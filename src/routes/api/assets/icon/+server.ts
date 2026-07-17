import { error } from '@sveltejs/kit';
import { z } from 'zod';

const allowedHosts = new Set(['assets.coingecko.com', 'coin-images.coingecko.com']);
const allowedContentTypes = new Set(['image/avif', 'image/webp', 'image/png', 'image/jpeg']);
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const MAX_ICON_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;

const iconUrlSchema = z
  .string()
  .url()
  .transform((value, context) => {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unsupported icon host.'
      });
    }
    return parsed;
  });

export async function GET({ fetch, url }) {
  const parsed = iconUrlSchema.safeParse(url.searchParams.get('url') ?? '');
  if (!parsed.success) {
    throw error(400, 'Invalid icon URL.');
  }

  let currentUrl = parsed.data;
  let response: Response | null = null;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    response = await fetch(currentUrl.toString(), {
      headers: {
        accept: 'image/avif,image/webp,image/png,image/jpeg',
        'user-agent': 'personal-krypto-dashboard/0.1'
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000)
    });

    if (!redirectStatuses.has(response.status)) break;
    if (redirects === MAX_REDIRECTS) throw error(502, 'Too many icon redirects.');

    const location = response.headers.get('location');
    if (!location) throw error(502, 'Icon redirect was missing a location.');
    const nextUrl = iconUrlSchema.safeParse(new URL(location, currentUrl).toString());
    if (!nextUrl.success) throw error(502, 'Icon redirect target was not allowed.');
    currentUrl = nextUrl.data;
  }

  if (!response) throw error(502, 'Icon unavailable.');

  if (!response.ok) {
    throw error(response.status === 404 ? 404 : 502, 'Icon unavailable.');
  }

  const contentType = (response.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!allowedContentTypes.has(contentType)) {
    throw error(502, 'Icon response was not an image.');
  }

  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ICON_BYTES) {
    throw error(502, 'Icon response was too large.');
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_ICON_BYTES) throw error(502, 'Icon response was too large.');

  return new Response(bytes, {
    headers: {
      'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
      'content-type': contentType
    }
  });
}
