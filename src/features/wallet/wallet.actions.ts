'use server';

import { auth } from '@/auth';
import { walletService } from '@/server/wallet/wallet.service';
import { addWalletSchema } from '@/server/wallet/wallet.schema';
import { ApiError } from '@/server/lib/errors';
import { revalidatePath } from 'next/cache';
import type { AddWalletAddressState, WalletBalanceState } from '@/features/wallet/wallet.types';

export async function addWalletAction(
  _prevState: AddWalletAddressState,
  formData: FormData,
): Promise<AddWalletAddressState> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { error: 'Please log in to add a wallet address.' };
  }

  const parsed = addWalletSchema.safeParse({
    address: formData.get('address'),
    label: formData.get('label'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid wallet address.' };
  }

  try {
    await walletService.addWallet(userId, parsed.data);
    revalidatePath('/dashboard/address');
    return { success: true };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    console.error('Failed to add wallet address:', error);
    return { error: 'Could not add this wallet address.' };
  }
}

export async function deleteWalletAction(formData: FormData): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return;
  }

  const walletId = formData.get('walletId');
  if (typeof walletId !== 'string' || !walletId) {
    return;
  }

  try {
    await walletService.deleteWallet(userId, walletId);
    revalidatePath('/dashboard/address');
  } catch (error) {
    if (error instanceof ApiError) {
      console.error('Delete wallet failed:', error.message);
      return;
    }
    console.error('Delete wallet failed:', error);
  }
}

export async function getWalletBalanceAction(
  _prevState: WalletBalanceState,
  formData: FormData,
): Promise<WalletBalanceState> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { error: 'Please log in to check a wallet balance.' };
  }

  const parsedAddress = addWalletSchema.shape.address.safeParse(formData.get('address'));

  if (!parsedAddress.success) {
    return { error: parsedAddress.error.issues[0]?.message ?? 'Invalid wallet address.' };
  }

  const address = parsedAddress.data;

  try {
    const balance = await walletService.getBalance(address);
    return { address, ...balance };
  } catch (error) {
    if (error instanceof ApiError) {
      return { address, error: error.message };
    }
    console.error('Wallet balance lookup failed:', error);
    return { address, error: 'Could not reach the Ethereum RPC endpoint.' };
  }
}
