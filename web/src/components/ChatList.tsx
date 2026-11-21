import { formatRelative, initials, statusMeta } from '../lib/format';
import type { ChatSummary } from '../lib/types';
import { StatusBadge } from './StatusBadge';

export function ChatList({
  chats,
  selectedId,
  onSelect,
  loading,
  emptyLabel = 'No hay conversaciones con este filtro.',
}: {
  chats: ChatSummary[];
  selectedId: string | null;
  onSelect: (chat: ChatSummary) => void;
  loading?: boolean;
  emptyLabel?: string;
}) {
  if (loading && chats.length === 0) {
    return (
      <div className="space-y-2 p-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-[#16253b]" />
        ))}
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="rounded-full bg-slate-100 dark:bg-[#16253b] p-3 text-slate-400">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5H8L3 21l1.3-4.2A8.5 8.5 0 1 1 21 12Z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Sin conversaciones</p>
        <p className="text-xs text-slate-400">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100 dark:divide-[#1c2f48] overflow-y-auto">
      {chats.map((chat) => {
        const active = chat.id === selectedId;
        return (
          <li key={chat.id}>
            <button
              onClick={() => onSelect(chat)}
              className={`flex w-full flex-col gap-1.5 px-4 py-3 text-left transition cursor-pointer ${
                active
                  ? 'bg-[#eef8fc] dark:bg-[#16253b] border-l-4 border-[#06a1b9] dark:border-[#00ACC1]'
                  : 'hover:bg-slate-50 dark:hover:bg-[#16253b]/50 border-l-4 border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    chat.status === 'WAITING'
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {initials(chat.customer?.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-slate-800 dark:text-[#b2ebf2]">
                    {chat.customer?.name ?? 'Cliente'}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{chat.title}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[10px] text-slate-400">{formatRelative(chat.lastMessageAt)}</span>
                  <StatusBadge status={chat.status} />
                </div>
              </div>
              <div className="flex items-center gap-2 pl-10">
                <p className="min-w-0 flex-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {chat.lastMessagePreview || 'Sin mensajes'}
                </p>
                {chat.status === 'WAITING' && chat.queuePosition ? (
                  <span className="shrink-0 rounded bg-amber-100 dark:bg-amber-950 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                    #{chat.queuePosition}
                  </span>
                ) : null}
                {chat.unreadCount > 0 && chat.status !== 'CLOSED' ? (
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${statusMeta[chat.status].badge}`}>
                    {chat.unreadCount}
                  </span>
                ) : null}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
