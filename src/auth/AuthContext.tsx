import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getData, TOKEN_KEY } from '../lib/api';
import type { ApiResponse, User } from '../../shared/schemas.ts';
interface Auth { user: User | null; checking: boolean; login: (usuario: string, password: string) => Promise<void>; register: (data: Record<string, string>) => Promise<void>; logout: () => Promise<void>; updateBookingBlock: (until: string) => void }
const AuthContext = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [checking, setChecking] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const clear = () => { sessionStorage.removeItem(TOKEN_KEY); setUser(null); };
    window.addEventListener('salita:unauthorized', clear);
    if (sessionStorage.getItem(TOKEN_KEY)) getData<User>('/auth/me', controller.signal).then(value => { if (!controller.signal.aborted) setUser(value); }).catch(() => { if (!controller.signal.aborted) clear(); }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    else setChecking(false);
    return () => { controller.abort(); window.removeEventListener('salita:unauthorized', clear); };
  }, []);
  async function login(usuario: string, password: string) {
    const { data } = await api.post<ApiResponse<{ token: string; usuario: User }>>('/auth/login', { usuario, password });
    if (!data.ok || !data.data?.token || !data.data.usuario) throw new Error(data.mensaje || 'La respuesta de login no es válida.');
    sessionStorage.setItem(TOKEN_KEY, data.data.token); setUser(data.data.usuario);
  }
  async function register(payload: Record<string, string>) {
    const { data } = await api.post<ApiResponse<{ token: string; usuario: User }>>('/auth/registro', payload);
    if (!data.ok || !data.data?.token) throw new Error(data.mensaje || 'No se pudo registrar la cuenta.');
    sessionStorage.setItem(TOKEN_KEY, data.data.token); setUser(data.data.usuario);
  }
  async function logout() { try { await api.post('/auth/logout'); } finally { sessionStorage.removeItem(TOKEN_KEY); setUser(null); } }
  function updateBookingBlock(until: string) {
    setUser(current => current?.rol === 'cliente' ? { ...current, turnosBloqueadosHasta: until } : current);
  }
  return <AuthContext.Provider value={{ user, checking, login, register, logout, updateBookingBlock }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('Falta AuthProvider.'); return value; }
