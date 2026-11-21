import { useState, useMemo } from 'react';
import { useApiData } from '../hooks/useApiData';
import { api } from '../lib/api';
import { formatDateTime, formatRelative, initials } from '../lib/format';
import type { ClientEnvironment, ClientUser } from '../lib/types';
import { CheckIcon, SearchIcon, ServerIcon, UsersIcon } from '../components/Icons';

export function ClientsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [filterEnv, setFilterEnv] = useState<'ALL' | 'WITH_ENV' | 'WITHOUT_ENV'>('ALL');
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [savedUserId, setSavedUserId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: clientsData, loading } = useApiData<{ clients: ClientUser[] }>(
    '/consultant/clients',
    { clients: [] },
    [refreshKey],
  );

  const { data: envsData } = useApiData<{ environments: ClientEnvironment[] }>(
    '/consultant/environments',
    { environments: [] },
  );

  const clients = clientsData.clients;
  const environments = envsData.environments;

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      // Búsqueda por texto
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const matchesName = client.name.toLowerCase().includes(query);
        const matchesEmail = client.email.toLowerCase().includes(query);
        if (!matchesName && !matchesEmail) return false;
      }

      // Filtro por asignación de entorno
      if (filterEnv === 'WITH_ENV') return Boolean(client.environmentId);
      if (filterEnv === 'WITHOUT_ENV') return !client.environmentId;

      return true;
    });
  }, [clients, search, filterEnv]);

  const totalClients = clients.length;
  const withEnvCount = clients.filter((c) => Boolean(c.environmentId)).length;
  const withoutEnvCount = totalClients - withEnvCount;

  async function handleEnvironmentChange(userId: string, newEnvId: string) {
    setSavingUserId(userId);
    setErrorMsg(null);

    try {
      await api(`/consultant/clients/${userId}/environment`, {
        method: 'PUT',
        body: { environmentId: newEnvId || null },
      });

      setSavedUserId(userId);
      setTimeout(() => setSavedUserId(null), 2500);
      setRefreshKey((k) => k + 1);
    } catch (caught) {
      setErrorMsg(caught instanceof Error ? caught.message : 'No se pudo actualizar el entorno');
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50 dark:bg-[#0a131f] transition-colors">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#0e1927] px-6 py-4 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#b2ebf2] flex items-center gap-2">
              <UsersIcon width={22} height={22} className="text-[#06a1b9]" />
              Clientes de la App Móvil
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Usuarios registrados en el celular y asignación administrativa de sus entornos de soporte.
            </p>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-5">
        {/* Banner Informativo de Aislamiento */}
        <div className="rounded-2xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/80 dark:bg-sky-950/30 p-4 text-xs text-sky-900 dark:text-sky-200 shadow-xs flex items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#06a1b9] text-white">
            <ServerIcon width={14} height={14} />
          </div>
          <div className="leading-relaxed">
            <span className="font-bold">Privacidad y Configuración Administrativa:</span>
            <p className="mt-0.5 text-sky-800 dark:text-sky-300">
              Los clientes en la app móvil <strong>nunca ven ni seleccionan estos entornos</strong>. Al asignar aquí una clínica (*ej. Clínica Santa María*), sus conversaciones se vincularán de forma transparente con la base de datos y fuentes configuradas, activando el Copiloto IA para los consultores cuando el caso escale.
            </p>
          </div>
        </div>

        {/* Tarjetas de Métricas Rápidas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Total Clientes Móviles</span>
            <p className="text-2xl font-black text-slate-900 dark:text-[#b2ebf2] mt-1">{totalClients}</p>
            <span className="text-[10px] text-slate-400">Registrados en la aplicación</span>
          </div>

          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-[#111d2e] p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Con Entorno Asignado</span>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{withEnvCount}</p>
            <span className="text-[10px] text-slate-400">Conectados a BD y fuentes de su clínica</span>
          </div>

          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-[#111d2e] p-4 shadow-xs">
            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Sin Entorno (Pendientes)</span>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{withoutEnvCount}</p>
            <span className="text-[10px] text-slate-400">Atendidos con conocimiento general</span>
          </div>
        </div>

        {/* Barra de Filtros y Búsqueda */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] p-3 shadow-xs">
          {/* Buscador */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-[#1c2f48] bg-slate-50 dark:bg-[#0a131f] px-3 py-1.5 min-w-[260px] flex-1 max-w-md focus-within:border-[#06a1b9] transition">
            <SearchIcon width={14} height={14} className="text-slate-400" />
            <input
              type="text"
              placeholder="Buscar cliente por nombre o correo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-slate-800 dark:text-[#e0f7fa] placeholder-slate-400 outline-hidden"
            />
          </div>

          {/* Filtros de Pestaña */}
          <div className="flex gap-1 bg-slate-100 dark:bg-[#0a131f] p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setFilterEnv('ALL')}
              className={`rounded-lg px-3 py-1 transition cursor-pointer ${
                filterEnv === 'ALL'
                  ? 'bg-white dark:bg-[#16253b] text-slate-800 dark:text-[#b2ebf2] shadow-xs'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Todos ({totalClients})
            </button>
            <button
              onClick={() => setFilterEnv('WITH_ENV')}
              className={`rounded-lg px-3 py-1 transition cursor-pointer ${
                filterEnv === 'WITH_ENV'
                  ? 'bg-white dark:bg-[#16253b] text-emerald-700 dark:text-emerald-300 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Con entorno ({withEnvCount})
            </button>
            <button
              onClick={() => setFilterEnv('WITHOUT_ENV')}
              className={`rounded-lg px-3 py-1 transition cursor-pointer ${
                filterEnv === 'WITHOUT_ENV'
                  ? 'bg-white dark:bg-[#16253b] text-amber-700 dark:text-amber-300 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Sin entorno ({withoutEnvCount})
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-rose-50 dark:bg-rose-950/50 p-3 text-xs text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
            {errorMsg}
          </div>
        )}

        {/* Tabla de Clientes */}
        <div className="rounded-2xl border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] shadow-xs overflow-hidden">
          {loading && clients.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">Cargando clientes de la aplicación móvil...</div>
          ) : filteredClients.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <UsersIcon width={36} height={36} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">No se encontraron clientes</p>
              <p className="text-[11px] mt-0.5">
                {search ? 'Intenta con otro término de búsqueda.' : 'Aún no hay clientes registrados en la app móvil.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-[#1c2f48] bg-slate-50/80 dark:bg-[#0a131f]/60 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <th className="px-5 py-3">Cliente Móvil</th>
                    <th className="px-4 py-3">Fecha de Registro</th>
                    <th className="px-4 py-3">Conversaciones</th>
                    <th className="px-5 py-3 min-w-[280px]">Entorno Asignado (Institución)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1c2f48]">
                  {filteredClients.map((client) => {
                    const isSaving = savingUserId === client.id;
                    const isSaved = savedUserId === client.id;

                    return (
                      <tr key={client.id} className="hover:bg-slate-50/60 dark:hover:bg-[#16253b]/40 transition">
                        {/* Cliente */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#002b49] dark:bg-[#001726] border border-[#06a1b9]/30 text-[11px] font-bold text-white shadow-xs">
                              {initials(client.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 dark:text-[#b2ebf2] truncate">{client.name}</p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{client.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Fecha de Registro */}
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400">
                          <span>{formatRelative(client.createdAt)}</span>
                          <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                            {formatDateTime(client.createdAt)}
                          </span>
                        </td>

                        {/* Conversaciones */}
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-[#16253b] px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            {client.chatsCount} {client.chatsCount === 1 ? 'chat' : 'chats'}
                          </span>
                          {client.lastChatAt && (
                            <span className="block text-[10px] text-slate-400 mt-1">
                              Último: {formatRelative(client.lastChatAt)}
                            </span>
                          )}
                        </td>

                        {/* Selector de Entorno Administrativo */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <select
                                value={client.environmentId || ''}
                                onChange={(e) => void handleEnvironmentChange(client.id, e.target.value)}
                                disabled={isSaving}
                                className={`w-full rounded-xl border px-3 py-1.5 text-xs font-medium outline-hidden transition cursor-pointer appearance-none ${
                                  client.environmentId
                                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200'
                                    : 'border-slate-200 dark:border-[#1c2f48] bg-slate-50 dark:bg-[#0a131f] text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                <option value="">— Sin entorno asignado —</option>
                                {environments.map((env) => (
                                  <option key={env.id} value={env.id}>
                                    {env.name} ({env.dbDatabase})
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Feedback de Estado */}
                            <div className="w-20 shrink-0 text-[11px]">
                              {isSaving ? (
                                <span className="text-slate-400 animate-pulse">Guardando…</span>
                              ) : isSaved ? (
                                <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                                  <CheckIcon width={13} height={13} />
                                  Listo
                                </span>
                              ) : client.environment ? (
                                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold truncate block" title={client.environment.dbServer}>
                                  {client.environment.dbServer}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">Genérico</span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
