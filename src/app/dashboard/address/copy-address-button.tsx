'use client';

import { CheckIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { useCallback, useRef, useState } from 'react';

type CopyAddressButtonProps = {
  address: string;
};

export default function CopyAddressButton({ address }: CopyAddressButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleCopy = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [address]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
      aria-label={copied ? 'Copied' : 'Copy address'}
    >
      {copied ? (
        <CheckIcon className="h-4 w-4 text-green-500" />
      ) : (
        <DocumentDuplicateIcon className="h-4 w-4" />
      )}
    </button>
  );
}
