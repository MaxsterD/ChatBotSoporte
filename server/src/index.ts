import { buildApp } from './app';
import { env } from './env';
import { prisma } from './db';
import { initRealtime, getIo } from './realtime/io';
import { agentQueue } from './chats/service';

const app = await buildApp();

try {
  await app.listen({ host: env.HOST, port: env.PORT });
  initRealtime(app.server);

  app.log.info(
    `API lista en http://localhost:${env.PORT} · agente=${env.AGENT_MODE} · modelo=${env.AGY_MODEL}`,
  );
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`Cerrando por ${signal}...`);
  agentQueue.cancelAll();
  getIo()?.close();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  app.log.error({ reason }, 'Promesa rechazada sin manejar');
});
