import Decimal from 'decimal.js';
import { z } from 'zod';
import type { Currency } from '$lib/types';
import type { PortfolioPlanDraft, PortfolioPlanInput } from '$lib/planning/types';

function validDecimal(value: string): boolean {
  try {
    return new Decimal(value).isFinite();
  } catch {
    return false;
  }
}

function positiveDecimal(label: string) {
  return z
    .string({ required_error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .refine(validDecimal, `${label} must be a valid decimal number.`)
    .refine(
      (value) => !validDecimal(value) || new Decimal(value).gt(0),
      `${label} must be greater than zero.`
    );
}

const targetDateSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => value || null)
  .refine((value) => {
    if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value === null;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Target date must be a valid date.');

const allocationTargetSchema = z.object({
  asset: z.object({
    provider: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .regex(/^[a-zA-Z0-9._-]+$/, 'Selected coin provider is invalid.')
      .default('coingecko'),
    providerCoinId: z
      .string({ required_error: 'Select a coin for every target row.' })
      .trim()
      .min(1, 'Select a coin for every target row.')
      .max(120)
      .regex(/^[a-zA-Z0-9._-]+$/, 'Selected coin id is invalid.'),
    symbol: z
      .string({ required_error: 'Selected coin details are incomplete.' })
      .trim()
      .min(1, 'Selected coin details are incomplete.')
      .max(20)
      .transform((value) => value.toUpperCase()),
    name: z
      .string({ required_error: 'Selected coin details are incomplete.' })
      .trim()
      .min(1, 'Selected coin details are incomplete.')
      .max(120),
    imageUrl: z
      .string()
      .trim()
      .url('Selected coin image URL is invalid.')
      .optional()
      .nullable()
      .or(z.literal(''))
      .transform((value) => value || null)
  }),
  targetPercentage: positiveDecimal('Target percentage').refine(
    (value) => !validDecimal(value) || new Decimal(value).lte(100),
    'A target percentage cannot exceed 100%.'
  )
});

export const portfolioPlanSchema = z
  .object({
    name: z.string().trim().min(1, 'Plan name is required.').max(120),
    targetValue: positiveDecimal('Target portfolio value'),
    currency: z.enum(['EUR', 'USD']),
    targetDate: targetDateSchema,
    targets: z
      .array(allocationTargetSchema)
      .min(1, 'Add at least one allocation target.')
      .max(50, 'A plan can contain at most 50 target assets.')
  })
  .superRefine((value, context) => {
    const ids = new Set<string>();
    value.targets.forEach((target, index) => {
      const id = `${target.asset.provider.toLowerCase()}:${target.asset.providerCoinId.toLowerCase()}`;
      if (ids.has(id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${target.asset.symbol} is included more than once.`,
          path: ['targets', index, 'asset']
        });
      }
      ids.add(id);
    });

    const total = value.targets.reduce(
      (sum, target) => sum.plus(target.targetPercentage),
      new Decimal(0)
    );
    if (!total.eq(100)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Allocation targets must total exactly 100% (currently ${total.toString()}%).`,
        path: ['targets']
      });
    }
  });

export const contributionAmountSchema = positiveDecimal('Contribution amount');

export function planDraftFromForm(formData: FormData): PortfolioPlanDraft {
  const providers = formData.getAll('asset_provider').map(String);
  const coinIds = formData.getAll('asset_provider_coin_id').map(String);
  const symbols = formData.getAll('asset_symbol').map(String);
  const names = formData.getAll('asset_name').map(String);
  const images = formData.getAll('asset_image_url').map(String);
  const percentages = formData.getAll('target_percentage').map(String);
  const rowCount = Math.min(
    51,
    Math.max(
      providers.length,
      coinIds.length,
      symbols.length,
      names.length,
      images.length,
      percentages.length
    )
  );

  return {
    name: formData.get('name')?.toString() ?? '',
    targetValue: formData.get('target_value')?.toString() ?? '',
    targetDate: formData.get('target_date')?.toString() ?? '',
    targets: Array.from({ length: rowCount }, (_, index) => ({
      provider: providers[index] ?? 'coingecko',
      providerCoinId: coinIds[index] ?? '',
      symbol: symbols[index] ?? '',
      name: names[index] ?? '',
      imageUrl: images[index] || null,
      targetPercentage: percentages[index] ?? ''
    }))
  };
}

export function parsePortfolioPlanForm(formData: FormData, currency: Currency): PortfolioPlanInput {
  const draft = planDraftFromForm(formData);
  return portfolioPlanSchema.parse({
    name: draft.name,
    targetValue: draft.targetValue,
    currency,
    targetDate: draft.targetDate,
    targets: draft.targets.map((target) => ({
      asset: {
        provider: target.provider,
        providerCoinId: target.providerCoinId,
        symbol: target.symbol,
        name: target.name,
        imageUrl: target.imageUrl
      },
      targetPercentage: target.targetPercentage
    }))
  });
}
