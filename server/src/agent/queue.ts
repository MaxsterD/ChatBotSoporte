import type { AgentTurnInput } from './types';

type Task<T> = (signal: AbortSignal) => Promise<T>;

/**
 * Cola de trabajos del agente: serializa por chat (una conversación de agy a la
 * vez), limita la concurrencia global y permite cancelar si un asesor toma el caso.
 */
export class AgentQueue {
  private readonly chains = new Map<string, Promise<unknown>>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly waiters: Array<() => void> = [];
  private active = 0;

  constructor(private readonly maxConcurrency: number) {}

  run<T>(chatId: string, task: Task<T>): Promise<T> {
    const previous = this.chains.get(chatId) ?? Promise.resolve();
    const controller = new AbortController();
    this.controllers.set(chatId, controller);

    const execute = async () => {
      await this.acquire();
      try {
        return await task(controller.signal);
      } finally {
        this.release();
        if (this.controllers.get(chatId) === controller) {
          this.controllers.delete(chatId);
        }
      }
    };

    const next = previous.then(execute, execute);
    this.chains.set(
      chatId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  cancel(chatId: string) {
    this.controllers.get(chatId)?.abort();
    this.controllers.delete(chatId);
  }

  cancelAll() {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }

  isBusy(chatId: string) {
    return this.controllers.has(chatId);
  }

  get stats() {
    return { active: this.active, waiting: this.waiters.length, chats: this.controllers.size };
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release() {
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) next();
  }
}

export type { AgentTurnInput };
