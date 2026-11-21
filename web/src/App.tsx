import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Layout } from './components/Layout';
import { LivePage, MyChatsPage } from './components/ChatsWorkspace';
import { LoginPage } from './pages/LoginPage';
import { QueuePage } from './pages/QueuePage';
import { TeamPage } from './pages/TeamPage';
import { EnvironmentsPage } from './pages/EnvironmentsPage';
import { ClientsPage } from './pages/ClientsPage';
import { BusinessHoursPage } from './pages/BusinessHoursPage';
import { AgentWorkspacePage } from './pages/AgentWorkspacePage';
import { useAuth } from './context/AuthContext';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="h-2 w-2 animate-ping rounded-full bg-indigo-500" />
          Cargando consola…
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'CLIENTE') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="h-2 w-2 animate-ping rounded-full bg-indigo-500" />
          Cargando consola…
        </div>
      </div>
    );
  }
  if (!user || user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<LivePage />} />
        <Route path="cola" element={<QueuePage />} />
        <Route path="mios" element={<MyChatsPage />} />
        <Route path="agente" element={<AgentWorkspacePage />} />
        <Route
          path="entornos"
          element={
            <RequireAdmin>
              <EnvironmentsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="clientes"
          element={
            <RequireAdmin>
              <ClientsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="horarios"
          element={
            <RequireAdmin>
              <BusinessHoursPage />
            </RequireAdmin>
          }
        />
        <Route
          path="equipo"
          element={
            <RequireAdmin>
              <TeamPage />
            </RequireAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
