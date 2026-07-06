import { and, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Currency } from '$lib/types';
import { db, getSqlite } from '$lib/server/db/client';
import { priceUpdateEvents, type PriceUpdateEventRow } from '$lib/server/db/schema';

export type PriceUpdateEventStatus = 'success' | 'stale_fallback' | 'failed';

export type PriceUpdateEventInput = {
  assetId?: string | null;
  provider: string;
  fiatCurrency: Currency;
  status: PriceUpdateEventStatus;
  price?: string | null;
  errorMessage?: string | null;
  checkedAt?: string;
};

export function recordPriceUpdateEvent(input: PriceUpdateEventInput): PriceUpdateEventRow {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    assetId: input.assetId ?? null,
    provider: input.provider,
    fiatCurrency: input.fiatCurrency,
    status: input.status,
    price: input.price ?? null,
    errorMessage: input.errorMessage ?? null,
    checkedAt: input.checkedAt ?? now,
    createdAt: now
  };

  db.insert(priceUpdateEvents).values(row).run();
  return row;
}

export function listLatestPriceUpdateEvents(
  fiatCurrency: Currency,
  assetIds: string[] = []
): Map<string, PriceUpdateEventRow> {
  const rows =
    assetIds.length > 0
      ? db
          .select()
          .from(priceUpdateEvents)
          .where(
            and(
              eq(priceUpdateEvents.fiatCurrency, fiatCurrency),
              inArray(priceUpdateEvents.assetId, assetIds)
            )
          )
          .orderBy(desc(priceUpdateEvents.checkedAt))
          .all()
      : db
          .select()
          .from(priceUpdateEvents)
          .where(eq(priceUpdateEvents.fiatCurrency, fiatCurrency))
          .orderBy(desc(priceUpdateEvents.checkedAt))
          .all();

  const latest = new Map<string, PriceUpdateEventRow>();
  for (const row of rows) {
    if (!row.assetId || latest.has(row.assetId)) continue;
    latest.set(row.assetId, row);
  }
  return latest;
}

export function getLatestSuccessfulPriceUpdateEvent(
  fiatCurrency?: Currency
): PriceUpdateEventRow | null {
  const rows = fiatCurrency
    ? db
        .select()
        .from(priceUpdateEvents)
        .where(
          and(
            eq(priceUpdateEvents.status, 'success'),
            eq(priceUpdateEvents.fiatCurrency, fiatCurrency)
          )
        )
        .orderBy(desc(priceUpdateEvents.checkedAt))
        .limit(1)
        .all()
    : db
        .select()
        .from(priceUpdateEvents)
        .where(eq(priceUpdateEvents.status, 'success'))
        .orderBy(desc(priceUpdateEvents.checkedAt))
        .limit(1)
        .all();

  return rows[0] ?? null;
}

export function cleanupPriceUpdateEvents(now = new Date()): {
  successDeleted: number;
  issueDeleted: number;
} {
  const successCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const issueCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const sqlite = getSqlite();

  const successDeleted = sqlite
    .prepare("DELETE FROM price_update_events WHERE status = 'success' AND created_at < ?")
    .run(successCutoff).changes;
  const issueDeleted = sqlite
    .prepare(
      "DELETE FROM price_update_events WHERE status IN ('stale_fallback', 'failed') AND created_at < ?"
    )
    .run(issueCutoff).changes;

  return { successDeleted, issueDeleted };
}
