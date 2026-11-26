// Portão da gurIA: um app pessoal que só atende a própria máquina.
// - só localhost, 127.0.0.1 e [::1] (403 para qualquer outro host);
// - Origin, quando vem, tem de ser a do próprio Host (proteção contra outro site);
// - escrita em /api/study exige Origin (o navegador sempre manda; um link solto não);
// - / leva para /study; das APIs, só /api/study fica aberta.
// Sem cookie anônimo, sem código de acesso: o dono é único (lib/study/owner.ts).
// Este arquivo não importa nada do projeto: o portão fica pequeno e fácil de conferir.
import { NextRequest, NextResponse } from 'next/server';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  if (!LOCAL_HOSTS.includes(request.nextUrl.hostname))
    return new NextResponse('Somente acesso local.', { status: 403 });
  const origin = request.headers.get('origin');
  // O NextURL normaliza 127.0.0.1 para localhost; a Origin guarda o que o
  // navegador usou. Compara com o Host de verdade, nunca com cabeçalhos repassados.
  if (origin && origin !== `http://${request.headers.get('host')}`)
    return new NextResponse('Origem não permitida.', { status: 403 });
  if (pathname === '/') return NextResponse.redirect(new URL('/study', request.url));

  // Páginas da versão anterior (OpenMAIC), apagadas na fase 4: respondem 404 mesmo
  // que algum arquivo antigo volte para a pasta.
  if (/^\/(workbench|workspace|classroom|generation-preview|eval)(\/|$)/.test(pathname))
    return new NextResponse('Not found', { status: 404 });

  if (pathname.startsWith('/api/')) {
    const study = pathname.startsWith('/api/study/');
    if (!study)
      return NextResponse.json(
        { error: 'Esta função não existe na gurIA.' },
        { status: 403 },
      );
    if (method !== 'GET' && !origin)
      return NextResponse.json(
        { error: 'Abra o aplicativo para realizar esta operação.' },
        { status: 403 },
      );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/).*)'],
};
