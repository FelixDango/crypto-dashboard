import type { Handle } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.requestId = randomUUID();

  const response = await resolve(event);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "connect-src 'self'",
      "img-src 'self' https://assets.coingecko.com data:",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "frame-ancestors 'none'"
    ].join('; ')
  );

  return response;
};
