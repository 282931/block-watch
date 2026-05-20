import { auth } from '@/auth';
import { getWalletAddressesWithBalances } from '@/app/lib/wallets';
import AddWalletAddressForm from './add-wallet-address-form';
import WalletItem, { WalletSkeleton } from './wallet-item';
import { Suspense } from 'react';

export default async function Page() {
  const session = await auth();
  const wallets = session?.user?.id
    ? await getWalletAddressesWithBalances(session.user.id)
    : [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold theme-text">Wallet addresses</h1>
          <p className="mt-2 max-w-2xl text-sm theme-text-secondary">
            Manage your saved Ethereum wallets and check their latest balances.
          </p>
        </div>
        <AddWalletAddressForm />
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        {wallets.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-base font-medium theme-text">No wallet addresses yet</p>
            <p className="mt-2 text-sm theme-text-secondary">
              Add your first Ethereum address to start tracking balances.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {wallets.map((wallet) => (
              <Suspense key={wallet.id} fallback={<WalletSkeleton wallet={wallet} />}>
                <WalletItem wallet={wallet} />
              </Suspense>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
