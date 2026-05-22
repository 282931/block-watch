export type WalletBalanceState = {
  address?: string;
  balanceEth?: string;
  balanceWei?: string;
  isStale?: boolean;
  error?: string;
};

export type WalletAddressWithBalance = {
  id: string;
  address: string;
  chain: string;
  label: string | null;
  createdAt: Date;
  balanceEth?: string;
  balanceWei?: string;
  balanceUpdatedAt?: Date;
  balanceError?: string;
};

export type AddWalletAddressState = {
  success?: boolean;
  error?: string;
};
