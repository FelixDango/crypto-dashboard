import { timingSafeEqual } from 'node:crypto';
import { getInternalCronSecret } from '$lib/env';

export function isInternalCronAuthorized(request: Request): boolean {
  const secret = getInternalCronSecret();
  if (!secret) return false;

  const authorization = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const authorizationBuffer = Buffer.from(authorization);
  const expectedBuffer = Buffer.from(expected);

  return (
    authorizationBuffer.length === expectedBuffer.length &&
    timingSafeEqual(authorizationBuffer, expectedBuffer)
  );
}
