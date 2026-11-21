import sql from 'mssql';
import { env } from '../../env';

export interface MenuItem {
  hijo: number;
  padre: number;
  etiqueta: string;
  padreEtiqueta?: string;
  link: string;
  linkModuloExterno?: string;
  descripcion?: string;
  parametro?: string;
}

export interface ParametroGeneral {
  parametro: string;
  valor: string;
  modulo?: string;
  descripcion?: string;
}

export interface PermisoModulo {
  codigoMenu: number;
  etiqueta: string;
  padreEtiqueta?: string;
  link: string;
  permitido: boolean;
}

class SismaDbService {
  private pool: sql.ConnectionPool | null = null;
  private connecting: Promise<sql.ConnectionPool> | null = null;
  private lastConnectionFailure: number = 0;
  private readonly FAILURE_COOLDOWN_MS = 60_000;

  private getConfig(): sql.config {
    return {
      server: env.SISMA_DB_SERVER,
      port: env.SISMA_DB_PORT,
      database: env.SISMA_DB_DATABASE,
      user: env.SISMA_DB_USER,
      password: env.SISMA_DB_PASSWORD,
      requestTimeout: env.SISMA_DB_TIMEOUT_MS,
      connectionTimeout: 2_500,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        readOnlyIntent: true,
      },
      pool: {
        max: 8,
        min: 0,
        idleTimeoutMillis: 30_000,
      },
    };
  }

  async getPool(): Promise<sql.ConnectionPool> {
    if (!env.SISMA_DB_ENABLE_RO) {
      throw new Error('La conexión a la base de datos de SismaSalud está deshabilitada por configuración (SISMA_DB_ENABLE_RO=false).');
    }

    if (this.pool && this.pool.connected) {
      return this.pool;
    }

    if (Date.now() - this.lastConnectionFailure < this.FAILURE_COOLDOWN_MS) {
      throw new Error('La conexión a SismaSalud falló recientemente; omitiendo reintento temporal.');
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = (async () => {
      try {
        const pool = new sql.ConnectionPool(this.getConfig());
        this.pool = await pool.connect();
        this.lastConnectionFailure = 0;
        return this.pool;
      } catch (err) {
        this.lastConnectionFailure = Date.now();
        throw err;
      } finally {
        this.connecting = null;
      }
    })();

    return this.connecting;
  }

  /**
   * Cierra el pool existente y reinicia el cooldown de conexión para aplicar nueva configuración.
   */
  async resetConnection(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.close();
      } catch {
        // Ignorar error al cerrar pool previo
      }
      this.pool = null;
    }
    this.connecting = null;
    this.lastConnectionFailure = 0;
  }

  /**
   * Valida estrictamente que una consulta no contenga comandos de modificación o alteración.
   */
  assertReadOnlyQuery(query: string) {
    const forbiddenPattern = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|MERGE|GRANT|REVOKE|DENY|EXECUTE|EXEC|RENAME|SHUTDOWN)\b/i;
    // Permitir sp_helptext para consultar definiciones de procedimientos
    const isSpHelptext = /^\s*EXEC(?:UTE)?\s+sp_helptext\b/i.test(query.trim());
    
    if (forbiddenPattern.test(query) && !isSpHelptext) {
      throw new Error('Operación no permitida: la conexión es estrictamente de solo lectura (SELECT).');
    }
  }

  /**
   * Ejecuta una consulta SELECT segura con nivel de aislamiento READ UNCOMMITTED para evitar bloqueos en tablas pesadas.
   */
  async ejecutarConsultaLectura<T = Record<string, unknown>>(query: string, params: Record<string, unknown> = {}): Promise<T[]> {
    this.assertReadOnlyQuery(query);
    const pool = await this.getPool();
    const request = pool.request();

    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }

    const isolatedQuery = `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\n${query}`;
    const result = await request.query<T>(isolatedQuery);
    return result.recordset ?? [];
  }

  /**
   * Busca opciones de menú en `sis_menu` por texto, mostrando la jerarquía (Padre -> Hijo) y la ruta PHP.
   */
  async buscarOpcionesMenu(termino: string, nivelAcceso?: number): Promise<MenuItem[]> {
    const query = `
      SELECT TOP 50
        m.hijo,
        m.padre,
        m.etiqueta,
        ISNULL(p.etiqueta, 'Raíz') AS padreEtiqueta,
        m.link,
        m.linkModuloExterno,
        m.descripcion,
        m.parametro
      FROM sis_menu m WITH (NOLOCK)
      LEFT JOIN sis_menu p WITH (NOLOCK) ON m.padre = p.hijo
      WHERE (m.etiqueta LIKE @termino OR m.descripcion LIKE @termino OR m.link LIKE @termino)
      ${nivelAcceso ? 'AND m.hijo IN (SELECT codigo FROM sis_nivelacceso WITH (NOLOCK) WHERE nivel = @nivelAcceso)' : ''}
      ORDER BY p.etiqueta, m.etiqueta;
    `;

    return this.ejecutarConsultaLectura<MenuItem>(query, {
      termino: `%${termino}%`,
      ...(nivelAcceso ? { nivelAcceso } : {}),
    });
  }

  /**
   * Obtiene la jerarquía completa de un menú hasta la raíz y su archivo PHP vinculado.
   */
  async obtenerJerarquiaMenu(idHijo: number): Promise<MenuItem[]> {
    const query = `
      WITH Jerarquia AS (
        SELECT 
          hijo, padre, etiqueta, link, linkModuloExterno, descripcion, parametro, 1 as nivel
        FROM sis_menu WITH (NOLOCK)
        WHERE hijo = @idHijo
        UNION ALL
        SELECT 
          m.hijo, m.padre, m.etiqueta, m.link, m.linkModuloExterno, m.descripcion, m.parametro, j.nivel + 1
        FROM sis_menu m WITH (NOLOCK)
        INNER JOIN Jerarquia j ON m.hijo = j.padre
      )
      SELECT * FROM Jerarquia ORDER BY nivel DESC;
    `;

    return this.ejecutarConsultaLectura<MenuItem>(query, { idHijo });
  }

  /**
   * Consulta configuraciones en `parametrosGenerales`.
   */
  async consultarParametroGeneral(parametro: string): Promise<ParametroGeneral[]> {
    const query = `
      SELECT TOP 20
        parametro,
        CONVERT(VARCHAR(500), value) AS valor,
        modulo,
        descripcion
      FROM parametrosGenerales WITH (NOLOCK)
      WHERE parametro LIKE @parametro OR descripcion LIKE @parametro;
    `;

    return this.ejecutarConsultaLectura<ParametroGeneral>(query, { parametro: `%${parametro}%` });
  }

  /**
   * Consulta la definición en texto de un procedimiento almacenado sin ejecutarlo.
   */
  async obtenerDefinicionSP(nombreSp: string): Promise<string | null> {
    const query = `
      SELECT TOP 1 m.definition
      FROM sys.sql_modules m WITH (NOLOCK)
      JOIN sys.procedures p WITH (NOLOCK) ON m.object_id = p.object_id
      WHERE p.name = @nombreSp OR p.name = 'sp' + @nombreSp;
    `;

    const result = await this.ejecutarConsultaLectura<{ definition: string }>(query, { nombreSp });
    return result[0]?.definition ?? null;
  }

  /**
   * Verifica la conectividad básica con el servidor SQL Server.
   */
  async testConnection(): Promise<{ ok: boolean; version?: string; database?: string; error?: string }> {
    try {
      const result = await this.ejecutarConsultaLectura<{ version: string; db: string }>(
        'SELECT @@VERSION AS version, DB_NAME() AS db;'
      );
      return {
        ok: true,
        version: result[0]?.version,
        database: result[0]?.db,
      };
    } catch (error) {
      return {
        ok: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Obtiene contexto relevante de menús y configuraciones en base de datos para enriquecer la respuesta del agente.
   */
  async obtenerContextoSoporte(mensaje: string): Promise<string> {
    if (!env.SISMA_DB_ENABLE_RO || Date.now() - this.lastConnectionFailure < this.FAILURE_COOLDOWN_MS) {
      return '';
    }

    try {
      const searchPromise = (async () => {
        const stopWords = new Set([
          'hola', 'buenos', 'buenas', 'dias', 'tardes', 'noches', 'como', 'donde', 'para', 'quiero',
          'necesito', 'tengo', 'favor', 'ayuda', 'sistema', 'salud', 'sisma', 'sismasalud', 'esta',
          'este', 'estos', 'estas', 'cual', 'quien', 'hacer', 'puedo', 'puede', 'debo', 'modulo',
          'pantalla', 'error', 'falla', 'problema', 'pasame', 'asesor', 'humano', 'consultor',
        ]);

        const normalized = mensaje
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s]/g, ' ');

        const tokens = normalized
          .split(/\s+/)
          .filter((w) => w.length >= 4 && !stopWords.has(w));

        if (tokens.length === 0) return '';

        const searchTerms = tokens.slice(0, 3);
        const menuPromises = searchTerms.map((term) => this.buscarOpcionesMenu(term).catch(() => []));
        const paramPromises = searchTerms.map((term) => this.consultarParametroGeneral(term).catch(() => []));

        const [menuResults, paramResults] = await Promise.all([
          Promise.all(menuPromises),
          Promise.all(paramPromises),
        ]);

        const allMenus = menuResults.flat();
        const uniqueMenus = Array.from(new Map(allMenus.map((m) => [m.hijo, m])).values()).slice(0, 6);

        const allParams = paramResults.flat();
        const uniqueParams = Array.from(new Map(allParams.map((p) => [p.parametro, p])).values()).slice(0, 3);

        if (uniqueMenus.length === 0 && uniqueParams.length === 0) {
          return '';
        }

        const lines: string[] = [];
        if (uniqueMenus.length > 0) {
          lines.push('Rutas de menús registradas en SismaSalud (BD):');
          for (const m of uniqueMenus) {
            const path = m.padreEtiqueta && m.padreEtiqueta !== 'Raíz' ? `${m.padreEtiqueta} → ${m.etiqueta}` : m.etiqueta;
            lines.push(`- Menú: ${path} (Archivo: ${m.link})`);
          }
        }

        if (uniqueParams.length > 0) {
          lines.push('Configuraciones generales de SismaSalud (BD):');
          for (const p of uniqueParams) {
            lines.push(`- Parámetro ${p.parametro}: ${p.valor}${p.modulo ? ` [${p.modulo}]` : ''}`);
          }
        }

        return lines.join('\n');
      })();

      const timeoutPromise = new Promise<string>((resolve) => setTimeout(() => resolve(''), 1500));
      return await Promise.race([searchPromise, timeoutPromise]);
    } catch {
      return '';
    }
  }

  /**
   * Cierra el pool de conexiones de manera ordenada.
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}

export const sismaDb = new SismaDbService();
