import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
  NEWS_CONTEXT_LABELS,
  NEWS_RANGES,
  listNewsArticles,
  type NewsRange
} from '$lib/server/news/context';

const querySchema = z.object({
  assetId: z.string().trim().min(1).optional(),
  sourceId: z.string().trim().min(1).optional(),
  theme: z.string().trim().min(1).optional(),
  sentimentLabel: z.enum(NEWS_CONTEXT_LABELS).optional(),
  range: z.enum(NEWS_RANGES).default('24h')
});

function optionalParam(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key)?.trim();
  return value ? value : undefined;
}

export const GET: RequestHandler = ({ url }) => {
  const parsed = querySchema.safeParse({
    assetId: optionalParam(url, 'assetId') ?? optionalParam(url, 'asset'),
    sourceId: optionalParam(url, 'sourceId') ?? optionalParam(url, 'source'),
    theme: optionalParam(url, 'theme'),
    sentimentLabel: optionalParam(url, 'sentimentLabel') ?? optionalParam(url, 'contextLabel'),
    range: optionalParam(url, 'range') ?? '24h'
  });

  if (!parsed.success) {
    return json({ error: 'Invalid news article filters.' }, { status: 400 });
  }

  return json({
    articles: listNewsArticles({
      ...parsed.data,
      range: parsed.data.range as NewsRange,
      limit: 100
    })
  });
};
