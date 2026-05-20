'use server';
import { AuthError } from 'next-auth';
import { signIn, signOut } from '@/auth';
import { auth } from '@/auth';
import bcrypt from 'bcryptjs';
import prisma from '@/app/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { AddWalletAddressState, WalletBalanceState } from '@/app/lib/definitions';
import {
  fetchEthereumBalance,
  normalizeWalletAddress,
} from '@/app/lib/wallets';

const walletAddressInputSchema = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Please enter a valid EVM wallet address.');

const walletLabelInputSchema = z
  .string()
  .trim()
  .max(80, 'Label must be 80 characters or fewer.')
  .optional();

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

export async function authenticate(
  _prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}

export async function register(
  _prevState: string | undefined,
  formData: FormData,
) {
  try {
    const email = formData.get('email');
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');

    const parsedCredentials = z
      .object({ email: z.string().email(), password: z.string().min(6) })
      .safeParse({ email, password });

    if (!parsedCredentials.success) {
      return 'Invalid input.';
    }

    if (password !== confirmPassword) {
      return 'Passwords do not match.';
    }

    const { email: validEmail, password: validPassword } = parsedCredentials.data;

    const existingUser = await prisma.user.findUnique({
      where: { email: validEmail },
    });

    if (existingUser) {
      return 'User already exists.';
    }

    const hashedPassword = await bcrypt.hash(validPassword, 10);
    const name = validEmail.split('@')[0];

    await prisma.user.create({
      data: {
        name,
        email: validEmail,
        password: hashedPassword,
      },
    });

    await signIn('credentials', {
      email: validEmail,
      password: validPassword,
      redirectTo: '/dashboard',
    });
  } catch (error) {
    // 检测是否是 Next.js 跳转信号
    const err = error as { digest?: string };
    if (err.digest?.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    if (error instanceof AuthError) {
      return 'Registration failed.';
    }
    console.error('Registration error:', error);
    return 'Something went wrong.';
  }
}

export async function logout() {
  await signOut({ redirectTo: '/login' });
}

export async function addWalletAddress(
  _prevState: AddWalletAddressState,
  formData: FormData,
): Promise<AddWalletAddressState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: 'Please log in to add a wallet address.' };
  }

  const parsedAddress = walletAddressInputSchema.safeParse(formData.get('address'));
  const parsedLabel = walletLabelInputSchema.safeParse(formData.get('label'));

  if (!parsedAddress.success) {
    return { error: parsedAddress.error.issues[0]?.message ?? 'Invalid wallet address.' };
  }

  if (!parsedLabel.success) {
    return { error: parsedLabel.error.issues[0]?.message ?? 'Invalid label.' };
  }

  const address = normalizeWalletAddress(parsedAddress.data);
  const label = parsedLabel.data || null;

  try {
    await prisma.walletAddress.create({
      data: {
        userId: session.user.id,
        address,
        label,
        chain: 'ethereum',
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { error: 'This wallet address is already in your list.' };
    }

    console.error('Failed to add wallet address:', error);
    return { error: 'Could not add this wallet address.' };
  }

  revalidatePath('/dashboard/address');
  return { success: true };
}

export async function deleteWalletAddress(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    return;
  }

  const walletId = formData.get('walletId');

  if (typeof walletId !== 'string' || !walletId) {
    return;
  }

  await prisma.walletAddress.deleteMany({
    where: {
      id: walletId,
      userId: session.user.id,
    },
  });

  revalidatePath('/dashboard/address');
}

export async function getWalletBalance(
  _prevState: WalletBalanceState,
  formData: FormData,
): Promise<WalletBalanceState> {
  const session = await auth();

  if (!session?.user) {
    return { error: 'Please log in to check a wallet balance.' };
  }

  const parsedAddress = walletAddressInputSchema.safeParse(formData.get('address'));

  if (!parsedAddress.success) {
    return { error: parsedAddress.error.issues[0]?.message ?? 'Invalid wallet address.' };
  }

  const address = normalizeWalletAddress(parsedAddress.data);

  try {
    const balance = await fetchEthereumBalance(address);

    return {
      address,
      ...balance,
    };
  } catch (error) {
    console.error('Wallet balance lookup failed:', error);
    return { address, error: 'Could not reach the Ethereum RPC endpoint.' };
  }
}
