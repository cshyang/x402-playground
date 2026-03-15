# x402 Playground: Design Document

**Date:** 2026-03-15
**Goal:** Build a Cloudflare-style x402 playground to learn client + server payment mechanics on Base Sepolia testnet.
**Stack:** Next.js, Vercel AI SDK, @x402/next, @x402/fetch, Claude, viem/ethers
**Parent project:** CampaignAgent (Week 2 learning)

---

## 1. What We're Building

A single-page Next.js app with two panels:

- **Left: Chat UI** — Vercel AI SDK chat interface. Claude agent with 4 tools (2 free, 2 paid).
- **Right: Flow Panel** — Wallet display + scrolling payment history. Each paid tool call shows a step-by-step animation of the 402 payment flow.

The goal is to feel and understand x402 from both sides (client and server) before wiring the real CampaignAgent.

---

## 2. Architecture

```
x402-playground/
├── app/
│   ├── layout.tsx                  # Shell: left chat + right panel
│   ├── page.tsx                    # Main playground page
│   ├── api/
│   │   ├── chat/route.ts           # Vercel AI SDK route (Claude + tools)
│   │   ├── tools/
│   │   │   ├── add/route.ts        # Free: add two numbers
│   │   │   ├── time/route.ts       # Free: current time
│   │   │   ├── square/route.ts     # Paid: square a number ($0.01)
│   │   │   └── fact/route.ts       # Paid: random fact ($0.005)
│   │   └── wallet/
│   │       └── fund/route.ts       # Proxy to Circle faucet for testnet USDC
├── components/
│   ├── chat-panel.tsx              # Left side: chat messages + input
│   ├── flow-panel.tsx              # Right side: wallet + payment log
│   ├── payment-step.tsx            # Single step in the flow visualization
│   └── wallet-display.tsx          # Balance + address + fund button
├── lib/
│   ├── wallet.ts                   # Client-side wallet (create/load from localStorage)
│   ├── x402-client.ts              # Auto-paying fetch wrapper
│   └── tools.ts                    # Tool definitions for Claude
```

---

## 3. Tools

### Free (no payment required)

| Tool | Input | Output |
|------|-------|--------|
| `add_numbers` | `a: number, b: number` | `{ result: a + b }` |
| `get_time` | none | `{ time: "2026-03-15T10:30:00Z" }` |

### Paid (x402-gated)

| Tool | Input | Output | Price |
|------|-------|--------|-------|
| `square_number` | `n: number` | `{ result: n * n }` | $0.01 USDC |
| `random_fact` | none | `{ fact: "..." }` | $0.005 USDC |

---

## 4. Payment Flow

When Claude calls a paid tool:

```
User: "What's 5 squared?"

Claude: [tool_call: square_number(5)]
    ↓
Frontend receives tool call
    ↓
x402 fetch client hits /api/tools/square?n=5
    ↓
Server returns 402 + payment details       → flow panel: step 1-3
    ↓
Client wallet signs payment                → flow panel: step 4
    ↓
Retry with payment header                  → flow panel: step 5
    ↓
Facilitator settles on Base Sepolia        → flow panel: step 6
    ↓
Server returns { result: 25 }              → flow panel: step 7
    ↓
Result sent back to Claude
    ↓
Claude: "5 squared is 25!"
```

Key: the **frontend** makes the paid request (not the server-side chat route), because the wallet private key lives in the browser. The chat route returns tool calls to the frontend, which executes them and sends results back.

---

## 5. Wallet

### Creation
- On first visit, generate a random wallet client-side (viem or ethers.js)
- Store private key in localStorage under `x402-playground-wallet`
- On return visits, load existing wallet

### Funding
- "Fund Wallet" button in the flow panel
- Proxy to Circle faucet API (https://faucet.circle.com/) for testnet USDC
- Also need small Base Sepolia ETH for gas via Coinbase CDP faucet
- Fallback: if faucet APIs don't support programmatic access, show wallet address + link to faucet sites

### Display (top of flow panel)
```
┌─────────────────────────────┐
│  🔑 0x1a2b...3c4d           │
│  Balance: 1.50 USDC         │
│  Network: Base Sepolia      │
│  [Fund Wallet]              │
└─────────────────────────────┘
```

---

## 6. Flow Panel

### Layout (right side)
1. **Wallet display** — fixed at top
2. **Session summary** — "3 payments · $0.025 USDC spent"
3. **Payment log** — scrolling list of payment cards

### Payment Card
```
┌─────────────────────────────────────┐
│ #3 — square_number(5)        $0.01  │
│                                     │
│  ✅ Agent called tool               │
│  ✅ Server returned 402             │
│  ✅ Price: $0.01 USDC               │
│  ✅ Wallet signed payment           │
│  ✅ Sent to facilitator             │
│  ✅ Confirmed — tx: 0xab..cd  ↗     │
│  ✅ Result returned: 25             │
│                                     │
│  2.3s total                         │
└─────────────────────────────────────┘
```

- Steps animate in one-by-one as they happen
- `↗` links to `sepolia.basescan.org/tx/0x...`
- Free tool calls don't appear in the panel — chat only
- Newest payment at top

---

## 7. x402 Configuration

### Server (paid routes)
```typescript
// @x402/next middleware on /api/tools/square and /api/tools/fact
{
  "GET /api/tools/square": {
    accepts: [{ scheme: "exact", price: "$0.01", network: "eip155:84532", payTo: SERVER_WALLET }],
    description: "Square a number"
  },
  "GET /api/tools/fact": {
    accepts: [{ scheme: "exact", price: "$0.005", network: "eip155:84532", payTo: SERVER_WALLET }],
    description: "Get a random fact"
  }
}
```

- Facilitator: `https://x402.org/facilitator` (testnet)
- Network: `eip155:84532` (Base Sepolia)
- Server wallet: separate from client wallet, private key in `.env`

### Client (auto-paying)
```typescript
// @x402/fetch wraps the browser's fetch
// Automatically detects 402, signs with client wallet, retries
```

---

## 8. Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...          # Claude API for chat
X402_SERVER_WALLET_PRIVATE_KEY=0x...  # Server's receiving wallet
```

Client wallet is generated in-browser, not in .env.

---

## 9. Build Order

1. **Scaffold** — Next.js app, Tailwind, basic two-panel layout
2. **Chat UI** — Vercel AI SDK chat with Claude, no tools yet
3. **Free tools** — Add add_numbers and get_time, wire to chat
4. **Wallet** — Client-side wallet generation, balance display, funding
5. **x402 server** — Add @x402/next middleware to square and fact routes
6. **x402 client** — Wire @x402/fetch with client wallet, handle 402 flow
7. **Flow panel** — Payment step visualization, transaction history
8. **Polish** — Animations, Basescan links, error handling

---

## 10. Key Decisions

| Decision | Why |
|----------|-----|
| All-in-one Next.js | One repo, one language. Fastest to working playground |
| Simple demo tools (not campaign) | Focus on x402 mechanics, not domain logic |
| Client-side wallet in localStorage | User experiences wallet creation and signing firsthand |
| Auto-generated wallet (no MetaMask) | Zero friction, no prerequisites |
| Frontend makes paid requests | Wallet private key lives in browser, signing must be client-side |
| Base Sepolia testnet | Free, matches x402's primary network |
| Testnet x402 facilitator | No CDP API key needed for testnet |
