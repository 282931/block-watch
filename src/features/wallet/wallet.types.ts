export type WalletBalanceState = {
  address?: string;
  balanceEth?: string;
  balanceWei?: string;
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
  balanceError?: string;
};

export type AddWalletAddressState = {
  success?: boolean;
  error?: string;
};
