import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { Role, User } from '@prisma/client';
import { env } from '../env';
import { prisma } from '../db';
import { unauthorized } from './errors';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

const ACCESS_SECRET = env.JWT_SECRET;

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(user: Pick<User, 'id' | 'email' | 'name' | 'role'>) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    ACCESS_SECRET,
    { expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'] },
  );
}

export function verifyAccessToken(token: string): AuthUser {
  try {
    const payload = jwt.verify(token, ACCESS_SECRET) as jwt.JwtPayload;
    if (!payload.sub || !payload.role) {
      throw unauthorized();
    }
    return {
      id: String(payload.sub),
      email: String(payload.email ?? ''),
      name: String(payload.name ?? ''),
      role: payload.role as Role,
    };
  } catch {
    throw unauthorized();
  }
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function issueRefreshToken(userId: string) {
  const token = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });
  return { token, expiresAt };
}

export async function rotateRefreshToken(token: string) {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
    throw unauthorized('Sesión expirada, vuelve a iniciar sesión');
  }
  if (!stored.user.active) {
    throw unauthorized('Usuario inactivo');
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const user = stored.user;
  const refresh = await issueRefreshToken(user.id);
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    accessToken: signAccessToken(user),
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
  };
}

export async function revokeRefreshToken(token: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function publicUser(user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'createdAt'>) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}
