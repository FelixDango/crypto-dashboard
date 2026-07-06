import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { generateCycleWindows } from '$lib/server/insights/market-cycle';

const querySchema = z
  .object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  })
  .refine((value) => value.end > value.start, {
    message: 'End date must be after start date.',
    path: ['end']
  });

export const GET: RequestHandler = ({ url }) => {
  const parsed = querySchema.safeParse({
    start: url.searchParams.get('start'),
    end: url.searchParams.get('end')
  });

  if (!parsed.success) {
    return json({ error: 'Invalid cycle window range.' }, { status: 400 });
  }

  return json({
    model: 'custom_cycle_model',
    windows: generateCycleWindows(
      new Date(`${parsed.data.start}T00:00:00.000Z`),
      new Date(`${parsed.data.end}T00:00:00.000Z`)
    )
  });
};
