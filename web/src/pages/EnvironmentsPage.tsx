import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApiData } from '../hooks/useApiData';
import { api } from '../lib/api';
import { initials } from '../lib/format';
import type { ClientEnvironment, LocalEnvironmentConfig, User } from '../lib/types';
import { CheckIcon, CodeIcon, DatabaseIcon, RefreshIcon, ServerIcon, SettingsIcon } from '../components/Icons';

export function EnvironmentsPage() {
  const { user } = useAuth();
  if (user && user.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  const isAdmin = user?.role === 'ADMIN';
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, loading } = useApiData<{ environments: ClientEnvironment[] }>(
    '/consultant/environments',
    { environments: [] },
    [refreshKey],
  );

  const { data: usersData } = useApiData<{ users: User[] }>('/consultant/users', { users: [] });

  // Configuración del Entorno Local Base
  const { data: localData } = useApiData<{ localEnvironment: LocalEnvironmentConfig | null }>(
    '/consultant/local-environment',
    { localEnvironment: null },
    [refreshKey],
  );
  const localEnv = localData.localEnvironment;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<ClientEnvironment | null>(null);
  const [assignModalEnv, setAssignModalEnv] = useState<ClientEnvironment | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // Estados para Modal de Configuración de Entorno Local
  const [localModalOpen, setLocalModalOpen] = useState(false);
  const [localDbServer, setLocalDbServer] = useState('');
  const [localDbPort, setLocalDbPort] = useState(1433);
  const [localDbDatabase, setLocalDbDatabase] = useState('');
  const [localDbUser, setLocalDbUser] = useState('');
  const [localDbPassword, setLocalDbPassword] = useState('');
  const [localDbEnabled, setLocalDbEnabled] = useState(true);
  const [localSourcePath, setLocalSourcePath] = useState('');
  const [localSaving, setLocalSaving] = useState(false);
  const [localFormError, setLocalFormError] = useState<string | null>(null);
  const [localSuccessMsg, setLocalSuccessMsg] = useState<string | null>(null);

  const [testLocalDbStatus, setTestLocalDbStatus] = useState<{ loading?: boolean; success?: boolean; message?: string }>({});
  const [testLocalSourceStatus, setTestLocalSourceStatus] = useState<{ loading?: boolean; success?: boolean; message?: string }>({});

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dbServer, setDbServer] = useState('');
  const [dbPort, setDbPort] = useState(1433);
  const [dbDatabase, setDbDatabase] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [sourceType, setSourceType] = useState<'SMB_UNC' | 'LOCAL_PATH'>('SMB_UNC');
  const [sourcePath, setSourcePath] = useState('');
  const [smbUser, setSmbUser] = useState('');
  const [smbPassword, setSmbPassword] = useState('');
  const [smbDomain, setSmbDomain] = useState('');

  // Status banners & testing states
  const [testDbStatus, setTestDbStatus] = useState<Record<string, { loading?: boolean; success?: boolean; message?: string }>>({});
  const [testSourceStatus, setTestSourceStatus] = useState<Record<string, { loading?: boolean; success?: boolean; message?: string }>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function openCreateModal() {
    setEditingEnv(null);
    setName('');
    setDescription('');
    setDbServer('10.120.2.2');
    setDbPort(1433);
    setDbDatabase('SismaSalud_Testing');
    setDbUser('soporte');
    setDbPassword('');
    setSourceType('SMB_UNC');
    setSourcePath('\\\\10.120.2.2\\SismaSalud\\fuentes');
    setSmbUser('');
    setSmbPassword('');
    setSmbDomain('');
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(env: ClientEnvironment) {
    setEditingEnv(env);
    setName(env.name);
    setDescription(env.description || '');
    setDbServer(env.dbServer);
    setDbPort(env.dbPort);
    setDbDatabase(env.dbDatabase);
    setDbUser(env.dbUser);
    setDbPassword('');
    setSourceType(env.sourceType);
    setSourcePath(env.sourcePath);
    setSmbUser(env.smbUser || '');
    setSmbPassword('');
    setSmbDomain(env.smbDomain || '');
    setFormError(null);
    setModalOpen(true);
  }

  function openAssignModal(env: ClientEnvironment) {
    setAssignModalEnv(env);
    // Filtrar usuarios clientes que ya pertenecen a este entorno
    const currentUsers = usersData.users
      .filter((u) => (u as any).environmentId === env.id)
      .map((u) => u.id);
    setSelectedUserIds(currentUsers);
  }

  function openLocalModal() {
    if (localEnv) {
      setLocalDbServer(localEnv.dbServer);
      setLocalDbPort(localEnv.dbPort);
      setLocalDbDatabase(localEnv.dbDatabase);
      setLocalDbUser(localEnv.dbUser);
      setLocalDbPassword('');
      setLocalDbEnabled(localEnv.dbEnabled);
      setLocalSourcePath(localEnv.sourcePath);
    }
    setLocalFormError(null);
    setLocalSuccessMsg(null);
    setTestLocalDbStatus({});
    setTestLocalSourceStatus({});
    setLocalModalOpen(true);
  }

  async function handleSaveLocal(e: FormEvent) {
    e.preventDefault();
    setLocalSaving(true);
    setLocalFormError(null);
    setLocalSuccessMsg(null);

    try {
      await api('/consultant/local-environment', {
        method: 'PUT',
        body: {
          dbServer: localDbServer,
          dbPort: localDbPort,
          dbDatabase: localDbDatabase,
          dbUser: localDbUser,
          ...(localDbPassword.trim() ? { dbPassword: localDbPassword.trim() } : {}),
          dbEnabled: localDbEnabled,
          sourcePath: localSourcePath,
        },
      });
      setLocalSuccessMsg('¡Configuración del entorno local guardada y sincronizada correctamente!');
      setRefreshKey((k) => k + 1);
      setTimeout(() => {
        setLocalModalOpen(false);
      }, 1000);
    } catch (caught) {
      setLocalFormError(caught instanceof Error ? caught.message : 'Error al guardar la configuración local');
    } finally {
      setLocalSaving(false);
    }
  }

  async function handleTestLocalDb(useFormValues = false) {
    setTestLocalDbStatus({ loading: true });
    try {
      const body = useFormValues
        ? {
            dbServer: localDbServer,
            dbPort: localDbPort,
            dbDatabase: localDbDatabase,
            dbUser: localDbUser,
            ...(localDbPassword.trim() ? { dbPassword: localDbPassword.trim() } : { useExistingPassword: true }),
          }
        : {};

      const res = await api<{ success: boolean; message: string; version?: string }>(
        '/consultant/local-environment/test-db',
        {
          method: 'POST',
          body,
        },
      );
      setTestLocalDbStatus({ loading: false, success: res.success, message: res.message });
    } catch (caught) {
      setTestLocalDbStatus({
        loading: false,
        success: false,
        message: caught instanceof Error ? caught.message : 'Falla de conexión a BD local',
      });
    }
  }

  async function handleTestLocalSource(useFormValues = false) {
    setTestLocalSourceStatus({ loading: true });
    try {
      const body = useFormValues && localSourcePath.trim() ? { sourcePath: localSourcePath.trim() } : {};
      const res = await api<{ success: boolean; message: string }>(
        '/consultant/local-environment/test-source',
        {
          method: 'POST',
          body,
        },
      );
      setTestLocalSourceStatus({ loading: false, success: res.success, message: res.message });
    } catch (caught) {
      setTestLocalSourceStatus({
        loading: false,
        success: false,
        message: caught instanceof Error ? caught.message : 'Falla al acceder a la carpeta de fuentes local',
      });
    }
  }


  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const payload = {
      name,
      description,
      dbServer,
      dbPort,
      dbDatabase,
      dbUser,
      ...(dbPassword.trim() ? { dbPassword: dbPassword.trim() } : {}),
      sourceType,
      sourcePath,
      smbUser: smbUser.trim() || undefined,
      ...(smbPassword.trim() ? { smbPassword: smbPassword.trim() } : {}),
      smbDomain: smbDomain.trim() || undefined,
    };

    try {
      if (editingEnv) {
        await api(`/consultant/environments/${editingEnv.id}`, {
          method: 'PUT',
          body: payload,
        });
      } else {
        await api('/consultant/environments', {
          method: 'POST',
          body: payload,
        });
      }
      setModalOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Error al guardar el entorno');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(env: ClientEnvironment) {
    if (!window.confirm(`¿Seguro que deseas eliminar el entorno "${env.name}"? Los chats existentes conservarán su historial.`)) {
      return;
    }
    try {
      await api(`/consultant/environments/${env.id}`, { method: 'DELETE' });
      setRefreshKey((k) => k + 1);
    } catch (caught) {
      alert(caught instanceof Error ? caught.message : 'No se pudo eliminar el entorno');
    }
  }

  async function handleTestDb(env: ClientEnvironment) {
    setTestDbStatus((prev) => ({ ...prev, [env.id]: { loading: true } }));
    try {
      const res = await api<{ success: boolean; message: string; version?: string }>(
        '/consultant/environments/test-db',
        {
          method: 'POST',
          body: { environmentId: env.id },
        },
      );
      setTestDbStatus((prev) => ({
        ...prev,
        [env.id]: { loading: false, success: res.success, message: res.message },
      }));
    } catch (caught) {
      setTestDbStatus((prev) => ({
        ...prev,
        [env.id]: { loading: false, success: false, message: caught instanceof Error ? caught.message : 'Falla de conexión' },
      }));
    }
  }

  async function handleTestSource(env: ClientEnvironment) {
    setTestSourceStatus((prev) => ({ ...prev, [env.id]: { loading: true } }));
    try {
      const res = await api<{ success: boolean; message: string }>(
        '/consultant/environments/test-source',
        {
          method: 'POST',
          body: { environmentId: env.id },
        },
      );
      setTestSourceStatus((prev) => ({
        ...prev,
        [env.id]: { loading: false, success: res.success, message: res.message },
      }));
    } catch (caught) {
      setTestSourceStatus((prev) => ({
        ...prev,
        [env.id]: { loading: false, success: false, message: caught instanceof Error ? caught.message : 'Falla al acceder a la ruta' },
      }));
    }
  }

  async function handleSaveAssignment() {
    if (!assignModalEnv) return;
    setSaving(true);
    try {
      await api(`/consultant/environments/${assignModalEnv.id}/assign-users`, {
        method: 'POST',
        body: { userIds: selectedUserIds },
      });
      setAssignModalEnv(null);
      setRefreshKey((k) => k + 1);
    } catch (caught) {
      alert(caught instanceof Error ? caught.message : 'Error al asignar usuarios');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50 dark:bg-[#0a131f] transition-colors">
      <header className="border-b border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#0e1927] px-6 py-4 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-[#b2ebf2] flex items-center gap-2">
              <ServerIcon width={22} height={22} className="text-[#06a1b9]" />
              Gestión de Entornos
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configuración de base de datos SQL Server y código fuente para soporte con copiloto IA.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={openLocalModal}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] hover:bg-slate-100 dark:hover:bg-[#1a293f] text-slate-700 dark:text-[#b2ebf2] px-3.5 py-2 text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  <SettingsIcon width={14} height={14} className="text-[#06a1b9]" />
                  Configurar Entorno Local
                </button>
                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#06a1b9] hover:bg-[#00838f] text-white px-4 py-2 text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  + Nuevo Entorno
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="p-6">
        {/* Tarjeta Destacada: Entorno Base / Local Predeterminado */}
        <div className="mb-6 rounded-2xl border border-cyan-200 dark:border-cyan-900/60 bg-gradient-to-r from-cyan-50/50 via-white to-slate-50 dark:from-[#082032] dark:via-[#0e1927] dark:to-[#0a131f] p-5 shadow-xs transition hover:shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#06a1b9]/15 text-[#06a1b9] dark:text-[#80deea]">
                <SettingsIcon width={22} height={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-[#b2ebf2]">
                    Entorno Base / Local (SismaSalud Predeterminado)
                  </h2>
                  <span className="rounded-full bg-cyan-100 dark:bg-cyan-950/80 px-2 py-0.5 text-[9.5px] font-bold text-cyan-800 dark:text-cyan-300 ring-1 ring-cyan-200 dark:ring-cyan-800">
                    NO QUEMADO EN CÓDIGO
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Fuente local y base de datos SQL Server que el bot y soporte usan por defecto cuando un cliente no tiene entorno asignado.
                </p>
              </div>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={openLocalModal}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#002b49] hover:bg-[#003d66] dark:bg-[#003d66] dark:hover:bg-[#005288] text-white px-3.5 py-2 text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <SettingsIcon width={14} height={14} />
                Cambiar Configuración Local
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Bloque BD Local */}
            <div className="rounded-xl border border-slate-200/80 dark:border-[#1c2f48] bg-white/80 dark:bg-[#111d2e] p-3 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-[#002b49] dark:text-[#b2ebf2] flex items-center gap-1.5">
                  <DatabaseIcon width={13} height={13} className="text-[#06a1b9]" />
                  Base de Datos Local
                </span>
                <button
                  type="button"
                  onClick={() => void handleTestLocalDb(false)}
                  disabled={testLocalDbStatus.loading}
                  className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#06a1b9] dark:text-[#80deea] hover:underline cursor-pointer disabled:opacity-50"
                >
                  <RefreshIcon width={10} height={10} className={testLocalDbStatus.loading ? 'animate-spin' : ''} />
                  Probar BD
                </button>
              </div>
              <p className="text-[11.5px] text-slate-800 dark:text-[#e0f7fa] font-mono truncate">
                {localEnv?.dbServer || '10.120.2.2'}:{localEnv?.dbPort || 1433} /{' '}
                <span className="font-bold">{localEnv?.dbDatabase || 'SismaSalud_Testing'}</span>
              </p>
              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                <span>Usuario: {localEnv?.dbUser || 'soporte'}</span>
                <span className={localEnv?.dbEnabled ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-500 font-semibold'}>
                  {localEnv?.dbEnabled ? '● Habilitado (Solo lectura)' : '○ Deshabilitado'}
                </span>
              </div>
              {testLocalDbStatus.message && (
                <div
                  className={`mt-2 rounded-lg p-2 text-[10.5px] leading-tight ${
                    testLocalDbStatus.success
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                      : 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
                  }`}
                >
                  {testLocalDbStatus.message}
                </div>
              )}
            </div>

            {/* Bloque Fuente Local */}
            <div className="rounded-xl border border-slate-200/80 dark:border-[#1c2f48] bg-white/80 dark:bg-[#111d2e] p-3 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-[#002b49] dark:text-[#b2ebf2] flex items-center gap-1.5">
                  <CodeIcon width={13} height={13} className="text-[#a5c31c]" />
                  Código Fuente Local
                </span>
                <button
                  type="button"
                  onClick={() => void handleTestLocalSource(false)}
                  disabled={testLocalSourceStatus.loading}
                  className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#06a1b9] dark:text-[#80deea] hover:underline cursor-pointer disabled:opacity-50"
                >
                  <RefreshIcon width={10} height={10} className={testLocalSourceStatus.loading ? 'animate-spin' : ''} />
                  Validar Ruta
                </button>
              </div>
              <p className="text-[11.5px] text-slate-800 dark:text-[#e0f7fa] font-mono truncate" title={localEnv?.sourcePath}>
                {localEnv?.sourcePath || 'C:\\inetpub\\wwwroot\\SismaSalud'}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                Ruta base indexada para contexto de soporte y análisis de código.
              </p>
              {testLocalSourceStatus.message && (
                <div
                  className={`mt-2 rounded-lg p-2 text-[10.5px] leading-tight ${
                    testLocalSourceStatus.success
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                      : 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
                  }`}
                >
                  {testLocalSourceStatus.message}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Separador de Sección de Clínicas */}
        <div className="flex items-center justify-between mb-4 pt-2 border-t border-slate-200/80 dark:border-[#1c2f48]">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-[#b2ebf2]">
              Entornos de Instituciones y Clínicas
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Conexiones dedicadas a SQL Server y código SMB para instituciones específicas.
            </p>
          </div>
        </div>
        {loading && data.environments.length === 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-56 animate-pulse rounded-2xl bg-white dark:bg-[#111d2e] p-5 shadow-xs" />
            ))}
          </div>
        ) : data.environments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] p-12 text-center">
            <ServerIcon width={40} height={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-[#b2ebf2]">No hay entornos configurados</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Configura un entorno (ej. Clínica Santa María) con su base de datos y ruta de fuentes para que el copiloto IA asista a los consultores.
            </p>
            {isAdmin && (
              <button
                onClick={openCreateModal}
                className="mt-4 rounded-xl bg-[#06a1b9] px-4 py-2 text-xs font-bold text-white hover:bg-[#00838f] transition cursor-pointer"
              >
                Configurar primer entorno
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {data.environments.map((env) => {
              const dbStatus = testDbStatus[env.id];
              const sourceStatus = testSourceStatus[env.id];

              return (
                <div
                  key={env.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] p-5 shadow-xs transition hover:shadow-md"
                >
                  <div>
                    {/* Header de la Tarjeta */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <h2 className="text-sm font-bold text-slate-900 dark:text-[#b2ebf2]">{env.name}</h2>
                        {env.description && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                            {env.description}
                          </p>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${
                          env.active
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {env.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>

                    {/* Bloque SQL Server */}
                    <div className="rounded-xl border border-slate-100 dark:border-[#1c2f48] bg-slate-50/70 dark:bg-[#0a131f] p-3 text-xs mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-[#002b49] dark:text-[#b2ebf2] flex items-center gap-1.5">
                          <DatabaseIcon width={13} height={13} className="text-[#06a1b9]" />
                          SQL Server
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleTestDb(env)}
                          disabled={dbStatus?.loading}
                          className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#06a1b9] dark:text-[#80deea] hover:underline cursor-pointer disabled:opacity-50"
                        >
                          <RefreshIcon width={10} height={10} className={dbStatus?.loading ? 'animate-spin' : ''} />
                          Probar
                        </button>
                      </div>
                      <p className="text-[11.5px] text-slate-700 dark:text-[#e0f7fa] font-mono truncate">
                        {env.dbServer}:{env.dbPort} / <span className="font-bold">{env.dbDatabase}</span>
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Usuario: {env.dbUser}
                      </p>

                      {dbStatus && (
                        <div
                          className={`mt-2 rounded-lg p-2 text-[10.5px] leading-tight ${
                            dbStatus.success
                              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                              : 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
                          }`}
                        >
                          {dbStatus.message}
                        </div>
                      )}
                    </div>

                    {/* Bloque Fuentes SMB */}
                    <div className="rounded-xl border border-slate-100 dark:border-[#1c2f48] bg-slate-50/70 dark:bg-[#0a131f] p-3 text-xs mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-[#002b49] dark:text-[#b2ebf2] flex items-center gap-1.5">
                          <CodeIcon width={13} height={13} className="text-[#a5c31c]" />
                          Código Fuente ({env.sourceType === 'SMB_UNC' ? 'SMB / Red' : 'Local'})
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleTestSource(env)}
                          disabled={sourceStatus?.loading}
                          className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#06a1b9] dark:text-[#80deea] hover:underline cursor-pointer disabled:opacity-50"
                        >
                          <RefreshIcon width={10} height={10} className={sourceStatus?.loading ? 'animate-spin' : ''} />
                          Probar
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-700 dark:text-[#e0f7fa] font-mono truncate" title={env.sourcePath}>
                        {env.sourcePath}
                      </p>

                      {sourceStatus && (
                        <div
                          className={`mt-2 rounded-lg p-2 text-[10.5px] leading-tight ${
                            sourceStatus.success
                              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                              : 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
                          }`}
                        >
                          {sourceStatus.message}
                        </div>
                      )}
                    </div>

                    {/* Clientes y Chats vinculados */}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 py-1 border-t border-slate-100 dark:border-[#1c2f48]">
                      <span>{env.usersCount ?? 0} clientes asignados</span>
                      <span>{env.chatsCount ?? 0} casos</span>
                    </div>
                  </div>

                  {/* Acciones de la Tarjeta */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#1c2f48] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openAssignModal(env)}
                      className="rounded-lg bg-slate-100 dark:bg-[#16253b] hover:bg-slate-200 text-slate-700 dark:text-slate-200 px-2.5 py-1 text-xs font-semibold transition cursor-pointer"
                    >
                      Asignar clientes
                    </button>
                    {isAdmin && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(env)}
                          className="rounded-lg border border-slate-200 dark:border-[#1c2f48] px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#16253b] transition cursor-pointer"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(env)}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Crear / Editar Entorno */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#111d2e] p-6 shadow-xl border border-slate-200 dark:border-[#1c2f48] my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-bold text-slate-900 dark:text-[#b2ebf2] mb-1">
              {editingEnv ? `Editar entorno: ${editingEnv.name}` : 'Nuevo Entorno de Institución'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Configura los accesos para que la IA se conecte directamente a la BD y fuentes de esta clínica.
            </p>

            {formError && (
              <div className="mb-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 p-3 text-xs text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nombre de la Institución / Clínica *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. Clínica Santa María"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-[#1c2f48] bg-slate-50 dark:bg-[#0a131f] px-3 py-2 text-slate-800 dark:text-[#e0f7fa] outline-hidden focus:border-[#06a1b9]"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Descripción (opcional)
                </label>
                <input
                  type="text"
                  placeholder="ej. Servidor de pruebas para facturación y glosas"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-[#1c2f48] bg-slate-50 dark:bg-[#0a131f] px-3 py-2 text-slate-800 dark:text-[#e0f7fa] outline-hidden focus:border-[#06a1b9]"
                />
              </div>

              {/* Sección SQL Server */}
              <div className="rounded-xl border border-slate-200 dark:border-[#1c2f48] p-3.5 space-y-3 bg-slate-50/50 dark:bg-[#0a131f]/50">
                <span className="font-bold text-[#002b49] dark:text-[#b2ebf2] flex items-center gap-1.5">
                  <DatabaseIcon width={14} height={14} className="text-[#06a1b9]" />
                  Base de Datos SQL Server
                </span>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Servidor / Host IP *</label>
                    <input
                      type="text"
                      required
                      placeholder="10.120.2.2 o sql.servidor.com"
                      value={dbServer}
                      onChange={(e) => setDbServer(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] px-2.5 py-1.5 outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Puerto</label>
                    <input
                      type="number"
                      required
                      value={dbPort}
                      onChange={(e) => setDbPort(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] px-2.5 py-1.5 outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Nombre de Base de Datos *</label>
                  <input
                    type="text"
                    required
                    placeholder="ej. SismaSalud_Testing"
                    value={dbDatabase}
                    onChange={(e) => setDbDatabase(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] px-2.5 py-1.5 outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Usuario SQL *</label>
                    <input
                      type="text"
                      required
                      placeholder="soporte"
                      value={dbUser}
                      onChange={(e) => setDbUser(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] px-2.5 py-1.5 outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Contraseña {editingEnv ? '(en blanco para mantener)' : '*'}
                    </label>
                    <input
                      type="password"
                      required={!editingEnv}
                      placeholder={editingEnv ? '••••••••' : 'Contraseña de BD'}
                      value={dbPassword}
                      onChange={(e) => setDbPassword(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] px-2.5 py-1.5 outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Sección Fuentes SMB */}
              <div className="rounded-xl border border-slate-200 dark:border-[#1c2f48] p-3.5 space-y-3 bg-slate-50/50 dark:bg-[#0a131f]/50">
                <span className="font-bold text-[#002b49] dark:text-[#b2ebf2] flex items-center gap-1.5">
                  <CodeIcon width={14} height={14} className="text-[#a5c31c]" />
                  Código Fuente (PHP / SQL / JS)
                </span>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Tipo de Ruta</label>
                    <select
                      value={sourceType}
                      onChange={(e) => setSourceType(e.target.value as any)}
                      className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] px-2.5 py-1.5 outline-hidden"
                    >
                      <option value="SMB_UNC">SMB / Red UNC</option>
                      <option value="LOCAL_PATH">Directorio Local</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Ruta del Código Fuente *</label>
                    <input
                      type="text"
                      required
                      placeholder="\\\\10.120.2.2\\SismaSalud\\fuentes o D:\\fuentes"
                      value={sourcePath}
                      onChange={(e) => setSourcePath(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] px-2.5 py-1.5 outline-hidden font-mono text-[11px]"
                    />
                  </div>
                </div>

                {sourceType === 'SMB_UNC' && (
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200/60 dark:border-[#1c2f48]">
                    <div>
                      <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Usuario SMB</label>
                      <input
                        type="text"
                        placeholder="ej. administrador"
                        value={smbUser}
                        onChange={(e) => setSmbUser(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] px-2.5 py-1.5 outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Clave SMB</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={smbPassword}
                        onChange={(e) => setSmbPassword(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] px-2.5 py-1.5 outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Dominio</label>
                      <input
                        type="text"
                        placeholder="opcional"
                        value={smbDomain}
                        onChange={(e) => setSmbDomain(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] px-2.5 py-1.5 outline-hidden"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-[#1c2f48] px-4 py-2 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#06a1b9] hover:bg-[#00838f] text-white px-5 py-2 font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : editingEnv ? 'Guardar Cambios' : 'Crear Entorno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Asignar Clientes */}
      {assignModalEnv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#111d2e] p-6 shadow-xl border border-slate-200 dark:border-[#1c2f48]">
            <h2 className="text-base font-bold text-slate-900 dark:text-[#b2ebf2] mb-1">
              Asignar Clientes a {assignModalEnv.name}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Los chats iniciados por estos usuarios se conectarán automáticamente a este entorno.
            </p>

            <div className="max-h-60 overflow-y-auto space-y-2 mb-4 divide-y divide-slate-100 dark:divide-[#1c2f48]">
              {usersData.users
                .filter((u) => u.role === 'CLIENTE')
                .map((u) => {
                  const checked = selectedUserIds.includes(u.id);

                  return (
                    <label
                      key={u.id}
                      className="flex items-center gap-3 pt-2 text-xs text-slate-800 dark:text-[#e0f7fa] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUserIds([...selectedUserIds, u.id]);
                          } else {
                            setSelectedUserIds(selectedUserIds.filter((id) => id !== u.id));
                          }
                        }}
                        className="rounded border-slate-300 text-[#06a1b9] focus:ring-[#06a1b9]"
                      />
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold">
                        {initials(u.name)}
                      </div>
                      <div className="flex-1 truncate">
                        <p className="font-semibold">{u.name}</p>
                        <p className="text-[10px] text-slate-400">{u.email}</p>
                      </div>
                    </label>
                  );
                })}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-[#1c2f48]">
              <button
                type="button"
                onClick={() => setAssignModalEnv(null)}
                className="rounded-xl border border-slate-200 dark:border-[#1c2f48] px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSaveAssignment()}
                disabled={saving}
                className="rounded-xl bg-[#06a1b9] hover:bg-[#00838f] text-white px-5 py-2 text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar Asignación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Configuración del Entorno Local Base */}
      {localModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#111d2e] p-6 shadow-2xl border border-slate-200 dark:border-[#1c2f48] my-8">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#06a1b9]/15 text-[#06a1b9]">
                  <SettingsIcon width={20} height={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-[#b2ebf2]">
                    Configurar Entorno Local / Base
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cambia la base de datos SQL Server y la carpeta de fuentes predeterminadas sin tocar código ni reiniciar manualmente.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLocalModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {localFormError && (
              <div className="mb-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 p-3 text-xs text-rose-700 dark:text-rose-200 border border-rose-200 dark:border-rose-800">
                {localFormError}
              </div>
            )}

            {localSuccessMsg && (
              <div className="mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 p-3 text-xs text-emerald-700 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2">
                <CheckIcon width={16} height={16} />
                {localSuccessMsg}
              </div>
            )}

            <form onSubmit={handleSaveLocal} className="space-y-4 text-xs">
              {/* Sección Fuente Local */}
              <div className="rounded-xl border border-slate-200/80 dark:border-[#1c2f48] bg-slate-50/50 dark:bg-[#0a131f] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-[#002b49] dark:text-[#b2ebf2] flex items-center gap-1.5">
                    <CodeIcon width={14} height={14} className="text-[#a5c31c]" />
                    Código Fuente Local
                  </h3>
                  <button
                    type="button"
                    onClick={() => void handleTestLocalSource(true)}
                    disabled={testLocalSourceStatus.loading}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#06a1b9] dark:text-[#80deea] hover:underline cursor-pointer disabled:opacity-50"
                  >
                    <RefreshIcon width={11} height={11} className={testLocalSourceStatus.loading ? 'animate-spin' : ''} />
                    Validar Carpeta
                  </button>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Ruta de la Carpeta de Código Fuente *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="C:\inetpub\wwwroot\SismaSalud o D:\Repositorios\fuentes"
                    value={localSourcePath}
                    onChange={(e) => setLocalSourcePath(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] px-3 py-2 outline-hidden font-mono text-[11.5px]"
                  />
                  <p className="text-[10.5px] text-slate-400 mt-1">
                    Directorio local donde están los controladores y vistas PHP de SismaSalud para que el agente consulte contexto.
                  </p>
                </div>

                {testLocalSourceStatus.message && (
                  <div
                    className={`rounded-lg p-2 text-[10.5px] ${
                      testLocalSourceStatus.success
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                        : 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
                    }`}
                  >
                    {testLocalSourceStatus.message}
                  </div>
                )}
              </div>

              {/* Sección Base de Datos Local */}
              <div className="rounded-xl border border-slate-200/80 dark:border-[#1c2f48] bg-slate-50/50 dark:bg-[#0a131f] p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-[#002b49] dark:text-[#b2ebf2] flex items-center gap-1.5">
                    <DatabaseIcon width={14} height={14} className="text-[#06a1b9]" />
                    Base de Datos Local (SQL Server)
                  </h3>
                  <button
                    type="button"
                    onClick={() => void handleTestLocalDb(true)}
                    disabled={testLocalDbStatus.loading}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#06a1b9] dark:text-[#80deea] hover:underline cursor-pointer disabled:opacity-50"
                  >
                    <RefreshIcon width={11} height={11} className={testLocalDbStatus.loading ? 'animate-spin' : ''} />
                    Probar Conexión
                  </button>
                </div>

                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={localDbEnabled}
                    onChange={(e) => setLocalDbEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-[#06a1b9] focus:ring-[#06a1b9]"
                  />
                  <span>Habilitar consulta de solo lectura a la base de datos local</span>
                </label>

                <div className="grid grid-cols-3 gap-2.5">
                  <div className="col-span-2">
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Servidor / Host *</label>
                    <input
                      type="text"
                      required
                      placeholder="10.120.2.2 o localhost"
                      value={localDbServer}
                      onChange={(e) => setLocalDbServer(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] px-2.5 py-1.5 outline-hidden font-mono text-[11.5px]"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Puerto *</label>
                    <input
                      type="number"
                      required
                      value={localDbPort}
                      onChange={(e) => setLocalDbPort(parseInt(e.target.value) || 1433)}
                      className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] px-2.5 py-1.5 outline-hidden font-mono text-[11.5px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Nombre Base de Datos *</label>
                    <input
                      type="text"
                      required
                      placeholder="SismaSalud_Testing"
                      value={localDbDatabase}
                      onChange={(e) => setLocalDbDatabase(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] px-2.5 py-1.5 outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">Usuario SQL *</label>
                    <input
                      type="text"
                      required
                      placeholder="soporte"
                      value={localDbUser}
                      onChange={(e) => setLocalDbUser(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] px-2.5 py-1.5 outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Contraseña SQL {localEnv?.hasPassword ? '(dejar en blanco para conservar la actual)' : '*'}
                  </label>
                  <input
                    type="password"
                    placeholder={localEnv?.hasPassword ? '•••••••• (configurada previamente)' : 'Contraseña de SQL Server'}
                    value={localDbPassword}
                    onChange={(e) => setLocalDbPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] px-2.5 py-1.5 outline-hidden"
                  />
                </div>

                {testLocalDbStatus.message && (
                  <div
                    className={`rounded-lg p-2 text-[10.5px] ${
                      testLocalDbStatus.success
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                        : 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
                    }`}
                  >
                    {testLocalDbStatus.message}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-[#1c2f48]">
                <button
                  type="button"
                  onClick={() => setLocalModalOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-[#1c2f48] px-4 py-2 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={localSaving}
                  className="rounded-xl bg-[#06a1b9] hover:bg-[#00838f] text-white px-5 py-2 font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {localSaving ? 'Guardando...' : 'Guardar Configuración Local'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
