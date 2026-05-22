import prisma from '@/app/lib/db';
import type { WalletAddress } from '@/prisma';

export type CreateWalletInput = {
  userId: string;
  address: string;
  chain: string;
  label: string | null;
};

export class WalletRepository {
  async findByUserId(userId: string): Promise<WalletAddress[]> {
    return prisma.walletAddress.findMany({
      where: { userId, chain: 'ethereum' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByIdAndUser(id: string, userId: string): Promise<WalletAddress | null> {
    return prisma.walletAddress.findFirst({
      where: { id, userId },
    });
  }

  async create(data: CreateWalletInput): Promise<WalletAddress> {
    return prisma.walletAddress.create({ data });
  }

  async deleteByIdAndUser(id: string, userId: string): Promise<void> {
    await prisma.walletAddress.deleteMany({
      where: { id, userId },
    });
  }

  async existsByUserAndAddress(userId: string, address: string): Promise<boolean> {
    const existing = await prisma.walletAddress.findFirst({
      where: { userId, address },
      select: { id: true },
    });
    return existing !== null;
  }
}
