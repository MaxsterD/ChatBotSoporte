import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, api, setUnauthorizedHandler } from '../api';
import {
  loadStoredSession,
  persistSession,
  wipeStoredSession,
} from '../session';
import type { Session } from '../types';

type SessionContextValue = {
  session: Session | null;
  booting: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
    void (async () => {
      const stored = await loadStoredSession();
      if (!stored) {
        setBooting(false);
        return;
      }
      setSession(stored);
      setBooting(false);
      try {
        const { user } = await api.me();
        const refreshed = { ...stored, user };
        await persistSession(refreshed);
        setSession(refreshed);
      } catch {
        // Si la sesión no es válida, el interceptor ya la limpió.
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, []);

  const startSession = useCallback(async (next: Session) => {
    if (next.user.role !== 'CLIENTE') {
      throw new Error('Esta app es para clientes. Usa la consola web como consultor.');
    }
    await persistSession(next);
    setSession(next);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const next = await api.login(email.trim().toLowerCase(), password);
      await startSession(next);
    },
    [startSession],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const next = await api.register(name.trim(), email.trim().toLowerCase(), password);
      await startSession(next);
    },
    [startSession],
  );

  const logout = useCallback(async () => {
    if (session) {
      try {
        await api.logout(session.refreshToken);
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
      }
    }
    await wipeStoredSession();
    setSession(null);
  }, [session]);

  const value = useMemo(
    () => ({ session, booting, login, register, logout }),
    [session, booting, login, register, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession debe usarse dentro de SessionProvider');
  return context;
}
