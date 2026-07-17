'use client';

import { useCallback, useEffect, useState } from 'react';
import PanelShell from '@/components/PanelShell';
import { api } from '@/lib/api';

interface UserRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  role: string;
  status: string;
  jobTitle: string | null;
  lastSeenAt: string | null;
  organization: { name: string } | null;
  dealership: { name: string; code: string } | null;
}

interface Organization {
  id: string;
  name: string;
}

interface Dealership {
  id: string;
  name: string;
  code: string;
}

const ROLE_LABELS: Record<string, string> = {
  VISITOR: 'Visitante',
  ASSOCIATE: 'Associado',
  DEALERSHIP: 'Concessionária',
  MANAGER: 'Gestor',
  OPERATOR: 'Operador',
  ADMIN: 'Administrador',
};

export default function UsersPage() {
  const [items, setItems] = useState<UserRow[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    role: 'ASSOCIATE',
    organizationId: '',
    dealershipId: '',
  });

  const load = useCallback(() => {
    const params = new URLSearchParams({ pageSize: '100' });
    if (q) params.set('q', q);
    api<{ items: UserRow[] }>(`/admin/users?${params}`)
      .then((res) => setItems(res.items))
      .catch((e) => setError(e.message));
  }, [q]);

  useEffect(() => {
    load();
    api<Organization[]>('/admin/organizations').then(setOrgs).catch(() => undefined);
    api<Dealership[]>('/admin/dealerships').then(setDealerships).catch(() => undefined);
  }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          email: form.email || undefined,
          role: form.role,
          organizationId: form.organizationId || undefined,
          dealershipId: form.dealershipId || undefined,
        }),
      });
      setForm({ name: '', phone: '', email: '', role: 'ASSOCIATE', organizationId: '', dealershipId: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelShell>
      <h2>Usuários</h2>

      <form className="card" onSubmit={createUser}>
        <strong>Cadastrar usuário</strong>
        <div className="row" style={{ marginTop: 10 }}>
          <div>
            <label>Nome</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label>Telefone (E.164 sem +)</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="5511999999999"
              pattern="\d{8,15}"
              required
            />
          </div>
          <div>
            <label>E-mail</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label>Perfil</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Empresa</label>
            <select
              value={form.organizationId}
              onChange={(e) => setForm({ ...form, organizationId: e.target.value })}
            >
              <option value="">—</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Concessionária</label>
            <select
              value={form.dealershipId}
              onChange={(e) => setForm({ ...form, dealershipId: e.target.value })}
            >
              <option value="">—</option>
              {dealerships.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={busy} style={{ maxWidth: 140 }}>
            Cadastrar
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>

      <div className="card">
        <div className="field" style={{ maxWidth: 320 }}>
          <label>Busca</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="nome, telefone ou e-mail" />
        </div>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Perfil</th>
              <th>Empresa</th>
              <th>Concessionária</th>
              <th>Último acesso</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td>{u.name ?? <span className="muted">sem nome</span>}</td>
                <td>{u.phone}</td>
                <td>
                  <span className="badge">{ROLE_LABELS[u.role] ?? u.role}</span>
                </td>
                <td>{u.organization?.name ?? '—'}</td>
                <td>{u.dealership ? `${u.dealership.name} (${u.dealership.code})` : '—'}</td>
                <td>{u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString('pt-BR') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
}
