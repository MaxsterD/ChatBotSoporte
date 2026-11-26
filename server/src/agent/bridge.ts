import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { env, serverRoot } from '../env';
import { AgentError, type AgentAnalysis, type AgentTurnInput, type AgentTurnResult } from './types';
import { mockTurn } from './mock';
import { sanitizeAgentText } from './sanitize';

const emptyAnalysis: AgentAnalysis = {
  summary: '',
  probableCause: '',
  suggestedSolution: '',
  missingInfo: '',
};

const analysisParser = z
  .object({
    summary: z.string().catch(''),
    probableCause: z.string().catch(''),
    suggestedSolution: z.string().catch(''),
    missingInfo: z.string().catch(''),
  })
  .catch(emptyAnalysis);

const outputParser = z.object({
  answer: z.string().catch(''),
  escalate: z.boolean().catch(false),
  analysis: analysisParser,
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function pickBoolean(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 'si', 'sí', 'yes', '1'].includes(normalized)) return true;
      if (['false', 'no', '0'].includes(normalized)) return false;
    }
  }
  return false;
}

/** Acepta camelCase, snake_case y español para no depender del modelo. */
function normalizeOutput(raw: unknown): { answer: string; escalate: boolean; analysis: AgentAnalysis } {
  const record = asRecord(raw);
  const analysis = asRecord(record.analysis ?? record.analisis ?? record);
  const normalized = {
    answer: pickString(record, ['answer', 'respuesta', 'message', 'mensaje', 'text']),
    escalate: pickBoolean(record, ['escalate', 'escalar', 'escalation', 'transfer', 'derivar']),
    analysis: {
      summary: pickString(analysis, ['summary', 'resumen', 'hallazgos', 'findings']),
      probableCause: pickString(analysis, [
        'probableCause',
        'probable_cause',
        'causaProbable',
        'causa_probable',
        'causa',
      ]),
      suggestedSolution: pickString(analysis, [
        'suggestedSolution',
        'suggested_solution',
        'solucionSugerida',
        'solucion_sugerida',
        'solucion',
      ]),
      missingInfo: pickString(analysis, [
        'missingInfo',
        'missing_info',
        'informacionFaltante',
        'informacion_faltante',
        'datosFaltantes',
      ]),
    },
  };
  const parsed = outputParser.safeParse(normalized);
  return parsed.success ? parsed.data : { answer: '', escalate: false, analysis: emptyAnalysis };
}

export function extractJsonBlock(text: string): unknown | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Corta el JSON que el agente a veces agrega al final de su respuesta en texto. */
export function stripTrailingJson(text: string) {
  const index = text.indexOf('{"analysis"');
  const alt = text.indexOf('{"escalate"');
  const cut = [index, alt].filter((value) => value >= 0).sort((a, b) => a - b)[0];
  return cut === undefined ? text : text.slice(0, cut);
}

let cachedBinary: string | null = null;

export function resolveAgyBinary() {
  if (cachedBinary) return cachedBinary;
  let configured = env.AGY_BIN;
  if (process.platform !== 'win32' && configured.endsWith('.exe')) {
    configured = configured.replace(/\.exe$/i, '');
  }
  if (configured.includes('\\') || configured.includes('/')) {
    cachedBinary = configured;
    return configured;
  }
  if (process.platform === 'win32') {
    const result = spawnSync('where.exe', [configured], { encoding: 'utf8', timeout: 10_000 });
    const found = (result.stdout ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)[0];
    if (found) {
      cachedBinary = found;
      return found;
    }
  } else {
    const home = process.env.HOME || '/root';
    const standardPaths = [
      path.join(home, '.local', 'bin', configured),
      `/usr/local/bin/${configured}`,
      `/usr/bin/${configured}`,
    ];
    for (const p of standardPaths) {
      if (fs.existsSync(p)) {
        cachedBinary = p;
        return p;
      }
    }
    const result = spawnSync('which', [configured], { encoding: 'utf8', timeout: 10_000 });
    const found = (result.stdout ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)[0];
    if (found) {
      cachedBinary = found;
      return found;
    }
  }
  cachedBinary = configured;
  return configured;
}

export function isAgyAvailable() {
  try {
    const result = spawnSync(resolveAgyBinary(), ['--help'], {
      encoding: 'utf8',
      timeout: 15_000,
      windowsHide: true,
    });
    return !result.error;
  } catch {
    return false;
  }
}

function killTree(child: ChildProcess) {
  if (!child.pid) {
    child.kill();
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGKILL');
  }
}

export function buildArgs(input: AgentTurnInput, model: string, timeoutMs: number = env.AGY_TIMEOUT_MS) {
  const timeoutSec = Math.max(10, Math.round(timeoutMs / 1000));
  const args = [
    `--print=${input.prompt}`,
    '--output-format',
    'stream-json',
    '--json-schema',
    env.agentSchemaPath,
    '--disable-slash-commands',
    '--sandbox',
    '--dangerously-skip-permissions',
    '--print-timeout',
    `${timeoutSec}s`,
    '--model',
    model,
  ];
  if (input.conversationId) args.push('--conversation', input.conversationId);
  for (const dir of env.agentExtraDirs) args.push('--add-dir', dir);
  if (input.extraDirs) {
    for (const dir of input.extraDirs) args.push('--add-dir', dir);
  }
  const uploadsDir = path.resolve(serverRoot, 'uploads');
  args.push('--add-dir', uploadsDir);
  return args;
}

function runAgyOnce(input: AgentTurnInput, model: string): Promise<AgentTurnResult> {
  const timeoutMs = input.timeoutMs ?? env.AGY_TIMEOUT_MS;
  const binary = resolveAgyBinary();
  const args = buildArgs(input, model, timeoutMs);

  return new Promise<AgentTurnResult>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(binary, args, {
        cwd: env.agentWorkspace,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      reject(new AgentError(`No se pudo iniciar el agente: ${(error as Error).message}`, 'spawn_failed', false));
      return;
    }

    let settled = false;
    let conversationId = input.conversationId ?? undefined;
    let resultEvent: Record<string, unknown> | null = null;
    let suppressedStep = -1;
    let stderr = '';
    let buffer = '';

    const cleanup = () => {
      clearTimeout(timer);
      input.signal?.removeEventListener('abort', onAbort);
    };

    const succeed = (value: AgentTurnResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const timer = setTimeout(() => {
      killTree(child);
      fail(new AgentError(`El agente tardó más de ${Math.round(timeoutMs / 1000)} segundos`, 'timeout'));
    }, timeoutMs);

    const onAbort = () => {
      killTree(child);
      fail(new AgentError('Turno cancelado', 'aborted', false));
    };
    input.signal?.addEventListener('abort', onAbort, { once: true });

    const handleEvent = (event: Record<string, unknown>) => {
      const type = event.event;
      if (type === 'init') {
        const init = asRecord(event.init);
        const id = event.conversation_id ?? init.conversation_id;
        if (typeof id === 'string') conversationId = id;
        return;
      }
      if (type === 'step_update') {
        const step = asRecord(event.step_update);
        const stepIndex = typeof step.step_index === 'number' ? step.step_index : -1;
        const delta = step.text_delta;
        if (typeof delta === 'string' && delta.length > 0 && input.onDelta) {
          if (stepIndex === suppressedStep) return;
          // Suprimir bloques JSON, llaves o campos del contrato estructurado
          if (/^\s*[\{\[]/.test(delta) || /"(analysis|escalate|answer|missingInfo|probableCause|suggestedSolution|summary)"\s*:/.test(delta)) {
            suppressedStep = stepIndex;
            return;
          }
          // Suprimir preámbulos en inglés, estados de herramientas o reflexiones internas
          if (
            /\b(analyzing|researching|investigating|screenshot|subagent|attached|documentation|provide you|accurate solution)\b/i.test(delta) ||
            /\b(I am|I'm|Let me|Please wait|Checking)\b/i.test(delta)
          ) {
            suppressedStep = stepIndex;
            return;
          }
          input.onDelta(delta);
        }
        return;
      }
      if (type === 'result') {
        resultEvent = asRecord(event.result);
      }
    };

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.startsWith('{')) {
          try {
            handleEvent(JSON.parse(line) as Record<string, unknown>);
          } catch {
            // Línea parcial o log: se ignora.
          }
        }
        newline = buffer.indexOf('\n');
      }
    });

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000);
    });

    child.on('error', (error) => {
      fail(
        new AgentError(
          `No se pudo ejecutar "${binary}": ${error.message}. Verifica AGY_BIN en server/.env`,
          'spawn_failed',
          false,
        ),
      );
    });

    child.on('close', (code) => {
      const tail = stderr.trim().split(/\r?\n/).slice(-4).join(' | ');
      if (!resultEvent) {
        fail(new AgentError(`El agente no devolvió resultado (código ${code}). ${tail}`, 'no_result'));
        return;
      }

      const status = resultEvent.status;
      const rawStructured = resultEvent.structured_output;
      const rawResponse = typeof resultEvent.response === 'string' ? resultEvent.response : '';

      let normalized: { answer: string; escalate: boolean; analysis: AgentAnalysis } | null = null;
      if (rawStructured && typeof rawStructured === 'object') {
        normalized = normalizeOutput(rawStructured);
      } else {
        const parsed = extractJsonBlock(rawResponse);
        if (parsed) normalized = normalizeOutput(parsed);
      }

      if (!normalized) {
        const text = sanitizeAgentText(rawResponse);
        if (!text) {
          fail(
            new AgentError(
              `El agente terminó con estado ${String(status)} y sin respuesta utilizable. ${tail}`,
              'empty_result',
            ),
          );
          return;
        }
        succeed({
          answer: text,
          escalate: status !== 'SUCCESS',
          analysis: emptyAnalysis,
          conversationId,
          model,
          partial: status !== 'SUCCESS',
        });
        return;
      }

      const answer =
        sanitizeAgentText(normalized.answer) ||
        sanitizeAgentText(stripTrailingJson(rawResponse));

      succeed({
        answer,
        escalate: normalized.escalate,
        analysis: normalized.analysis,
        conversationId,
        model,
        partial: status !== 'SUCCESS',
      });
    });
  });
}

export async function runAgent(input: AgentTurnInput): Promise<AgentTurnResult> {
  if (env.AGENT_MODE === 'mock') {
    input.onStart?.();
    return mockTurn(input);
  }

  const models = Array.from(new Set([env.AGY_MODEL, ...env.fallbackModels])).slice(0, 2);
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      input.onStart?.();
      return await runAgyOnce(input, model);
    } catch (error) {
      const agentError = error instanceof Error ? error : new AgentError(String(error));
      lastError = agentError;
      if (agentError instanceof AgentError && ['aborted', 'spawn_failed'].includes(agentError.code)) {
        throw agentError;
      }
      console.warn(`[agent] el modelo ${model} falló: ${agentError.message}`);
    }
  }

  throw lastError ?? new AgentError('El agente no pudo responder');
}

export { emptyAnalysis };
