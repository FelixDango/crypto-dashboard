import { z } from 'zod';

export const RESET_CONFIRMATION_PHRASE = 'DELETE ALL TEST DATA';
export const resetScopeSchema = z.enum(['portfolio', 'full']);

export const resetRequestSchema = z.object({
  scope: resetScopeSchema,
  acknowledged: z.literal(true, {
    errorMap: () => ({ message: 'Acknowledge that this deletion is permanent.' })
  }),
  confirmationPhrase: z.literal(RESET_CONFIRMATION_PHRASE, {
    errorMap: () => ({ message: `Type ${RESET_CONFIRMATION_PHRASE} exactly.` })
  })
});

export type ResetScope = z.infer<typeof resetScopeSchema>;
export type ResetRequest = z.infer<typeof resetRequestSchema>;

export function parseResetForm(formData: FormData): ResetRequest {
  return resetRequestSchema.parse({
    scope: formData.get('scope')?.toString(),
    acknowledged: formData.get('acknowledged')?.toString() === 'on',
    confirmationPhrase: formData.get('confirmation_phrase')?.toString()
  });
}
