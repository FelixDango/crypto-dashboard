import { error } from '@sveltejs/kit';
import { z } from 'zod';

const allowedHosts = new Set(['assets.coingecko.com', 'coin-images.coingecko.com']);

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

  const response = await fetch(parsed.data.toString(), {
    headers: {
      accept: 'image/avif,image/webp,image/png,image/jpeg,image/svg+xml;q=0.8,*/*;q=0.5',
      'user-agent': 'personal-krypto-dashboard/0.1'
    }
  });

  if (!response.ok) {
    throw error(response.status === 404 ? 404 : 502, 'Icon unavailable.');
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw error(502, 'Icon response was not an image.');
  }

  return new Response(response.body, {
    headers: {
      'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
      'content-type': contentType
    }
  });
}
