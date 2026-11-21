import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../lib/errors';
import { requireUser } from '../auth/routes';
import {
  executeProposedAction,
  getOrInitCopilot,
  sendCopilotMessage,
} from '../copilot/service';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw badRequest('Revisa los datos enviados', result.error.flatten());
  return result.data;
}

export async function copilotRoutes(app: FastifyInstance) {
  // Obtener estado del copiloto e iniciar diagnóstico si procede
  app.get('/consultant/chats/:id/copilot', async (request) => {
    const user = requireUser(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return getOrInitCopilot(id, user);
  });

  // Enviar mensaje o instrucción del consultor al copiloto IA
  app.post('/consultant/chats/:id/copilot/message', async (request) => {
    const user = requireUser(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const body = parse(
      z.object({ content: z.string().trim().min(1).max(3000) }),
      request.body,
    );
    const turn = await sendCopilotMessage(id, user, body.content);
    return { turn };
  });

  // Aprobar o rechazar la acción propuesta por el copiloto (ejecución de SQL o modificación de archivos)
  app.post('/consultant/chats/:id/copilot/action', async (request) => {
    const user = requireUser(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const body = parse(
      z.object({
        turnId: z.string().uuid(),
        decision: z.enum(['APPROVE', 'REJECT']),
      }),
      request.body,
    );
    const result = await executeProposedAction(id, user, body.turnId, body.decision);
    return { result };
  });
}
