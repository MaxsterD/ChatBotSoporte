import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth/routes';
import { badRequest } from '../lib/errors';
import {
  createStaffSession,
  deleteStaffSession,
  executeStaffPlanAction,
  getStaffSession,
  listStaffSessions,
  sendStaffMessage,
  updateStaffPlanAction,
  updateStaffSessionEnvironment,
} from '../staffAgent/service';
import { purgeOrphanAgyConversations } from '../agent/conversationManager';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw badRequest('Revisa los datos enviados', result.error.flatten());
  return result.data;
}

export async function staffAgentRoutes(app: FastifyInstance) {
  // Listar sesiones del consultor
  app.get('/consultant/agent/sessions', async (request) => {
    const user = requireUser(request);
    const sessions = await listStaffSessions(user.id);
    return { sessions };
  });

  // Crear una nueva sesión
  app.post('/consultant/agent/sessions', async (request, reply) => {
    const user = requireUser(request);
    const body = parse(
      z.object({
        title: z.string().optional(),
        environmentId: z.string().uuid().nullable().optional(),
      }),
      request.body ?? {},
    );

    const session = await createStaffSession(user.id, body);
    return reply.code(201).send({ session });
  });

  // Obtener detalle de sesión con mensajes
  app.get('/consultant/agent/sessions/:id', async (request) => {
    const user = requireUser(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const session = await getStaffSession(id, user.id, user.role);
    return { session };
  });

  // Cambiar entorno de la sesión activa
  app.put('/consultant/agent/sessions/:id/environment', async (request) => {
    const user = requireUser(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const body = parse(
      z.object({
        environmentId: z.string().uuid().nullable(),
      }),
      request.body,
    );

    const updated = await updateStaffSessionEnvironment(id, body.environmentId, user.id, user.role);
    return { session: updated };
  });

  // Eliminar una sesión
  app.delete('/consultant/agent/sessions/:id', async (request) => {
    const user = requireUser(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return deleteStaffSession(id, user.id, user.role);
  });

  // Enviar mensaje técnico al agente (Modo Chat o Modo Plan)
  app.post('/consultant/agent/sessions/:id/messages', async (request) => {
    const user = requireUser(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const body = parse(
      z.object({
        content: z.string().default(''),
        imageUrl: z.string().nullable().optional(),
        mode: z.enum(['CHAT', 'PLAN']).optional(),
      }),
      request.body ?? {},
    );

    return sendStaffMessage({
      sessionId: id,
      consultantId: user.id,
      content: body.content,
      imageUrl: body.imageUrl,
      mode: body.mode,
    });
  });

  // Ejecutar (Build) o rechazar un plan técnico en el entorno activo
  app.post('/consultant/agent/sessions/:id/messages/:messageId/execute-plan', async (request) => {
    const user = requireUser(request);
    const { id, messageId } = parse(
      z.object({
        id: z.string().uuid(),
        messageId: z.string().uuid(),
      }),
      request.params,
    );
    const body = parse(
      z.object({
        decision: z.enum(['APPROVE', 'REJECT']),
      }),
      request.body,
    );

    return executeStaffPlanAction({
      sessionId: id,
      messageId,
      consultantId: user.id,
      role: user.role,
      decision: body.decision,
    });
  });

  // Modificar o refinar manualmente un plan técnico propuesto
  app.patch('/consultant/agent/sessions/:id/messages/:messageId/plan', async (request) => {
    const user = requireUser(request);
    const { id, messageId } = parse(
      z.object({
        id: z.string().uuid(),
        messageId: z.string().uuid(),
      }),
      request.params,
    );
    const body = parse(
      z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        steps: z.array(z.string()).optional(),
        verificationCriteria: z.string().optional(),
        sql: z.string().optional(),
        filePath: z.string().optional(),
        replacementContent: z.string().optional(),
      }),
      request.body,
    );

    return updateStaffPlanAction({
      sessionId: id,
      messageId,
      consultantId: user.id,
      role: user.role,
      title: body.title,
      description: body.description,
      steps: body.steps,
      verificationCriteria: body.verificationCriteria,
      sql: body.sql,
      filePath: body.filePath,
      replacementContent: body.replacementContent,
    });
  });

  // Purgar huérfanos de agy CLI
  app.post('/consultant/agent/sync-agy', async (request) => {
    requireUser(request);
    const purged = await purgeOrphanAgyConversations();
    return { ok: true, purged };
  });
}
