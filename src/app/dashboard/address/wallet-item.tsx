import { WalletAddressWithBalance } from "../../lib/definitions";
import { fetchEthereumBalance } from "../../lib/wallets";
import CopyAddressButton from "./copy-address-button";
import DeleteWalletAddressButton from "./delete-wallet-address-button";

export default async function WalletItem({ wallet }: { wallet: WalletAddressWithBalance }) {
  const balance = await fetchEthereumBalance(wallet.address).catch(() => null);

  return (
    <li
      key={wallet.id}
      className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(160px,220px)_auto] md:items-center"
    >
      <WalletPureItem wallet={wallet} />
      <div>
        {!balance ? (
          <p className="text-sm font-medium text-red-600 dark:text-red-300">
            Balance unavailable
          </p>
        ) : (
          <>
            <p className="text-lg font-semibold theme-text">
              {balance.balanceEth} ETH
            </p>
            <p className="mt-1 break-all text-xs theme-text-secondary">
              {balance.balanceWei} wei
            </p>
          </>
        )}
      </div>

      <DeleteWalletAddressButton
        walletId={wallet.id}
        walletName={wallet.label || wallet.address}
      />
    </li>
  )
}

export function WalletPureItem({ wallet }: { wallet: WalletAddressWithBalance }) {

  return <div className="min-w-0">
    <div className="flex flex-wrap items-center gap-2">
      <p className="font-medium theme-text">
        {wallet.label || 'Ethereum wallet'}
      </p>
      <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-200">
        {wallet.chain}
      </span>
    </div>
    <p className="mt-2 flex items-center gap-1.5 break-all font-mono text-sm theme-text-secondary line-clamp-1">
      <span className="min-w-0 truncate">{wallet.address}</span>
      <CopyAddressButton address={wallet.address} />
    </p>
    <p className="mt-2 text-xs theme-text-secondary">
      Added {wallet.createdAt.toLocaleDateString()}
    </p>
  </div>


}
export function WalletSkeleton({ wallet }: { wallet: WalletAddressWithBalance }) {

  return (
    <li
      key={wallet.id}
      className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(160px,220px)_auto] md:items-center"
    >
      <WalletPureItem wallet={wallet} />

      <div className="space-y-2">
        <div className="h-5 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </div>

      <div className="flex justify-end">
        <div className="h-10 w-10 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
      </div>
    </li>
  );
}
