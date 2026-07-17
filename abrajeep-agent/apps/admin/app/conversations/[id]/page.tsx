'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import PanelShell from '@/components/PanelShell';
import { api, STATUS_LABELS } from '@/lib/api';

interface Source {
  title?: string;
  score?: number;
  version?: number;
}

interface ToolCallRow {
  id: string;
  name: string;
  status: string;
  durationMs: number | null;
}

interface MessageRow {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  text: string | null;
  transcription: string | null;
  authorType: string;
  createdAt: string;
  sources: Source[] | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: string | null;
  toolCalls: ToolCallRow[];
  attachments: Array<{ id: string; kind: string; fileName: string | null }>;
}

interface ConversationDetail {
  id: string;
  status: string;
  contextSummary: string | null;
  user: { name: string | null; phone: string; role: string };
  messages: MessageRow[];
  agentActions: Array<{ id: string; type: string; createdAt: string; detail: unknown }>;
}

export default function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ConversationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<ConversationDetail>(`/admin/conversations/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function action(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/conversations/${id}/${path}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <PanelShell>
        {error ? <p className="error">{error}</p> : <p className="muted">Carregando…</p>}
      </PanelShell>
    );
  }

  return (
    <PanelShell>
      <h2>
        Conversa — {data.user.name ?? data.user.phone}{' '}
        <span className="badge">{STATUS_LABELS[data.status] ?? data.status}</span>
      </h2>
      <p className="muted">
        Telefone: {data.user.phone} · Perfil: {data.user.role}
      </p>

      <div className="card">
        <div className="row" style={{ alignItems: 'center' }}>
          <button disabled={busy || data.status !== 'WAITING_HUMAN'} onClick={() => action('claim')}>
            Assumir atendimento
          </button>
          <button
            className="secondary"
            disabled={busy || !['WAITING_HUMAN', 'HUMAN_HANDLING'].includes(data.status)}
            onClick={() => action('return-to-agent')}
          >
            Devolver ao agente
          </button>
          <button
            className="secondary"
            disabled={busy || !['AGENT_HANDLING', 'HUMAN_HANDLING'].includes(data.status)}
            onClick={() => action('resolve')}
          >
            Marcar resolvida
          </button>
          <button className="danger" disabled={busy || data.status === 'CLOSED'} onClick={() => action('close')}>
            Encerrar
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      {data.contextSummary && (
        <div className="card">
          <strong>Resumo do contexto</strong>
          <p>{data.contextSummary}</p>
        </div>
      )}

      <div className="card chat">
        {data.messages.map((m) => (
          <div key={m.id} className={`msg ${m.direction === 'INBOUND' ? 'inbound' : 'outbound'}`}>
            {m.text ?? <em className="muted">[{m.type}]</em>}
            {m.transcription && m.text !== m.transcription && (
              <div className="sources">Transcrição: {m.transcription}</div>
            )}
            {m.attachments.length > 0 && (
              <div className="sources">
                Anexos: {m.attachments.map((a) => a.fileName ?? a.kind).join(', ')}
              </div>
            )}
            {m.sources && m.sources.length > 0 && (
              <div className="sources">
                Fontes:{' '}
                {m.sources
                  .map((s) => `${s.title}${s.score != null ? ` (${(s.score * 100).toFixed(0)}%)` : ''}`)
                  .join(' · ')}
              </div>
            )}
            {m.toolCalls.length > 0 && (
              <div className="sources">
                Funções: {m.toolCalls.map((t) => `${t.name} [${t.status}]`).join(', ')}
              </div>
            )}
            <div className="meta">
              {m.authorType} · {new Date(m.createdAt).toLocaleString('pt-BR')}
              {m.estimatedCostUsd && ` · US$ ${Number(m.estimatedCostUsd).toFixed(5)}`}
              {m.inputTokens != null && ` · ${m.inputTokens}/${m.outputTokens} tokens`}
            </div>
          </div>
        ))}
      </div>

      {data.status === 'HUMAN_HANDLING' && (
        <div className="card">
          <label>Responder como operador</label>
          <div className="row">
            <textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} />
            <button
              disabled={busy || reply.trim().length === 0}
              onClick={async () => {
                await action('messages', { text: reply });
                setReply('');
              }}
              style={{ maxWidth: 120 }}
            >
              Enviar
            </button>
          </div>
        </div>
      )}

      {data.agentActions.length > 0 && (
        <div className="card">
          <strong>Histórico de ações</strong>
          <table>
            <tbody>
              {data.agentActions.map((a) => (
                <tr key={a.id}>
                  <td>{a.type}</td>
                  <td className="muted">{new Date(a.createdAt).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  );
}
