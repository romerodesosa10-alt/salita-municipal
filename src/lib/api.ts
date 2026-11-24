import axios from 'axios';
import type { ApiResponse } from '../../shared/schemas.ts';
export const TOKEN_KEY = 'salita.token';
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api/v1', timeout: 12000 });
api.interceptors.request.use(config => { const token = sessionStorage.getItem(TOKEN_KEY); if (token) config.headers.Authorization = `Bearer ${token}`; return config; });
api.interceptors.response.use(response => response, error => {
  if (axios.isAxiosError(error) && error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) window.dispatchEvent(new Event('salita:unauthorized'));
  return Promise.reject(error);
});
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiResponse<unknown>>(error)) return error.response?.data?.mensaje || (error.code === 'ECONNABORTED' ? 'El servidor tardó demasiado. Intentá otra vez.' : 'No se pudo conectar con el servidor. Comprobá que el backend esté encendido.');
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
}
export function serverErrors(error: unknown): Record<string, string> { return axios.isAxiosError<ApiResponse<unknown>>(error) ? error.response?.data?.errores || {} : {}; }
export async function getData<T>(path: string, signal?: AbortSignal): Promise<T> { const response = await api.get<ApiResponse<T>>(path, { signal }); if (!response.data.ok) throw new Error(response.data.mensaje); return response.data.data; }
