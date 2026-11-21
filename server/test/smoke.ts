/**
 * Prueba de humo de la API con el proveedor mock (sin consumir Antigravity).
 * Uso: npm run smoke   (con el servidor levantado en AGENT_MODE=mock)
 */
import { io as connectSocket, type Socket } from 'socket.io-client';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:4000';
const PASSWORD = 'demo1234';

type Json = Record<string, any>;

let failures = 0;
let checks = 0;

function ok(condition: unknown, label: string) {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}`);
  }
}

async function api(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as Json) : {};
  return { status: response.status, data };
}

async function login(email: string) {
  const { status, data } = await api('/auth/login', {
    method: 'POST',
    body: { email, password: PASSWORD },
  });
  if (status !== 200) throw new Error(`login ${email} falló: ${status} ${JSON.stringify(data)}`);
  return data as { accessToken: string; user: { id: string; role: string; name: string } };
}

async function waitFor<T>(label: string, fn: () => Promise<T | null>, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`timeout esperando ${label}`);
}

async function waitForBotMessage(token: string, chatId: string, after: number) {
  return waitFor('respuesta del agente', async () => {
    const { data } = await api(`/chats/${chatId}`, { token });
    const bot = data.messages?.filter((m: Json) => m.authorType === 'BOT');
    return bot.length > after ? bot[bot.length - 1] : null;
  });
}

async function main() {
  console.log('Prueba de humo · SismaSalud Soporte\n');

  const health = await api('/health');
  ok(health.status === 200 && health.data.ok === true, 'health responde');
  ok(health.data.agent?.mode === 'mock', `modo mock activo (${health.data.agent?.mode})`);

  const client = await login('cliente@sismasalud.demo');
  const consultant = await login('consultor1@sismasalud.demo');
  ok(client.user.role === 'CLIENTE', 'login cliente');
  ok(consultant.user.role === 'CONSULTOR', 'login consultor');

  const forbidden = await api('/consultant/chats', { token: client.accessToken });
  ok(forbidden.status === 403, 'cliente no puede entrar a la bandeja de consultores');

  const socket: Socket = connectSocket(BASE, {
    auth: { token: client.accessToken },
    transports: ['websocket'],
  });
  const events: Json[] = [];
  socket.on('message:new', (payload) => events.push(payload));
  await new Promise<void>((resolve, reject) => {
    socket.on('ready', () => resolve());
    socket.on('connect_error', (error) => reject(error));
    setTimeout(() => reject(new Error('socket timeout')), 8000);
  });
  ok(true, 'socket autenticado');

  const created = await api('/chats', {
    method: 'POST',
    token: client.accessToken,
    body: { title: 'Prueba de citas' },
  });
  ok(created.status === 201, 'crear chat');
  const chatId = created.data.chat.id as string;
  ok(created.data.messages.length >= 1, 'mensaje de bienvenida');

  await api(`/chats/${chatId}/messages`, {
    method: 'POST',
    token: client.accessToken,
    body: { content: 'Hola, ¿cómo agendo una cita para un paciente?' },
  });

  const answer = await waitForBotMessage(client.accessToken, chatId, 0);
  ok(answer.content.length > 40, 'el agente responde la duda');
  ok(/cita/i.test(answer.content), 'la respuesta usa la base de conocimiento');
  ok(events.some((event) => event.chatId === chatId), 'el socket recibe los mensajes');

  const queueRequest = await api(`/chats/${chatId}/request-human`, {
    method: 'POST',
    token: client.accessToken,
    body: { reason: 'prueba' },
  });
  ok(queueRequest.status === 200 && queueRequest.data.chat.status === 'WAITING', 'pasa a la cola');

  const queue = await waitFor('cola con el chat', async () => {
    const { data } = await api('/consultant/queue', { token: consultant.accessToken });
    return data.queue?.find((item: Json) => item.id === chatId) ?? null;
  });
  ok(queue.position >= 1, 'aparece en la cola de consultores');

  const chatDetail = await api(`/chats/${chatId}`, { token: client.accessToken });
  const chatJson = JSON.stringify(chatDetail.data);
  ok(!chatJson.includes('probableCause'), 'el cliente no recibe el análisis interno');
  ok(!chatJson.includes('suggestedSolution'), 'el cliente no recibe la solución sugerida');

  const analysis = await waitFor('análisis listo', async () => {
    const { data } = await api(`/consultant/chats/${chatId}/analysis`, {
      token: consultant.accessToken,
    });
    return data.analysis?.ready ? data.analysis : null;
  });
  ok(Boolean(analysis.summary), 'el consultor ve el resumen');
  ok(Boolean(analysis.probableCause), 'el consultor ve la causa probable');
  ok(Boolean(analysis.suggestedSolution), 'el consultor ve la solución sugerida');

  const taken = await api(`/consultant/chats/${chatId}/take`, {
    method: 'POST',
    token: consultant.accessToken,
  });
  ok(taken.status === 200 && taken.data.chat.status === 'ASSIGNED', 'el consultor toma el caso');

  const reply = await api(`/consultant/chats/${chatId}/messages`, {
    method: 'POST',
    token: consultant.accessToken,
    body: { content: 'Hola, soy Laura. Ya estoy revisando tu caso.' },
  });
  ok(reply.status === 201, 'el consultor responde');

  const clientView = await waitFor('respuesta del consultor en el móvil', async () => {
    const { data } = await api(`/chats/${chatId}`, { token: client.accessToken });
    return data.messages?.find((m: Json) => m.authorType === 'CONSULTANT') ?? null;
  });
  ok(clientView.content.includes('Laura'), 'el cliente ve la respuesta del consultor');

  const note = await api(`/consultant/chats/${chatId}/notes`, {
    method: 'POST',
    token: consultant.accessToken,
    body: { content: 'Nota interna de prueba' },
  });
  ok(note.status === 201, 'el consultor agrega nota interna');

  const afterClose = await api(`/chats/${chatId}/close`, {
    method: 'POST',
    token: client.accessToken,
  });
  ok(afterClose.status === 200, 'el cliente puede cerrar la conversación');

  socket.close();

  console.log(`\n${checks - failures}/${checks} comprobaciones correctas`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error('\nPrueba de humo falló:', error.message);
  process.exit(1);
});
