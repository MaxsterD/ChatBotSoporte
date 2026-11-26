import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../lib/errors';
import { requireUser } from '../auth/routes';
import {
  closeChat,
  createChat,
  deleteChat,
  getClientChat,
  listClientChats,
  requestHuman,
  sendCustomerMessage,
} from '../chats/service';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw badRequest('Revisa los datos enviados', result.error.flatten());
  return result.data;
}

export async function chatRoutes(app: FastifyInstance) {
  app.get('/chats', async (request) => {
    const user = requireUser(request);
    return { chats: await listClientChats(user.id) };
  });

  app.post('/chats', async (request, reply) => {
    const user = requireUser(request);
    const body = parse(
      z.object({ title: z.string().trim().max(80).optional() }),
      request.body ?? {},
    );
    const chat = await createChat(user, body.title);
    return reply.code(201).send(chat);
  });

  app.get('/chats/:id', async (request) => {
    const user = requireUser(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return getClientChat(user, id);
  });

  app.post('/chats/:id/messages', async (request, reply) => {
    const user = requireUser(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const body = parse(
      z
        .object({
          content: z.string().trim().max(4000).default(''),
          imageUrl: z.string().trim().max(1000).optional().nullable(),
        })
        .refine((data) => data.content.length > 0 || Boolean(data.imageUrl), {
          message: 'Debes enviar un mensaje o una imagen adjunta',
        }),
      request.body,
    );
    const message = await sendCustomerMessage(user, id, body.content, body.imageUrl);
    return reply.code(201).send({ message });
  });

  app.post('/chats/:id/request-human', async (request) => {
    const user = requireUser(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const chat = await requestHuman(user, id);
    return { chat };
  });

  app.post('/chats/:id/close', async (request) => {
    const user = requireUser(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    await closeChat(id, user);
    return { ok: true };
  });

  app.delete('/chats/:id', async (request) => {
    const user = requireUser(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return deleteChat(id, user.id, user.role);
  });
}
