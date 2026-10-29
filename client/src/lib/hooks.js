import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

/** const { data, loading, error, reload } = useApi('/members?page=1', [deps]) ; pass null path to skip. */
export function useApi(path, deps = []) {
  const [state, setState] = useState({ data: null, loading: !!path, error: null });
  const load = useCallback(async () => {
    if (!path) return setState({ data: null, loading: false, error: null });
    setState((s) => ({ ...s, loading: true, error: null }));
    try { setState({ data: await api(path), loading: false, error: null }); } catch (e) { setState({ data: null, loading: false, error: e.message }); }
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: load };
}
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
