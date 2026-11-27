import fs from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { prisma } from '../db';
import { decryptCredential, encryptCredential } from '../lib/crypto';
import { badRequest, notFound } from '../lib/errors';
import type { ClientEnvironment } from '@prisma/client';
import { resolveEnvironmentSourcePath, testSourcePathAccess, unmountSmbShare } from './smbService';

export interface EnvironmentInput {
  name: string;
  description?: string;
  active?: boolean;
  dbServer: string;
  dbPort?: number;
  dbDatabase: string;
  dbUser: string;
  dbPassword?: string;
  sourceType?: 'SMB_UNC' | 'LOCAL_PATH';
  sourcePath: string;
  smbUser?: string;
  smbPassword?: string;
  smbDomain?: string;
}

export interface EnvironmentSummary {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  dbServer: string;
  dbPort: number;
  dbDatabase: string;
  dbUser: string;
  sourceType: string;
  sourcePath: string;
  smbUser: string | null;
  smbDomain: string | null;
  createdAt: string;
  updatedAt: string;
  usersCount: number;
  chatsCount: number;
}

function serializeEnvironment(env: ClientEnvironment & { _count?: { users: number; chats: number } }): EnvironmentSummary {
  return {
    id: env.id,
    name: env.name,
    description: env.description,
    active: env.active,
    dbServer: env.dbServer,
    dbPort: env.dbPort,
    dbDatabase: env.dbDatabase,
    dbUser: env.dbUser,
    sourceType: env.sourceType,
    sourcePath: env.sourcePath,
    smbUser: env.smbUser,
    smbDomain: env.smbDomain,
    createdAt: env.createdAt.toISOString(),
    updatedAt: env.updatedAt.toISOString(),
    usersCount: env._count?.users ?? 0,
    chatsCount: env._count?.chats ?? 0,
  };
}

export async function listEnvironments(): Promise<EnvironmentSummary[]> {
  const envs = await prisma.clientEnvironment.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { users: true, chats: true } } },
  });
  return envs.map(serializeEnvironment);
}

export async function getEnvironment(id: string) {
  const env = await prisma.clientEnvironment.findUnique({
    where: { id },
    include: {
      users: { select: { id: true, name: true, email: true, role: true } },
      _count: { select: { users: true, chats: true } },
    },
  });
  if (!env) throw notFound('Entorno no encontrado');

  return {
    ...serializeEnvironment(env),
    users: env.users,
  };
}

export async function createEnvironment(input: EnvironmentInput) {
  if (!input.name.trim()) throw badRequest('El nombre de la institución es requerido');
  if (!input.dbServer.trim()) throw badRequest('El servidor de base de datos es requerido');
  if (!input.dbDatabase.trim()) throw badRequest('La base de datos es requerida');
  if (!input.dbUser.trim()) throw badRequest('El usuario de base de datos es requerido');
  if (!input.sourcePath.trim()) throw badRequest('La ruta de código fuente es requerida');

  const existing = await prisma.clientEnvironment.findUnique({ where: { name: input.name.trim() } });
  if (existing) throw badRequest(`Ya existe un entorno con el nombre "${input.name.trim()}"`);

  const dbPasswordEncrypted = encryptCredential(input.dbPassword ?? '');
  const smbPasswordEncrypted = input.smbPassword ? encryptCredential(input.smbPassword) : null;

  const env = await prisma.clientEnvironment.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      active: input.active ?? true,
      dbServer: input.dbServer.trim(),
      dbPort: input.dbPort ?? 1433,
      dbDatabase: input.dbDatabase.trim(),
      dbUser: input.dbUser.trim(),
      dbPasswordEncrypted,
      sourceType: input.sourceType ?? (input.sourcePath.startsWith('\\\\') ? 'SMB_UNC' : 'LOCAL_PATH'),
      sourcePath: input.sourcePath.trim(),
      smbUser: input.smbUser?.trim() || null,
      smbPasswordEncrypted,
      smbDomain: input.smbDomain?.trim() || null,
    },
    include: { _count: { select: { users: true, chats: true } } },
  });

  return serializeEnvironment(env);
}

export async function updateEnvironment(id: string, input: Partial<EnvironmentInput>) {
  const env = await prisma.clientEnvironment.findUnique({ where: { id } });
  if (!env) throw notFound('Entorno no encontrado');

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description.trim() || null;
  if (input.active !== undefined) data.active = input.active;
  if (input.dbServer !== undefined) data.dbServer = input.dbServer.trim();
  if (input.dbPort !== undefined) data.dbPort = input.dbPort;
  if (input.dbDatabase !== undefined) data.dbDatabase = input.dbDatabase.trim();
  if (input.dbUser !== undefined) data.dbUser = input.dbUser.trim();
  if (input.sourceType !== undefined) data.sourceType = input.sourceType;
  if (input.sourcePath !== undefined) data.sourcePath = input.sourcePath.trim();
  if (input.smbUser !== undefined) data.smbUser = input.smbUser.trim() || null;
  if (input.smbDomain !== undefined) data.smbDomain = input.smbDomain.trim() || null;

  if (input.dbPassword !== undefined && input.dbPassword.trim() !== '') {
    data.dbPasswordEncrypted = encryptCredential(input.dbPassword);
  }
  if (input.smbPassword !== undefined) {
    data.smbPasswordEncrypted = input.smbPassword.trim() ? encryptCredential(input.smbPassword) : null;
  }

  const updated = await prisma.clientEnvironment.update({
    where: { id },
    data,
    include: { _count: { select: { users: true, chats: true } } },
  });

  return serializeEnvironment(updated);
}

export async function deleteEnvironment(id: string) {
  const env = await prisma.clientEnvironment.findUnique({ where: { id } });
  if (!env) throw notFound('Entorno no encontrado');

  // Si había un montaje CIFS activo en Linux, desmontar
  await unmountSmbShare(path.posix.join('/mnt/smb_sources', id));

  // Desvincular usuarios y chats antes de eliminar
  await prisma.user.updateMany({ where: { environmentId: id }, data: { environmentId: null } });
  await prisma.chat.updateMany({ where: { environmentId: id }, data: { environmentId: null } });

  await prisma.clientEnvironment.delete({ where: { id } });
  return { success: true };
}

export async function assignUsersToEnvironment(environmentId: string, userIds: string[]) {
  const env = await prisma.clientEnvironment.findUnique({ where: { id: environmentId } });
  if (!env) throw notFound('Entorno no encontrado');

  // Limpiar usuarios previos asignados a este entorno
  await prisma.user.updateMany({
    where: { environmentId },
    data: { environmentId: null },
  });

  // Asignar los nuevos usuarios
  if (userIds.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { environmentId },
    });
  }

  return getEnvironment(environmentId);
}

/**
 * Prueba la conexión en vivo con SQL Server para una configuración o entorno dado.
 */
export async function testDbConnection(params: {
  dbServer: string;
  dbPort?: number;
  dbDatabase: string;
  dbUser: string;
  dbPassword?: string;
  environmentId?: string;
}) {
  let password = params.dbPassword ?? '';
  let server = params.dbServer;
  let port = params.dbPort ?? 1433;
  let database = params.dbDatabase;
  let user = params.dbUser;

  if (params.environmentId) {
    const env = await prisma.clientEnvironment.findUnique({ where: { id: params.environmentId } });
    if (!env) throw notFound('Entorno no encontrado');
    server = env.dbServer;
    port = env.dbPort;
    database = env.dbDatabase;
    user = env.dbUser;
    password = decryptCredential(env.dbPasswordEncrypted);
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
      message: `Error al conectar a SQL Server: ${(error as Error).message}`,
    };
  } finally {
    if (pool) {
      await pool.close().catch(() => {});
    }
  }
}

/**
 * Prueba la existencia y legibilidad de la ruta de código fuente (SMB / UNC / Local).
 */
export async function testSourceConnection(params: {
  sourcePath: string;
  sourceType?: string;
  environmentId?: string;
  smbUser?: string;
  smbPassword?: string;
  smbDomain?: string;
}) {
  if (params.environmentId) {
    const env = await prisma.clientEnvironment.findUnique({ where: { id: params.environmentId } });
    if (!env) throw notFound('Entorno no encontrado');
    return testSourcePathAccess({
      sourcePath: env.sourcePath,
      sourceType: env.sourceType,
      environmentId: env.id,
      smbUser: env.smbUser || undefined,
      smbDomain: env.smbDomain || undefined,
      smbPassword: env.smbPasswordEncrypted ? decryptCredential(env.smbPasswordEncrypted) : undefined,
    });
  }

  return testSourcePathAccess(params);
}

// Cache de pools activos para consultas eficientes de soporte
const environmentPools = new Map<string, { pool: sql.ConnectionPool; expiresAt: number }>();

export async function getEnvironmentDbPool(env: ClientEnvironment): Promise<sql.ConnectionPool> {
  const cached = environmentPools.get(env.id);
  if (cached && cached.pool.connected && Date.now() < cached.expiresAt) {
    return cached.pool;
  }

  const password = decryptCredential(env.dbPasswordEncrypted);
  const pool = new sql.ConnectionPool({
    server: env.dbServer,
    port: env.dbPort,
    database: env.dbDatabase,
    user: env.dbUser,
    password,
    connectionTimeout: 3500,
    requestTimeout: 15000,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    pool: {
      max: 4,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  });

  await pool.connect();
  environmentPools.set(env.id, { pool, expiresAt: Date.now() + 60000 });
  return pool;
}

/**
 * Consulta menús y parámetros específicos del entorno del cliente para enriquecer el contexto del agente.
 */
export async function getEnvironmentSupportContext(environmentId: string, userText: string): Promise<{
  contextText: string;
  sourceDir: string | null;
}> {
  const env = await prisma.clientEnvironment.findUnique({ where: { id: environmentId } });
  if (!env || !env.active) {
    return { contextText: '', sourceDir: null };
  }

  let contextText = `[ENTORNO DEL CLIENTE: ${env.name}]\n- Base de datos: ${env.dbDatabase} en ${env.dbServer}\n`;

  try {
    const pool = await getEnvironmentDbPool(env);
    const stopWords = new Set(['hola', 'buenos', 'dias', 'tardes', 'como', 'para', 'error', 'pantalla', 'modulo', 'ayuda']);
    const tokens = userText
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !stopWords.has(w))
      .slice(0, 3);

    if (tokens.length > 0) {
      const clauses = tokens.map((_, i) => `etiqueta LIKE @t${i} OR link LIKE @t${i}`).join(' OR ');
      const req = pool.request();
      tokens.forEach((t, i) => req.input(`t${i}`, `%${t}%`));

      const menuRes = await req.query(`
        SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
        SELECT TOP 6 hijo, etiqueta, link, padre FROM sis_menu WHERE ${clauses}
      `).catch(() => ({ recordset: [] }));

      if (menuRes.recordset.length > 0) {
        contextText += 'Menús registrados en su instalación (BD):\n';
        for (const m of menuRes.recordset as Array<{ etiqueta: string; link: string }>) {
          contextText += `- ${m.etiqueta} (${m.link})\n`;
        }
      }
    }
  } catch {
    // Si la BD de la clínica no responde temporalmente, no interrumpimos el turno
  }

  // Verificar si la ruta de fuentes del entorno existe (resolviendo montaje SMB si aplica)
  let sourceDir: string | null = null;
  try {
    const effectiveSource = await resolveEnvironmentSourcePath(env);
    const stat = await fs.stat(effectiveSource);
    if (stat.isDirectory()) {
      sourceDir = effectiveSource;
      contextText += `- Código fuente accesible en: ${env.sourcePath}\n`;
    }
  } catch {
    // Ruta no accesible en este instante
  }

  return { contextText, sourceDir };
}
