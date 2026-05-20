'use client';

import { useRef, useState, useTransition } from 'react';
import {
  ExclamationCircleIcon,
  PlusIcon,
  TagIcon,
  WalletIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@/app/ui/button';
import { addWalletAddress } from '@/app/lib/actions';
import type { AddWalletAddressState } from '@/app/lib/definitions';

const initialState: AddWalletAddressState = {};

export default function AddWalletAddressForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleOpen() {
    setState(initialState);
    setIsOpen(true);
  }

  if (!isOpen) {
    return (
      <Button type="button" onClick={handleOpen}>
        <PlusIcon className="mr-2 h-5 w-5 text-white" />
        Add address
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold theme-text">Add wallet address</h2>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
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
            const result = await addWalletAddress(initialState, formData);
            setState(result);

            if (result.success) {
              formRef.current?.reset();
              setIsOpen(false);
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
              className="block w-full rounded-md border border-gray-300 bg-white py-3 pl-11 pr-4 text-sm font-mono text-gray-900 outline-2 placeholder:text-gray-400 focus:border-blue-500 focus:outline-blue-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
            <WalletIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
          </div>
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
            onClick={() => setIsOpen(false)}
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
  );
}
