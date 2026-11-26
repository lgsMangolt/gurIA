import type { Metadata, Viewport } from 'next';
import './globals.css';

// Layout raiz da gurIA. A tela /study traz o próprio tema (tokens Primer em
// app/study/study.css), então aqui ficam só o idioma, os metadados e o reset
// de CSS. Sem provedores, notificações ou fontes do OpenMAIC.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'gurIA · Aprenda conectando ideias',
  description: 'Um espaço pessoal para estudar, praticar e acompanhar o que você aprende.',
  icons: { icon: '/study/gurIA-icon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
