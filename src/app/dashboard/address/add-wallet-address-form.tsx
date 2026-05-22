'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  ExclamationCircleIcon,
  PlusIcon,
  TagIcon,
  WalletIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@/app/ui/button';
import { addWalletAction } from '@/features/wallet/wallet.actions';
import type { AddWalletAddressState } from '@/features/wallet/wallet.types';

const initialState: AddWalletAddressState = {};

export default function AddWalletAddressForm() {
  const [state, setState] = useState(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const [connecting, setConnecting] = useState(false);
  const [walletAccounts, setWalletAccounts] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window.ethereum === 'undefined') return;

    const handleAccountsChanged = (accounts: unknown) => {
      if (Array.isArray(accounts) && accounts.length > 0) {
        setWalletAccounts(accounts.map((a) => String(a).toLowerCase()));
      } else {
        setWalletAccounts([]);
      }
    };

    (window.ethereum as any).on('accountsChanged', handleAccountsChanged);
    return () => {
      (window.ethereum as any).removeListener('accountsChanged', handleAccountsChanged);
    };
  }, []);

  function handleOpen() {
    setState(initialState);
    dialogRef.current?.showModal();
  }

  function handleClose() {
    dialogRef.current?.close();
  }

  async function handleConnectWallet() {
    if (typeof window.ethereum === 'undefined') {
      setState({ error: 'No wallet found. Please install MetaMask or another Ethereum wallet.' });
      return;
    }

    setConnecting(true);
    try {
      const accounts: string[] = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        setState({ error: 'No accounts found in your wallet.' });
        return;
      }
      setWalletAccounts(accounts.map((a) => a.toLowerCase()));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet';
      setState({ error: message });
    } finally {
      setConnecting(false);
    }
  }

  function handleSelectAccount(address: string) {
    if (addressRef.current) {
      addressRef.current.value = address;
    }
  }

  return (
    <>
      <Button type="button" onClick={handleOpen}>
        <PlusIcon className="mr-2 h-5 w-5 text-white" />
        Add address
      </Button>

      <dialog
        ref={dialogRef}
        onClose={handleClose}
        className="m-auto w-full max-w-lg rounded-xl border border-gray-200 bg-white p-0 shadow-2xl backdrop:bg-black/50 dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold theme-text">Add wallet address</h2>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              aria-label="Close add address form"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <form
            ref={formRef}
            action={(formData) => {
              startTransition(async () => {
                const result = await addWalletAction(initialState, formData);
                setState(result);

                if (result.success) {
                  formRef.current?.reset();
                  handleClose();
                }
              });
            }}
            className="space-y-4"
          >
            <div>
              <label
                htmlFor="address"
                className="mb-2 block text-sm font-medium theme-text"
              >
                Wallet address
              </label>
              <div className="relative">
                <input
                  id="address"
                  name="address"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  required
                  minLength={42}
                  maxLength={42}
                  placeholder="0x..."
                  ref={addressRef}
                  className="block w-full rounded-md border border-gray-300 bg-white py-3 pl-11 pr-14 text-sm font-mono text-gray-900 outline-2 placeholder:text-gray-400 focus:border-blue-500 focus:outline-blue-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                />
                <WalletIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                <button
                  type="button"
                  onClick={handleConnectWallet}
                  disabled={connecting}
                  title="Connect wallet to fill address"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-white transition bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {connecting ? '...' : walletAccounts.length > 0 ? '✓' : 'Connect'}
                </button>
              </div>
              {walletAccounts.length > 0 && (
                <>
                  <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 bg-gray-50 dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-950">
                    {walletAccounts.map((acc) => (
                      <li key={acc}>
                        <button
                          type="button"
                          onClick={() => handleSelectAccount(acc)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-mono text-gray-700 transition hover:bg-blue-50 hover:text-blue-700 dark:text-gray-300 dark:hover:bg-blue-950 dark:hover:text-blue-300"
                        >
                          <WalletIcon className="h-4 w-4 shrink-0 text-gray-400" />
                          <span className="truncate">{acc}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Only see one account? Open MetaMask &gt; click the three dots &gt; "Connected sites" &gt; add more accounts. The list auto-updates.
                  </p>
                </>
              )}
            </div>

            <div>
              <label
                htmlFor="label"
                className="mb-2 block text-sm font-medium theme-text"
              >
                Label
              </label>
              <div className="relative">
                <input
                  id="label"
                  name="label"
                  type="text"
                  maxLength={80}
                  placeholder="Main wallet"
                  className="block w-full rounded-md border border-gray-300 bg-white py-3 pl-11 pr-4 text-sm text-gray-900 outline-2 placeholder:text-gray-400 focus:border-blue-500 focus:outline-blue-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                />
                <TagIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={isPending} aria-disabled={isPending}>
                {isPending ? 'Adding...' : 'Save address'}
              </Button>
              <button
                type="button"
                onClick={handleClose}
                className="h-10 rounded-lg px-4 text-sm font-medium theme-text-secondary transition hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            </div>

            <div aria-live="polite" aria-atomic="true">
              {state.error && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                  <ExclamationCircleIcon className="mt-0.5 h-5 w-5 flex-none" />
                  <p>{state.error}</p>
                </div>
              )}
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
