import { z } from 'zod';

export const addressSchema = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Please enter a valid EVM wallet address.')
  .transform((addr) => addr.toLowerCase());

export const labelSchema = z
  .string()
  .trim()
  .max(80, 'Label must be 80 characters or fewer.')
  .optional();

export const addWalletSchema = z.object({
  address: addressSchema,
  label: labelSchema,
});

export type AddWalletInput = z.infer<typeof addWalletSchema>;
