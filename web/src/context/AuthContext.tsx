import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, clearSession, getStoredUser, getAccessToken, storeSession } from '../lib/api';
import type { User } from '../lib/types';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredUser<User>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!getAccessToken()) {
        setLoading(false);
        return;
      }
      try {
        const data = await api<{ user: User }>('/auth/me');
        if (!cancelled) {
          setUser(data.user);
          localStorage.setItem('soporte.user', JSON.stringify(data.user));
        }
      } catch {
        if (!cancelled) {
          clearSession();
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string) {
    setError(null);
    try {
      const data = await api<{ accessToken: string; refreshToken: string; user: User }>(
        '/auth/login',
        { method: 'POST', body: { email, password } },
      );
      if (data.user.role === 'CLIENTE') {
        throw new Error('Esta consola es para consultores. Usa la app móvil como cliente.');
      }
      storeSession(data);
      setUser(data.user);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo iniciar sesión';
      setError(message);
      throw caught;
    }
  }

  async function logout() {
    try {
      const refreshToken = localStorage.getItem('soporte.refreshToken');
      if (refreshToken) {
        await api('/auth/logout', { method: 'POST', body: { refreshToken } });
      }
    } catch {
      // Ignoramos errores al cerrar sesión.
    }
    clearSession();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
