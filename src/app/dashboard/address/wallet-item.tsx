import { Suspense } from "react";
import { WalletAddressWithBalance } from "../../lib/definitions";
import { fetchEthereumBalance } from "../../lib/wallets";
import DeleteWalletAddressButton from "./delete-wallet-address-button";

export default async function WalletItem({ wallet }: { wallet: WalletAddressWithBalance }) {
  const { balanceEth, balanceWei } = await fetchEthereumBalance(wallet.address);

  return (
    <li
      key={wallet.id}
      className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(160px,220px)_auto] md:items-center"
    >
      <WalletPureItem wallet={wallet} />
      <div>
        {wallet.balanceError ? (
          <p className="text-sm font-medium text-red-600 dark:text-red-300">
            {wallet.balanceError}
          </p>
        ) : (
          <>
            <p className="text-lg font-semibold theme-text">
              {balanceEth} ETH
            </p>
            <p className="mt-1 break-all text-xs theme-text-secondary">
              {balanceWei} wei
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
    <p className="mt-2 break-all font-mono text-sm theme-text-secondary line-clamp-1">
      {wallet.address}
    </p>
    <p className="mt-2 text-xs theme-text-secondary">
      Added {wallet.createdAt.toLocaleDateString()}
    </p>
  </div>


}
export function WalletSkeleton({ wallet }: { wallet: WalletAddressWithBalance }) {

  return <li
    key={wallet.id}
    className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(160px,220px)_auto] md:items-center"
  >
    <WalletPureItem wallet={wallet} />

  </li>



}