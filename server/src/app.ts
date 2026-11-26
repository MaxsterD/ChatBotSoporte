import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { env, serverRoot, repoRoot } from './env';
import { ApiError } from './lib/errors';
import { authRoutes } from './auth/routes';
import { chatRoutes } from './routes/chats';
import { consultantRoutes } from './routes/consultant';
import { uploadRoutes } from './routes/upload';
import { environmentRoutes } from './routes/environments';
import { copilotRoutes } from './routes/copilot';
import { staffAgentRoutes } from './routes/staffAgent';
import { businessHoursRoutes } from './routes/businessHours';
import { getRawLocalEnvironmentConfig } from './config/localEnvironment';
import { isAgyAvailable } from './agent/bridge';
import { sismaDb } from './agent/db/sismaDb';

let agyCache: { value: boolean; at: number } | null = null;

function agyAvailable() {
  const now = Date.now();
  if (agyCache && now - agyCache.at < 60_000) return agyCache.value;
  const value = env.AGENT_MODE === 'mock' ? true : isAgyAvailable();
  agyCache = { value, at: now };
  return value;
}

export async function buildApp() {
  try {
    const rawLocal = await getRawLocalEnvironmentConfig();
    env.agentExtraDirs = [rawLocal.sourcePath];
    env.SISMA_DB_SERVER = rawLocal.dbServer;
    env.SISMA_DB_PORT = rawLocal.dbPort;
    env.SISMA_DB_DATABASE = rawLocal.dbDatabase;
    env.SISMA_DB_USER = rawLocal.dbUser;
    env.SISMA_DB_ENABLE_RO = rawLocal.dbEnabled;
    if (rawLocal.dbPassword) {
      env.SISMA_DB_PASSWORD = rawLocal.dbPassword;
    }
  } catch {
    // Si la BD aún está inicializándose o en tests aislados, usar env predeterminado
  }

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            },
    },
    bodyLimit: 15 * 1024 * 1024,
  });

  const uploadsDir = path.resolve(serverRoot, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 15 * 1024 * 1024,
    },
  });

  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
  });

  await app.register(cors, {
    origin:
      env.CORS_ORIGIN === '*'
        ? true
        : env.CORS_ORIGIN.split(',').map((value) => value.trim()),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  });

  await app.register(rateLimit, {
    max: 600,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1'],
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }
    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.code(429).send({
        error: { code: 'rate_limited', message: 'Demasiadas solicitudes, espera un momento' },
      });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500) {
      return reply.code(statusCode).send({
        error: {
          code: (error as { code?: string }).code ?? 'bad_request',
          message: 'La solicitud no es válida',
        },
      });
    }
    request.log.error(error);
    return reply.code(500).send({
      error: { code: 'internal_error', message: 'Ocurrió un error procesando la solicitud' },
    });
  });

  app.get('/', async () => ({
    name: 'Soporte SismaSalud API',
    version: '1.0.0',
    docs: '/health',
  }));

  app.get('/health', async () => {
    const dbTest = env.SISMA_DB_ENABLE_RO ? await sismaDb.testConnection() : { ok: false, error: 'disabled' };
    return {
      ok: true,
      agent: {
        mode: env.AGENT_MODE,
        model: env.AGY_MODEL,
        cliAvailable: agyAvailable(),
        workspace: env.agentWorkspace,
        extraDirs: env.agentExtraDirs,
      },
      sismaDb: {
        enabled: env.SISMA_DB_ENABLE_RO,
        server: env.SISMA_DB_SERVER,
        database: env.SISMA_DB_DATABASE,
        connected: dbTest.ok,
      },
      uptimeSeconds: Math.round(process.uptime()),
    };
  });

  await app.register(authRoutes);
  await app.register(chatRoutes);
  await app.register(consultantRoutes);
  await app.register(environmentRoutes);
  await app.register(copilotRoutes);
  await app.register(staffAgentRoutes);
  await app.register(businessHoursRoutes);
  await app.register(uploadRoutes);

  // Servir cliente Web SPA si existe la carpeta compilada (web/dist)
  const webDistDir = path.resolve(repoRoot, 'web', 'dist');
  if (fs.existsSync(webDistDir)) {
    await app.register(fastifyStatic, {
      root: webDistDir,
      prefix: '/',
      decorateReply: false,
    });

    app.setNotFoundHandler((request, reply) => {
      const url = request.raw.url || '';
      if (
        url.startsWith('/auth') ||
        url.startsWith('/chats') ||
        url.startsWith('/consultant') ||
        url.startsWith('/business-hours') ||
        url.startsWith('/uploads') ||
        url.startsWith('/health') ||
        url.startsWith('/socket.io')
      ) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'Ruta no encontrada' } });
      }
      return reply.sendFile('index.html', webDistDir);
    });
  }

  return app;
}
