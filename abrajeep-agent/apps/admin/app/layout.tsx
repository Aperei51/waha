import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ABRAJEEP — Painel do Agente',
  description: 'Painel administrativo do agente de atendimento WhatsApp da ABRAJEEP',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
