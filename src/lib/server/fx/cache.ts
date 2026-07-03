import Decimal from 'decimal.js';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Currency, NormalizedTransactionRecord, TransactionRecord } from '$lib/types';
import { db } from '$lib/server/db/client';
import { fxRates, type FxRateRow } from '$lib/server/db/schema';
import { getFxProvider } from './providers';

export type FxQuote = {
  from: Currency;
  to: Currency;
  rate: string;
  source: string;
  rateDate: string;
  capturedAt: string | null;
  warning?: string;
};

function rateDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function mapRate(row: FxRateRow, from: Currency, to: Currency): FxQuote {
  return {
    from,
    to,
    rate: row.rate,
    source: row.provider,
    rateDate: row.rateDate,
    capturedAt: row.capturedAt
  };
}

function cachedRate(
  from: Currency,
  to: Currency,
  date: string,
  providerId: string
): FxQuote | null {
  const direct = db
    .select()
    .from(fxRates)
    .where(
      and(
        eq(fxRates.rateDate, date),
        eq(fxRates.baseCurrency, from),
        eq(fxRates.quoteCurrency, to),
        eq(fxRates.provider, providerId)
      )
    )
    .limit(1)
    .get();

  if (direct) return mapRate(direct, from, to);

  const reverse = db
    .select()
    .from(fxRates)
    .where(
      and(
        eq(fxRates.rateDate, date),
        eq(fxRates.baseCurrency, to),
        eq(fxRates.quoteCurrency, from),
        eq(fxRates.provider, providerId)
      )
    )
    .limit(1)
    .get();

  if (!reverse) return null;

  return {
    from,
    to,
    rate: new Decimal(1).div(reverse.rate).toDecimalPlaces(18).toString(),
    source: reverse.provider,
    rateDate: reverse.rateDate,
    capturedAt: reverse.capturedAt
  };
}

export async function getFxRateForDate(
  from: Currency,
  to: Currency,
  dateValue: string,
  providerId = 'frankfurter'
): Promise<FxQuote> {
  const date = rateDate(dateValue);
  if (from === to) {
    return {
      from,
      to,
      rate: '1',
      source: 'same-currency',
      rateDate: date,
      capturedAt: null
    };
  }

  const cached = cachedRate(from, to, date, providerId);
  if (cached) return cached;

  const provider = getFxProvider(providerId);
  try {
    const fetched = await provider.getDailyRate(from, to, date);
    db.insert(fxRates)
      .values({
        id: randomUUID(),
        rateDate: fetched.rateDate,
        baseCurrency: from,
        quoteCurrency: to,
        provider: provider.id,
        rate: fetched.rate,
        capturedAt: fetched.capturedAt
      })
      .onConflictDoUpdate({
        target: [fxRates.rateDate, fxRates.baseCurrency, fxRates.quoteCurrency, fxRates.provider],
        set: {
          rate: fetched.rate,
          capturedAt: fetched.capturedAt
        }
      })
      .run();

    return {
      from,
      to,
      rate: fetched.rate,
      source: provider.id,
      rateDate: fetched.rateDate,
      capturedAt: fetched.capturedAt
    };
  } catch (error) {
    const warning = error instanceof Error ? error.message : 'FX provider failed.';
    return {
      from,
      to,
      rate: '1',
      source: provider.id,
      rateDate: date,
      capturedAt: null,
      warning: `${from}/${to} is using an unconverted fallback rate. ${warning}`
    };
  }
}

export async function normalizeTransactions(
  transactions: TransactionRecord[],
  baseCurrency: Currency
): Promise<NormalizedTransactionRecord[]> {
  const normalized: NormalizedTransactionRecord[] = [];

  for (const transaction of transactions) {
    const quote = await getFxRateForDate(
      transaction.fiatCurrency,
      baseCurrency,
      transaction.transactionDate
    );
    const rate = new Decimal(quote.rate);
    const normalizedFiatAmount = new Decimal(transaction.fiatAmount).mul(rate);
    const feeAmount = transaction.feeAmount ? new Decimal(transaction.feeAmount) : new Decimal(0);
    const feeCurrency = transaction.feeCurrency ?? transaction.fiatCurrency;
    const feeQuote =
      feeCurrency === transaction.fiatCurrency
        ? quote
        : await getFxRateForDate(feeCurrency, baseCurrency, transaction.transactionDate);
    const normalizedFeeAmount = feeAmount.mul(feeQuote.rate);

    normalized.push({
      ...transaction,
      normalizedFiatAmount: normalizedFiatAmount.toDecimalPlaces(12).toString(),
      normalizedFeeAmount: normalizedFeeAmount.toDecimalPlaces(12).toString(),
      fxRate: quote.rate,
      fxSource: quote.source,
      fxDate: quote.rateDate,
      fxCapturedAt: quote.capturedAt,
      fxWarning: quote.warning ?? feeQuote.warning
    });
  }

  return normalized;
}
