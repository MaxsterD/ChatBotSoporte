import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { verifyAccessToken } from '../lib/auth';
import { env } from '../env';
import type { AuthUser } from '../lib/auth';

let io: Server | null = null;

export function initRealtime(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((v) => v.trim()),
      credentials: true,
    },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    const rawToken =
      (socket.handshake.auth?.token as string | undefined) ??
      (typeof socket.handshake.query.token === 'string' ? socket.handshake.query.token : undefined);

    if (!rawToken) {
      next(new Error('unauthorized'));
      return;
    }
    try {
      const user: AuthUser = verifyAccessToken(rawToken);
      socket.data.user = user;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as AuthUser;
    socket.join(`user:${user.id}`);
    if (user.role === 'CONSULTOR' || user.role === 'ADMIN') {
      socket.join('consultants');
    }

    socket.on('chat:subscribe', (chatId: unknown) => {
      if (typeof chatId === 'string' && (user.role !== 'CLIENTE' || true)) {
        socket.join(`chat:${chatId}`);
      }
    });
    socket.on('chat:unsubscribe', (chatId: unknown) => {
      if (typeof chatId === 'string') socket.leave(`chat:${chatId}`);
    });

    socket.emit('ready', { userId: user.id, role: user.role });
  });

  return io;
}

export function getIo() {
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToConsultants(event: string, payload: unknown) {
  io?.to('consultants').emit(event, payload);
}

export function emitToChatViewers(chatId: string, event: string, payload: unknown) {
  io?.to(`chat:${chatId}`).emit(event, payload);
}

/** Emite a todos los interesados: cliente dueño, consultores y vistas abiertas del chat. */
export function emitToChat(
  chat: { id: string; userId: string },
  event: string,
  payload: unknown,
) {
  emitToUser(chat.userId, event, payload);
  emitToConsultants(event, payload);
  emitToChatViewers(chat.id, event, payload);
}

export function emitToConsultantsOnly(event: string, payload: unknown) {
  io?.to('consultants').emit(event, payload);
}
