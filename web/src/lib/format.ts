import type { ChatStatus } from './types';

export function initials(name?: string | null) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '??';
}

export function formatRelative(iso?: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatWait(minutes: number) {
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h ${rest} min`;
}

export const statusMeta: Record<ChatStatus, { label: string; badge: string; dot: string }> = {
  BOT: {
    label: 'Agente',
    badge: 'bg-[#f0f9fc] text-[#006699] ring-[#bce5f3]',
    dot: 'bg-[#34b0c4]',
  },
  WAITING: {
    label: 'En espera',
    badge: 'bg-amber-50 text-amber-700 ring-amber-200',
    dot: 'bg-amber-500',
  },
  ASSIGNED: {
    label: 'Asignada',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
  },
  CLOSED: {
    label: 'Cerrada',
    badge: 'bg-slate-100 text-slate-600 ring-slate-200',
    dot: 'bg-slate-400',
  },
};

export function reasonLabel(reason?: string | null) {
  switch (reason) {
    case 'BOT':
      return 'Escalado por el agente';
    case 'USER_REQUEST':
      return 'El cliente pidió un asesor';
    case 'AGENT_ERROR':
      return 'Falla del agente';
    default:
      return 'Sin clasificar';
  }
}
