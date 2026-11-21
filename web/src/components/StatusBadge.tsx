import type { ChatStatus } from '../lib/types';
import { statusMeta } from '../lib/format';

export function StatusBadge({ status, className = '' }: { status: ChatStatus; className?: string }) {
  const meta = statusMeta[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${meta.badge} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
