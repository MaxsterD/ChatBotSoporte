import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { MoonIcon, SparkIcon, SunIcon } from '../components/Icons';

const DEMO_USERS = [
  { label: 'Consultora', email: 'consultor1@sismasalud.demo' },
  { label: 'Consultor 2', email: 'consultor2@sismasalud.demo' },
  { label: 'Administrador', email: 'admin@sismasalud.demo' },
];

export function LoginPage() {
  const { user, login } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [email, setEmail] = useState('consultor1@sismasalud.demo');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#f0f4f8] dark:bg-[#0a131f] transition-colors">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-[#002b49] via-[#003d66] to-[#0a2540] dark:from-[#001726] dark:via-[#002b49] dark:to-[#00101d] p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#06a1b9]/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-0 left-10 h-72 w-72 rounded-full bg-[#80deea]/15 blur-3xl"
          aria-hidden
        />

        <div className="relative">
          <div className="inline-block rounded-xl bg-[#001d32] dark:bg-[#00101d] border border-[#06a1b9]/30 p-3.5 shadow-xl">
            <img src="/sismasalud.png" alt="SismaSalud" className="h-8 w-auto object-contain" />
          </div>
          <p className="mt-2 text-xs font-semibold text-[#80deea] tracking-wider uppercase">
            Plataforma de Soporte y Consultoría
          </p>
        </div>

        <div className="relative max-w-md">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-[#b2ebf2] ring-1 ring-white/15">
            <SparkIcon width={13} height={13} />
            Agente IA SismaSalud + Consultores Expertos
          </span>
          <h1 className="mt-5 text-3xl font-bold leading-tight">
            Todas las conversaciones de soporte hospitalario en un solo lugar.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Monitorea en tiempo real lo que el agente responde a los usuarios, toma el caso cuando se requiera y accede de inmediato al análisis técnico del incidente.
          </p>
          <ul className="mt-6 space-y-2.5 text-[13px] text-slate-200">
            {[
              'Bandeja en tiempo real de citas, RIPS, facturación y farmacia',
              'Cola de espera con prioridad y tiempo transcurrido',
              'Análisis confidencial del agente para los consultores',
              'Intervención humana inmediata y notas internas privadas',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#06a1b9]" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-slate-400">
          SismaSalud · Soluciones Integradas de Información en Salud
        </p>
      </div>

      <div className="relative flex w-full flex-col items-center justify-center bg-[#f0f4f8] dark:bg-[#0a131f] px-6 py-12 lg:w-1/2 transition-colors">
        {/* Toggle Modo Nocturno / Diurno estilo SismaSalud */}
        <div className="absolute right-6 top-6">
          <button
            type="button"
            onClick={toggleTheme}
            id="theme-icon"
            title={isDark ? 'Modo Diurno' : 'Modo Nocturno'}
            className="flex items-center gap-2 rounded-xl bg-white dark:bg-[#111d2e] border border-slate-200 dark:border-[#1c2f48] px-3 py-1.5 text-xs font-semibold text-[#006064] dark:text-[#b2ebf2] shadow-sm transition hover:opacity-90 cursor-pointer"
          >
            {isDark ? (
              <>
                <SunIcon width={16} height={16} className="text-amber-300" />
                <span>Modo Diurno</span>
              </>
            ) : (
              <>
                <MoonIcon width={16} height={16} className="text-[#06a1b9]" />
                <span>Modo Nocturno</span>
              </>
            )}
          </button>
        </div>

        <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#111d2e] p-8 shadow-xl border border-[#d1e1ec] dark:border-[#1c2f48] transition-colors">
          <div className="mb-6 flex flex-col items-center gap-3">
            <div className="rounded-xl bg-[#002b49] dark:bg-[#001726] border border-[#06a1b9]/30 px-5 py-2.5 shadow-md">
              <img src="/sismasalud.png" alt="SismaSalud" className="h-7 w-auto object-contain" />
            </div>
            <h2 className="text-lg font-bold text-[#002b49] dark:text-[#b2ebf2]">Consola de Consultores</h2>
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              Acceso para consultores y administradores de soporte SismaSalud.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-[#002b49] dark:text-[#b2ebf2] uppercase tracking-wide">
                Usuario / Correo
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-[#1c2f48] bg-slate-50/50 dark:bg-[#16253b] px-3.5 py-2.5 text-sm text-slate-800 dark:text-[#e0f7fa] outline-none transition focus:border-[#06a1b9] focus:bg-white dark:focus:bg-[#16253b] focus:ring-2 focus:ring-[#06a1b9]/20"
                placeholder="consultor@sismasalud.demo"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-[#002b49] dark:text-[#b2ebf2] uppercase tracking-wide">
                Contraseña
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-[#1c2f48] bg-slate-50/50 dark:bg-[#16253b] px-3.5 py-2.5 text-sm text-slate-800 dark:text-[#e0f7fa] outline-none transition focus:border-[#06a1b9] focus:bg-white dark:focus:bg-[#16253b] focus:ring-2 focus:ring-[#06a1b9]/20"
                placeholder="••••••••"
              />
            </label>

            {error && (
              <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#06a1b9] dark:bg-[#00838f] px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-sky-900/20 transition hover:opacity-90 disabled:opacity-60 cursor-pointer"
            >
              {loading ? 'Ingresando…' : 'Ingresar a la consola'}
            </button>
          </form>

          <div className="mt-6 rounded-xl border border-slate-200 dark:border-[#1c2f48] bg-slate-50 dark:bg-[#16253b] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Accesos Demo · Clave: demo1234
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DEMO_USERS.map((demo) => (
                <button
                  key={demo.email}
                  type="button"
                  onClick={() => {
                    setEmail(demo.email);
                    setPassword('demo1234');
                  }}
                  className="rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] px-2.5 py-1 text-[11px] font-medium text-[#06a1b9] dark:text-[#80deea] shadow-2xs transition hover:border-[#06a1b9] hover:bg-sky-50 dark:hover:bg-[#1c2f48] cursor-pointer"
                >
                  {demo.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
