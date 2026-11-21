import { useState, type FormEvent } from 'react';
import { useApiData } from '../hooks/useApiData';
import { api } from '../lib/api';
import { formatRelative, initials } from '../lib/format';
import type { User } from '../lib/types';

export function TeamPage() {
  const { data, loading } = useApiData<{ users: User[] }>('/consultant/users', { users: [] });
  const [users, setUsers] = useState<User[] | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const list = users ?? data.users;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const created = await api<{ user: User }>('/consultant/users', {
        method: 'POST',
        body: { name, email, password, role: 'CONSULTOR' },
      });
      setUsers([...list, { ...created.user, createdAt: new Date().toISOString() }]);
      setName('');
      setEmail('');
      setPassword('');
      setMessage('Consultor creado correctamente.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo crear el consultor');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50 dark:bg-[#0a131f] transition-colors">
      <header className="border-b border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#0e1927] px-5 py-4 transition-colors">
        <h1 className="text-lg font-bold text-slate-900 dark:text-[#b2ebf2]">Equipo de soporte</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">Consultores con acceso a la consola web.</p>
      </header>

      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_360px]">
        <section className="rounded-2xl border border-slate-200 dark:border-[#1c2f48] border-t-3 border-t-[#06a1b9] dark:border-t-[#00ACC1] bg-white dark:bg-[#111d2e] shadow-sm">
          <header className="border-b border-slate-100 dark:border-[#1c2f48] px-4 py-3">
            <p className="text-[12px] font-bold text-[#002b49] dark:text-[#b2ebf2]">Usuarios internos</p>
          </header>
          {loading && list.length === 0 ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-[#16253b]" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-[#1c2f48]">
              {list.map((user) => (
                <li key={user.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-200">
                    {initials(user.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-800 dark:text-[#b2ebf2]">{user.name}</p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{user.email}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 dark:bg-[#16253b] px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                    {user.role}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {user.createdAt ? formatRelative(user.createdAt) : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="h-fit rounded-2xl border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] p-4 shadow-sm">
          <p className="text-[12px] font-bold text-slate-700 dark:text-[#b2ebf2]">Nuevo consultor</p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Crea el acceso; la contraseña se puede cambiar después.
          </p>
          <form onSubmit={submit} className="mt-3 space-y-2.5">
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre completo"
              className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#16253b] text-slate-800 dark:text-[#e0f7fa] placeholder-slate-400 dark:placeholder-slate-500 px-3 py-2 text-[12px] outline-none focus:border-[#06a1b9]"
            />
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="correo@institucion.com"
              className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#16253b] text-slate-800 dark:text-[#e0f7fa] placeholder-slate-400 dark:placeholder-slate-500 px-3 py-2 text-[12px] outline-none focus:border-[#06a1b9]"
            />
            <input
              required
              minLength={8}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Contraseña (mínimo 8)"
              className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#16253b] text-slate-800 dark:text-[#e0f7fa] placeholder-slate-400 dark:placeholder-slate-500 px-3 py-2 text-[12px] outline-none focus:border-[#06a1b9]"
            />
            {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
            {message && <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{message}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-[#06a1b9] dark:bg-[#00838f] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Guardando…' : 'Crear consultor'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
