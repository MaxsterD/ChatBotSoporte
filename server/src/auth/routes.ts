import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import {
  hashPassword,
  issueRefreshToken,
  publicUser,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from '../lib/auth';
import type { AuthUser } from '../lib/auth';
import { badRequest, forbidden, unauthorized } from '../lib/errors';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest('Revisa los datos enviados', result.error.flatten());
  }
  return result.data;
}

export function requireUser(request: FastifyRequest): AuthUser {
  const header = request.headers.authorization;
  if (!header?.toLowerCase().startsWith('bearer ')) {
    throw unauthorized();
  }
  return verifyAccessToken(header.slice(7).trim());
}

export function requireStaff(request: FastifyRequest): AuthUser {
  const user = requireUser(request);
  if (user.role === 'CLIENTE') throw forbidden('Solo el equipo de soporte puede hacer esto');
  return user;
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (request, reply) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(80),
        email: z.string().trim().email().max(160),
        password: z.string().min(8).max(120),
      }),
      request.body,
    );

    const email = body.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw badRequest('Ese correo ya está registrado');

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email,
        passwordHash: await hashPassword(body.password),
        role: 'CLIENTE',
      },
    });

    const refresh = await issueRefreshToken(user.id);
    return reply.code(201).send({
      user: publicUser(user),
      accessToken: signAccessToken(user),
      refreshToken: refresh.token,
    });
  });

  app.post('/auth/login', async (request) => {
    const body = parse(
      z.object({
        email: z.string().trim().email(),
        password: z.string().min(1),
      }),
      request.body,
    );

    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });

    if (!user || !user.active) throw unauthorized('Correo o contraseña incorrectos');
    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) throw unauthorized('Correo o contraseña incorrectos');

    const refresh = await issueRefreshToken(user.id);
    return {
      user: publicUser(user),
      accessToken: signAccessToken(user),
      refreshToken: refresh.token,
    };
  });

  app.post('/auth/refresh', async (request) => {
    const body = parse(z.object({ refreshToken: z.string().min(10) }), request.body);
    return rotateRefreshToken(body.refreshToken);
  });

  app.post('/auth/logout', async (request, reply) => {
    const body = parse(
      z.object({ refreshToken: z.string().min(10).optional() }),
      request.body ?? {},
    );
    if (body.refreshToken) await revokeRefreshToken(body.refreshToken);
    return reply.code(204).send();
  });

  app.get('/auth/me', async (request) => {
    const auth = requireUser(request);
    const user = await prisma.user.findUnique({ where: { id: auth.id } });
    if (!user || !user.active) throw unauthorized();
    return { user: publicUser(user) };
  });
}
