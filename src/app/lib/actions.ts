'use server';
import { AuthError } from 'next-auth';
import { signIn, signOut } from '@/auth';
import bcrypt from 'bcryptjs';
import prisma from '@/app/lib/db';
import { z } from 'zod';

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
      .object({ email: z.email(), password: z.string().min(6) })
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
