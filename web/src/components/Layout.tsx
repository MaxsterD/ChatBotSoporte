import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { useTheme } from '../context/ThemeContext';
import { useApiData } from '../hooks/useApiData';
import { initials } from '../lib/format';
import type { Stats } from '../lib/types';
import { BotIcon, ChatIcon, ClockIcon, LogoutIcon, MoonIcon, QueueIcon, ServerIcon, SmartphoneIcon, SunIcon, UsersIcon } from './Icons';

const emptyStats: Stats = {
  waiting: 0,
  assigned: 0,
  bots: 0,
  closedToday: 0,
  mine: 0,
  analysesPending: 0,
  longestWaitMinutes: 0,
  agent: { mode: '...', model: '', queue: { active: 0, waiting: 0, chats: 0 } },
};

function navClass({ isActive }: { isActive: boolean }) {
  return [
    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
    isActive
      ? 'bg-[var(--primary-color)] text-white shadow-sm font-semibold'
      : 'text-slate-300 hover:bg-white/10 hover:text-white',
  ].join(' ');
}

export function Layout() {
  const { user, logout } = useAuth();
  const { connected } = useRealtime();
  const { isDark, toggleTheme } = useTheme();
  const { data: stats } = useApiData<Stats>('/consultant/stats', emptyStats);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-full min-h-screen bg-slate-100 dark:bg-[#0a131f] transition-colors duration-200">
      <aside className="flex w-64 shrink-0 flex-col bg-[#002b49] dark:bg-[#001726] border-r border-[#003d66] dark:border-[#1c2f48] px-4 py-5 text-white transition-colors duration-200">
        <div className="mb-4 flex flex-col gap-2 rounded-xl bg-[#001d32] dark:bg-[#00101d] border border-[#06a1b9]/30 p-3 shadow-md">
          <img src="/sismasalud.png" alt="SismaSalud" className="h-7 w-auto object-contain" />
          <div className="flex items-center justify-between border-t border-white/10 pt-1.5 text-[10px] text-slate-300 font-medium">
            <span>Consola de Soporte</span>
            <span className="rounded bg-[#06a1b9]/20 border border-[#06a1b9]/40 px-1.5 py-0.5 text-[#80deea] font-bold">STAFF</span>
          </div>
        </div>

        {/* Theme Switcher similar a SismaSalud (Modo Diurno / Modo Nocturno) */}
        <div className="mb-4 flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs">
          <span className="text-slate-300 font-medium">Tema Sisma</span>
          <button
            type="button"
            onClick={toggleTheme}
            id="theme-icon"
            title={isDark ? 'Modo Diurno' : 'Modo Nocturno'}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold text-[#80deea] hover:bg-white/20 transition cursor-pointer"
          >
            {isDark ? (
              <>
                <SunIcon width={14} height={14} className="text-amber-300" />
                <span>Diurno</span>
              </>
            ) : (
              <>
                <MoonIcon width={14} height={14} className="text-[#80deea]" />
                <span>Nocturno</span>
              </>
            )}
          </button>
        </div>

        <nav className="space-y-1">
          <NavLink to="/" end className={navClass}>
            <ChatIcon />
            Conversaciones
            {stats.waiting > 0 && (
              <span className="ml-auto rounded-full bg-amber-400/90 px-2 py-0.5 text-[11px] font-bold text-amber-950">
                {stats.waiting}
              </span>
            )}
          </NavLink>
          <NavLink to="/cola" className={navClass}>
            <QueueIcon />
            Cola de espera
            {stats.waiting > 0 && (
              <span className="ml-auto text-[11px] font-semibold text-amber-300">
                {stats.waiting}
              </span>
            )}
          </NavLink>
          <NavLink to="/mios" className={navClass}>
            <ChatIcon />
            Mis casos
            {stats.mine > 0 && (
              <span className="ml-auto text-[11px] font-semibold text-emerald-300">{stats.mine}</span>
            )}
          </NavLink>
          <NavLink to="/agente" className={navClass}>
            <BotIcon />
            Agente
          </NavLink>
          {user?.role === 'ADMIN' && (
            <>
              <NavLink to="/entornos" className={navClass}>
                <ServerIcon />
                Entornos
              </NavLink>
              <NavLink to="/clientes" className={navClass}>
                <SmartphoneIcon />
                Clientes
              </NavLink>
              <NavLink to="/horarios" className={navClass}>
                <ClockIcon />
                Horario
              </NavLink>
              <NavLink to="/equipo" className={navClass}>
                <UsersIcon />
                Equipo
              </NavLink>
            </>
          )}
        </nav>

        <div className="mt-6 space-y-2 rounded-xl bg-white/5 border border-white/10 p-3 text-[11px] text-slate-300">
          <div className="flex items-center justify-between">
            <span>Agente Sisma</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-white">
              <span
                className={`h-2 w-2 rounded-full ${
                  stats.agent.mode === 'agy' ? 'bg-[#a5c31c]' : 'bg-[#06a1b9]'
                }`}
              />
              {stats.agent.mode}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Modelo</span>
            <span className="max-w-[110px] truncate font-medium text-slate-200">
              {stats.agent.model || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Tiempo real</span>
            <span
              className={`font-semibold ${connected ? 'text-[#a5c31c]' : 'text-amber-300'}`}
            >
              {connected ? 'conectado' : 'reconectando'}
            </span>
          </div>
        </div>

        <div className="mt-auto pt-6">
          <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1d71b6] text-xs font-bold text-white shadow-sm">
              {initials(user?.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{user?.name}</p>
              <p className="truncate text-[11px] text-slate-400">{user?.role.toLowerCase()}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <LogoutIcon width={16} height={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-slate-100 dark:bg-[#0a131f] text-slate-800 dark:text-[#E0F7FA] transition-colors duration-200">
        <Outlet />
      </main>
    </div>
  );
}
