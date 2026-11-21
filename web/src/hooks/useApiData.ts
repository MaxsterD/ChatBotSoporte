import { useEffect, useRef, useState } from 'react';
import { useRealtime } from '../context/RealtimeContext';
import { api } from '../lib/api';

export function useApiData<T>(
  path: string | null,
  initial: T,
  deps: unknown[] = [],
  options: { debounce?: number } = {},
) {
  const { version } = useRealtime();
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    if (firstLoad.current) setLoading(true);

    const delay = version === 0 ? 0 : (options.debounce ?? 220);
    const timer = setTimeout(async () => {
      try {
        const result = await api<T>(path);
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Error de red');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          firstLoad.current = false;
        }
      }
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, version, ...deps]);

  return { data, loading, error, setData };
}
