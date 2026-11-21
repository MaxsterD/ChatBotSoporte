import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData } from '../hooks/useApiData';
import { api } from '../lib/api';
import { formatWait, initials, reasonLabel } from '../lib/format';
import type { Analysis, ChatSummary } from '../lib/types';
import { ClockIcon, CloseIcon, SparkIcon } from '../components/Icons';

const emptyAnalysis: { analysis: Analysis } = {
  analysis: {
    available: false,
    reason: null,
    summary: '',
    probableCause: '',
    suggestedSolution: '',
    missingInfo: '',
    ready: false,
    createdAt: null,
  },
};

function AnalysisModal({
  chat,
  onClose,
  onTake,
  taking,
}: {
  chat: ChatSummary;
  onClose: () => void;
  onTake: () => void;
  taking: boolean;
}) {
  const { data, loading } = useApiData<{ analysis: Analysis }>(
    `/consultant/chats/${chat.id}/analysis`,
    emptyAnalysis,
    [chat.id],
  );
  const analysis = data.analysis;

  const rows: Array<[string, string]> = [
    ['Qué encontró el agente', analysis.summary],
    ['Causa probable', analysis.probableCause],
    ['Solución sugerida', analysis.suggestedSolution],
    ['Falta confirmar', analysis.missingInfo],
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white dark:bg-[#111d2e] border border-slate-200 dark:border-[#1c2f48] shadow-xl">
        <header className="flex items-start gap-3 border-b border-slate-200 dark:border-[#1c2f48] px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950 text-xs font-bold text-amber-800 dark:text-amber-300">
            {initials(chat.customer?.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900 dark:text-[#b2ebf2]">{chat.customer?.name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{chat.title}</p>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              {reasonLabel(chat.escalation?.reason)} · esperando {formatWait(chat.waitingMinutes ?? 0)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#16253b] cursor-pointer">
            <CloseIcon />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {loading && !analysis.available ? (
            <div className="space-y-2">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-4 animate-pulse rounded bg-slate-100 dark:bg-[#16253b]" />
              ))}
            </div>
          ) : (
            rows.map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#06a1b9] dark:text-[#80deea]">
                  {label}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700 dark:text-[#e0f7fa]">
                  {value || 'Sin información registrada.'}
                </p>
              </div>
            ))
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-[#1c2f48] px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 dark:border-[#1c2f48] px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#16253b] cursor-pointer"
          >
            Cerrar
          </button>
          <button
            onClick={onTake}
            disabled={taking}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#06a1b9] dark:bg-[#00838f] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60 cursor-pointer"
          >
            <SparkIcon width={14} height={14} />
            {taking ? 'Tomando…' : 'Tomar el caso'}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function QueuePage() {
  const { data, loading } = useApiData<{ queue: ChatSummary[] }>('/consultant/queue', { queue: [] });
  const [active, setActive] = useState<ChatSummary | null>(null);
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function take(chat: ChatSummary) {
    setTaking(true);
    setError(null);
    try {
      await api(`/consultant/chats/${chat.id}/take`, { method: 'POST' });
      setActive(null);
      navigate(`/?chat=${chat.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo tomar el caso');
    } finally {
      setTaking(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50 dark:bg-[#0a131f] transition-colors">
      <header className="border-b border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#0e1927] px-5 py-4 transition-colors">
        <h1 className="text-lg font-bold text-slate-900 dark:text-[#b2ebf2]">Cola de espera</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Clientes que pidieron un asesor o cuyos casos el agente no pudo resolver.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {error && (
          <div className="mb-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {loading && data.queue.length === 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-48 animate-pulse rounded-2xl bg-white dark:bg-[#111d2e] ring-1 ring-slate-200 dark:ring-[#1c2f48]" />
            ))}
          </div>
        ) : data.queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 dark:border-[#1c2f48] bg-white/60 dark:bg-[#111d2e]/40 py-20 text-center">
            <div className="rounded-full bg-emerald-50 dark:bg-emerald-950/60 p-3 text-emerald-600 dark:text-emerald-400">
              <ClockIcon />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-[#b2ebf2]">No hay nadie en la cola</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Cuando un cliente pida un asesor aparecerá aquí.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.queue.map((chat) => (
              <article
                key={chat.id}
                className="flex flex-col rounded-2xl border border-slate-200 dark:border-[#1c2f48] border-t-3 border-t-[#06a1b9] dark:border-t-[#00ACC1] bg-white dark:bg-[#111d2e] p-4 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-start gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                    {initials(chat.customer?.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-slate-900 dark:text-[#b2ebf2]">
                      {chat.customer?.name}
                    </p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{chat.title}</p>
                  </div>
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                    #{chat.position}
                  </span>
                </div>

                <p className="mt-2 line-clamp-2 text-[12px] text-slate-600 dark:text-[#e0f7fa]">
                  {chat.lastMessagePreview || 'Sin mensajes'}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-[#16253b] px-2 py-0.5 font-semibold text-slate-600 dark:text-slate-300">
                    <ClockIcon width={12} height={12} />
                    {formatWait(chat.waitingMinutes ?? 0)}
                  </span>
                  <span className="rounded-full bg-[#f0f9fc] dark:bg-[#002b49] px-2 py-0.5 font-semibold text-[#06a1b9] dark:text-[#80deea] ring-1 ring-[#bce5f3] dark:ring-[#006064]">
                    {reasonLabel(chat.escalation?.reason)}
                  </span>
                  {chat.escalation?.ready ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">análisis listo</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">analizando…</span>
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setActive(chat)}
                    className="flex-1 rounded-lg border border-[#06a1b9]/40 bg-[#f0f9fc] dark:bg-[#002b49]/60 px-3 py-1.5 text-[11px] font-semibold text-[#006064] dark:text-[#80deea] transition hover:opacity-90 cursor-pointer"
                  >
                    Ver análisis
                  </button>
                  <button
                    onClick={() => void take(chat)}
                    disabled={taking}
                    className="flex-1 rounded-lg bg-[#06a1b9] dark:bg-[#00838f] px-3 py-1.5 text-[11px] font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60 cursor-pointer"
                  >
                    Tomar caso
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {active && (
        <AnalysisModal
          chat={active}
          onClose={() => setActive(null)}
          onTake={() => void take(active)}
          taking={taking}
        />
      )}
    </div>
  );
}
