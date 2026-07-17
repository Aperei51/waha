'use client';

/**
 * Cliente HTTP do painel. Token JWT guardado em localStorage;
 * 401 redireciona para o login.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('abrajeep_admin_token');
}

export function setToken(token: string | null): void {
  if (token) window.localStorage.setItem('abrajeep_admin_token', token);
  else window.localStorage.removeItem('abrajeep_admin_token');
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401) {
    setToken(null);
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new ApiError('Sessão expirada', 401);
  }
  const data = (await res.json().catch(() => ({}))) as { message?: string } & T;
  if (!res.ok) throw new ApiError(data.message ?? `Erro ${res.status}`, res.status);
  return data;
}

export const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberta',
  AGENT_HANDLING: 'Com o agente',
  WAITING_HUMAN: 'Aguardando humano',
  HUMAN_HANDLING: 'Atendimento humano',
  RESOLVED: 'Resolvida',
  CLOSED: 'Encerrada',
};
