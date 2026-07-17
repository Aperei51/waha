'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import PanelShell from '@/components/PanelShell';
import { api, STATUS_LABELS } from '@/lib/api';

interface ConversationRow {
  id: string;
  status: string;
  lastMessageAt: string;
  createdAt: string;
  user: { name: string | null; phone: string; role: string };
  _count: { messages: number };
}

function badgeClass(status: string): string {
  if (status === 'WAITING_HUMAN') return 'badge waiting';
  if (status === 'HUMAN_HANDLING') return 'badge human';
  if (status === 'RESOLVED' || status === 'CLOSED') return 'badge closed';
  return 'badge';
}

export default function ConversationsPage() {
  const [items, setItems] = useState<ConversationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    api<{ items: ConversationRow[]; total: number }>(`/admin/conversations?${params}`)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((e) => setError(e.message));
  }, [q, status, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PanelShell>
      <h2>Conversas ({total})</h2>
      <div className="card">
        <div className="row">
          <div>
            <label>Busca (nome ou telefone)</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="5511…" />
          </div>
          <div>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>De</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label>Até</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Telefone</th>
              <th>Status</th>
              <th>Mensagens</th>
              <th>Última atividade</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>{c.user.name ?? <span className="muted">sem nome</span>}</td>
                <td>{c.user.phone}</td>
                <td>
                  <span className={badgeClass(c.status)}>{STATUS_LABELS[c.status] ?? c.status}</span>
                </td>
                <td>{c._count.messages}</td>
                <td>{new Date(c.lastMessageAt).toLocaleString('pt-BR')}</td>
                <td>
                  <Link href={`/conversations/${c.id}`}>Abrir</Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Nenhuma conversa encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
}
