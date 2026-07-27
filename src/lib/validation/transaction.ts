import Decimal from 'decimal.js';
import { z } from 'zod';
import type { Currency } from '$lib/types';
import type { TransactionInput } from '$lib/server/transactions';

const currencies = ['EUR', 'USD'] as const;

function isDecimal(value: string): boolean {
  try {
    const decimal = new Decimal(value);
    return decimal.isFinite();
  } catch {
    return false;
  }
}

function isPositiveDecimal(value: string): boolean {
  try {
    return new Decimal(value).gt(0);
  } catch {
    return false;
  }
}

function isNonNegativeDecimal(value: string): boolean {
  try {
    return new Decimal(value).gte(0);
  } catch {
    return false;
  }
}

function positiveDecimal(label: string) {
  return z
    .string({ required_error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .refine(isDecimal, `${label} must be a valid decimal number.`)
    .refine(
      (value) => !isDecimal(value) || isPositiveDecimal(value),
      `${label} must be greater than zero.`
    );
}

const optionalFee = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || isDecimal(value), 'Fee must be a valid decimal number.')
  .refine(
    (value) => value === null || !isDecimal(value) || isNonNegativeDecimal(value),
    'Fee cannot be negative.'
  );

function normalizeDate(value: string, context: z.RefinementCtx): string {
  const cleaned = value.trim();
  const candidate = cleaned.length <= 10 ? `${cleaned}T12:00:00.000Z` : cleaned;
  const parsed = new Date(candidate);

  if (Number.isNaN(parsed.getTime())) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Transaction date is invalid.' });
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\0/g, '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

export const transactionInputSchema = z.object({
  asset: z.object({
    provider: z.string().trim().default('coingecko'),
    providerCoinId: z
      .string({ required_error: 'Select a coin from the search results.' })
      .trim()
      .min(1, 'Select a coin from the search results.')
      .max(120, 'Selected coin id is too long.'),
    symbol: z
      .string({ required_error: 'Selected coin details are incomplete.' })
      .trim()
      .min(1, 'Selected coin details are incomplete.')
      .max(20, 'Selected coin symbol is too long.')
      .transform((value) => value.toUpperCase()),
    name: z
      .string({ required_error: 'Selected coin details are incomplete.' })
      .trim()
      .min(1, 'Selected coin details are incomplete.')
      .max(120, 'Selected coin name is too long.'),
    imageUrl: z
      .string()
      .trim()
      .url()
      .optional()
      .or(z.literal(''))
      .transform((value) => value || null)
  }),
  type: z.enum(['buy', 'sell']),
  quantity: positiveDecimal('Quantity'),
  fiatAmount: positiveDecimal('Fiat amount'),
  fiatCurrency: z.enum(currencies),
  feeAmount: optionalFee,
  feeCurrency: z.enum(currencies).nullable().optional(),
  transactionDate: z
    .string({ required_error: 'Transaction date is required.' })
    .min(1, 'Transaction date is required.')
    .transform(normalizeDate),
  notes: z
    .string()
    .optional()
    .nullable()
    .transform((value) => cleanText(value, 1000))
});

export function parseTransactionForm(formData: FormData): TransactionInput {
  const feeCurrency =
    formData.get('fee_currency')?.toString() || formData.get('fiat_currency')?.toString();
  const parsed = transactionInputSchema.parse({
    asset: {
      provider: formData.get('asset_provider')?.toString() || 'coingecko',
      providerCoinId: formData.get('asset_provider_coin_id')?.toString(),
      symbol: formData.get('asset_symbol')?.toString(),
      name: formData.get('asset_name')?.toString(),
      imageUrl: formData.get('asset_image_url')?.toString() || ''
    },
    type: formData.get('type')?.toString(),
    quantity: formData.get('quantity')?.toString(),
    fiatAmount: formData.get('fiat_amount')?.toString(),
    fiatCurrency: formData.get('fiat_currency')?.toString(),
    feeAmount: formData.get('fee_amount')?.toString() || null,
    feeCurrency: (feeCurrency || null) as Currency | null,
    transactionDate: formData.get('transaction_date')?.toString(),
    notes: formData.get('notes')?.toString()
  });

  return parsed;
}
