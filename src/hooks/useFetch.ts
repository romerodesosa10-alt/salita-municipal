import { useCallback, useEffect, useState } from 'react';
import { errorMessage, getData } from '../lib/api';
export function useFetch<T>(path: string, keepDataOnRefresh = false) {
  const [state, setState] = useState<{ data: T | null; isLoading: boolean; error: string | null; path: string }>({ data: null, isLoading: !!path, error: null, path });
  const [revision, setRevision] = useState(0);
  const refetch = useCallback(() => setRevision(x => x + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    if (!path) return;
    setState(previous => keepDataOnRefresh && previous.path === path && previous.data !== null
      ? previous : { data: null, isLoading: true, error: null, path });
    getData<T>(path, controller.signal).then(data => { if (!controller.signal.aborted) setState({ data, isLoading: false, error: null, path }); }).catch(error => { if (!controller.signal.aborted) setState({ data: null, isLoading: false, error: errorMessage(error), path }); });
    return () => controller.abort();
  }, [path, revision, keepDataOnRefresh]);
  return { data: state.path === path ? state.data : null, isLoading: !!path && (state.path !== path || state.isLoading), error: state.path === path ? state.error : null, refetch };
}
