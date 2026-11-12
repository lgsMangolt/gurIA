import { NextRequest, NextResponse } from 'next/server';

import { isAgentRuntimeConfigured, isLocalCodexProEnabled, isProWorkbenchEnabled } from '@/lib/config/feature-flags';
import { verifyAccessTokenEdge } from '@/lib/server/access-token-edge';
import {
  anonymousOwnerForNavigation,
  type NavigationIdentity,
} from '@/lib/server/identity/navigation';

/**
 * Let the request through, carrying the anonymous owner a page request
 * establishes: the cookie is set on the page response, and the forwarded
 * request carries it too, so the page and every request it sends resolve one
 * owner (see `lib/server/identity/navigation.ts`).
 */
function next(request: NextRequest, identity: NavigationIdentity | undefined): NextResponse {
  if (!identity) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set('cookie', identity.requestCookie);
  const response = NextResponse.next({ request: { headers } });
  response.headers.append('set-cookie', identity.setCookie);
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (process.env.OPENMAIC_STUDY_LOCAL === 'true') {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(request.nextUrl.hostname))
      return new NextResponse('Somente acesso local.', { status: 403 });
    const origin = request.headers.get('origin');
    // NextURL normalizes 127.0.0.1 to localhost; Origin preserves the browser's
    // authority. Compare against the actual Host, never forwarded headers.
    if (origin && origin !== `http://${request.headers.get('host')}`)
      return new NextResponse('Origem não permitida.', { status: 403 });
    if (pathname === '/') return NextResponse.redirect(new URL('/study', request.url));
    if (pathname.startsWith('/api/')) {
      const study = pathname.startsWith('/api/study/');
      const runtime = pathname.startsWith('/api/persistence/runtime/');
      const proRead = isLocalCodexProEnabled() && request.method === 'GET' &&
        /^\/api\/agent\/(runtime|owner-events|sessions(?:\/[^/]+(?:\/events)?)?|skills(?:\/[^/]+)?)$/.test(pathname);
      const proWrite = isLocalCodexProEnabled() && (
        (request.method === 'POST' && /^\/api\/agent\/sessions(?:\/[^/]+\/(?:messages|cancel))?$/.test(pathname)) ||
        (request.method === 'PATCH' && /^\/api\/agent\/sessions\/[^/]+$/.test(pathname))
      );
      const readOnly =
        request.method === 'GET' &&
        /^\/api\/(persistence|stages|stage-meta|agents|folders|materials|server-providers|model-config|access-code\/status|health)(\/|$)/.test(
          pathname,
        );
      if (!study && !runtime && !readOnly && !proRead && !proWrite)
        return NextResponse.json(
          { error: 'Esta função não está habilitada no modo de estudos sem APIs pagas.' },
          { status: 403 },
        );
      if (((study && request.method !== 'GET') || proWrite) && !origin)
        return NextResponse.json(
          { error: 'Abra o aplicativo para realizar esta operação.' },
          { status: 403 },
        );
    }
  }

  // Return an actual server-side 404 when either half of the workbench is off.
  // Edge middleware cannot reliably inspect server-only deployment variables,
  // so it enforces the public gate and leaves the complete runtime/database
  // check to Node. A Node-hosted middleware uses the same gate as startup.
  const canInspectServerRuntime = process.env.NEXT_RUNTIME !== 'edge';
  const workbenchEnabled =
    isProWorkbenchEnabled() && (!canInspectServerRuntime || isAgentRuntimeConfigured());
  if (!workbenchEnabled && (pathname === '/workbench' || pathname.startsWith('/workbench/'))) {
    return new NextResponse('Not found', { status: 404 });
  }

  // One anonymous owner per browser, established on the page response before
  // any API request can mint its own.
  const identity = anonymousOwnerForNavigation({
    method: request.method,
    headers: request.headers,
    pathname,
  });

  const accessCode = process.env.ACCESS_CODE;
  if (!accessCode) {
    return next(request, identity);
  }

  // Whitelist: access-code endpoints, health check
  if (pathname.startsWith('/api/access-code/') || pathname === '/api/health') {
    return next(request, identity);
  }

  // Check cookie — validate HMAC signature, not just existence
  const cookie = request.cookies.get('openmaic_access');
  if (cookie?.value && (await verifyAccessTokenEdge(cookie.value, accessCode))) {
    return next(request, identity);
  }

  // API requests without valid cookie → 401
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, errorCode: 'INVALID_REQUEST', error: 'Access code required' },
      { status: 401 },
    );
  }

  // Page requests → let through, frontend shows modal
  return next(request, identity);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/).*)'],
};
