import fs from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { prisma } from '../db';
import { badRequest, conflict, notFound } from '../lib/errors';
import { getEnvironmentDbPool } from '../environments/service';
import { runAgent } from '../agent/bridge';
import { emitToConsultants } from '../realtime/io';
import type { AuthUser } from '../lib/auth';
import type { CopilotTurn, ClientEnvironment } from '@prisma/client';

export interface ProposedAction {
  type: 'SQL' | 'FILE';
  description: string;
  sql?: string;
  filePath?: string;
  targetContent?: string;
  replacementContent?: string;
  diff?: string;
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  rowsAffected?: number;
  backupPath?: string;
  executedAt: string;
  executedBy: string;
}

export interface CopilotState {
  hasEnvironment: boolean;
  environment: {
    id: string;
    name: string;
    dbServer: string;
    dbDatabase: string;
    sourcePath: string;
    sourceType: string;
  } | null;
  turns: Array<{
    id: string;
    role: string;
    authorName?: string;
    content: string;
    status: string;
    proposedAction: ProposedAction | null;
    executionResult: ExecutionResult | null;
    createdAt: string;
  }>;
}

function serializeTurn(turn: CopilotTurn & { author?: { name: string } | null }) {
  return {
    id: turn.id,
    role: turn.role,
    authorName: turn.author?.name,
    content: turn.content,
    status: turn.status,
    proposedAction: (turn.proposedAction as unknown as ProposedAction) ?? null,
    executionResult: (turn.executionResult as unknown as ExecutionResult) ?? null,
    createdAt: turn.createdAt.toISOString(),
  };
}

export async function getOrInitCopilot(chatId: string, consultant: AuthUser): Promise<CopilotState> {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      user: { include: { environment: true } },
      environment: true,
      escalation: true,
    },
  });

  if (!chat) throw notFound('Conversación no encontrada');

  const env = chat.environment ?? chat.user.environment;
  if (!env) {
    return { hasEnvironment: false, environment: null, turns: [] };
  }

  // Asegurar que el chat esté enlazado con el entorno del cliente
  if (!chat.environmentId && env.id) {
    await prisma.chat.update({
      where: { id: chatId },
      data: { environmentId: env.id },
    });
  }

  const existingTurns = await prisma.copilotTurn.findMany({
    where: { chatId },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { name: true } } },
  });

  if (existingTurns.length > 0) {
    return {
      hasEnvironment: true,
      environment: {
        id: env.id,
        name: env.name,
        dbServer: env.dbServer,
        dbDatabase: env.dbDatabase,
        sourcePath: env.sourcePath,
        sourceType: env.sourceType,
      },
      turns: existingTurns.map(serializeTurn),
    };
  }

  // Si no hay turnos y el caso está escalado, generar el diagnóstico inicial automáticamente
  const initialTurn = await generateInitialCopilotDiagnosis(chat, env);

  return {
    hasEnvironment: true,
    environment: {
      id: env.id,
      name: env.name,
      dbServer: env.dbServer,
      dbDatabase: env.dbDatabase,
      sourcePath: env.sourcePath,
      sourceType: env.sourceType,
    },
    turns: initialTurn ? [serializeTurn(initialTurn)] : [],
  };
}

async function generateInitialCopilotDiagnosis(
  chat: any,
  env: ClientEnvironment,
): Promise<CopilotTurn | null> {
  const messages = await prisma.message.findMany({
    where: { chatId: chat.id, internal: false },
    orderBy: { createdAt: 'asc' },
  });

  const lastUser = [...messages].reverse().find((m) => m.authorType === 'USER');
  const userText = lastUser?.content || 'Consulta sobre error en sistema';

  let dbContext = '';
  try {
    const pool = await getEnvironmentDbPool(env);
    const req = pool.request();
    const token = userText.split(/\s+/).find((w: string) => w.length >= 4) || 'factura';
    req.input('token', `%${token}%`);
    const tables = await req.query(`
      SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
      SELECT TOP 4 TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE @token
    `).catch(() => ({ recordset: [] }));

    if (tables.recordset.length > 0) {
      dbContext = `Tablas relacionadas encontradas en ${env.dbDatabase}: ${tables.recordset.map((r: any) => r.TABLE_NAME).join(', ')}`;
    }
  } catch (err) {
    dbContext = `Base de datos de la clínica inaccesible: ${(err as Error).message}`;
  }

  let sourceFilesContext = '';
  try {
    const entries = await fs.readdir(env.sourcePath);
    const relevant = entries.filter((f) => /\.(php|sql|js)$/i.test(f)).slice(0, 6);
    if (relevant.length > 0) {
      sourceFilesContext = `Archivos clave en ${env.sourcePath}: ${relevant.join(', ')}`;
    }
  } catch {
    sourceFilesContext = `Ruta de fuentes no accesible temporalmente.`;
  }

  const escalationSummary = chat.escalation?.summary || 'El caso fue transferido a soporte.';
  const escalationCause = chat.escalation?.probableCause || 'Inconsistencia en validación o datos.';
  const escalationSolution = chat.escalation?.suggestedSolution || 'Revisar parámetros y registros.';

  const diagnosticContent = [
    `**Copiloto IA conectado a ${env.name}**`,
    `He analizado el caso con la base de datos (\`${env.dbDatabase}\`) y el código fuente configurado.`,
    '',
    `📌 **Diagnóstico del problema:**`,
    `${escalationSummary}`,
    '',
    `🔍 **Causa raíz técnica:**`,
    `${escalationCause}`,
    dbContext ? `\n*Contexto BD:* ${dbContext}` : '',
    sourceFilesContext ? `*Contexto Fuentes:* ${sourceFilesContext}` : '',
    '',
    `💡 **Solución recomendada:**`,
    `${escalationSolution}`,
    '',
    `Puedes indicarme si deseas que proceda con la solución, o darme instrucciones específicas (ej. *"Procede pero hazlo de tal forma..."* o *"El cliente me dice que ahora sale tal error..."*).`,
  ].filter(Boolean).join('\n');

  const turn = await prisma.copilotTurn.create({
    data: {
      chatId: chat.id,
      role: 'COPILOT',
      content: diagnosticContent,
      status: 'INFO',
    },
  });

  return turn;
}

export async function sendCopilotMessage(
  chatId: string,
  consultant: AuthUser,
  instruction: string,
): Promise<CopilotTurn> {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      user: { include: { environment: true } },
      environment: true,
      escalation: true,
    },
  });

  if (!chat) throw notFound('Conversación no encontrada');
  const env = chat.environment ?? chat.user.environment;
  if (!env) throw badRequest('Este chat no tiene un entorno de clínica asociado');

  // Registrar el turno del consultor
  const userTurn = await prisma.copilotTurn.create({
    data: {
      chatId,
      authorId: consultant.id,
      role: 'CONSULTANT',
      content: instruction.trim(),
      status: 'INFO',
    },
    include: { author: { select: { name: true } } },
  });

  emitToConsultants('copilot:new_turn', { chatId, turn: serializeTurn(userTurn) });

  // Recopilar historial del copiloto para dar continuidad al diálogo
  const history = await prisma.copilotTurn.findMany({
    where: { chatId },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  const prompt = [
    `Eres el Copiloto Experto de Soporte Técnico para SismaSalud, asistiendo al consultor humano ${consultant.name}.`,
    `Estás conectado al entorno de la institución: ${env.name}`,
    `- Base de datos SQL Server: ${env.dbDatabase} en ${env.dbServer}`,
    `- Ruta de código fuente: ${env.sourcePath}`,
    '',
    `[HISTORIAL DEL COPILOTO CON EL CONSULTOR]`,
    history.map((t: CopilotTurn) => `${t.role}: ${t.content}`).join('\n\n'),
    '',
    `[NUEVA INSTRUCCIÓN / FEEDBACK DEL CONSULTOR]`,
    instruction.trim(),
    '',
    `INSTRUCCIONES DE RESPUESTA:`,
    `1. Responde directamente al consultor en español con lenguaje técnico claro y preciso.`,
    `2. Si el consultor pide proceder con una solución o pide una corrección específica en la BD o en código:`,
    `   - Si requiere un script SQL de corrección, incluye un bloque de código \`\`\`sql con la consulta (SELECT de validación o UPDATE/INSERT).`,
    `   - Si requiere modificar un archivo de código PHP o JS en las fuentes, indica el nombre del archivo y el bloque de código antes y después.`,
    `3. Explica qué impacto tendrá la solución y qué debe verificar el cliente una vez aplicada.`,
  ].join('\n');

  let copilotResponseText = '';
  let proposedAction: ProposedAction | null = null;

  try {
    const result = await runAgent({
      prompt,
      timeoutMs: 45000,
    });
    copilotResponseText = result.answer || result.analysis?.suggestedSolution || 'He analizado tus instrucciones.';
  } catch (error) {
    copilotResponseText = `Analizando tu solicitud: ${(error as Error).message}. He tomado en cuenta las observaciones para el entorno de ${env.name}.`;
  }

  // Detectar si la respuesta propone un script SQL accionable
  const sqlMatch = copilotResponseText.match(/```sql\s*([\s\S]*?)```/i);
  if (sqlMatch && /(UPDATE|INSERT|DELETE|EXEC)\b/i.test(sqlMatch[1])) {
    proposedAction = {
      type: 'SQL',
      description: 'Script SQL correctivo en la base de datos de la clínica',
      sql: sqlMatch[1].trim(),
    };
  }

  const aiTurn = await prisma.copilotTurn.create({
    data: {
      chatId,
      role: 'COPILOT',
      content: copilotResponseText,
      status: proposedAction ? 'PROPOSED' : 'INFO',
      proposedAction: proposedAction ? (proposedAction as any) : undefined,
    },
  });

  const serializedAiTurn = serializeTurn(aiTurn);
  emitToConsultants('copilot:new_turn', { chatId, turn: serializedAiTurn });
  return aiTurn;
}

export async function executeProposedAction(
  chatId: string,
  consultant: AuthUser,
  turnId: string,
  decision: 'APPROVE' | 'REJECT',
) {
  const turn = await prisma.copilotTurn.findUnique({ where: { id: turnId } });
  if (!turn) throw notFound('Turno de copiloto no encontrado');
  if (turn.chatId !== chatId) throw badRequest('El turno no pertenece a esta conversación');

  if (decision === 'REJECT') {
    const updated = await prisma.copilotTurn.update({
      where: { id: turnId },
      data: { status: 'REJECTED' },
    });
    emitToConsultants('copilot:turn_updated', { chatId, turn: serializeTurn(updated) });
    return serializeTurn(updated);
  }

  const action = turn.proposedAction as ProposedAction | null;
  if (!action) throw conflict('Este turno no contiene una acción propuesta para ejecutar.');

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { environment: true, user: { include: { environment: true } } },
  });
  const env = chat?.environment ?? chat?.user.environment;
  if (!env) throw badRequest('No hay un entorno configurado para este caso');

  const executionResult: ExecutionResult = {
    success: false,
    message: '',
    executedAt: new Date().toISOString(),
    executedBy: consultant.name,
  };

  try {
    if (action.type === 'SQL') {
      if (!action.sql) throw new Error('No se proporcionó el código SQL a ejecutar');
      const pool = await getEnvironmentDbPool(env);
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        const req = new sql.Request(transaction);
        const result = await req.query(action.sql);
        await transaction.commit();

        executionResult.success = true;
        executionResult.rowsAffected = Array.isArray(result.rowsAffected)
          ? result.rowsAffected.reduce((a, b) => a + b, 0)
          : result.rowsAffected || 1;
        executionResult.message = `Script SQL ejecutado exitosamente en ${env.dbDatabase}. (${executionResult.rowsAffected} registros afectados).`;
      } catch (sqlErr) {
        await transaction.rollback().catch(() => {});
        throw sqlErr;
      }
    } else if (action.type === 'FILE') {
      if (!action.filePath) throw new Error('No se especificó la ruta del archivo a modificar');
      const resolvedTarget = path.resolve(env.sourcePath, action.filePath);
      // Seguridad: prevenir Path Traversal fuera del directorio del entorno
      if (!resolvedTarget.startsWith(path.resolve(env.sourcePath))) {
        throw new Error('Operación denegada: ruta de archivo fuera del entorno permitido.');
      }

      // 1. Respaldo previo
      const originalContent = await fs.readFile(resolvedTarget, 'utf8');
      const backupPath = `${resolvedTarget}.bak-${Date.now()}`;
      await fs.writeFile(backupPath, originalContent, 'utf8');
      executionResult.backupPath = backupPath;

      // 2. Aplicar modificación
      if (action.replacementContent) {
        await fs.writeFile(resolvedTarget, action.replacementContent, 'utf8');
      } else if (action.targetContent && action.diff) {
        const updated = originalContent.replace(action.targetContent, action.diff);
        await fs.writeFile(resolvedTarget, updated, 'utf8');
      }

      executionResult.success = true;
      executionResult.message = `Archivo ${path.basename(resolvedTarget)} modificado correctamente. Respaldo creado en ${path.basename(backupPath)}.`;
    }

    const updatedTurn = await prisma.copilotTurn.update({
      where: { id: turnId },
      data: {
        status: 'EXECUTED',
        executionResult: executionResult as any,
      },
    });

    // Agregar un turno informativo de cierre del copiloto
    const confirmationTurn = await prisma.copilotTurn.create({
      data: {
        chatId,
        role: 'COPILOT',
        content: `✅ **Solución aplicada correctamente en ${env.name}:**\n${executionResult.message}\n\nPuedes indicarle al cliente en el chat que verifique nuevamente el funcionamiento. Si el cliente reporta alguna novedad, házmelo saber aquí.`,
        status: 'INFO',
      },
    });

    emitToConsultants('copilot:turn_updated', { chatId, turn: serializeTurn(updatedTurn) });
    emitToConsultants('copilot:new_turn', { chatId, turn: serializeTurn(confirmationTurn) });

    return serializeTurn(updatedTurn);
  } catch (error) {
    executionResult.success = false;
    executionResult.message = `Falla al ejecutar la solución: ${(error as Error).message}`;

    const failedTurn = await prisma.copilotTurn.update({
      where: { id: turnId },
      data: {
        status: 'FAILED',
        executionResult: executionResult as any,
      },
    });

    emitToConsultants('copilot:turn_updated', { chatId, turn: serializeTurn(failedTurn) });
    throw error;
  }
}
