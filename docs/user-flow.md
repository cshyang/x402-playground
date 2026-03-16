# x402 Playground — User Flow Documentation

## Overview

The x402 Playground is a two-panel web app where users chat with an AI agent that has free and paid tools. Paid tools require real USDC micropayments on Base Sepolia testnet via the x402 protocol, with identity authentication via ERC-8128.

### Protocol Stack

| Layer | Standard | Role |
|-------|----------|------|
| **Authentication** | ERC-8128 | Signs every paid request with wallet identity |
| **Payment** | x402 | HTTP 402 micropayment flow with USDC |
| **Blockchain** | Base Sepolia | On-chain USDC settlement |

---

## User Journey

### Phase 1: First Visit

```
User opens app
    │
    ├─ Browser generates Ethereum wallet (private key + address)
    ├─ Stores in localStorage (persists across sessions)
    ├─ Fetches USDC + ETH balances from Base Sepolia
    │
    ▼
┌─────────────────────────────────────────────────┐
│                                                 │
│   LEFT: Chat Panel          RIGHT: Flow Panel   │
│   ┌───────────────┐        ┌────────────────┐   │
│   │ Tool directory │        │ Wallet: 0x...  │   │
│   │               │        │ USDC: $0.00    │   │
│   │ FREE:         │        │ ETH: 0.0000    │   │
│   │  add_numbers  │        │                │   │
│   │  get_time     │        │ ⚠ Not funded   │   │
│   │               │        │ [Fund] button  │   │
│   │ PAID:         │        │                │   │
│   │  square $0.01 │        │ No payments    │   │
│   │  fact $0.005  │        │ yet            │   │
│   └───────────────┘        └────────────────┘   │
│   ┌───────────────────────┐                     │
│   │ Message input...   [↑]│                     │
│   └───────────────────────┘                     │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Phase 2: Funding the Wallet

```
User clicks "Fund" button
    │
    ├─ Clicks "copy" to copy wallet address
    ├─ Opens Circle Faucet (https://faucet.circle.com/)
    │
    ▼
┌─ Circle Faucet ──────────────────┐
│  1. Select network: Base         │
│  2. Select testnet: Sepolia      │
│  3. Paste wallet address         │
│  4. Click claim → 20 USDC       │
└──────────────────────────────────┘
    │
    ├─ USDC arrives on-chain (~10 seconds)
    ├─ App auto-refreshes balance (every 15s)
    │
    ▼
Flow Panel now shows: USDC: $20.00
Warning disappears
```

### Phase 3: Using a Free Tool

```
User: "What is 12 + 34?"
    │
    ▼
Browser ──POST──▶ /api/chat { messages, walletBalance }
                      │
                      ▼
                 Z.AI (GLM-4.7)
                 decides: call add_numbers(a=12, b=34)
                      │
                 execute() runs server-side
                 result: { result: 46 }
                      │
                 GLM-4.7: "12 + 34 = 46"
                      │
    ◀──stream──────────┘
    │
    ▼
Chat shows:
┌──────────────────────────────┐
│ YOU                          │
│ What is 12 + 34?             │
│                              │
│ AGENT                        │
│ ┌─ CALLED add_numbers ─────┐│
│ │ { "result": 46 }         ││
│ └───────────────────────────┘│
│ 12 + 34 equals 46.          │
└──────────────────────────────┘

Flow Panel: no change (free tools don't appear)
```

### Phase 4: Using a Paid Tool

This is the core learning experience — the x402 payment flow.

```
User: "What is 7 squared?"
    │
    ▼
Browser ──POST──▶ /api/chat { messages, walletBalance: "$20.00" }
                      │
                      ▼
                 Z.AI (GLM-4.7)
                 decides: call square_number(n=7)
                 ⚠ NO execute() function on server
                      │
    ◀──stream──────────┘
    │
    ▼
Chat shows "PAYING square_number (paid) processing x402..."
    │
    ▼
ERC-8128 + x402 PAYMENT FLOW BEGINS (8 steps)
```

#### The ERC-8128 + x402 Payment Flow (Detail)

```
Step 1: ERC-8128 IDENTITY SIGNING
    Browser signs the HTTP request with wallet's private key
    Adds three headers: Signature, Signature-Input, Content-Digest
    keyid format: erc8128:84532:0xFD6F...2528
    ⚠ This is identity proof, NOT payment — "I am this wallet"
    Flow Panel: ✓ ERC-8128 identity — Signed as 0xFD6F...2528 on chain 84532

Step 2: REQUEST SENT
    Browser ──GET──▶ /api/tools/square?n=7
    + ERC-8128 signature headers (identity proof)
    Flow Panel: ✓ Request sent — GET /api/tools/square?n=7

Step 3: PAYMENT REQUIRED
    Server ◀── x402 middleware intercepts
    Server ──402──▶ Browser
    Headers contain payment requirements
    Flow Panel: ✓ Payment required — x402 v2

Step 4: PAYMENT DETAILS PARSED
    Browser reads from 402 response:
    ┌──────────────────────────────────┐
    │ scheme: "exact"                  │
    │ amount: "10000" (= $0.01 USDC)  │
    │ asset: 0x036C...CF7e (USDC)     │
    │ payTo: 0x0000...0001            │
    │ network: eip155:84532           │
    └──────────────────────────────────┘
    Flow Panel: ✓ Payment details — 10000 USDC → 0x0000...0001

Step 5: SIGNING USDC AUTHORIZATION
    Browser uses private key from localStorage
    Signs a USDC transferWithAuthorization
    ⚠ Does NOT submit to blockchain — just creates a signature
    Flow Panel: ✓ Signing USDC authorization — Signed from 0xFD6F...2528

Step 6: RETRY WITH IDENTITY + PAYMENT
    Browser ──GET──▶ /api/tools/square?n=7
    + ERC-8128 headers (re-signed with new nonce for replay protection)
    + x402 payment signature header
    Server verifies ERC-8128 identity → knows WHO is paying
    Flow Panel: ✓ Identity + payment → 200

Step 7: SETTLEMENT
    Server ──▶ x402 Facilitator (x402.org/facilitator)
    Facilitator verifies payment signature
    Facilitator submits USDC transfer to Base Sepolia
    Transaction settles on-chain
    Flow Panel: ✓ Settlement — tx: 0xabc...def on eip155:84532

Step 8: RESPONSE RECEIVED
    Server handler executes: 7 * 7 = 49
    Server verifies ERC-8128 identity → includes caller info
    Server ──200──▶ Browser:
    {
      result: 49,
      authenticatedBy: "ERC-8128",
      caller: "0xFD6F...2528",
      chainId: 84532
    }
    Browser calls addToolResult() → sends result to LLM
    sendAutomaticallyWhen triggers → LLM generates follow-up
    Wallet balance refreshes: $20.00 → $19.99
    Flow Panel: ✓ Response received — {"result":49,...}
```

#### After Payment Completes

```
Chat shows:
┌──────────────────────────────────┐
│ YOU                              │
│ What is 7 squared?               │
│                                  │
│ AGENT                            │
│ ┌─ CALLED square_number (paid) ─┐│
│ │ { "result": 49 }             ││
│ └────────────────────────────────┘│
│ 7 squared is 49! This used the   │
│ square_number tool which cost     │
│ $0.01 USDC.                      │
└──────────────────────────────────┘

Flow Panel:
┌──────────────────────────────────┐
│ Wallet: 0xFD6F...2528           │
│ USDC: $19.99   ETH: 0.0000     │
│                                  │
│ Session: 1 payment · $0.010      │
│                                  │
│ #1 — square_number ({"n":7})     │
│  ✓ 1. ERC-8128 identity         │
│     Signed as 0xFD6F...2528     │
│  ✓ 2. Request sent              │
│     GET /api/tools/square?n=7    │
│  ✓ 3. Payment required          │
│     x402 v2                      │
│  ✓ 4. Payment details           │
│     10000 USDC → 0x0000...0001   │
│  ✓ 5. Signing USDC authorization│
│     Signed exact authorization   │
│  ✓ 6. Identity + payment        │
│     Identity + payment → 200    │
│  ✓ 7. Settlement                │
│     tx: 0xabc...def              │
│  ✓ 8. Response received         │
│     {"result":49,...}            │
│  View on Basescan ↗             │
└──────────────────────────────────┘
```

### Phase 5: Unfunded Wallet

If a user tries a paid tool without USDC:

```
User: "What is 7 squared?"
    │
    ▼
/api/chat receives walletBalance: "$0.00"
    │
    ▼
System prompt includes:
  "WARNING: wallet is NOT funded.
   Do NOT call paid tools."
    │
    ▼
GLM-4.7 responds:
  "I'd need to use square_number which costs $0.01 USDC,
   but your wallet isn't funded. Click the Fund button
   on the right panel to get free testnet USDC."

No payment attempted. No error.
```

---

## Data Flow Diagram

```
┌──────────────┐     ┌──────────────┐     ┌─────────────────┐
│   BROWSER    │     │  NEXT.JS     │     │   EXTERNAL      │
│              │     │  SERVER      │     │   SERVICES      │
│              │     │              │     │                 │
│ Chat UI ─────┼──1──▶ /api/chat ───┼──2──▶ Z.AI GLM-4.7   │
│  useChat()   ◀──3──┤  streamText()◀──3──┤  tool decision  │
│              │     │              │     │                 │
│ ERC-8128 ────┤     │              │     │                 │
│  signs req   │     │              │     │                 │
│              │     │              │     │                 │
│ x402 Client──┼──4──▶ /api/tools/* │     │                 │
│  x402Fetch() ◀──5──┤  verifyErc   │     │                 │
│  + ERC-8128  │     │  8128()      │     │                 │
│              │     │  withX402()  ├──6──▶ x402 Facilitator│
│ Wallet ──────┤     │              │     │  verify+settle  │
│  sign ERC8128│     │              │     │        │        │
│  sign USDC   │     │              │     │        7        │
│  localStorage│     │              │     │        ▼        │
│              │     │              │     │  Base Sepolia   │
│ addTool      │     │              │     │  USDC on-chain  │
│  Result() ───┼──8──▶ /api/chat    │     │                 │
│ (auto-send)  ◀──9──┤  final resp  │     │                 │
└──────────────┘     └──────────────┘     └─────────────────┘

1. User sends chat message (+ wallet balance)
2. Server forwards to Z.AI LLM
3. LLM streams response + tool calls (paid tools have no execute)
4. Browser signs request with ERC-8128, calls paid tool endpoint
5. Server returns 402; browser signs USDC auth + retries with identity + payment
6. Server verifies ERC-8128 identity, sends payment to facilitator
7. Facilitator settles USDC on Base Sepolia
8. Browser sends tool result (incl. authenticatedBy) back to LLM
9. sendAutomaticallyWhen triggers; LLM generates final response with result
```

---

## Sequence Diagram — Paid Tool (x402 Payment)

```
 User          Browser           /api/chat        Z.AI (GLM-4.7)      /api/tools/*      x402 Facilitator    Base Sepolia
  │               │                  │                  │                  │                  │                  │
  │  "What is     │                  │                  │                  │                  │                  │
  │  7 squared?"  │                  │                  │                  │                  │                  │
  │──────────────▶│                  │                  │                  │                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │  POST /api/chat  │                  │                  │                  │                  │
  │               │  {messages,      │                  │                  │                  │                  │
  │               │   walletBalance} │                  │                  │                  │                  │
  │               │─────────────────▶│                  │                  │                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │                  │  streamText()    │                  │                  │                  │
  │               │                  │  + tool defs     │                  │                  │                  │
  │               │                  │─────────────────▶│                  │                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │                  │                  │  "call           │                  │                  │
  │               │                  │  tool_call:      │  square_number   │                  │                  │
  │               │                  │  square_number   │  (n=7)"          │                  │                  │
  │               │                  │◀─────────────────│                  │                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │                  │  ⚠ No execute()  │                  │                  │                  │
  │               │  SSE stream:     │  on server       │                  │                  │                  │
  │               │  tool part with  │                  │                  │                  │                  │
  │               │  state:          │                  │                  │                  │                  │
  │               │  "input-available│                  │                  │                  │                  │
  │               │◀─────────────────│                  │                  │                  │                  │
  │               │                  │                  │                  │                  │                  │
  │  "paying      │  ┌──────────────────────────────────────────┐         │                  │                  │
  │  x402..."     │  │ x402Fetch() begins (browser-side)       │         │                  │                  │
  │◀──────────────│  └──────────────────────────────────────────┘         │                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │  ┌───────────────────────────────┐  │                  │                  │                  │
  │               │  │ ERC-8128: Sign HTTP request   │  │                  │                  │                  │
  │               │  │ + Signature header            │  │                  │                  │                  │
  │               │  │ + Signature-Input header      │  │                  │                  │                  │
  │               │  │ + Content-Digest header       │  │                  │                  │                  │
  │               │  │ keyid: erc8128:84532:0xFD6F.. │  │                  │                  │                  │
  │               │  └───────────────────────────────┘  │                  │                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │  GET /api/tools/square?n=7          │                  │                  │                  │
  │               │  + ERC-8128 identity headers        │                  │                  │                  │
  │               │────────────────────────────────────────────────────── ▶│                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │                  │                  │  withX402()      │                  │                  │
  │               │                  │                  │  checks headers  │                  │                  │
  │               │                  │                  │  no payment found│                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │  HTTP 402 Payment Required          │                  │                  │                  │
  │               │  + x402 headers: scheme, amount,    │                  │                  │                  │
  │               │    asset, payTo, network             │                  │                  │                  │
  │               │◀────────────────────────────────────────────────────── │                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │  ┌───────────────────────────────┐  │                  │                  │                  │
  │               │  │ Parse 402 requirements        │  │                  │                  │                  │
  │               │  │ Create ExactEvmScheme(signer) │  │                  │                  │                  │
  │               │  │ Sign USDC transferWithAuth    │  │                  │                  │                  │
  │               │  │ using wallet private key      │  │                  │                  │                  │
  │               │  └───────────────────────────────┘  │                  │                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │  ┌───────────────────────────────┐  │                  │                  │                  │
  │               │  │ ERC-8128: Re-sign request     │  │                  │                  │                  │
  │               │  │ (new nonce for replay protect) │  │                  │                  │                  │
  │               │  └───────────────────────────────┘  │                  │                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │  GET /api/tools/square?n=7          │                  │                  │                  │
  │               │  + ERC-8128 identity headers        │                  │                  │                  │
  │               │  + x402 payment signature header    │                  │                  │                  │
  │               │────────────────────────────────────────────────────── ▶│                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │                  │                  │  verifyErc8128() │                  │                  │
  │               │                  │                  │  → 0xFD6F...2528 │                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │                  │                  │  withX402()      │                  │                  │
  │               │                  │                  │  found payment   │                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │                  │                  │                  │  verify(payload)  │                  │
  │               │                  │                  │                  │─────────────────▶ │                  │
  │               │                  │                  │                  │                  │                  │
  │               │                  │                  │                  │  ✓ valid          │                  │
  │               │                  │                  │                  │◀─────────────────│                  │
  │               │                  │                  │                  │                  │                  │
  │               │                  │                  │                  │  settle(payload)  │                  │
  │               │                  │                  │                  │─────────────────▶ │                  │
  │               │                  │                  │                  │                  │                  │
  │               │                  │                  │                  │                  │ USDC transfer    │
  │               │                  │                  │                  │                  │────────────────▶ │
  │               │                  │                  │                  │                  │                  │
  │               │                  │                  │                  │                  │ tx confirmed     │
  │               │                  │                  │                  │                  │◀────────────────│
  │               │                  │                  │                  │                  │                  │
  │               │                  │                  │                  │  tx: 0xabc...     │                  │
  │               │                  │                  │                  │◀─────────────────│                  │
  │               │                  │                  │                  │                  │                  │
  │               │                  │                  │  handler runs:   │                  │                  │
  │               │                  │                  │  7 * 7 = 49      │                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │  HTTP 200 { result: 49,              │                  │                  │                  │
  │               │    authenticatedBy: "ERC-8128",      │                  │                  │                  │
  │               │    caller: "0xFD6F..." }             │                  │                  │                  │
  │               │  + settlement headers (tx hash)     │                  │                  │                  │
  │               │◀────────────────────────────────────────────────────── │                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │  addToolResult({ toolCallId,        │                  │                  │                  │
  │               │    tool: "square_number",            │                  │                  │                  │
  │               │    output: { result: 49 } })         │                  │                  │                  │
  │               │─────────────────▶│                  │                  │                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │                  │  messages + tool  │                  │                  │                  │
  │               │                  │  result           │                  │                  │                  │
  │               │                  │─────────────────▶│                  │                  │                  │
  │               │                  │                  │                  │                  │                  │
  │               │                  │  "7 squared is   │                  │                  │                  │
  │               │  SSE stream:     │   49!"           │                  │                  │                  │
  │               │  final text      │                  │                  │                  │                  │
  │               │◀─────────────────│◀─────────────────│                  │                  │                  │
  │               │                  │                  │                  │                  │                  │
  │  Shows result │                  │                  │                  │                  │                  │
  │  + payment log│                  │                  │                  │                  │                  │
  │◀──────────────│                  │                  │                  │                  │                  │
  │               │                  │                  │                  │                  │                  │
```

## Sequence Diagram — Free Tool (No Payment)

```
 User          Browser           /api/chat        Z.AI (GLM-4.7)
  │               │                  │                  │
  │  "What is     │                  │                  │
  │  2 + 3?"      │                  │                  │
  │──────────────▶│                  │                  │
  │               │                  │                  │
  │               │  POST /api/chat  │                  │
  │               │─────────────────▶│                  │
  │               │                  │  streamText()    │
  │               │                  │─────────────────▶│
  │               │                  │                  │
  │               │                  │  tool_call:      │
  │               │                  │  add_numbers     │
  │               │                  │  (a=2, b=3)      │
  │               │                  │◀─────────────────│
  │               │                  │                  │
  │               │                  │  execute() runs  │
  │               │                  │  server-side     │
  │               │                  │  result: 5       │
  │               │                  │                  │
  │               │                  │  feeds result    │
  │               │                  │  back to LLM     │
  │               │                  │─────────────────▶│
  │               │                  │                  │
  │               │                  │  "2 + 3 = 5"     │
  │               │  SSE stream:     │                  │
  │               │  tool part +     │                  │
  │               │  text response   │                  │
  │               │◀─────────────────│◀─────────────────│
  │               │                  │                  │
  │  Shows result │                  │                  │
  │◀──────────────│                  │                  │
  │               │                  │                  │
```

---

## Lifecycle Summary

| Stage | What Happens | Where |
|-------|-------------|-------|
| **Init** | Wallet generated, balances fetched | Browser (localStorage + viem) |
| **Chat** | Message sent to LLM (+ wallet balance), tool decision made | Server (/api/chat → Z.AI) |
| **Free tool** | Executes immediately, streams result | Server (execute() in route) |
| **Paid tool** | Returns to browser without executing | Server → Browser |
| **ERC-8128** | Signs HTTP request with wallet identity (Signature, Signature-Input, Content-Digest headers) | Browser (@slicekit/erc8128) |
| **Payment** | 402 → sign USDC auth → retry with identity + payment | Browser (x402Fetch) → Server |
| **Verification** | Server verifies ERC-8128 identity → knows caller address | Server (verifyErc8128) |
| **Settlement** | USDC transferred on-chain | Facilitator → Base Sepolia |
| **Result** | Tool output (incl. authenticatedBy) sent back to LLM | Browser (addToolResult) → Server |
| **Response** | sendAutomaticallyWhen triggers, LLM incorporates result | Server (stream) → Browser |

---

## Mobile Experience

On screens < 768px (md breakpoint):

- Two-panel layout replaced with tab switcher
- **Chat tab**: Full-screen chat with tool chips above input
- **Payments tab**: Full-screen wallet + payment log
- Badge on Payments tab shows count of active payments
- `h-dvh` used instead of `h-screen` to account for mobile browser chrome
