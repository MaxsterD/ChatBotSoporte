import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ChatStatus } from '@prisma/client';
import { badRequest, forbidden } from '../lib/errors';
import { hashPassword } from '../lib/auth';
import { requireStaff, requireUser } from '../auth/routes';
import {
  addConsultantNote,
  closeChat,
  createConsultant,
  getChatAnalysis,
  getConsultantChat,
  getQueue,
  getStats,
  listConsultantChats,
  listConsultants,
  listClients,
  releaseChat,
  sendConsultantMessage,
  takeChat,
  updateClientEnvironment,
} from '../chats/service';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw badRequest('Revisa los datos enviados', result.error.flatten());
  return result.data;
}

const statusSchema = z.enum(['BOT', 'WAITING', 'ASSIGNED', 'CLOSED']).optional();

export async function consultantRoutes(app: FastifyInstance) {
  app.get('/consultant/chats', async (request) => {
    const user = requireStaff(request);
    const query = parse(
      z.object({
        status: statusSchema,
        q: z.string().trim().max(120).optional(),
        mine: z.coerce.boolean().optional(),
      }),
      request.query ?? {},
    );
    const chats = await listConsultantChats({
      status: query.status as ChatStatus | undefined,
      search: query.q,
      mine: query.mine,
      consultantId: user.id,
    });
    return { chats };
  });

  app.get('/consultant/queue', async (request) => {
    requireStaff(request);
    return { queue: await getQueue() };
  });

  app.get('/consultant/stats', async (request) => {
    const user = requireStaff(request);
    return getStats(user.id);
  });

  app.get('/consultant/chats/:id', async (request) => {
    requireStaff(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return getConsultantChat(id);
  });

  app.get('/consultant/chats/:id/analysis', async (request) => {
    requireStaff(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return { analysis: await getChatAnalysis(id) };
  });

  app.post('/consultant/chats/:id/take', async (request) => {
    const user = requireStaff(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return takeChat(id, user);
  });

  app.post('/consultant/chats/:id/messages', async (request, reply) => {
    const user = requireStaff(request);
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
    const message = await sendConsultantMessage(id, user, body.content, body.imageUrl);
    return reply.code(201).send({ message });
  });

  app.post('/consultant/chats/:id/notes', async (request, reply) => {
    const user = requireStaff(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const body = parse(
      z.object({ content: z.string().trim().min(1).max(2000) }),
      request.body,
    );
    const note = await addConsultantNote(id, user, body.content);
    return reply.code(201).send({ note });
  });

  app.post('/consultant/chats/:id/release', async (request) => {
    const user = requireStaff(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return releaseChat(id, user);
  });

  app.post('/consultant/chats/:id/close', async (request) => {
    const user = requireStaff(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    await closeChat(id, user);
    return { ok: true };
  });

  app.get('/consultant/users', async (request) => {
    const user = requireStaff(request);
    if (user.role !== 'ADMIN') throw forbidden('Solo un administrador puede listar usuarios internos');
    return { users: await listConsultants() };
  });

  app.post('/consultant/users', async (request, reply) => {
    const user = requireStaff(request);
    if (user.role !== 'ADMIN') throw forbidden('Solo un administrador puede crear consultores');

    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(80),
        email: z.string().trim().email(),
        password: z.string().min(8).max(120),
        role: z.enum(['CONSULTOR', 'ADMIN']).default('CONSULTOR'),
      }),
      request.body,
    );

    const created = await createConsultant({
      name: body.name,
      email: body.email.toLowerCase(),
      passwordHash: await hashPassword(body.password),
      role: body.role,
    });

    return reply.code(201).send({
      user: { id: created.id, name: created.name, email: created.email, role: created.role },
    });
  });

  // Listar clientes registrados en la app móvil (Exclusivo ADMIN)
  app.get('/consultant/clients', async (request) => {
    const user = requireStaff(request);
    if (user.role !== 'ADMIN') throw forbidden('Solo un administrador puede ver los clientes');
    const query = parse(
      z.object({
        q: z.string().trim().max(100).optional(),
        environmentId: z.string().trim().optional(),
      }),
      request.query ?? {},
    );
    return { clients: await listClients({ search: query.q, environmentId: query.environmentId }) };
  });

  // Asignar o cambiar entorno de un cliente móvil (Exclusivo ADMIN)
  app.put('/consultant/clients/:id/environment', async (request) => {
    const user = requireStaff(request);
    if (user.role !== 'ADMIN') throw forbidden('Solo un administrador puede asignar entornos');

    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const body = parse(
      z.object({ environmentId: z.string().uuid().nullable() }),
      request.body,
    );

    return { user: await updateClientEnvironment(id, body.environmentId) };
  });
}
