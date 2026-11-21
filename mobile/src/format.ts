export function initials(name?: string | null) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '??';
}

function two(value: number) {
  return String(value).padStart(2, '0');
}

export function formatTime(iso: string) {
  const date = new Date(iso);
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}

export function formatRelative(iso?: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return `${two(date.getDate())}/${two(date.getMonth() + 1)}`;
}

export function firstName(name?: string | null) {
  return name?.trim().split(/\s+/)[0] ?? '';
}
