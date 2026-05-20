import prisma from '@/app/lib/db';
import type { WalletAddressWithBalance } from '@/app/lib/definitions';

const ETH_WEI_FACTOR = BigInt('1000000000000000000');
const ETHERSCAN_API_URL = 'https://api.etherscan.io/v2/api';

export function normalizeWalletAddress(address: string) {
  return address.trim().toLowerCase();
}

export function formatWeiAsEth(weiValue: string) {
  const wei = BigInt(weiValue);
  const eth = wei / ETH_WEI_FACTOR;
  const fractional = wei % ETH_WEI_FACTOR;
  const trimmedFractional = fractional
    .toString()
    .padStart(18, '0')
    .replace(/0+$/, '')
    .slice(0, 6);

  return trimmedFractional ? `${eth}.${trimmedFractional}` : eth.toString();
}

export async function fetchEthereumBalance(address: string) {
  const apiKey = process.env.ETHERSCAN_API_KEY;

  if (!apiKey) {
    throw new Error('Missing Etherscan API key.');
  }

  const searchParams = new URLSearchParams({
    chainid: '1',
    module: 'account',
    action: 'balance',
    address,
    tag: 'latest',
    apikey: apiKey,
  });

  const response = await fetch(`${ETHERSCAN_API_URL}?${searchParams}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Balance lookup failed.');
  }

  const payload = (await response.json()) as {
    status?: string;
    message?: string;
    result?: string;
  };

  if (payload.status !== '1' || !payload.result) {
    throw new Error(payload.result ?? payload.message ?? 'Balance lookup failed.');
  }

  return {
    balanceWei: BigInt(payload.result).toString(),
    balanceEth: formatWeiAsEth(payload.result),
  };
}

export async function getWalletAddressesWithBalances(
  userId: string,
): Promise<WalletAddressWithBalance[]> {
  const wallets = await prisma.walletAddress.findMany({
    where: {
      userId,
      chain: 'ethereum',
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
  return wallets.map((wallet) => ({
    ...wallet,
    balance: '0',
    balanceEth: '0',
  }));

  // return Promise.all(
  //   wallets.map(async (wallet) => {
  //     try {
  //       const balance = await fetchEthereumBalance(wallet.address);

  //       return {
  //         ...wallet,
  //         ...balance,
  //       };
  //     } catch {
  //       return {
  //         ...wallet,
  //         balanceError: 'Balance unavailable',
  //       };
  //     }
  //   }),
  // );
}
