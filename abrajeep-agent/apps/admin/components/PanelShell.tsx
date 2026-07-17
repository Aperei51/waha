'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getToken, setToken } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/conversations', label: 'Conversas' },
  { href: '/documents', label: 'Documentos' },
  { href: '/users', label: 'Usuários' },
];

/** Layout autenticado do painel: sidebar + verificação de sessão. */
export default function PanelShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>ABRAJEEP Agente</h1>
        <nav>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname.startsWith(item.href) ? 'active' : ''}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          className="logout"
          onClick={() => {
            setToken(null);
            router.replace('/login');
          }}
        >
          Sair
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
