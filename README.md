This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Background worker (balance sync)

Wallet balances are refreshed asynchronously via a BullMQ queue (`balance-sync`).
The web app only reads from Redis/Postgres and enqueues jobs; a separate Node
process is responsible for actually calling Etherscan and writing back.

Run the worker alongside `next dev` in a second terminal:

```bash
pnpm dev          # Next.js
pnpm dev:worker   # BullMQ worker (tsx watch)
```

Production-style one-shot run: `pnpm worker`.

Required env vars (see `.env.example`):

- `REDIS_URL` — used by both the cache client and the BullMQ connection.
- `ETHERSCAN_API_KEY` — required by the worker. While missing, jobs will fail
  three times then be parked in the BullMQ “failed” set; the UI keeps showing
  the skeleton with “Still syncing”. Backfill the key, restart the worker,
  and re-enqueue (e.g. by re-adding the wallet) to recover.
- `BALANCE_SYNC_CONCURRENCY` — optional worker concurrency (default 5).
- `BALANCE_SCHEDULER_CRON` — optional cron pattern for the periodic refresh
  job (default `*/2 * * * *`, i.e. every 2 minutes). The scheduler fans out a
  `balance-sync` job for every distinct wallet; jobId dedup keeps the queue
  from doubling up if a previous tick is still in flight.

Smoke test: start the worker, add a wallet on `/dashboard/address`, watch the
worker log emit `completed job=...`, then confirm `WalletAddress.balanceUpdatedAt`
in Postgres and that the UI swaps the skeleton for the real ETH amount.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
