import prisma from '@/app/lib/db';
import type { WalletAddress } from '@/prisma';

export type CreateWalletInput = {
  userId: string;
  address: string;
  chain: string;
  label: string | null;
};

export type BalanceData = {
  balanceEth: string;
  balanceWei: string;
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

  async findByAddress(address: string): Promise<WalletAddress | null> {
    return prisma.walletAddress.findFirst({
      where: { address },
    });
  }

  async updateBalance(address: string, balance: BalanceData): Promise<void> {
    await prisma.walletAddress.updateMany({
      where: { address },
      data: {
        balanceEth: balance.balanceEth,
        balanceWei: balance.balanceWei,
        balanceUpdatedAt: new Date(),
      },
    });
  }
}
