import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
export const serverRoot = path.resolve(here, '..');
export const repoRoot = path.resolve(serverRoot, '..');

dotenv.config({ path: path.resolve(serverRoot, '.env') });

const rawSchema = z.object({
  DATABASE_URL: z.string().min(1),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('*'),
  JWT_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default('30m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().default(14),
  AGENT_MODE: z.enum(['agy', 'mock']).default('agy'),
  AGY_BIN: z.string().default('agy.exe'),
  AGY_MODEL: z.string().default('gemini-3.8-flash-medium'),
  AGY_FALLBACK_MODELS: z.string().default(''),
  AGY_TIMEOUT_MS: z.coerce.number().default(120_000),
  AGENT_WORKSPACE: z.string().default('../agent'),
  AGENT_EXTRA_DIRS: z.string().default(''),
  AGENT_MAX_CONCURRENCY: z.coerce.number().default(2),
  AGENT_MAX_MESSAGE_CHARS: z.coerce.number().default(4000),
  SISMA_DB_ENABLE_RO: z
    .enum(['true', 'false', '1', '0'])
    .default('true')
    .transform((val) => val === 'true' || val === '1'),
  SISMA_DB_SERVER: z.string().default('10.120.2.2'),
  SISMA_DB_PORT: z.coerce.number().default(1433),
  SISMA_DB_DATABASE: z.string().default('SismaSalud_Testing'),
  SISMA_DB_USER: z.string().default('soporte'),
  SISMA_DB_PASSWORD: z.string().default('0Sismasalud'),
  SISMA_DB_TIMEOUT_MS: z.coerce.number().default(60_000),
});

const parsed = rawSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Configuración inválida en server/.env:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;

const workspaceAbs = path.isAbsolute(raw.AGENT_WORKSPACE)
  ? raw.AGENT_WORKSPACE
  : path.resolve(serverRoot, raw.AGENT_WORKSPACE);

export const env = {
  ...raw,
  agentWorkspace: workspaceAbs,
  agentExtraDirs: raw.AGENT_EXTRA_DIRS.split(/[;,]/)
    .map((value) => value.trim())
    .filter(Boolean),
  agentSchemaPath: path.join(workspaceAbs, 'schema.json'),
  fallbackModels: raw.AGY_FALLBACK_MODELS.split(',')
    .map((value) => value.trim())
    .filter(Boolean),
};
