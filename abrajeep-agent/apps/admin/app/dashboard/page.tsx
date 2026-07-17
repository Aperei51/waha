'use client';

import { useEffect, useState } from 'react';
import PanelShell from '@/components/PanelShell';
import { api } from '@/lib/api';

interface Metrics {
  conversations: { total: number; open: number; waitingHuman: number };
  messagesLast30d: number;
  users: number;
  errors: { failedWebhooks: number; toolCallErrors: number };
  costLast30d: { estimatedUsd: number; inputTokens: number; outputTokens: number };
  feedback: { averageRating: number | null; count: number };
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Metrics>('/admin/metrics')
      .then(setMetrics)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <PanelShell>
      <h2>Dashboard</h2>
      {error && <p className="error">{error}</p>}
      {!metrics && !error && <p className="muted">Carregando…</p>}
      {metrics && (
        <>
          <div className="grid">
            <div className="card stat">
              <div className="value">{metrics.conversations.total}</div>
              <div className="label">Conversas (total)</div>
            </div>
            <div className="card stat">
              <div className="value">{metrics.conversations.waitingHuman}</div>
              <div className="label">Aguardando atendimento humano</div>
            </div>
            <div className="card stat">
              <div className="value">{metrics.messagesLast30d}</div>
              <div className="label">Mensagens (30 dias)</div>
            </div>
            <div className="card stat">
              <div className="value">{metrics.users}</div>
              <div className="label">Usuários</div>
            </div>
            <div className="card stat">
              <div className="value">US$ {metrics.costLast30d.estimatedUsd.toFixed(4)}</div>
              <div className="label">Custo estimado OpenAI (30 dias)</div>
            </div>
            <div className="card stat">
              <div className="value">
                {metrics.errors.failedWebhooks + metrics.errors.toolCallErrors}
              </div>
              <div className="label">Erros (webhooks + funções)</div>
            </div>
            <div className="card stat">
              <div className="value">
                {metrics.feedback.averageRating ? metrics.feedback.averageRating.toFixed(1) : '—'}
              </div>
              <div className="label">Avaliação média ({metrics.feedback.count} feedbacks)</div>
            </div>
            <div className="card stat">
              <div className="value">
                {(metrics.costLast30d.inputTokens + metrics.costLast30d.outputTokens).toLocaleString('pt-BR')}
              </div>
              <div className="label">Tokens (30 dias)</div>
            </div>
          </div>
        </>
      )}
    </PanelShell>
  );
}
