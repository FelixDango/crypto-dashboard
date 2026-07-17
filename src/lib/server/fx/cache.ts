import Decimal from 'decimal.js';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Currency, NormalizedTransactionRecord, TransactionRecord } from '$lib/types';
import { db } from '$lib/server/db/client';
import { fxRates, type FxRateRow } from '$lib/server/db/schema';
import { moneyText, rateText } from '$lib/portfolio/decimal';
import { getFxProvider } from './providers';

type FxQuoteBase = {
  from: Currency;
  to: Currency;
  source: string;
  rateDate: string;
  capturedAt: string | null;
  warning?: string;
};

export type FxQuote =
  | (FxQuoteBase & { status: 'complete'; rate: string })
  | (FxQuoteBase & { status: 'missing'; rate: null });

function rateDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function mapRate(row: FxRateRow, from: Currency, to: Currency): FxQuote {
  return {
    status: 'complete',
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
    status: 'complete',
    from,
    to,
    rate: rateText(new Decimal(1).div(reverse.rate)),
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
      status: 'complete',
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
      status: 'complete',
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
      status: 'missing',
      from,
      to,
      rate: null,
      source: provider.id,
      rateDate: date,
      capturedAt: null,
      warning: `${from}/${to} is unavailable. The affected transaction is excluded from financial totals until a rate is available. ${warning}`
    };
  }
}

export async function normalizeTransactions(
  transactions: TransactionRecord[],
  baseCurrency: Currency
): Promise<NormalizedTransactionRecord[]> {
  const requests = new Map<string, Promise<FxQuote>>();
  const quoteFor = (from: Currency, dateValue: string) => {
    const key = `${from}:${baseCurrency}:${rateDate(dateValue)}`;
    let request = requests.get(key);
    if (!request) {
      request = getFxRateForDate(from, baseCurrency, dateValue);
      requests.set(key, request);
    }
    return request;
  };

  return Promise.all(
    transactions.map(async (transaction) => {
      const quote = await quoteFor(transaction.fiatCurrency, transaction.transactionDate);
      const feeAmount = transaction.feeAmount ? new Decimal(transaction.feeAmount) : new Decimal(0);
      const feeCurrency = transaction.feeCurrency ?? transaction.fiatCurrency;
      const feeQuote =
        feeCurrency === transaction.fiatCurrency
          ? quote
          : await quoteFor(feeCurrency, transaction.transactionDate);
      const complete = quote.status === 'complete' && feeQuote.status === 'complete';
      const normalizedFiatAmount = complete
        ? new Decimal(transaction.fiatAmount).mul(quote.rate)
        : new Decimal(0);
      const normalizedFeeAmount = complete ? feeAmount.mul(feeQuote.rate) : new Decimal(0);
      const warnings = [quote.warning, feeQuote.warning].filter(
        (warning, index, values): warning is string =>
          Boolean(warning) && values.indexOf(warning) === index
      );

      return {
        ...transaction,
        normalizedFiatAmount: moneyText(normalizedFiatAmount),
        normalizedFeeAmount: moneyText(normalizedFeeAmount),
        fxRate: quote.rate ?? '',
        fxSource: quote.source,
        fxDate: quote.rateDate,
        fxCapturedAt: quote.capturedAt,
        fxStatus: complete ? 'complete' : 'missing',
        fxComplete: complete,
        fxWarning: warnings.length > 0 ? warnings.join(' ') : undefined
      } satisfies NormalizedTransactionRecord;
    })
  );
}
