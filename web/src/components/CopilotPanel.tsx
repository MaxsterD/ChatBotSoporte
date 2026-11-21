import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { formatTime } from '../lib/format';
import type { CopilotState, CopilotTurn } from '../lib/types';
import { useRealtime } from '../context/RealtimeContext';
import { CheckIcon, CloseCircleIcon, CodeIcon, DatabaseIcon, PlayIcon, SendIcon, SparkIcon } from './Icons';

export function CopilotPanel({
  chatId,
  environment,
  onClose,
}: {
  chatId: string;
  environment: {
    id: string;
    name: string;
    dbDatabase: string;
    dbServer: string;
    sourcePath: string;
    sourceType: string;
  };
  onClose?: () => void;
}) {
  const [data, setData] = useState<CopilotState | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { version } = useRealtime();

  async function loadData() {
    try {
      const res = await api<CopilotState>(`/consultant/chats/${chatId}/copilot`);
      setData(res);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cargar el copiloto');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    void loadData();
  }, [chatId]);

  useEffect(() => {
    // Recargar silenciosamente cuando haya eventos de realtime
    void loadData();
  }, [version]);

  useEffect(() => {
    if (data?.turns.length) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [data?.turns.length]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || sending) return;

    setSending(true);
    setText('');
    setError(null);

    try {
      const res = await api<{ turn: CopilotTurn }>(`/consultant/chats/${chatId}/copilot/message`, {
        method: 'POST',
        body: { content },
      });
      setData((prev) => (prev ? { ...prev, turns: [...prev.turns, res.turn] } : prev));
      // Re-cargar para obtener el turno de respuesta del copiloto
      setTimeout(() => void loadData(), 1200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error al enviar instrucción');
    } finally {
      setSending(false);
    }
  }

  async function handleAction(turnId: string, decision: 'APPROVE' | 'REJECT') {
    if (decision === 'APPROVE') {
      const confirmed = window.confirm(
        '¿Confirmas la aplicación de esta solución en el entorno de la clínica? Se ejecutará bajo supervisión y respaldo.',
      );
      if (!confirmed) return;
    }

    setActionBusy(turnId);
    setError(null);

    try {
      await api<{ result: CopilotTurn }>(`/consultant/chats/${chatId}/copilot/action`, {
        method: 'POST',
        body: { turnId, decision },
      });
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error al ejecutar la acción');
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <aside className="flex h-full w-[400px] shrink-0 flex-col border-l border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#0e1927] transition-all">
      {/* Header del Entorno */}
      <div className="border-b border-slate-200 dark:border-[#1c2f48] bg-gradient-to-r from-slate-50 to-[#e0f7fa]/30 dark:from-[#0a131f] dark:to-[#0e2a3a]/40 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#06a1b9] dark:bg-[#00838f] text-white shadow-xs">
              <SparkIcon width={15} height={15} />
            </span>
            <div>
              <h2 className="text-xs font-bold text-slate-900 dark:text-[#b2ebf2] flex items-center gap-1.5">
                Copiloto IA
                <span className="rounded bg-[#06a1b9]/20 border border-[#06a1b9]/40 px-1.5 py-0.2 text-[9px] font-bold text-[#006064] dark:text-[#80deea]">
                  CONECTADO
                </span>
              </h2>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[240px]">
                {environment.name}
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Cerrar panel lateral"
            >
              <CloseCircleIcon width={16} height={16} />
            </button>
          )}
        </div>

        {/* Badges de Conectividad con la Clínica */}
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px]">
          <span className="inline-flex items-center gap-1 rounded-md bg-white/90 dark:bg-[#16253b] px-2 py-0.5 font-medium text-slate-700 dark:text-[#80deea] border border-slate-200/80 dark:border-[#1c2f48]">
            <DatabaseIcon width={11} height={11} className="text-[#06a1b9] dark:text-[#00acc1]" />
            <span className="truncate max-w-[120px]">{environment.dbDatabase}</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-white/90 dark:bg-[#16253b] px-2 py-0.5 font-medium text-slate-700 dark:text-[#80deea] border border-slate-200/80 dark:border-[#1c2f48]">
            <CodeIcon width={11} height={11} className="text-[#a5c31c]" />
            <span className="truncate max-w-[140px]">{environment.sourcePath.split(/[\\/]/).pop() || 'Fuentes'}</span>
          </span>
        </div>
      </div>

      {/* Historial del Copiloto */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50 dark:bg-[#0a131f]/60 text-xs">
        {loading && !data ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#06a1b9] border-t-transparent" />
            <span className="text-[11px]">Conectando y analizando entorno...</span>
          </div>
        ) : data?.turns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-[#1c2f48] p-4 text-center text-slate-400">
            <p className="text-[12px] font-medium">Iniciando diagnóstico con el entorno...</p>
            <p className="text-[10px] mt-1">Inspeccionando tablas y código fuente de {environment.name}.</p>
          </div>
        ) : (
          data?.turns.map((turn) => {
            const isCopilot = turn.role === 'COPILOT';
            const action = turn.proposedAction;
            const result = turn.executionResult;

            return (
              <div
                key={turn.id}
                className={`flex flex-col gap-1 ${isCopilot ? 'items-start' : 'items-end'}`}
              >
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 px-1">
                  <span>{isCopilot ? 'Copiloto IA' : turn.authorName || 'Consultor'}</span>
                  <span>·</span>
                  <span>{formatTime(turn.createdAt)}</span>
                </div>

                <div
                  className={`rounded-2xl px-3.5 py-2.5 max-w-[94%] shadow-xs leading-relaxed ${
                    isCopilot
                      ? 'rounded-tl-xs border border-[#b2ebf2]/60 dark:border-[#006064]/60 bg-white dark:bg-[#111d2e] text-slate-800 dark:text-[#e0f7fa]'
                      : 'rounded-tr-xs bg-[#06a1b9] dark:bg-[#00838f] text-white'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{turn.content}</div>

                  {/* Tarjeta de Solución / Acción Propuesta */}
                  {action && (
                    <div className="mt-3 rounded-xl border border-[#06a1b9]/30 dark:border-[#00acc1]/30 bg-[#f0f9fc] dark:bg-[#0d2232] p-3 text-slate-800 dark:text-[#e0f7fa]">
                      <div className="flex items-center justify-between pb-1.5 border-b border-[#06a1b9]/20">
                        <span className="text-[11px] font-bold text-[#002b49] dark:text-[#b2ebf2] flex items-center gap-1">
                          <PlayIcon width={12} height={12} className="text-[#06a1b9]" />
                          Solución Propuesta
                        </span>
                        <span className="rounded bg-[#06a1b9]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#006064] dark:text-[#80deea]">
                          {action.type === 'SQL' ? 'SCRIPT SQL' : 'MODIFICACIÓN DE ARCHIVO'}
                        </span>
                      </div>

                      <p className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                        {action.description}
                      </p>

                      {action.sql && (
                        <div className="mt-2 rounded-lg bg-slate-900 p-2.5 text-[11px] text-emerald-400 font-mono overflow-x-auto">
                          <code>{action.sql}</code>
                        </div>
                      )}

                      {action.filePath && (
                        <div className="mt-2 text-[10px] text-slate-500 font-mono truncate">
                          Archivo: {action.filePath}
                        </div>
                      )}

                      {/* Estado de la Acción */}
                      <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                        {turn.status === 'PROPOSED' ? (
                          <div className="flex w-full gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => void handleAction(turn.id, 'REJECT')}
                              disabled={actionBusy === turn.id}
                              className="rounded-lg border border-slate-300 dark:border-slate-600 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                            >
                              Rechazar
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleAction(turn.id, 'APPROVE')}
                              disabled={actionBusy === turn.id}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#06a1b9] hover:bg-[#00838f] text-white px-3 py-1 text-[11px] font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
                            >
                              {actionBusy === turn.id ? (
                                <span>Ejecutando...</span>
                              ) : (
                                <>
                                  <CheckIcon width={12} height={12} />
                                  Proceder con la solución
                                </>
                              )}
                            </button>
                          </div>
                        ) : turn.status === 'EXECUTED' ? (
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckIcon width={13} height={13} />
                            Solución ejecutada ({result?.rowsAffected ?? 1} filas afectadas)
                          </div>
                        ) : turn.status === 'REJECTED' ? (
                          <div className="text-[10px] text-slate-400 italic">
                            Acción rechazada por el consultor
                          </div>
                        ) : turn.status === 'FAILED' ? (
                          <div className="text-[10px] text-rose-500 font-semibold">
                            Falla en ejecución
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/50 px-3 py-1.5 text-[10.5px] text-rose-600 dark:text-rose-300 border-t border-rose-200 dark:border-rose-900">
          {error}
        </div>
      )}

      {/* Input de Diálogo Consultor <-> Copiloto */}
      <form onSubmit={handleSend} className="border-t border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#0e1927] p-2.5">
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-[#1c2f48] bg-slate-50 dark:bg-[#111d2e] px-2.5 py-1.5 focus-within:border-[#06a1b9] transition">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={sending}
            placeholder="Instruir a la IA (ej. 'Procede pero no toques X')..."
            className="flex-1 bg-transparent text-xs text-slate-800 dark:text-[#e0f7fa] placeholder-slate-400 outline-hidden"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#06a1b9] text-white hover:bg-[#00838f] disabled:opacity-40 transition cursor-pointer"
            title="Enviar directriz al copiloto"
          >
            <SendIcon width={13} height={13} />
          </button>
        </div>
      </form>
    </aside>
  );
}
