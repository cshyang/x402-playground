# x402 Playground

A Cloudflare-style playground for learning blockchain micropayments and agent authentication. Chat with an AI agent that has free and paid tools — paid tools require ERC-8128 identity signing and x402 USDC payments on Base Sepolia testnet.

## Stack

- **Next.js 16** (App Router) + Tailwind CSS
- **Vercel AI SDK v5** + Z.AI (GLM-4.7)
- **ERC-8128** — Signed HTTP requests with Ethereum identity (`@slicekit/erc8128`)
- **x402 protocol** — HTTP 402 payment gating (`@x402/next`, `@x402/evm`)
- **viem** — Ethereum wallet management
- **Base Sepolia** testnet + testnet USDC

## Protocol Stack

| Layer | Standard | Role |
|-------|----------|------|
| Authentication | ERC-8128 | Signs every paid request with wallet identity |
| Payment | x402 | HTTP 402 micropayment flow with USDC |
| Blockchain | Base Sepolia | On-chain USDC settlement |

## How it works

1. Chat with the agent — it has 4 tools (2 free, 2 paid)
2. Free tools execute instantly on the server
3. Paid tools trigger the ERC-8128 + x402 flow:
   - Browser signs the request with ERC-8128 (identity proof)
   - Browser calls the paid API endpoint
   - Server returns HTTP 402 with payment requirements
   - Browser signs a USDC transfer authorization with the wallet
   - Browser retries with both identity + payment headers
   - Server verifies ERC-8128 identity (knows WHO is paying)
   - Facilitator verifies payment and settles USDC on-chain
   - Server returns the result (including authenticated caller info)
4. The right panel shows each step in real-time (8 steps per payment)

## Setup

```bash
cd playground
npm install
```

Create `.env.local`:

```
ZAI_API_KEY=your-zai-api-key
X402_PAY_TO=0x0000000000000000000000000000000000000001
```

```bash
npm run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ZAI_API_KEY` | Z.AI API key for GLM-4.7 |
| `X402_PAY_TO` | Server wallet address to receive payments |

## Funding your wallet

The app auto-generates a wallet in your browser (stored in localStorage). To use paid tools:

1. Copy your wallet address from the right panel
2. Go to [Circle Faucet](https://faucet.circle.com/)
3. Select **Base** network, **Sepolia** testnet
4. Paste your address and claim 20 USDC

## Deploy to Vercel

Set the **Root Directory** to `playground` in Vercel project settings. Add the environment variables above.
