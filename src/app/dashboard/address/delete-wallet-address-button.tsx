'use client';

import { TrashIcon } from '@heroicons/react/24/outline';
import { deleteWalletAddress } from '@/app/lib/actions';
import { useRef } from 'react';

type DeleteWalletAddressButtonProps = {
  walletId: string;
  walletName: string;
};

export default function DeleteWalletAddressButton({
  walletId,
  walletName,
}: DeleteWalletAddressButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleConfirm() {
    formRef.current?.requestSubmit();
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-red-600 transition hover:bg-red-50 hover:text-red-700 dark:text-red-300 dark:hover:bg-red-950"
        aria-label={`Delete ${walletName}`}
      >
        <TrashIcon className="h-5 w-5" />
      </button>

      <dialog
        ref={dialogRef}
        className="m-auto w-full max-w-sm rounded-xl border border-gray-200 bg-white p-0 shadow-2xl backdrop:bg-black/50 dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="p-6">
          <h3 className="text-lg font-semibold theme-text">Delete address</h3>
          <p className="mt-2 text-sm theme-text-secondary">
            Are you sure you want to delete <span className="font-medium text-red-600 dark:text-red-300">{walletName}</span>? This action cannot be undone.
          </p>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="h-10 rounded-lg px-4 text-sm font-medium theme-text-secondary transition hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex h-10 items-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 active:bg-red-700"
            >
              <TrashIcon className="mr-2 h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      </dialog>

      <form ref={formRef} action={deleteWalletAddress} className="hidden">
        <input type="hidden" name="walletId" value={walletId} />
      </form>
    </>
  );
}
