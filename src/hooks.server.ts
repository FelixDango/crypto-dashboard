import type { Handle } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { logError, logRequest } from '$lib/server/logger';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.requestId = randomUUID();
  const startedAt = performance.now();

  let response: Response;
  try {
    response = await resolve(event);
  } catch (error) {
    logError('http_request_failed', error, {
      requestId: event.locals.requestId,
      method: event.request?.method ?? 'GET',
      path: event.url.pathname,
      durationMs: Math.round(performance.now() - startedAt)
    });
    throw error;
  }
  response.headers.set('X-Request-ID', event.locals.requestId);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "connect-src 'self'",
      "img-src 'self' data:",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "frame-ancestors 'none'"
    ].join('; ')
  );

  const publiclyCacheable = event.url.pathname === '/api/assets/icon';
  if (!publiclyCacheable) {
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Pragma', 'no-cache');
  }

  if (event.url.pathname !== '/health' || response.status >= 400) {
    logRequest({
      requestId: event.locals.requestId,
      method: event.request?.method ?? 'GET',
      path: event.url.pathname,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt)
    });
  }

  return response;
};
