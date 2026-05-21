import prisma from '@/app/lib/db';
import type { WalletAddressWithBalance } from '@/app/lib/definitions';
import { EtherscanProvider, formatEther } from 'ethers';

const ETHEREUM_MAINNET_CHAIN_ID = 1;

export function normalizeWalletAddress(address: string) {
  return address.trim().toLowerCase();
}

function trimEthBalance(balance: string) {
  const [whole, fractional = ''] = balance.split('.');
  const trimmedFractional = fractional.replace(/0+$/, '').slice(0, 6);

  return trimmedFractional ? `${whole}.${trimmedFractional}` : whole;
}

let provider: EtherscanProvider | null = null;

function getProvider() {
  if (!provider) {
    const apiKey = process.env.ETHERSCAN_API_KEY;

    if (!apiKey) {
      throw new Error('Missing Etherscan API key.');
    }

    provider = new EtherscanProvider(ETHEREUM_MAINNET_CHAIN_ID, apiKey);
  }

  return provider;
}

export async function fetchEthereumBalance(address: string) {
  const balanceWei = await getProvider().getBalance(address);

  return {
    balanceWei: balanceWei.toString(),
    balanceEth: trimEthBalance(formatEther(balanceWei)),
  };
}

export async function getWalletAddresses(
  userId: string,
): Promise<WalletAddressWithBalance[]> {
  return prisma.walletAddress.findMany({
    where: {
      userId,
      chain: 'ethereum',
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}
