import { useState } from 'react';
import { useApiData } from '../hooks/useApiData';
import { formatDateTime, reasonLabel } from '../lib/format';
import type { Analysis } from '../lib/types';
import { ChevronIcon, SparkIcon } from './Icons';

const empty: { analysis: Analysis } = {
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

function Section({ title, children }: { title: string; children: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#06a1b9] dark:text-[#80deea]">{title}</p>
      <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-700 dark:text-[#e0f7fa]">
        {children || 'Sin información registrada.'}
      </p>
    </div>
  );
}

export function AnalysisPanel({
  chatId,
  defaultOpen = true,
}: {
  chatId: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { data, loading } = useApiData<{ analysis: Analysis }>(
    `/consultant/chats/${chatId}/analysis`,
    empty,
    [chatId],
  );
  const analysis = data.analysis;

  return (
    <div className="rounded-xl border border-[#06a1b9]/40 bg-gradient-to-br from-[#f0f9fc] to-white dark:from-[#0e2a3a] dark:to-[#111d2e] shadow-sm">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left cursor-pointer"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#06a1b9] dark:bg-[#00838f] text-white shadow-xs">
          <SparkIcon width={13} height={13} />
        </span>
        <span className="flex-1 text-[12px] font-bold text-[#002b49] dark:text-[#b2ebf2]">
          Análisis del agente SismaSalud
          <span className="ml-2 font-normal text-[#06a1b9] dark:text-[#80deea]">solo visible para consultores</span>
        </span>
        {!loading && analysis.ready ? (
          <span className="rounded-full bg-white dark:bg-[#16253b] px-2 py-0.5 text-[10px] font-semibold text-[#006064] dark:text-[#80deea] ring-1 ring-[#b2ebf2] dark:ring-[#006064]">
            listo
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800">
            generando…
          </span>
        )}
        <ChevronIcon
          width={16}
          height={16}
          className={`text-[#06a1b9] dark:text-[#80deea] transition ${open ? '' : '-rotate-90'}`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-[#06a1b9]/20 dark:border-[#1c2f48] px-3.5 py-3">
          {loading && !analysis.available ? (
            <div className="space-y-2">
              <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-[#16253b]" />
              <div className="h-3 w-full animate-pulse rounded bg-slate-200 dark:bg-[#16253b]" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-slate-200 dark:bg-[#16253b]" />
            </div>
          ) : !analysis.available ? (
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              Esta conversación no tiene un análisis registrado. Se genera cuando el agente
              escala el caso a la cola.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                <span className="rounded-full bg-white dark:bg-[#16253b] px-2 py-0.5 font-semibold text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-[#1c2f48]">
                  {reasonLabel(analysis.reason)}
                </span>
                {analysis.createdAt && <span>{formatDateTime(analysis.createdAt)}</span>}
              </div>
              <Section title="Qué encontró">{analysis.summary}</Section>
              <Section title="Causa probable">{analysis.probableCause}</Section>
              <Section title="Solución sugerida">{analysis.suggestedSolution}</Section>
              <Section title="Falta confirmar">{analysis.missingInfo}</Section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
