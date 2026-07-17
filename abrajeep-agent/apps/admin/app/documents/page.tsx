'use client';

import { useCallback, useEffect, useState } from 'react';
import PanelShell from '@/components/PanelShell';
import { api } from '@/lib/api';

interface DocumentRow {
  id: string;
  title: string;
  audience: string;
  status: string;
  version: number;
  fileName: string | null;
  publishedAt: string | null;
  category: { name: string } | null;
  dealership: { name: string; code: string } | null;
  _count: { chunks: number };
}

interface Category {
  id: string;
  name: string;
}

const AUDIENCE_LABELS: Record<string, string> = {
  PUBLIC: 'Pública',
  ASSOCIATES: 'Associados',
  DEALERSHIP: 'Concessionária',
  INTERNAL: 'Interna',
  ADMIN: 'Administradores',
};

export default function DocumentsPage() {
  const [items, setItems] = useState<DocumentRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [audience, setAudience] = useState('INTERNAL');
  const [categoryId, setCategoryId] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(() => {
    api<{ items: DocumentRow[] }>('/admin/documents?pageSize=100')
      .then((res) => setItems(res.items))
      .catch((e) => setError(e.message));
    api<Category[]>('/admin/categories')
      .then(setCategories)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('title', title);
      form.append('audience', audience);
      if (categoryId) form.append('categoryId', categoryId);
      form.append('file', file);
      await api('/admin/documents', { method: 'POST', body: form });
      setTitle('');
      setFile(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no upload');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, action: 'archive' | 'activate') {
    setBusy(true);
    try {
      await api(`/admin/documents/${id}/${action}`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelShell>
      <h2>Base de conhecimento</h2>

      <form className="card" onSubmit={upload}>
        <strong>Enviar novo documento</strong>
        <div className="row" style={{ marginTop: 10 }}>
          <div>
            <label>Título</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} />
          </div>
          <div>
            <label>Audiência</label>
            <select value={audience} onChange={(e) => setAudience(e.target.value)}>
              {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Categoria</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Arquivo (PDF, DOCX, TXT, MD)</label>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md,text/plain,text/markdown,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </div>
          <button type="submit" disabled={busy} style={{ maxWidth: 140 }}>
            {busy ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Título</th>
              <th>Categoria</th>
              <th>Audiência</th>
              <th>Chunks</th>
              <th>Status</th>
              <th>Publicado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id}>
                <td>
                  {d.title}
                  {d.dealership && <div className="muted">({d.dealership.code})</div>}
                </td>
                <td>{d.category?.name ?? '—'}</td>
                <td>{AUDIENCE_LABELS[d.audience] ?? d.audience}</td>
                <td>{d._count.chunks}</td>
                <td>
                  <span className={d.status === 'active' ? 'badge' : 'badge closed'}>
                    {d.status === 'active' ? 'Ativo' : 'Arquivado'}
                  </span>
                </td>
                <td>{d.publishedAt ? new Date(d.publishedAt).toLocaleDateString('pt-BR') : '—'}</td>
                <td>
                  {d.status === 'active' ? (
                    <button className="secondary" disabled={busy} onClick={() => setStatus(d.id, 'archive')}>
                      Arquivar
                    </button>
                  ) : (
                    <button className="secondary" disabled={busy} onClick={() => setStatus(d.id, 'activate')}>
                      Reativar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Nenhum documento cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
}
