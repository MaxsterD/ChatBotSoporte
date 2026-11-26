import path from 'node:path';
import type {
  Chat,
  ChatStatus,
  ConsultantNote,
  Escalation,
  EscalationReason,
  Message,
  User,
} from '@prisma/client';
import { prisma } from '../db';
import { env, serverRoot } from '../env';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import type { AuthUser } from '../lib/auth';
import {
  emitToChat,
  emitToConsultants,
  emitToConsultantsOnly,
} from '../realtime/io';
import { AgentQueue } from '../agent/queue';
import { runAgent } from '../agent/bridge';
import { buildAnalysisPrompt, buildTurnPrompt } from '../agent/prompts';
import { clipText } from '../agent/sanitize';
import { userWantsHuman, isOfferingHumanQuestion, isAffirmativeResponse } from '../agent/intent';
import { sismaDb } from '../agent/db/sismaDb';
import { deleteAgyConversation } from '../agent/conversationManager';
import { getEnvironmentSupportContext } from '../environments/service';
import { checkBusinessHoursStatus } from '../businessHours/service';
import type { AgentAnalysis } from '../agent/types';

export const agentQueue = new AgentQueue(env.AGENT_MAX_CONCURRENCY);

const DEFAULT_WELCOME =
  '¡Hola! Soy el agente de soporte de SismaSalud. Cuéntame tu duda y la reviso contigo. Si en algún momento prefieres hablar con una persona, escríbelo y te conecto con un asesor.';

const QUEUE_MESSAGE =
  'Te estoy conectando con un asesor humano. En un momento se une a la conversación y ve todo lo que hemos hablado.';

type ChatEnvironmentSummary = {
  id: string;
  name: string;
  dbDatabase: string;
  dbServer: string;
  sourcePath: string;
  sourceType: string;
};

type ChatWithPeople = Chat & {
  user: Pick<User, 'id' | 'name' | 'email'> & {
    environment?: ChatEnvironmentSummary | null;
  };
  assignedConsultant: Pick<User, 'id' | 'name'> | null;
  environment?: ChatEnvironmentSummary | null;
  escalation: Escalation | null;
};

export function serializeMessage(message: Message) {
  return {
    id: message.id,
    chatId: message.chatId,
    authorType: message.authorType,
    authorId: message.authorId,
    content: message.content,
    imageUrl: message.imageUrl ?? null,
    internal: message.internal,
    createdAt: message.createdAt,
  };
}

export function serializeConsultantNote(note: ConsultantNote & { author?: Pick<User, 'id' | 'name'> | null }) {
  return {
    id: note.id,
    chatId: note.chatId,
    author: note.author ? { id: note.author.id, name: note.author.name } : null,
    content: note.content,
    createdAt: note.createdAt,
  };
}

export function serializeChat(chat: ChatWithPeople) {
  const envData = chat.environment ?? chat.user?.environment ?? null;

  return {
    id: chat.id,
    title: chat.title,
    status: chat.status,
    lastMessagePreview: chat.lastMessagePreview,
    lastMessageAt: chat.lastMessageAt,
    unreadCount: chat.unreadCount,
    queueEnteredAt: chat.queueEnteredAt,
    takenAt: chat.takenAt,
    closedAt: chat.closedAt,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    customer: chat.user ? { id: chat.user.id, name: chat.user.name, email: chat.user.email } : null,
    consultant: chat.assignedConsultant
      ? { id: chat.assignedConsultant.id, name: chat.assignedConsultant.name }
      : null,
    environment: envData
      ? {
          id: envData.id,
          name: envData.name,
          dbDatabase: envData.dbDatabase,
          dbServer: envData.dbServer,
          sourcePath: envData.sourcePath,
          sourceType: envData.sourceType,
        }
      : null,
    escalation: chat.escalation
      ? {
          reason: chat.escalation.reason,
          ready: chat.escalation.ready,
          createdAt: chat.escalation.createdAt,
        }
      : null,
  };
}

function chatInclude() {
  return {
    user: {
      select: {
        id: true,
        name: true,
        email: true,
        environment: {
          select: {
            id: true,
            name: true,
            dbDatabase: true,
            dbServer: true,
            sourcePath: true,
            sourceType: true,
          },
        },
      },
    },
    assignedConsultant: { select: { id: true, name: true } },
    environment: {
      select: {
        id: true,
        name: true,
        dbDatabase: true,
        dbServer: true,
        sourcePath: true,
        sourceType: true,
      },
    },
    escalation: true,
  } as const;
}

async function loadChat(chatId: string) {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: chatInclude(),
  });
  if (!chat) throw notFound('Conversación no encontrada');
  return chat;
}

async function logEvent(chatId: string, type: string, actorId?: string | null, payload?: unknown) {
  try {
    await prisma.chatEvent.create({
      data: {
        chatId,
        type,
        actorId: actorId ?? null,
        payload: payload === undefined ? undefined : (payload as object),
      },
    });
  } catch (error) {
    console.warn('[chat] no se pudo registrar evento', type, (error as Error).message);
  }
}

async function addMessage(params: {
  chat: Pick<Chat, 'id' | 'userId'>;
  authorType: Message['authorType'];
  authorId?: string | null;
  content: string;
  imageUrl?: string | null;
  internal?: boolean;
  countAsUnread?: boolean;
}) {
  const { chat, authorType, authorId, content, imageUrl, internal = false } = params;
  const trimmed = content.trim();
  if (!trimmed && !imageUrl) throw conflict('El mensaje está vacío');

  const message = await prisma.message.create({
    data: {
      chatId: chat.id,
      authorType,
      authorId: authorId ?? null,
      content: trimmed,
      imageUrl: imageUrl ?? null,
      internal,
    },
  });

  const previewText = trimmed || (imageUrl ? '📷 Imagen adjunta' : '');

  await prisma.chat.update({
    where: { id: chat.id },
    data: {
      lastMessagePreview: clipText(previewText, 140),
      lastMessageAt: message.createdAt,
      ...(!internal && (authorType === 'BOT' || authorType === 'CONSULTANT')
        ? { unreadCount: { increment: 1 } }
        : {}),
    },
  });

  const payload = serializeMessage(message);

  if (internal) {
    emitToConsultants('message:new', payload);
  } else {
    emitToChat(chat, 'message:new', payload);
  }

  return message;
}

export async function createChat(user: AuthUser, title?: string) {
  // Validación de Horario de Atención para clientes móviles
  if (user.role === 'CLIENTE') {
    const hoursStatus = await checkBusinessHoursStatus();
    if (!hoursStatus.isOpen) {
      throw conflict(hoursStatus.message, {
        code: 'OUT_OF_BUSINESS_HOURS',
        scheduleText: hoursStatus.scheduleText,
      });
    }
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { environmentId: true },
  });

  const chat = await prisma.chat.create({
    data: {
      userId: user.id,
      title: title?.trim() || 'Nueva conversación',
      status: 'BOT',
      environmentId: dbUser?.environmentId ?? null,
    },
    include: chatInclude(),
  });

  await addMessage({
    chat,
    authorType: 'SYSTEM',
    content: DEFAULT_WELCOME,
  });

  await logEvent(chat.id, 'chat_created', user.id);
  emitToConsultants('chat:new', serializeChat(chat));
  return getClientChat(user, chat.id);
}

export async function listClientChats(userId: string) {
  const chats = await prisma.chat.findMany({
    where: { userId },
    orderBy: { lastMessageAt: 'desc' },
    include: chatInclude(),
  });

  return Promise.all(
    chats.map(async (chat) => ({
      ...serializeChat(chat),
      queuePosition: chat.status === 'WAITING' ? await queuePosition(chat) : null,
    })),
  );
}

async function queuePosition(chat: Pick<Chat, 'id' | 'queueEnteredAt'>) {
  if (!chat.queueEnteredAt) return null;
  const ahead = await prisma.chat.count({
    where: {
      status: 'WAITING',
      queueEnteredAt: { lt: chat.queueEnteredAt },
    },
  });
  return ahead + 1;
}

export async function getClientChat(user: AuthUser, chatId: string) {
  const chat = await loadChat(chatId);
  if (chat.userId !== user.id) throw forbidden('Esta conversación no te pertenece');

  const messages = await prisma.message.findMany({
    where: { chatId, internal: false },
    orderBy: { createdAt: 'asc' },
  });

  if (chat.unreadCount > 0) {
    await prisma.chat.update({ where: { id: chatId }, data: { unreadCount: 0 } });
    chat.unreadCount = 0;
  }

  return {
    chat: {
      ...serializeChat(chat),
      queuePosition: chat.status === 'WAITING' ? await queuePosition(chat) : null,
    },
    messages: messages.map(serializeMessage),
  };
}

async function refreshChatTitle(chat: Chat, firstUserMessage: string) {
  if (chat.title !== 'Nueva conversación') return;
  await prisma.chat.update({
    where: { id: chat.id },
    data: { title: clipText(firstUserMessage.replace(/\s+/g, ' '), 60) },
  });
}

export async function sendCustomerMessage(
  user: AuthUser,
  chatId: string,
  content: string,
  imageUrl?: string | null,
) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (!chat) throw notFound('Conversación no encontrada');
  if (chat.userId !== user.id) throw forbidden('Esta conversación no te pertenece');
  if (chat.status === 'CLOSED') throw conflict('La conversación está cerrada');

  if (content.length > env.AGENT_MAX_MESSAGE_CHARS) {
    throw conflict(`El mensaje supera el máximo de ${env.AGENT_MAX_MESSAGE_CHARS} caracteres`);
  }

  await refreshChatTitle(chat, content || 'Consulta con imagen adjunta');
  const message = await addMessage({
    chat,
    authorType: 'USER',
    authorId: user.id,
    content,
    imageUrl,
  });

  if (chat.status === 'BOT') {
    let wantsHuman = userWantsHuman(content);
    if (!wantsHuman) {
      const lastBotMessage = await prisma.message.findFirst({
        where: { chatId, authorType: 'BOT', internal: false },
        orderBy: { createdAt: 'desc' },
      });
      if (lastBotMessage && isOfferingHumanQuestion(lastBotMessage.content) && isAffirmativeResponse(content)) {
        wantsHuman = true;
      }
    }

    if (wantsHuman) {
      await requestHuman(user, chatId, 'el cliente lo solicitó');
    } else {
      emitToChat(chat, 'agent:typing', { chatId, value: true, reset: true });
      void enqueueAgentTurn(chatId);
    }
  }

  return serializeMessage(message);
}

export async function requestHuman(user: AuthUser, chatId: string, note?: string) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (!chat) throw notFound('Conversación no encontrada');
  if (chat.userId !== user.id) throw forbidden('Esta conversación no te pertenece');
  if (chat.status === 'CLOSED') throw conflict('La conversación está cerrada');
  if (chat.status === 'ASSIGNED') return serializeChat(await loadChat(chatId));

  agentQueue.cancel(chatId);
  await escalate(chat, 'USER_REQUEST', undefined, note);
  return serializeChat(await loadChat(chatId));
}

export async function escalate(
  chat: Chat,
  reason: EscalationReason,
  analysis?: AgentAnalysis,
  note?: string,
) {
  const fresh = await prisma.chat.findUnique({ where: { id: chat.id } });
  if (!fresh || fresh.status === 'CLOSED' || fresh.status === 'ASSIGNED') return;

  const queueEnteredAt = fresh.queueEnteredAt ?? new Date();

  await prisma.chat.update({
    where: { id: fresh.id },
    data: {
      status: 'WAITING',
      queueEnteredAt,
      assignedConsultantId: null,
      takenAt: null,
    },
  });

  const hasAnalysis = Boolean(
    analysis && (analysis.summary || analysis.probableCause || analysis.suggestedSolution),
  );

  await prisma.escalation.upsert({
    where: { chatId: fresh.id },
    create: {
      chatId: fresh.id,
      reason,
      summary: analysis?.summary ?? '',
      probableCause: analysis?.probableCause ?? '',
      suggestedSolution: analysis?.suggestedSolution ?? '',
      missingInfo: analysis?.missingInfo ?? '',
      ready: hasAnalysis,
    },
    update: {
      reason,
      ...(hasAnalysis
        ? {
            summary: analysis?.summary ?? '',
            probableCause: analysis?.probableCause ?? '',
            suggestedSolution: analysis?.suggestedSolution ?? '',
            missingInfo: analysis?.missingInfo ?? '',
            ready: true,
          }
        : {}),
    },
  });

  await addMessage({
    chat: fresh,
    authorType: 'SYSTEM',
    content: QUEUE_MESSAGE,
  });

  await logEvent(fresh.id, 'escalated', null, { reason, note: note ?? null });

  const updated = await loadChat(fresh.id);
  emitToChat(updated, 'chat:updated', serializeChat(updated));
  emitToConsultants('queue:updated', await getQueue());

  if (!hasAnalysis) {
    void generateCaseAnalysis(fresh.id, reason);
  }

  return updated;
}

async function generateCaseAnalysis(chatId: string, reason: EscalationReason) {
  try {
    await agentQueue.run(chatId, async (signal) => {
      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: { escalation: true },
      });
      if (!chat || chat.status === 'CLOSED') return;
      if (chat.escalation?.ready) return;

      const transcript = await prisma.message.findMany({
        where: { chatId, internal: false },
        orderBy: { createdAt: 'asc' },
      });

      const prompt = buildAnalysisPrompt({ chat, transcript, reason });
      const result = await runAgent({
        prompt,
        conversationId: chat.agyConversationId,
        signal,
        analysisOnly: true,
        timeoutMs: env.AGY_TIMEOUT_MS,
      });

      const analysis = result.analysis;
      if (!analysis.summary && !analysis.probableCause && !analysis.suggestedSolution) return;

      await prisma.escalation.updateMany({
        where: { chatId },
        data: {
          summary: analysis.summary,
          probableCause: analysis.probableCause,
          suggestedSolution: analysis.suggestedSolution,
          missingInfo: analysis.missingInfo,
          ready: true,
        },
      });

      emitToConsultantsOnly('analysis:ready', { chatId });
      await logEvent(chatId, 'analysis_ready', null, { model: result.model });
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'aborted') return;
    console.warn('[agent] no se pudo generar el análisis del caso', (error as Error).message);
    await prisma.escalation.updateMany({
      where: { chatId },
      data: {
        summary: 'El agente no pudo generar el análisis automático del caso.',
        probableCause: 'Error técnico o de capacidad del modelo al analizar la conversación.',
        suggestedSolution:
          'Revisar la conversación completa y confirmar los datos del cliente antes de responder.',
        missingInfo: 'Validar con el cliente el módulo, el mensaje de error y la hora del incidente.',
        ready: true,
      },
    });
    emitToConsultantsOnly('analysis:ready', { chatId });
  }
}

async function enqueueAgentTurn(chatId: string) {
  try {
    await agentQueue.run(chatId, async (signal) => {
      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: { user: true, environment: true },
      });
      if (!chat || chat.status !== 'BOT') return;

      emitToChat(chat, 'agent:typing', { chatId, value: true, reset: true });

      const transcript = await prisma.message.findMany({
        where: { chatId, internal: false },
        orderBy: { createdAt: 'asc' },
      });
      const lastUser = [...transcript].reverse().find((message) => message.authorType === 'USER');
      if (!lastUser) return;

      const userText = lastUser.content || (lastUser.imageUrl ? 'El cliente envió una imagen adjunta.' : '');
      const targetEnvId = chat.environmentId ?? chat.user.environmentId;
      let sismaContext = '';
      const envExtraDirs: string[] = [];

      if (targetEnvId) {
        const envCtx = await getEnvironmentSupportContext(targetEnvId, userText).catch(() => ({
          contextText: '',
          sourceDir: null,
        }));
        sismaContext = envCtx.contextText;
        if (envCtx.sourceDir) {
          envExtraDirs.push(envCtx.sourceDir);
        }
      } else {
        sismaContext = await sismaDb.obtenerContextoSoporte(userText).catch(() => '');
      }

      let imageAbsolutePath: string | null = null;
      if (lastUser.imageUrl) {
        const cleanPath = lastUser.imageUrl.replace(/^\/uploads\//, '');
        imageAbsolutePath = path.resolve(serverRoot, 'uploads', cleanPath);
      }

      const prompt = buildTurnPrompt({
        chat,
        user: chat.user,
        message: lastUser.content,
        imageUrl: lastUser.imageUrl,
        imagePath: imageAbsolutePath,
        transcript,
        isNewConversation: !chat.agyConversationId,
        sismaContext,
      });

      emitToChat(chat, 'agent:typing', { chatId, value: true, reset: true });

      let preview = '';
      const result = await runAgent({
        prompt,
        conversationId: chat.agyConversationId,
        extraDirs: envExtraDirs.length > 0 ? envExtraDirs : undefined,
        signal,
        onStart: () => {
          preview = '';
          emitToChat(chat, 'agent:typing', { chatId, value: true, reset: true });
        },
        onDelta: (text) => {
          preview = clipText(`${preview}${text}`, 2400);
          emitToChat(chat, 'agent:delta', { chatId, text, preview });
        },
      });

      emitToChat(chat, 'agent:typing', { chatId, value: false });

      if (signal.aborted) return;
      const fresh = await prisma.chat.findUnique({ where: { id: chatId } });
      if (!fresh || fresh.status !== 'BOT') return;

      if (result.conversationId && result.conversationId !== fresh.agyConversationId) {
        await prisma.chat.update({
          where: { id: chatId },
          data: { agyConversationId: result.conversationId },
        });
      }

      if (result.answer) {
        await addMessage({ chat: fresh, authorType: 'BOT', content: result.answer });
      }

      let shouldEscalate = result.escalate;
      // Guardrail: si el agente formuló una pregunta ofreciendo transferir con un asesor,
      // NO se escala de inmediato; se espera a que el usuario responda en el siguiente turno.
      if (shouldEscalate && isOfferingHumanQuestion(result.answer)) {
        console.log(`[agent] El agente ofreció asesor mediante pregunta en chat ${chatId}; posponiendo escalamiento a la respuesta del cliente.`);
        shouldEscalate = false;
      }

      if (shouldEscalate) {
        await escalate(fresh, 'BOT', result.analysis);
      }

      await logEvent(chatId, 'agent_turn_done', null, {
        model: result.model,
        partial: result.partial ?? false,
        escalated: shouldEscalate,
      });
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    if (chat) {
      emitToChat(chat, 'agent:typing', { chatId, value: false });
    }
    if (code === 'aborted') return;

    console.warn('[agent] turno fallido en el chat', chatId, (error as Error).message);
    if (!chat || chat.status !== 'BOT') return;

    await escalate(chat, 'AGENT_ERROR', {
      summary: `El agente no pudo completar el turno: ${(error as Error).message}`,
      probableCause:
        'Falla técnica del agente (capacidad del modelo, tiempo de espera agotado o error de ejecución del CLI).',
      suggestedSolution:
        'Retomar la conversación manualmente, responder con la información del caso y verificar si el incidente se repite.',
      missingInfo: 'Confirmar con el cliente el mensaje exacto y si el problema persiste.',
    });
  }
}

async function loadConsultantChat(chatId: string) {
  const chat = await loadChat(chatId);
  const messages = await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: 'asc' },
  });
  const notes = await prisma.consultantNote.findMany({
    where: { chatId },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, name: true } } },
  });

  return {
    chat: {
      ...serializeChat(chat),
      queuePosition: chat.status === 'WAITING' ? await queuePosition(chat) : null,
    },
    messages: messages.map(serializeMessage),
    notes: notes.map(serializeConsultantNote),
  };
}

export async function listConsultantChats(params: {
  status?: ChatStatus;
  search?: string;
  mine?: boolean;
  consultantId: string;
}) {
  const { status, search, mine, consultantId } = params;
  const chats = await prisma.chat.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(mine ? { assignedConsultantId: consultantId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { user: { name: { contains: search, mode: 'insensitive' } } },
              { user: { email: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastMessageAt: 'desc' }],
    take: 200,
    include: chatInclude(),
  });

  return chats.map(serializeChat);
}

export async function getQueue() {
  const chats = await prisma.chat.findMany({
    where: { status: 'WAITING' },
    orderBy: { queueEnteredAt: 'asc' },
    include: chatInclude(),
  });

  return chats.map((chat, index) => ({
    ...serializeChat(chat),
    position: index + 1,
    waitingMinutes: chat.queueEnteredAt
      ? Math.max(0, Math.floor((Date.now() - chat.queueEnteredAt.getTime()) / 60000))
      : 0,
  }));
}

export async function getConsultantChat(chatId: string) {
  return loadConsultantChat(chatId);
}

export async function getChatAnalysis(chatId: string) {
  const escalation = await prisma.escalation.findUnique({ where: { chatId } });
  if (!escalation) {
    return {
      available: false,
      reason: null,
      summary: '',
      probableCause: '',
      suggestedSolution: '',
      missingInfo: '',
      ready: false,
      createdAt: null,
    };
  }
  return {
    available: true,
    reason: escalation.reason,
    summary: escalation.summary,
    probableCause: escalation.probableCause,
    suggestedSolution: escalation.suggestedSolution,
    missingInfo: escalation.missingInfo,
    ready: escalation.ready,
    createdAt: escalation.createdAt,
  };
}

export async function takeChat(chatId: string, consultant: AuthUser) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (!chat) throw notFound('Conversación no encontrada');
  if (chat.status === 'CLOSED') throw conflict('La conversación está cerrada');
  if (chat.status === 'ASSIGNED') {
    if (chat.assignedConsultantId === consultant.id) return loadConsultantChat(chatId);
    throw conflict('Otro asesor ya tomó esta conversación');
  }

  agentQueue.cancel(chatId);

  await prisma.chat.update({
    where: { id: chatId },
    data: {
      status: 'ASSIGNED',
      assignedConsultantId: consultant.id,
      takenAt: new Date(),
      queueEnteredAt: null,
      unreadCount: 0,
    },
  });

  await addMessage({
    chat,
    authorType: 'SYSTEM',
    content: `Un asesor se unió a la conversación. Hola, soy ${consultant.name}.`,
  });

  await logEvent(chatId, 'taken', consultant.id);

  const updated = await loadChat(chatId);
  emitToChat(updated, 'chat:updated', serializeChat(updated));
  emitToChat(updated, 'chat:assigned', {
    chatId,
    consultant: { id: consultant.id, name: consultant.name },
  });
  emitToConsultants('queue:updated', await getQueue());

  return loadConsultantChat(chatId);
}

export async function sendConsultantMessage(
  chatId: string,
  consultant: AuthUser,
  content: string,
  imageUrl?: string | null,
) {
  let chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (!chat) throw notFound('Conversación no encontrada');
  if (chat.status === 'CLOSED') throw conflict('La conversación está cerrada');

  if (chat.status === 'WAITING' || (chat.status === 'BOT' && !chat.assignedConsultantId)) {
    await takeChat(chatId, consultant);
    chat = await prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) throw notFound('Conversación no encontrada');
  }

  if (chat.assignedConsultantId && chat.assignedConsultantId !== consultant.id && consultant.role !== 'ADMIN') {
    throw forbidden('Otro asesor tiene asignada esta conversación');
  }
  if (chat.status !== 'ASSIGNED') throw conflict('Toma la conversación antes de responder');

  const message = await addMessage({
    chat,
    authorType: 'CONSULTANT',
    authorId: consultant.id,
    content,
    imageUrl,
  });

  await logEvent(chatId, 'consultant_message', consultant.id);
  return serializeMessage(message);
}

export async function addConsultantNote(chatId: string, consultant: AuthUser, content: string) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (!chat) throw notFound('Conversación no encontrada');

  const note = await prisma.consultantNote.create({
    data: { chatId, authorId: consultant.id, content: content.trim() },
    include: { author: { select: { id: true, name: true } } },
  });

  emitToConsultantsOnly('note:new', serializeConsultantNote(note));
  return serializeConsultantNote(note);
}

export async function releaseChat(chatId: string, consultant: AuthUser) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (!chat) throw notFound('Conversación no encontrada');
  if (chat.status !== 'ASSIGNED') throw conflict('La conversación no está asignada');
  if (chat.assignedConsultantId !== consultant.id && consultant.role !== 'ADMIN') {
    throw forbidden('Solo el asesor asignado puede devolver la conversación');
  }

  await prisma.chat.update({
    where: { id: chatId },
    data: {
      status: 'BOT',
      assignedConsultantId: null,
      takenAt: null,
      queueEnteredAt: null,
    },
  });

  await addMessage({
    chat,
    authorType: 'SYSTEM',
    content: 'El asesor finalizó su intervención. El agente de soporte vuelve a estar disponible.',
  });

  await logEvent(chatId, 'released', consultant.id);
  const updated = await loadChat(chatId);
  emitToChat(updated, 'chat:updated', serializeChat(updated));
  emitToConsultants('queue:updated', await getQueue());
  return loadConsultantChat(chatId);
}

export async function closeChat(chatId: string, actor: AuthUser) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (!chat) throw notFound('Conversación no encontrada');
  if (chat.status === 'CLOSED') return loadConsultantChat(chatId);

  const isOwner = chat.userId === actor.id;
  const isStaff = actor.role === 'CONSULTOR' || actor.role === 'ADMIN';
  if (!isOwner && !isStaff) throw forbidden('No puedes cerrar esta conversación');

  agentQueue.cancel(chatId);

  await prisma.chat.update({
    where: { id: chatId },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      queueEnteredAt: null,
      unreadCount: 0,
    },
  });

  await addMessage({
    chat,
    authorType: 'SYSTEM',
    content: isOwner
      ? 'El cliente cerró la conversación.'
      : 'El asesor cerró la conversación.',
  });

  await logEvent(chatId, 'closed', actor.id);
  const updated = await loadChat(chatId);
  emitToChat(updated, 'chat:updated', serializeChat(updated));
  emitToConsultants('queue:updated', await getQueue());
  return isStaff ? loadConsultantChat(chatId) : getClientChat(actor, chatId);
}

export async function getStats(consultantId: string) {
  const [waiting, assigned, bots, closedToday, mine, ready] = await Promise.all([
    prisma.chat.count({ where: { status: 'WAITING' } }),
    prisma.chat.count({ where: { status: 'ASSIGNED' } }),
    prisma.chat.count({ where: { status: 'BOT' } }),
    prisma.chat.count({
      where: { status: 'CLOSED', closedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    prisma.chat.count({ where: { assignedConsultantId: consultantId, status: 'ASSIGNED' } }),
    prisma.escalation.count({ where: { ready: false } }),
  ]);

  const oldest = await prisma.chat.findFirst({
    where: { status: 'WAITING' },
    orderBy: { queueEnteredAt: 'asc' },
    select: { queueEnteredAt: true },
  });

  return {
    waiting,
    assigned,
    bots,
    closedToday,
    mine,
    analysesPending: ready,
    longestWaitMinutes: oldest?.queueEnteredAt
      ? Math.max(0, Math.floor((Date.now() - oldest.queueEnteredAt.getTime()) / 60000))
      : 0,
    agent: {
      mode: env.AGENT_MODE,
      model: env.AGY_MODEL,
      queue: agentQueue.stats,
    },
  };
}

export async function createConsultant(input: {
  name: string;
  email: string;
  passwordHash: string;
  role?: 'CONSULTOR' | 'ADMIN';
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict('Ya existe un usuario con ese correo');
  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role ?? 'CONSULTOR',
    },
  });
}

export async function listConsultants() {
  return prisma.user.findMany({
    where: { role: { in: ['CONSULTOR', 'ADMIN'] } },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: { name: 'asc' },
  });
}

export async function listClients(params: { search?: string; environmentId?: string }) {
  const { search, environmentId } = params;

  const whereClause: Record<string, unknown> = { role: 'CLIENTE' };

  if (search && search.trim()) {
    whereClause.OR = [
      { name: { contains: search.trim(), mode: 'insensitive' } },
      { email: { contains: search.trim(), mode: 'insensitive' } },
    ];
  }

  if (environmentId === 'none') {
    whereClause.environmentId = null;
  } else if (environmentId) {
    whereClause.environmentId = environmentId;
  }

  const users = await prisma.user.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: {
      environment: {
        select: {
          id: true,
          name: true,
          dbDatabase: true,
          dbServer: true,
        },
      },
      _count: { select: { chats: true } },
      chats: {
        orderBy: { lastMessageAt: 'desc' },
        take: 1,
        select: { lastMessageAt: true, status: true },
      },
    },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt.toISOString(),
    environmentId: u.environmentId,
    environment: u.environment,
    chatsCount: u._count.chats,
    lastChatAt: u.chats[0]?.lastMessageAt ? u.chats[0].lastMessageAt.toISOString() : null,
    lastChatStatus: u.chats[0]?.status ?? null,
  }));
}

export async function updateClientEnvironment(userId: string, environmentId: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('Usuario no encontrado');
  if (user.role !== 'CLIENTE') throw badRequest('Solo se puede asignar entorno a usuarios clientes');

  if (environmentId) {
    const env = await prisma.clientEnvironment.findUnique({ where: { id: environmentId } });
    if (!env) throw notFound('Entorno no encontrado');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { environmentId },
    include: {
      environment: {
        select: {
          id: true,
          name: true,
          dbDatabase: true,
          dbServer: true,
        },
      },
    },
  });

  // Actualizar también los chats activos del usuario para que hereden el nuevo entorno
  await prisma.chat.updateMany({
    where: { userId, status: { in: ['BOT', 'WAITING', 'ASSIGNED'] } },
    data: { environmentId },
  });

  return {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    environmentId: updated.environmentId,
    environment: updated.environment,
  };
}

/**
 * Elimina un chat y sincroniza la eliminación en Antigravity CLI si tenía conversación agy.
 */
export async function deleteChat(chatId: string, userId: string, role?: string) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (!chat) throw notFound('Chat no encontrado');
  if (chat.userId !== userId && role !== 'ADMIN' && role !== 'CONSULTOR') {
    throw forbidden('No tienes permiso para eliminar este chat');
  }

  if (chat.agyConversationId) {
    try {
      await deleteAgyConversation(chat.agyConversationId);
    } catch (err) {
      console.warn(`[chats] Aviso al limpiar conversación agy ${chat.agyConversationId}:`, err);
    }
  }

  await prisma.chat.delete({ where: { id: chatId } });
  return { ok: true };
}
