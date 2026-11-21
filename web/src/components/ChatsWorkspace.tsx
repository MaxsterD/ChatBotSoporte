import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApiData } from '../hooks/useApiData';
import type { ChatStatus, ChatSummary } from '../lib/types';
import { ChatList } from './ChatList';
import { Conversation, EmptyConversation } from './Conversation';
import { SearchIcon } from './Icons';

const TABS: Array<{ key: ChatStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'Todas' },
  { key: 'WAITING', label: 'En espera' },
  { key: 'BOT', label: 'Agente' },
  { key: 'ASSIGNED', label: 'Asignadas' },
  { key: 'CLOSED', label: 'Cerradas' },
];

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function ChatsWorkspace({
  mine = false,
  title,
  subtitle,
}: {
  mine?: boolean;
  title: string;
  subtitle: string;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<ChatStatus | 'ALL'>(mine ? 'ASSIGNED' : 'ALL');
  const [search, setSearch] = useState('');
  const [mobileOpen, setMobileOpen] = useState(Boolean(searchParams.get('chat')));
  const debouncedSearch = useDebounced(search, 300);
  const selectedId = searchParams.get('chat');

  const params = new URLSearchParams();
  if (status !== 'ALL') params.set('status', status);
  if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
  if (mine) params.set('mine', 'true');

  const { data, loading } = useApiData<{ chats: ChatSummary[] }>(
    `/consultant/chats?${params.toString()}`,
    { chats: [] },
    [status, debouncedSearch, mine],
  );

  function select(id: string) {
    const next = new URLSearchParams(searchParams);
    next.set('chat', id);
    setSearchParams(next, { replace: true });
    setMobileOpen(true);
  }

  function back() {
    const next = new URLSearchParams(searchParams);
    next.delete('chat');
    setSearchParams(next, { replace: true });
    setMobileOpen(false);
  }

  const waitingCount = data.chats.filter((chat) => chat.status === 'WAITING').length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#0e1927] px-5 py-4 transition-colors">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#b2ebf2]">{title}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="rounded-full bg-slate-100 dark:bg-[#16253b] px-2.5 py-1 font-semibold text-slate-600 dark:text-slate-300">
              {data.chats.length} conversaciones
            </span>
            {waitingCount > 0 && (
              <span className="rounded-full bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 font-semibold text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800">
                {waitingCount} en espera
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl bg-slate-100 dark:bg-[#16253b] p-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatus(tab.key)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                  status === tab.key
                    ? 'bg-[#06a1b9] dark:bg-[#00838f] text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto">
            <SearchIcon
              width={15}
              height={15}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente o tema…"
              className="w-56 rounded-xl border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] text-slate-800 dark:text-[#e0f7fa] placeholder-slate-400 dark:placeholder-slate-500 py-1.5 pl-8 pr-3 text-[12px] outline-none transition focus:border-[#06a1b9] focus:ring-1 focus:ring-[#06a1b9]"
            />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section
          className={`min-h-0 w-full shrink-0 flex-col border-r border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] lg:flex lg:w-[370px] ${
            mobileOpen ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <ChatList chats={data.chats} selectedId={selectedId} onSelect={(chat) => select(chat.id)} loading={loading} />
        </section>

        <section
          className={`min-h-0 flex-1 flex-col bg-slate-50 dark:bg-[#0a131f] lg:flex ${mobileOpen ? 'flex' : 'hidden lg:flex'}`}
        >
          {selectedId ? (
            <Conversation chatId={selectedId} onBack={back} />
          ) : (
            <EmptyConversation />
          )}
        </section>
      </div>
    </div>
  );
}

export function LivePage() {
  return (
    <ChatsWorkspace
      title="Conversaciones en vivo"
      subtitle="Todas las conversaciones de SismaSalud, en tiempo real."
    />
  );
}

export function MyChatsPage() {
  return (
    <ChatsWorkspace
      mine
      title="Mis casos"
      subtitle="Conversaciones que tomaste y están bajo tu atención."
    />
  );
}
