'use client';

import { TrashIcon } from '@heroicons/react/24/outline';
import { deleteWalletAddress } from '@/app/lib/actions';

type DeleteWalletAddressButtonProps = {
  walletId: string;
  walletName: string;
};

export default function DeleteWalletAddressButton({
  walletId,
  walletName,
}: DeleteWalletAddressButtonProps) {
  return (
    <form
      action={deleteWalletAddress}
      onSubmit={(event) => {
        if (!window.confirm(`Delete ${walletName}?`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="walletId" value={walletId} />
      <button
        type="submit"
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-red-600 transition hover:bg-red-50 hover:text-red-700 dark:text-red-300 dark:hover:bg-red-950"
        aria-label={`Delete ${walletName}`}
      >
        <TrashIcon className="h-5 w-5" />
      </button>
    </form>
  );
}
