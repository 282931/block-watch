'use client';

import { useEffect, useState, useTransition } from 'react';
import { getWalletBalanceAction } from '@/features/wallet/wallet.actions';
import type { WalletBalanceState } from '@/features/wallet/wallet.types';

export default function WalletBalance({ address, initialBalance }: { address: string; initialBalance: WalletBalanceState | null }) {
  const [balance, setBalance] = useState<WalletBalanceState | null>(initialBalance);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (balance && !balance.isStale) return;

    const timer = window.setTimeout(() => {
      const formData = new FormData();
      formData.set('address', address);

      startTransition(async () => {
        setBalance(await getWalletBalanceAction({}, formData));
      });
    }, balance ? 1500 : 0);

    return () => window.clearTimeout(timer);
  }, [address, balance]);

  if (balance?.error) {
    return (
      <p className="text-sm font-medium text-red-600 dark:text-red-300">
        {balance.error}
      </p>
    );
  }

  if (!balance?.balanceEth || !balance.balanceWei) {
    return (
      <div className="space-y-2">
        <div className="h-5 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  return (
    <>
      <p className="text-lg font-semibold theme-text">
        {balance.balanceEth} ETH
      </p>
      <p className="mt-1 break-all text-xs theme-text-secondary">
        {balance.balanceWei} wei
      </p>
      {(balance.isStale || isPending) && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">
          Updating balance...
        </p>
      )}
    </>
  );
}
