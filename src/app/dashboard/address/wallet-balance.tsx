'use client';

import { useEffect, useState, useTransition } from 'react';
import { getWalletBalanceAction } from '@/features/wallet/wallet.actions';
import type { WalletBalanceState } from '@/features/wallet/wallet.types';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 10;

export default function WalletBalance({
  address,
  initialBalance,
}: {
  address: string;
  initialBalance: WalletBalanceState | null;
}) {
  // React 19 "reset state on prop change" pattern: track address in state,
  // and when it changes, reset balance + attempts before rendering.
  const [trackedAddress, setTrackedAddress] = useState(address);
  const [balance, setBalance] = useState<WalletBalanceState | null>(initialBalance);
  const [attempts, setAttempts] = useState(0);
  const [isPending, startTransition] = useTransition();

  if (trackedAddress !== address) {
    setTrackedAddress(address);
    setBalance(initialBalance);
    setAttempts(0);
  }

  const hasFresh = Boolean(balance?.balanceEth && balance?.balanceWei && !balance?.isStale);
  const exhausted = !hasFresh && attempts >= MAX_POLL_ATTEMPTS;

  useEffect(() => {
    if (hasFresh || exhausted) return;

    const delay = balance ? POLL_INTERVAL_MS : 0;
    const timer = window.setTimeout(() => {
      const formData = new FormData();
      formData.set('address', address);

      startTransition(async () => {
        const next = await getWalletBalanceAction({}, formData);
        setBalance(next);
        setAttempts((n) => n + 1);
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [address, balance, hasFresh, exhausted]);

  const hasValue = Boolean(balance?.balanceEth && balance?.balanceWei);

  if (!hasValue) {
    return (
      <div className="space-y-2">
        <div className="h-5 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <p className="text-xs text-amber-600 dark:text-amber-300">
          {exhausted ? 'Still syncing, check back soon.' : 'Updating balance...'}
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="text-lg font-semibold theme-text">{balance!.balanceEth} ETH</p>
      <p className="mt-1 break-all text-xs theme-text-secondary">{balance!.balanceWei} wei</p>
      {(balance!.isStale || isPending) && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">
          {exhausted ? 'Stale value, check back soon.' : 'Updating balance...'}
        </p>
      )}
    </>
  );
}
