import fs from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { prisma } from '../db';
import { env, serverRoot } from '../env';
import { decryptCredential, encryptCredential } from '../lib/crypto';
import { badRequest } from '../lib/errors';
import { sismaDb } from '../agent/db/sismaDb';

export interface LocalEnvironmentDTO {
  id: string;
  dbServer: string;
  dbPort: number;
  dbDatabase: string;
  dbUser: string;
  hasPassword: boolean;
  dbEnabled: boolean;
  sourcePath: string;
  updatedAt: Date;
}

export interface RawLocalEnvironment {
  dbServer: string;
  dbPort: number;
  dbDatabase: string;
  dbUser: string;
  dbPassword: string;
  dbEnabled: boolean;
  sourcePath: string;
}

export interface UpdateLocalEnvironmentInput {
  dbServer: string;
  dbPort?: number;
  dbDatabase: string;
  dbUser: string;
  dbPassword?: string;
  dbEnabled?: boolean;
  sourcePath: string;
}

async function syncToEnvFile(updates: Record<string, string>) {
  try {
    const envPath = path.resolve(serverRoot, '.env');
    let content = await fs.readFile(envPath, 'utf8');
    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, `${key}=${value}`);
      } else {
        content += `\n${key}=${value}`;
      }
    }
    await fs.writeFile(envPath, content, 'utf8');
  } catch (err) {
    console.warn('Aviso: no se pudo sincronizar server/.env:', err);
  }
}

/**
 * Obtiene o inicializa la configuración del entorno local/base desde la base de datos.
 */
export async function getLocalEnvironmentConfig(): Promise<LocalEnvironmentDTO> {
  let record = await prisma.localEnvironmentConfig.findUnique({
    where: { id: 'default' },
  });

  if (!record) {
    // Inicializar con valores predeterminados de env
    const initialSource = env.agentExtraDirs[0] || 'C:\\inetpub\\wwwroot\\SismaSalud';
    const encryptedPwd = env.SISMA_DB_PASSWORD ? encryptCredential(env.SISMA_DB_PASSWORD) : null;

    record = await prisma.localEnvironmentConfig.create({
      data: {
        id: 'default',
        dbServer: env.SISMA_DB_SERVER,
        dbPort: env.SISMA_DB_PORT,
        dbDatabase: env.SISMA_DB_DATABASE,
        dbUser: env.SISMA_DB_USER,
        dbPasswordEncrypted: encryptedPwd,
        dbEnabled: env.SISMA_DB_ENABLE_RO,
        sourcePath: initialSource,
      },
    });
  }

  return {
    id: record.id,
    dbServer: record.dbServer,
    dbPort: record.dbPort,
    dbDatabase: record.dbDatabase,
    dbUser: record.dbUser,
    hasPassword: Boolean(record.dbPasswordEncrypted),
    dbEnabled: record.dbEnabled,
    sourcePath: record.sourcePath,
    updatedAt: record.updatedAt,
  };
}

/**
 * Obtiene la configuración bruta con la contraseña descifrada para uso interno del agente y consultas BD.
 */
export async function getRawLocalEnvironmentConfig(): Promise<RawLocalEnvironment> {
  let record = await prisma.localEnvironmentConfig.findUnique({
    where: { id: 'default' },
  });

  if (!record) {
    await getLocalEnvironmentConfig(); // Inicializa si no existe
    record = await prisma.localEnvironmentConfig.findUnique({
      where: { id: 'default' },
    });
  }

  let dbPassword = '';
  if (record?.dbPasswordEncrypted) {
    try {
      dbPassword = decryptCredential(record.dbPasswordEncrypted);
    } catch {
      dbPassword = env.SISMA_DB_PASSWORD;
    }
  } else {
    dbPassword = env.SISMA_DB_PASSWORD;
  }

  return {
    dbServer: record?.dbServer || env.SISMA_DB_SERVER,
    dbPort: record?.dbPort || env.SISMA_DB_PORT,
    dbDatabase: record?.dbDatabase || env.SISMA_DB_DATABASE,
    dbUser: record?.dbUser || env.SISMA_DB_USER,
    dbPassword,
    dbEnabled: record?.dbEnabled ?? env.SISMA_DB_ENABLE_RO,
    sourcePath: record?.sourcePath || env.agentExtraDirs[0] || 'C:\\inetpub\\wwwroot\\SismaSalud',
  };
}

/**
 * Actualiza la configuración del entorno local (BD SQL Server y Fuente Local).
 */
export async function updateLocalEnvironmentConfig(
  input: UpdateLocalEnvironmentInput,
): Promise<LocalEnvironmentDTO> {
  const dbServer = input.dbServer.trim();
  const dbDatabase = input.dbDatabase.trim();
  const dbUser = input.dbUser.trim();
  const sourcePath = input.sourcePath.trim();
  const dbPort = input.dbPort ?? 1433;
  const dbEnabled = input.dbEnabled ?? true;

  if (!dbServer) throw badRequest('El servidor de base de datos es requerido');
  if (!dbDatabase) throw badRequest('El nombre de la base de datos es requerido');
  if (!dbUser) throw badRequest('El usuario de la base de datos es requerido');
  if (!sourcePath) throw badRequest('La ruta de código fuente local es requerida');

  const existing = await prisma.localEnvironmentConfig.findUnique({ where: { id: 'default' } });

  let dbPasswordEncrypted = existing?.dbPasswordEncrypted ?? null;
  if (input.dbPassword !== undefined && input.dbPassword.trim() !== '') {
    dbPasswordEncrypted = encryptCredential(input.dbPassword);
  }

  const updated = await prisma.localEnvironmentConfig.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      dbServer,
      dbPort,
      dbDatabase,
      dbUser,
      dbPasswordEncrypted,
      dbEnabled,
      sourcePath,
    },
    update: {
      dbServer,
      dbPort,
      dbDatabase,
      dbUser,
      dbPasswordEncrypted,
      dbEnabled,
      sourcePath,
    },
  });

  // Actualizar variables en memoria para consumo inmediato
  env.agentExtraDirs = [sourcePath];
  env.SISMA_DB_SERVER = dbServer;
  env.SISMA_DB_PORT = dbPort;
  env.SISMA_DB_DATABASE = dbDatabase;
  env.SISMA_DB_USER = dbUser;
  env.SISMA_DB_ENABLE_RO = dbEnabled;
  if (input.dbPassword !== undefined && input.dbPassword.trim() !== '') {
    env.SISMA_DB_PASSWORD = input.dbPassword;
  }

  // Notificar al servicio de base de datos para que reinicie su pool de conexiones
  await sismaDb.resetConnection();

  // Sincronizar con el archivo .env físico para persistencia entre reinicios completos
  const envUpdates: Record<string, string> = {
    SISMA_DB_SERVER: dbServer,
    SISMA_DB_PORT: String(dbPort),
    SISMA_DB_DATABASE: dbDatabase,
    SISMA_DB_USER: dbUser,
    SISMA_DB_ENABLE_RO: String(dbEnabled),
    AGENT_EXTRA_DIRS: sourcePath,
  };
  if (input.dbPassword !== undefined && input.dbPassword.trim() !== '') {
    envUpdates.SISMA_DB_PASSWORD = input.dbPassword;
  }
  await syncToEnvFile(envUpdates);

  return {
    id: updated.id,
    dbServer: updated.dbServer,
    dbPort: updated.dbPort,
    dbDatabase: updated.dbDatabase,
    dbUser: updated.dbUser,
    hasPassword: Boolean(updated.dbPasswordEncrypted),
    dbEnabled: updated.dbEnabled,
    sourcePath: updated.sourcePath,
    updatedAt: updated.updatedAt,
  };
}

/**
 * Prueba la conexión a la base de datos local SQL Server con los parámetros indicados o almacenados.
 */
export async function testLocalDbConnection(params?: {
  dbServer?: string;
  dbPort?: number;
  dbDatabase?: string;
  dbUser?: string;
  dbPassword?: string;
  useExistingPassword?: boolean;
}) {
  const rawStored = await getRawLocalEnvironmentConfig();

  const server = params?.dbServer?.trim() || rawStored.dbServer;
  const port = params?.dbPort || rawStored.dbPort;
  const database = params?.dbDatabase?.trim() || rawStored.dbDatabase;
  const user = params?.dbUser?.trim() || rawStored.dbUser;
  let password = rawStored.dbPassword;

  if (params?.dbPassword && !params.useExistingPassword) {
    password = params.dbPassword;
  }

  const startTime = Date.now();
  let pool: sql.ConnectionPool | null = null;
  try {
    pool = new sql.ConnectionPool({
      server,
      port,
      database,
      user,
      password,
      connectionTimeout: 4000,
      requestTimeout: 4000,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        readOnlyIntent: true,
      },
    });

    await pool.connect();
    const result = await pool.request().query('SELECT @@VERSION as version, DB_NAME() as currentDb');
    const row = result.recordset[0] as { version: string; currentDb: string };
    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      version: row.version.split('\n')[0].trim(),
      currentDb: row.currentDb,
      latencyMs,
      message: `Conexión exitosa a ${server}:${port}/${database} (${latencyMs} ms)`,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      message: `Error al conectar a SQL Server local: ${(error as Error).message}`,
    };
  } finally {
    if (pool) {
      await pool.close().catch(() => {});
    }
  }
}

/**
 * Prueba la existencia y legibilidad del directorio de fuentes local.
 */
export async function testLocalSourcePath(sourcePath?: string) {
  const rawStored = await getRawLocalEnvironmentConfig();
  const targetPath = sourcePath?.trim() || rawStored.sourcePath;

  if (!targetPath) {
    return {
      success: false,
      error: 'La ruta de código fuente está vacía',
      message: 'Debe especificar una ruta de carpeta de código fuente.',
    };
  }

  try {
    const stat = await fs.stat(targetPath);
    if (!stat.isDirectory()) {
      return {
        success: false,
        error: 'La ruta existe pero no es un directorio',
        message: `La ruta "${targetPath}" no es un directorio válido.`,
      };
    }

    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    const sampleFiles = entries.slice(0, 10).map((e) => `${e.name}${e.isDirectory() ? '/' : ''}`);

    return {
      success: true,
      totalEntries: entries.length,
      sampleFiles,
      message: `Directorio local accesible (${entries.length} elementos encontrados)`,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      message: `No se pudo acceder al directorio local: ${(error as Error).message}`,
    };
  }
}
