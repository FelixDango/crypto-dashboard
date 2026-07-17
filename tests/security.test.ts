import { describe, expect, it, vi } from 'vitest';
import { handle } from '../src/hooks.server';

describe('security response policy', () => {
  it('marks financial responses private and non-cacheable and exposes a request id', async () => {
    const event = {
      url: new URL('http://app/dashboard'),
      locals: {}
    };
    const response = await handle({
      event,
      resolve: vi.fn(async () => new Response('ok'))
    } as never);

    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('does not overwrite the public icon cache policy', async () => {
    const response = await handle({
      event: { url: new URL('http://app/api/assets/icon'), locals: {} },
      resolve: vi.fn(
        async () =>
          new Response('icon', {
            headers: { 'cache-control': 'public, max-age=86400' }
          })
      )
    } as never);

    expect(response.headers.get('cache-control')).toBe('public, max-age=86400');
  });
});
