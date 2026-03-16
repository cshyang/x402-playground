# x402 Protocol

> How machines pay each other for API access, one HTTP request at a time.

---

## What is x402?

x402 is an open protocol that lets any API charge per-request using cryptocurrency. When a server wants payment, it returns **HTTP 402 Payment Required** — a status code that's been reserved since the 1990s but never had a standard implementation until now.

The client reads the payment requirements from the response headers, signs a payment authorization with its wallet, and retries the request with the payment signature attached. A facilitator service handles the actual on-chain settlement.

```
Client: GET /api/tools/square?n=7
Server: 402 — "Pay $0.01 USDC to 0x... on Base Sepolia"
Client: [signs payment with wallet]
Client: GET /api/tools/square?n=7 + payment signature
Server: 200 — { result: 49 }
```

x402 was created by Coinbase. It runs primarily on **Base** (Coinbase's L2 blockchain) with **USDC** (a dollar-pegged stablecoin). Our playground uses **Base Sepolia** — the free testnet.

---

## Why it exists

Traditional API monetization requires accounts, API keys, and billing systems. That works for human developers — but AI agents can't sign up for accounts, manage API keys, or provide credit cards.

x402 removes all of that. Payment happens *inside* the HTTP request. No accounts. No keys. No subscriptions. An agent with a funded wallet can pay any x402-protected API instantly.

| Traditional | x402 |
|-------------|------|
| Sign up → get API key → use → get invoiced | Just pay per-request |
| Requires human in the loop | Fully autonomous |
| Server tracks usage per key | Server is stateless |
| Monthly billing cycles | Instant settlement |

---

## What actually happens on the blockchain

This is the part most tutorials skip. x402 isn't just "HTTP with a payment header." Real money moves on a real blockchain. Let's trace exactly what happens.

### USDC is a smart contract

USDC isn't like ETH (which is built into the blockchain itself). USDC is a **program** — a smart contract deployed at a specific address (`0x036CbD53842c5426634e7929541eC2318f3dCF7e` on Base Sepolia). That program maintains a ledger: a mapping of `address → balance`.

```
USDC Contract (simplified):
┌────────────────────────────────┐
│  balances:                     │
│    0xFD6F...2528 → 20,000,000 │  ← your wallet: $20.00 (6 decimals)
│    0x0000...0001 →          0 │  ← server wallet: $0.00
│    0xABC1...DEF2 → 5,000,000  │  ← someone else: $5.00
│                                │
│  functions:                    │
│    transfer(to, amount)        │  ← normal transfer
│    transferWithAuthorization(  │  ← the magic one
│      from, to, value,          │
│      validAfter, validBefore,  │
│      nonce, signature          │
│    )                           │
└────────────────────────────────┘
```

The normal `transfer` function requires the sender to submit a blockchain transaction (which costs gas and takes time). But USDC has a special function called **`transferWithAuthorization`** (defined in EIP-3009). This is the key innovation that makes x402 work.

### EIP-3009: The signed check

`transferWithAuthorization` lets you say: "I authorize anyone to move $0.01 from my wallet to this address, valid for the next 30 seconds." You sign this authorization with your private key, but you **don't submit it to the blockchain yourself**. Someone else (the facilitator) submits it for you.

```
Normal transfer:
  You → submit transaction → blockchain → money moves
  (you pay gas, you wait for confirmation)

transferWithAuthorization:
  You → sign authorization → hand signature to facilitator
  Facilitator → submit transaction → blockchain → money moves
  (facilitator pays gas, you just signed)
```

This is like the difference between going to the bank yourself vs. signing a check and handing it to someone. The check is just a piece of paper with your signature — it doesn't become money until someone deposits it.

The authorization contains:
```
{
  from:        "0xFD6F...2528",    // your wallet
  to:          "0x0000...0001",    // server's wallet (payTo)
  value:       "10000",            // $0.01 in USDC (6 decimal places)
  validAfter:  "1710547200",       // not valid before this timestamp
  validBefore: "1710547230",       // expires after this timestamp (30s window)
  nonce:       "0x7a3b...f1c2",    // random, prevents replay
  signature:   "0x4f8a...b3d7"     // your cryptographic signature
}
```

The signature proves you authorized this specific transfer. Nobody can forge it without your private key. Nobody can change the amount, recipient, or timing without invalidating the signature.

### "But I never approved anything"

If you've used MetaMask or Coinbase Wallet, you're used to a popup asking you to confirm every transaction. In our playground, you signed a USDC transfer authorization and never saw a dialog. Why?

Because popup vs. silent is about **where the private key lives**, not about what's being signed.

```
MetaMask / Coinbase Wallet:
  Private key is locked inside the browser extension
  Your code asks: "please sign this"
  Extension shows a popup: "Do you approve?"
  You click "Approve" → extension signs → returns signature
  The popup IS the security — the key never leaves the extension

Our playground:
  Private key is a raw hex string in localStorage
  Our code calls account.signMessage() directly
  No popup, no confirmation — the key is already accessible
  The signing happens instantly, silently, in JavaScript
```

Both produce the exact same cryptographic signature. The difference is UX, not security. MetaMask guards the key behind a UI. Our playground holds the key directly because it's a throwaway testnet wallet with fake money — there's nothing to protect.

In a production agent, the private key would be stored securely (in a hardware wallet, a secure enclave, or a key management service). The signing would still be automatic (agents can't click popups), but the key would be protected from extraction. For learning on testnet, localStorage is fine.

### What the facilitator actually does

The facilitator is the bridge between HTTP and the blockchain. Here's what happens inside it, step by step:

```
Your Server                     Facilitator                          Base Sepolia
    │                               │                                    │
    │  "verify this payment"        │                                    │
    │  + signed authorization       │                                    │
    │──────────────────────────────▶│                                    │
    │                               │                                    │
    │                               │  1. VERIFY (off-chain, instant)    │
    │                               │  ├─ Decode the signed auth         │
    │                               │  ├─ ecrecover → get signer address │
    │                               │  ├─ Does signer == from address?   │
    │                               │  ├─ Is the amount correct?         │
    │                               │  ├─ Is the nonce unused?           │
    │                               │  ├─ Is the time window valid?      │
    │                               │  └─ Check on-chain: does the       │
    │                               │     sender have enough USDC?       │
    │                               │                                    │
    │                               │  2. SETTLE (on-chain, ~2 seconds)  │
    │                               │  ├─ Build transaction:             │
    │                               │  │  USDC.transferWithAuthorization(│
    │                               │  │    from, to, value, validAfter, │
    │                               │  │    validBefore, nonce, signature│
    │                               │  │  )                              │
    │                               │  ├─ Sign tx with facilitator's     │
    │                               │  │  own wallet (pays gas)          │
    │                               │  │                                 │
    │                               │  │  submit transaction             │
    │                               │  │────────────────────────────────▶│
    │                               │  │                                 │
    │                               │  │                                 │ USDC contract
    │                               │  │                                 │ executes:
    │                               │  │                                 │ ├─ verify signature
    │                               │  │                                 │ ├─ check nonce unused
    │                               │  │                                 │ ├─ check time window
    │                               │  │                                 │ ├─ debit from: -10000
    │                               │  │                                 │ └─ credit to:  +10000
    │                               │  │                                 │
    │                               │  │         tx confirmed            │
    │                               │  │◀────────────────────────────────│
    │                               │  │                                 │
    │                               │  └─ Got tx hash: 0xabc...def      │
    │                               │                                    │
    │  "payment confirmed"          │                                    │
    │  txHash: 0xabc...def          │                                    │
    │◀──────────────────────────────│                                    │
```

**Step 1: Verify (off-chain, instant)**

The facilitator checks the math without touching the blockchain. It uses `ecrecover` — a cryptographic function that recovers the signer's address from a signature. If the recovered address matches the `from` field, the signature is legitimate. It also checks that the sender has enough USDC balance by reading from the blockchain (a read, not a write — no gas needed).

**Step 2: Settle (on-chain, ~2 seconds on Base)**

The facilitator builds a real blockchain transaction that calls `USDC.transferWithAuthorization(...)` with all the parameters and your signature. The USDC smart contract runs its own verification (double-checking the signature, nonce, and time window), then updates the internal balance ledger.

The facilitator **pays the gas fee** for this transaction. On Base, gas is ~$0.001, which is negligible compared to the payment amount. This is why Base (an L2) matters — on Ethereum mainnet, gas would be $1-5, which would destroy the economics of $0.01 micropayments.

**The result:** A permanent, public record on the blockchain. Anyone can verify it happened by looking up the transaction hash on [sepolia.basescan.org](https://sepolia.basescan.org).

### Why Base? And what's the point of gas on a Coinbase chain?

Gas exists on Ethereum to incentivize **decentralized validators** — thousands of independent operators competing to process your transaction. Nobody controls it. The gas fee is the market price for that security.

Base is different. Coinbase runs the sequencer — the single entity that orders and processes all Base transactions. There isn't a decentralized validator set. Coinbase processes your transaction, Coinbase collects the fee. So what's the point?

**Base is a rollup.** It executes transactions cheaply on its own, but periodically posts compressed batches back to Ethereum mainnet. If Coinbase ever cheats — changes a balance, censors a transaction, fabricates a result — anyone can challenge it using the original data on Ethereum. The L1 is the court of appeals.

```
Ethereum mainnet (L1):
  Thousands of independent validators
  Expensive ($1-5 per transaction)
  Truly decentralized — nobody can censor or cheat

Base (L2):
  Single sequencer (Coinbase)
  Cheap (~$0.001 per transaction)
  Centralized execution — but posts proofs to Ethereum
  If Coinbase cheats → Ethereum catches it
```

For agent-to-agent micropayments at $0.01, you need cheap and fast. You don't need maximum decentralization. If an agent pays $0.01 for an API call, it's not worth $5 in gas to settle that on Ethereum mainnet. Base gives you the same USDC, the same wallets, the same signatures — at 1/1000th the cost.

The honest tradeoff: Base is closer to "Coinbase's database with Ethereum as a backup" than to a fully decentralized network. If you needed censorship resistance against Coinbase specifically, you'd use Ethereum mainnet. For a learning playground with testnet USDC, this distinction doesn't matter — but it's good to understand what you're building on.

### Why this is trustless

"Trustless" doesn't mean "no trust." It means you don't need to trust any single party:

**The client doesn't trust the server.** The signed authorization is specific: exact amount, exact recipient, exact time window. The server can't take more than what was authorized. If the server doesn't deliver the data after payment, the client can prove on-chain that payment was made (the transaction is public).

**The server doesn't trust the client.** The facilitator verifies the payment before the server runs its handler. If the signature is invalid or the client doesn't have enough USDC, the server never executes.

**Neither trusts the facilitator (fully).** The facilitator can't steal money — it can only execute the exact transfer you signed. It can't change the amount or recipient because that would invalidate the signature. The facilitator could *refuse* to settle (denial of service), but it can't steal. And you can switch facilitators — they're interchangeable.

```
What could go wrong?                Who's protected?       How?
──────────────────────             ─────────────────       ────
Client sends fake signature         Server                  Facilitator verifies
Server takes payment, no response   Client                  Tx is public proof
Facilitator changes the amount      Both                    Signature locks the terms
Facilitator goes down               Both                    Switch to another facilitator
Client double-spends               Server                  Nonce prevents replay
```

---

## How the full flow works

Now that you understand the mechanics, here's the complete flow with every detail:

```
Client                           Server                     Facilitator        Blockchain
  │                                 │                            │                 │
  │  1. GET /api/tools/square?n=7   │                            │                 │
  │────────────────────────────────▶│                            │                 │
  │                                 │                            │                 │
  │                                 │ withX402() middleware:      │                 │
  │                                 │ checks for payment header  │                 │
  │                                 │ → not found                │                 │
  │                                 │                            │                 │
  │                                 │ ExactEvmScheme (server):   │                 │
  │                                 │ "$0.01" → amount: "10000"  │                 │
  │                                 │ asset: USDC contract addr  │                 │
  │                                 │                            │                 │
  │  2. HTTP 402                    │                            │                 │
  │  PAYMENT-REQUIRED header:       │                            │                 │
  │  {                              │                            │                 │
  │    x402Version: 2,              │                            │                 │
  │    accepts: [{                  │                            │                 │
  │      scheme: "exact",           │                            │                 │
  │      network: "eip155:84532",   │                            │                 │
  │      amount: "10000",           │                            │                 │
  │      asset: "0x036C...CF7e",    │                            │                 │
  │      payTo: "0x0000...0001"     │                            │                 │
  │    }]                           │                            │                 │
  │  }                              │                            │                 │
  │◀────────────────────────────────│                            │                 │
  │                                 │                            │                 │
  │  3. Client-side:                │                            │                 │
  │  ├─ getPaymentRequiredResponse()│                            │                 │
  │  │  → parse the 402 headers     │                            │                 │
  │  │                              │                            │                 │
  │  ├─ ExactEvmScheme (client):    │                            │                 │
  │  │  create EIP-3009 auth:       │                            │                 │
  │  │  { from, to, value,          │                            │                 │
  │  │    validAfter, validBefore,  │                            │                 │
  │  │    nonce }                   │                            │                 │
  │  │  + sign with private key     │                            │                 │
  │  │                              │                            │                 │
  │  ├─ createPaymentPayload()      │                            │                 │
  │  │  → wraps auth into payload   │                            │                 │
  │  │                              │                            │                 │
  │  └─ encodePaymentSignatureHeader│                            │                 │
  │     → base64 encode into header │                            │                 │
  │                                 │                            │                 │
  │  4. GET /api/tools/square?n=7   │                            │                 │
  │  + X-PAYMENT header             │                            │                 │
  │────────────────────────────────▶│                            │                 │
  │                                 │                            │                 │
  │                                 │ withX402() middleware:      │                 │
  │                                 │ found payment header       │                 │
  │                                 │ → decode payload           │                 │
  │                                 │                            │                 │
  │                                 │ 5. HTTPFacilitatorClient    │                 │
  │                                 │ POST /verify               │                 │
  │                                 │───────────────────────────▶│                 │
  │                                 │                            │ ecrecover       │
  │                                 │                            │ check balance   │
  │                                 │                            │ check nonce     │
  │                                 │          { isValid: true } │                 │
  │                                 │◀───────────────────────────│                 │
  │                                 │                            │                 │
  │                                 │ 6. HTTPFacilitatorClient    │                 │
  │                                 │ POST /settle               │                 │
  │                                 │───────────────────────────▶│                 │
  │                                 │                            │                 │
  │                                 │                            │ build tx:       │
  │                                 │                            │ USDC.transfer   │
  │                                 │                            │ WithAuth(...)   │
  │                                 │                            │────────────────▶│
  │                                 │                            │                 │
  │                                 │                            │                 │ verify sig
  │                                 │                            │                 │ check nonce
  │                                 │                            │                 │ debit from
  │                                 │                            │                 │ credit to
  │                                 │                            │                 │
  │                                 │                            │  tx: 0xabc..def │
  │                                 │                            │◀────────────────│
  │                                 │   { txHash: "0xabc..def" } │                 │
  │                                 │◀───────────────────────────│                 │
  │                                 │                            │                 │
  │                                 │ withX402() continues:       │                 │
  │                                 │ payment settled!           │                 │
  │                                 │ → call handler()           │                 │
  │                                 │ → 7 * 7 = 49              │                 │
  │                                 │                            │                 │
  │  7. HTTP 200                    │                            │                 │
  │  { result: 49 }                 │                            │                 │
  │  + PAYMENT-RESPONSE header      │                            │                 │
  │  { txHash: "0xabc..def" }       │                            │                 │
  │◀────────────────────────────────│                            │                 │
```

After this, the USDC contract's state has changed permanently:

```
Before:                              After:
  0xFD6F...2528 → 20,000,000          0xFD6F...2528 → 19,990,000  (-10,000)
  0x0000...0001 →          0          0x0000...0001 →     10,000  (+10,000)
```

And anyone in the world can verify this by checking `sepolia.basescan.org/tx/0xabc..def`.

---

## Quick glossary

**ERC / EIP** — Ethereum's standards process. EIP = Ethereum Improvement Proposal. ERC = Ethereum Request for Comments (application-level standards like token formats). x402 itself is NOT an ERC — it's a standalone protocol by Coinbase. But it uses ERCs under the hood (like ERC-20 for USDC).

**CAIP-2 chain identifier** — A standard format for identifying blockchains. `eip155:84532` means chain ID 84532 on an EVM-compatible chain (Base Sepolia). Common ones:

| Identifier | Chain |
|-----------|-------|
| `eip155:1` | Ethereum mainnet |
| `eip155:8453` | Base mainnet |
| `eip155:84532` | Base Sepolia (testnet) — what we use |
| `solana:mainnet` | Solana mainnet |

**EIP-3009 `transferWithAuthorization`** — A function on the USDC contract that lets you authorize a transfer with just a signature. The sender signs, someone else submits. This is the mechanism that makes x402 work — you never need to submit a blockchain transaction yourself.

**"Exact" scheme** — The payment scheme we use. The client pays the exact amount requested. (An "upto" scheme would let you authorize a maximum and the server takes what it needs.)

**Gas** — The fee for executing a transaction on the blockchain. On Base, this is ~$0.001. The facilitator pays gas, not you.

---

## SDK reference

We use three packages. Here's every function and class, organized by where it runs.

### Browser side (the payer)

These run in the user's browser. They handle signing payments and encoding them into HTTP headers.

---

#### `x402Client` — from `@x402/core/client`

A registry of payment schemes the client can use.

```typescript
// x402-client.ts:114-115
const client = new x402Client();
client.register("eip155:84532", new ExactEvmScheme(evmSigner));
```

| | |
|---|---|
| **Constructor** | No arguments |
| **`.register(network, scheme)`** | Registers a payment scheme for a specific chain |
| **Purpose** | A 402 response might offer payment on multiple chains. The client needs to know which ones it supports. In our case: just Base Sepolia with the "exact" scheme. |

---

#### `x402HTTPClient` — from `@x402/core/client`

HTTP adapter that reads/writes x402 payment data from/to HTTP headers. This is where the protocol encoding lives.

```typescript
// x402-client.ts:116
const httpClient = new x402HTTPClient(client);
```

| | |
|---|---|
| **Constructor** | Takes an `x402Client` |
| **Purpose** | Bridges the abstract payment logic and HTTP. Has four methods we use: |

**`.getPaymentRequiredResponse(getHeader, body?)`** — Reads a 402 response.

```typescript
// x402-client.ts:118-121
const paymentRequired = httpClient.getPaymentRequiredResponse(
  (name) => response.headers.get(name),  // reads headers by name
  await response.json().catch(() => null) // optional body fallback
);
```

| | |
|---|---|
| **Input** | Header reader function + optional response body |
| **Output** | A `PaymentRequired` object describing what the server wants: |

```
{
  x402Version: 2,
  accepts: [{
    scheme: "exact",
    network: "eip155:84532",
    asset: "0x036C...CF7e",     // USDC contract address
    amount: "10000",            // $0.01 in USDC's 6-decimal format
    payTo: "0x0000...0001",     // recipient wallet
    maxTimeoutSeconds: 30
  }],
  resource: { ... }
}
```

**`.createPaymentPayload(paymentRequired)`** — The big one. Signs the payment.

```typescript
// x402-client.ts:142
const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
```

| | |
|---|---|
| **Input** | The `PaymentRequired` from above |
| **Output** | A `PaymentPayload` containing the signed EIP-3009 authorization |
| **What happens inside** | Selects a payment option from `accepts` → delegates to `ExactEvmScheme` → builds the `transferWithAuthorization` parameters (from, to, value, validAfter, validBefore, nonce) → signs with your private key → wraps everything into a payload object |

This is the "signing the check" step. The output contains your cryptographic signature authorizing the transfer, but no money has moved yet.

**`.encodePaymentSignatureHeader(paymentPayload)`** — Serializes for HTTP transport.

```typescript
// x402-client.ts:149
const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
```

| | |
|---|---|
| **Input** | The signed `PaymentPayload` |
| **Output** | `Record<string, string>` — headers to attach to the retry request (base64-encoded JSON) |

**`.getPaymentSettleResponse(getHeader)`** — Reads the receipt from the 200 response.

```typescript
// x402-client.ts:171-173
const settleResponse = httpClient.getPaymentSettleResponse(
  (name) => paidResponse.headers.get(name)
);
```

| | |
|---|---|
| **Input** | Header reader from the successful response |
| **Output** | Settlement info including `txHash` — the on-chain transaction ID you can look up on Basescan |

---

#### `ExactEvmScheme` (client) — from `@x402/evm`

The EVM-specific payment logic. Knows how to construct and sign USDC transfer authorizations.

```typescript
// x402-client.ts:115
new ExactEvmScheme(evmSigner)
```

| | |
|---|---|
| **Constructor** | Takes a `ClientEvmSigner` (something that can sign Ethereum messages and read contract state) |
| **What it does** | Builds the EIP-3009 `transferWithAuthorization` parameters and signs them with your key |
| **"Exact" means** | Pay the exact amount. No overpayment, no authorization for more. |

Under the hood, it constructs EIP-712 typed data (a structured message format that wallets can sign) containing the transfer details, then asks the signer to produce a signature.

---

#### `toClientEvmSigner(account, publicClient)` — from `@x402/evm`

A bridge function. The x402 SDK needs a signer that can both sign and read. viem separates these concerns. This function combines them.

```typescript
// x402-client.ts:112
const evmSigner = toClientEvmSigner(account, publicClient);
```

| | |
|---|---|
| **Input** | A viem `Account` (has the private key, can sign) + a viem `PublicClient` (connects to blockchain, can read contract state) |
| **Output** | A `ClientEvmSigner` that `ExactEvmScheme` can use |
| **Why it exists** | `ExactEvmScheme` needs to both sign the authorization AND read on-chain state (like checking your nonce). viem's `Account` can sign but can't read. viem's `PublicClient` can read but can't sign. This function glues them together. |

---

### Server side (the seller)

These run on your Next.js server. They protect routes, build 402 responses, and coordinate with the facilitator.

---

#### `HTTPFacilitatorClient` — from `@x402/core/server`

The connection to the facilitator service. This is your server's lifeline to the blockchain.

```typescript
// x402-server.ts:16-18
const facilitator = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator",
});
```

| | |
|---|---|
| **Constructor** | `{ url: string }` |
| **Testnet** | `https://x402.org/facilitator` (free, no API key) |
| **Production** | `https://api.cdp.coinbase.com/platform/v2/x402` (1,000 free tx/month) |
| **What it does** | Makes two HTTP calls to the facilitator: `POST /verify` (check if the signature is valid and the sender has funds) and `POST /settle` (submit the actual blockchain transaction). Your server never touches the blockchain directly. |

---

#### `x402ResourceServer` — from `@x402/core/server`

The server-side payment orchestrator. Coordinates between the middleware, the scheme, and the facilitator.

```typescript
// x402-server.ts:19-20
const server = new x402ResourceServer(facilitator)
  .register(NETWORK, new ExactEvmScheme());
```

| | |
|---|---|
| **Constructor** | Takes a `FacilitatorClient` |
| **`.register(network, scheme)`** | Tells the server "I accept this payment scheme on this network" |
| **What it does** | When `withX402` receives a paid request: the resource server decodes the payment header → asks the facilitator to verify → if valid, asks the facilitator to settle → reports success/failure back to the middleware |

---

#### `ExactEvmScheme` (server) — from `@x402/evm/exact/server`

The server-side variant. **Different import path, different purpose, same name.**

```typescript
// x402-server.ts:2
import { ExactEvmScheme } from "@x402/evm/exact/server";
```

| | |
|---|---|
| **Constructor** | No arguments (the server doesn't sign anything) |
| **What it does** | Two jobs: (1) converts human prices like `"$0.01"` to on-chain amounts (`"10000"` for USDC with 6 decimals, plus the correct asset contract address), and (2) builds the structured payment requirements that go in the 402 response headers |
| **Key difference** | Client `ExactEvmScheme` signs payments. Server `ExactEvmScheme` describes prices. Same name, different package, different job. |

---

#### `withX402(handler, routeConfig, server)` — from `@x402/next`

The middleware. Wraps a Next.js route handler with payment protection.

```typescript
// x402-server.ts:38
return withX402(handler, routeConfig, server);
```

| | |
|---|---|
| **Input** | Your route handler, a `RouteConfig`, and the `x402ResourceServer` |
| **Output** | A new handler that intercepts every request |
| **No payment header?** | Asks the server scheme to build payment requirements → returns 402 |
| **Has payment header?** | Asks the resource server to verify and settle → if successful, calls your original handler → returns the response with a settlement receipt header |

The `RouteConfig` you provide:

```typescript
// x402-server.ts:28-35
{
  accepts: {
    scheme: "exact",          // payment type
    payTo: "0x...",           // who gets the money
    price: "$0.01",           // human-readable price (scheme converts to on-chain amount)
    network: "eip155:84532",  // which blockchain
  },
  description: "Square a number",
}
```

---

## Our wrappers

We built two helpers on top of the SDK to keep our code clean.

**Server: `withPayment(handler, price, description)`** — Pre-configures scheme, network, and recipient so each route only specifies what's unique.

```typescript
// api/tools/square/route.ts:24
export const GET = withPayment(handler, "$0.01", "Square a number");
```

**Client: `x402Fetch(url, privateKey, onStep?)`** — Orchestrates the entire client-side flow (ERC-8128 signing + x402 payment) with step-by-step progress callbacks for the UI.

```typescript
// chat-panel.tsx
const result = await x402Fetch(url, wallet.privateKey, (steps) => {
  // update flow panel in real-time
});
```

Returns `{ success, data, txHash, error, steps }`.

---

## Cheat sheet

| What | Package | Side | One-liner |
|------|---------|------|-----------|
| `x402Client` | `@x402/core/client` | Browser | "I can pay on these chains" |
| `x402HTTPClient` | `@x402/core/client` | Browser | "Read 402 headers, encode payment headers" |
| `ExactEvmScheme` | `@x402/evm` | Browser | "Sign this USDC transfer authorization" |
| `toClientEvmSigner` | `@x402/evm` | Browser | "Glue viem's Account + PublicClient into one signer" |
| `HTTPFacilitatorClient` | `@x402/core/server` | Server | "Talk to the payment processor (verify + settle)" |
| `x402ResourceServer` | `@x402/core/server` | Server | "Orchestrate payment verification for my routes" |
| `ExactEvmScheme` | `@x402/evm/exact/server` | Server | "Convert $0.01 to 10000 and build 402 response" |
| `withX402` | `@x402/next` | Server | "Protect this route — 402 if unpaid, 200 if paid" |
