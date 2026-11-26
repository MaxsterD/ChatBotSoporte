import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSessionSync, persistSession, wipeStoredSession } from './session';
import type { BusinessHoursStatus, ChatDetail, ChatSummary, Message, Session } from './types';

export const RAILWAY_DEFAULT_URL = 'https://chatbotsoporte-production.up.railway.app';
export const RADMIN_DEFAULT_URL = 'http://26.237.103.241:4000';
const SERVER_URL_KEY = 'soporte.server_url.v1';

function resolveDefaultApiUrl() {
  const configured = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();
  if (configured) return configured.replace(/\/$/, '');

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost ??
    '';
  const host = hostUri.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:4000`;

  return RAILWAY_DEFAULT_URL;
}

export let API_URL = resolveDefaultApiUrl();

// Inicialización asíncrona de URL personalizada si se guardó previamente
AsyncStorage.getItem(SERVER_URL_KEY)
  .then((saved) => {
    if (saved && saved.startsWith('http')) {
      API_URL = saved.replace(/\/$/, '');
    }
  })
  .catch(() => {});

export function getApiUrl(): string {
  return API_URL;
}

export async function setCustomApiUrl(newUrl: string): Promise<string> {
  const clean = newUrl.trim().replace(/\/$/, '');
  API_URL = clean;
  await AsyncStorage.setItem(SERVER_URL_KEY, clean);
  return API_URL;
}

export async function resetServerUrlToRadmin(): Promise<string> {
  API_URL = RADMIN_DEFAULT_URL;
  await AsyncStorage.setItem(SERVER_URL_KEY, RADMIN_DEFAULT_URL);
  return API_URL;
}

export function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = 'error') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

let unauthorizedHandler: (() => void) | null = null;
let refreshing: Promise<boolean> | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function performRefresh(): Promise<boolean> {
  const session = getSessionSync();
  if (!session?.refreshToken) return false;

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as {
      accessToken: string;
      refreshToken: string;
      user: Session['user'];
    };
    await persistSession({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    });
    return true;
  } catch {
    return false;
  }
}

/** Renueva la sesión; devuelve false si ya no es válida. */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = performRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions, retry: boolean): Promise<T> {
  const session = getSessionSync();
  const headers: Record<string, string> = {};
  if (session) headers.authorization = `Bearer ${session.accessToken}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor de soporte');
  }

  if (response.status === 401) {
    if (retry && session?.refreshToken) {
      const renewed = await refreshSession();
      if (renewed) return request<T>(path, options, false);
    }
    await wipeStoredSession();
    unauthorizedHandler?.();
    throw new ApiError(401, 'Tu sesión expiró. Vuelve a iniciar sesión.', 'unauthorized');
  }

  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    const error = (data as { error?: { message?: string; code?: string } }).error;
    throw new ApiError(
      response.status,
      error?.message ?? 'No se pudo completar la solicitud',
      error?.code ?? 'error',
    );
  }

  return data as T;
}

export const api = {
  login(email: string, password: string) {
    return request<Session>('/auth/login', { method: 'POST', body: { email, password } }, false);
  },
  register(name: string, email: string, password: string) {
    return request<Session>(
      '/auth/register',
      { method: 'POST', body: { name, email, password } },
      false,
    );
  },
  logout(refreshToken: string) {
    return request<void>('/auth/logout', { method: 'POST', body: { refreshToken } }, false);
  },
  me() {
    return request<{ user: Session['user'] }>('/auth/me', {}, true);
  },
  listChats() {
    return request<{ chats: ChatSummary[] }>('/chats', {}, true);
  },
  createChat(title?: string) {
    return request<ChatDetail>('/chats', { method: 'POST', body: { title } }, true);
  },
  getChat(chatId: string) {
    return request<ChatDetail>(`/chats/${chatId}`, {}, true);
  },
  uploadImage(base64: string, filename?: string, mimeType?: string) {
    return request<{ url: string; filename: string }>(
      '/upload',
      { method: 'POST', body: { base64, filename, mimeType } },
      true,
    );
  },
  sendMessage(chatId: string, content: string, imageUrl?: string | null) {
    return request<{ message: Message }>(
      `/chats/${chatId}/messages`,
      { method: 'POST', body: { content, imageUrl } },
      true,
    );
  },
  requestHuman(chatId: string) {
    return request<{ chat: ChatSummary }>(
      `/chats/${chatId}/request-human`,
      { method: 'POST' },
      true,
    );
  },
  closeChat(chatId: string) {
    return request<{ ok: boolean }>(`/chats/${chatId}/close`, { method: 'POST' }, true);
  },
  getBusinessHours() {
    return request<{ status: BusinessHoursStatus }>('/business-hours', {}, false);
  },
};
