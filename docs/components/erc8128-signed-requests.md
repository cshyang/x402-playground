# ERC-8128: Signed HTTP Requests

> Your agent paid for an API call. But someone else got the data.

---

## What is it?

You've built an agent that pays for API access with x402. It signs a USDC payment, attaches it to an HTTP request, and gets back data. Simple. But here's the thing — the payment signature proves you authorized a dollar transfer. It doesn't prove you're the one making the HTTP request. An attacker who intercepts that payment header can attach it to *their* request, and your server won't know the difference. You get charged. They get the data.

ERC-8128 fixes this. It's a standard for signing HTTP requests with your Ethereum wallet — not the payment, but the request itself. Three extra headers on every call: a cryptographic signature, a description of what was signed, and a hash of the body. The server runs `ecrecover`, recovers your wallet address, and now knows: this specific HTTP request came from this specific wallet. If anyone tampers with the request or replays it, the signature breaks.

Created by jacopo.eth (Slice), it builds on **RFC 9421** — the IETF's standard for HTTP Message Signatures — and plugs in Ethereum's signing scheme (EIP-191) as the algorithm. Think of it as HTTPS client certificates, but your wallet is the certificate and the blockchain is the CA.

Status: **Draft ERC** (proposed January 2026, still being debated). The TypeScript SDK (`@slicekit/erc8128`) is solid — works in browsers, Node.js, and Deno.

---

## Why it exists

### The security hole without it

x402 solves *payment*. But it has a gap: the payment signature doesn't authenticate the HTTP request — it authorizes a USDC transfer. These are different things.

Here's the problem. The x402 payment header contains a signed USDC `transferWithAuthorization` — which proves "wallet 0xFD6F authorized $0.01 to be moved." But your server doesn't verify this signature itself. It sends it to the **facilitator**, which checks it and settles on-chain. The server trusts the facilitator's "yes, it's valid" response.

So what stops someone from stealing the payment and using it?

```
The attack without ERC-8128:

1. You sign a $0.01 USDC payment and send it in a request
2. An attacker on the same network intercepts the payment header
3. Attacker creates their OWN request to the same endpoint
4. Attacker attaches YOUR payment header to THEIR request
5. Server sends payment to facilitator → "valid!"
6. Server runs handler → serves data to the ATTACKER
7. YOU get charged, THEY get the data
```

The facilitator only checks "is this payment signature valid?" — it doesn't check "is the person sending this HTTP request the same person who signed the payment?" The payment is a signed check. Anyone who holds the check can cash it.

ERC-8128 closes this gap by binding identity to the HTTP request itself:

```
With ERC-8128:

1. You sign the HTTP request with your wallet (ERC-8128)
   + sign a USDC payment (x402)
2. Attacker intercepts both headers
3. Attacker creates their OWN request, attaches your headers
4. Server runs ecrecover on ERC-8128 signature
   → recovers YOUR address from the signature
   → but the request's method/path/query DON'T MATCH
     what was signed (attacker's request is different)
   → REJECTED: signature doesn't match this request
```

The ERC-8128 signature is bound to the specific HTTP request — the method, path, query, and authority. Change any of those, and the signature breaks. The attacker can't reuse your signature on a different request.

### Beyond security: identity enables everything else

Once the server can verify WHO is calling (not just that they paid), it unlocks:

| Capability | What it enables |
|-----------|----------------|
| **Usage tracking** | "Wallet 0xFD6F has made 342 requests this month" |
| **Reputation** | "This wallet has a 4.7 rating on ERC-8004" — trust-aware pricing |
| **Per-caller pricing** | "Trusted wallets pay $0.005, unknown wallets pay $0.01" |
| **Audit trail** | "Wallet 0xFD6F paid for this analysis at 2:31 PM" — provable on-chain |
| **Access control** | "Only wallets registered on ERC-8004 can access premium endpoints" |

### How it compares to traditional authentication

The traditional web solves identity with sessions: you log in once, get a cookie or JWT, and every subsequent request carries that token. But sessions require a login flow, a user database, and token management. Agents can't log in. ERC-8128 skips all of that — your wallet *is* your identity, and every request re-proves it.

| Sessions (JWT/cookies) | ERC-8128 |
|------------------------|----------|
| Login → get token → attach to requests | Sign each request with wallet key |
| Server stores sessions or validates JWTs | Server verifies signature (stateless) |
| Token can be stolen and replayed indefinitely | Signature bound to specific request + nonce |
| Identity and payment are separate systems | Same wallet for identity AND payment |
| Requires user database | No database — address is the identity |

---

## How it works

### The 30-second version

The client signs every HTTP request with its Ethereum private key. The server recovers the signer's address from the signature and knows who's calling. That's it.

### The three headers

ERC-8128 adds three headers to every signed request:

```
GET /api/tools/square?n=7 HTTP/1.1
Host: localhost:3000
Signature-Input: eth=("@method" "@path" "@query");keyid="erc8128:84532:0xFD6F...";
                 created=1710547200;expires=1710547320;nonce="a1b2c3"
Signature: eth=:base64_encoded_signature:
Content-Digest: sha-256=:base64_encoded_hash:
```

**`Signature-Input`** — The recipe. Describes *what* was signed:
- Which request components are covered (`@method`, `@path`, `@query`, headers)
- The `keyid`: `erc8128:<chainId>:<address>` — who signed it
- Timestamps: `created` and `expires` — the validity window
- A `nonce` — random value that prevents replay attacks

**`Signature`** — The actual cryptographic signature. Produced by signing the "signature base" (a structured string built from the components listed in Signature-Input) with the wallet's private key using EIP-191 (Ethereum personal sign).

**`Content-Digest`** — A SHA-256 hash of the request body. If someone tampers with the body after signing, the digest won't match and verification fails. For GET requests (no body), this is optional.

### What the server does with these headers

```
Signed request arrives
    │
    ▼
1. Parse Signature-Input
   ├─ Extract keyid → "erc8128:84532:0xFD6F..."
   ├─ Extract components → ["@method", "@path", "@query"]
   ├─ Extract created, expires, nonce
   │
   ▼
2. Rebuild the "signature base"
   ├─ Reconstruct exactly what was signed
   │  using the request's actual method, path, query, etc.
   │  (if the request was tampered with, this will differ
   │   from what the client signed)
   │
   ▼
3. Verify the signature
   ├─ ecrecover(signature, signature_base) → recovered address
   ├─ Does recovered address == keyid address?
   │  ├─ YES → signature is authentic
   │  └─ NO  → reject (forged or tampered)
   │
   ▼
4. Check freshness
   ├─ Is current time between created and expires?
   │  ├─ YES → signature is fresh
   │  └─ NO  → reject (expired or from the future)
   │
   ▼
5. Check replay
   ├─ Has this nonce been used before?
   │  ├─ NO  → mark as used, continue
   │  └─ YES → reject (replay attack)
   │
   ▼
6. Authenticated: 0xFD6F...2528 on chain 84532
```

### ecrecover — the core cryptographic operation

This is worth understanding because it's the fundamental operation that makes both ERC-8128 and x402 work.

On Ethereum, when you sign a message with your private key, anyone can **recover your public address** from the signature without knowing your private key. This is called `ecrecover` — it's a property of the ECDSA cryptographic algorithm that Ethereum uses.

```
Signing (client side):
  private_key + message → signature
  (only the key holder can do this)

Recovery (server side):
  signature + message → public_address
  (anyone can do this — no private key needed)
```

The server doesn't need your private key. It doesn't need a shared secret. It doesn't even need to have seen you before. It just takes the signature and the message, runs `ecrecover`, and gets your address. If the address matches the `keyid`, the request is authentic.

This is fundamentally different from how JWTs work. A JWT is a token *issued by the server* — the server creates it, so the server trusts it. ERC-8128 signatures are created *by the client* — the server trusts the math, not a prior relationship.

### Request binding — what exactly gets signed?

Not all requests are signed equally. ERC-8128 supports two binding modes:

**Request-bound** (what we use) — Signs the specific request: method, path, query, authority, and optionally headers and body. If any of these change, the signature breaks. This is like signing a check that names the exact payee and amount.

```
Signed components: @method + @path + @query + @authority
                   GET    /api/tools/square  ?n=7    localhost:3000

If an attacker changes ?n=7 to ?n=999:
  → server rebuilds signature base with ?n=999
  → ecrecover produces a DIFFERENT address
  → doesn't match keyid → rejected
```

**Class-bound** — Signs only a subset of components (like just the authority). Useful for CDN caching where the same signature can be reused across different paths on the same domain. Less secure, more flexible.

Our playground uses request-bound because each paid tool call should be uniquely authenticated.

---

## Adjacent concepts

**RFC 9421 (HTTP Message Signatures)** — The IETF standard that ERC-8128 builds on. It defines the general framework: how to express which components are signed (`Signature-Input`), how to build the "signature base" string, and how to carry the signature in headers. RFC 9421 is algorithm-agnostic — it works with RSA, HMAC, ECDSA, etc. ERC-8128 plugs in Ethereum's EIP-191 as the specific signing algorithm.

**EIP-191 (Signed Data Standard)** — The Ethereum standard for signing arbitrary messages (as opposed to signing transactions). When MetaMask shows a "Sign Message" popup, it's using EIP-191 under the hood. ERC-8128 uses it to sign the RFC 9421 signature base bytes.

**SIWE (Sign-In With Ethereum)** — A different standard (EIP-4361) for authenticating with Ethereum wallets. SIWE is a *login* mechanism — you sign a message once, get a session, and subsequent requests use the session token. ERC-8128 is a *per-request* mechanism — every request is individually signed. SIWE is for human login UX. ERC-8128 is for machine-to-machine authentication where there's no "login" concept.

**SIWA (Sign-In With Agent)** — A higher-level framework built on ERC-8128 + ERC-8004. Combines ERC-8004 (on-chain identity) with ERC-8128 (per-request signing) into a complete authentication flow for AI agents. If ERC-8128 is the HTTP layer, SIWA is the application layer.

**Nonce** — A random value included in each signature that prevents replay attacks. If an attacker intercepts a signed request and re-sends it, the server checks the nonce store and rejects the duplicate. Each nonce can only be used once within its TTL window.

---

## "But I never saw a signing popup"

If you've used MetaMask, you're used to approving every signature. In our playground, ERC-8128 signs every request silently. That's because the signing happens differently depending on where the private key lives:

```
MetaMask:
  Key locked inside extension → popup for every sign → user clicks approve
  Security: human gate-keeps every signature

Our playground:
  Key is a hex string in localStorage → code calls signMessage() directly
  Security: none (it's testnet with fake money)

Production agent:
  Key in a secure enclave / KMS → code calls signMessage() via API
  Security: key is protected, but signing is still automatic (no popup)
```

The cryptographic signature is identical in all three cases. The difference is the security model around the key, not the protocol. Agents can't click popups — they need programmatic signing. ERC-8128 is designed for this: the signing is always programmatic, the key protection is up to you.

---

## The Flip Side

**It's a Draft standard.** ERC-8128 was proposed in January 2026. The spec is still being debated — the keyid format, multi-algorithm support, and fallback headers are all open questions. If you build production infrastructure on it today, the API might change. The SDK (`@slicekit/erc8128`) is solid, but it's tracking a moving target.

**Nonce storage is your problem.** Replay protection requires storing every nonce you've seen until it expires. In our playground, we use an in-memory `Map` — which resets on every server restart and doesn't work across multiple server instances. Production needs Redis, a database, or a distributed cache. The SDK gives you the `NonceStore` interface, but the infrastructure is yours to build.

**Headers add size.** Each signed request carries ~500-800 bytes of extra headers (Signature, Signature-Input, Content-Digest). For most API calls this is negligible. For high-frequency, low-latency systems (like trading APIs), this overhead matters. You can mitigate with class-bound signatures (reusable across requests) but that trades security for performance.

**Verification isn't free.** `ecrecover` is a cryptographic operation. On a server handling thousands of requests per second, verifying every signature adds CPU cost. It's cheaper than JWT validation (no database lookup), but more expensive than "no auth at all." For our playground this is irrelevant. For a high-scale production API, you'd benchmark it.

**It doesn't prove you're trustworthy — just that you are who you claim.** ERC-8128 tells the server "this request came from wallet 0xFD6F." It doesn't say whether that wallet is reputable, legitimate, or worth doing business with. That's the job of ERC-8004 (the identity and reputation layer). ERC-8128 is the "who are you?" — ERC-8004 is the "should I trust you?"

**The pragmatic take.** For agent-to-agent communication where you need per-request identity without login flows, ERC-8128 is elegant and well-designed. For human-facing apps where you already have sessions, it's overkill — just use cookies. For our playground, it adds one line to the client (`signRequest`) and one line to the server (`verifyRequest`) and gives us authenticated tool calls. Worth it.

---

## SDK reference

We use `@slicekit/erc8128` (v0.3.2). Here's every function we use, organized by side.

### Browser side (signing requests)

---

#### `createSignerClient(signer, options?)` — Creates a reusable signing client.

```typescript
// x402-client.ts:36-39
const client = createSignerClient(signer, {
  ttlSeconds: 120,
  binding: "request-bound",
});
```

| | |
|---|---|
| **Input: `signer`** | An `EthHttpSigner` object (see below) |
| **Input: `options`** | `ttlSeconds` (signature validity window), `binding` (request-bound or class-bound) |
| **Output** | A `SignerClient` with `.signRequest()` and `.fetch()` methods |
| **Pattern** | Create once per wallet, reuse for all requests. The client remembers the signer config so you don't pass it every time. |

The `EthHttpSigner` we pass:

```typescript
// x402-client.ts:29-34
const signer = {
  chainId: 84532,                    // Base Sepolia
  address: account.address,          // wallet address for the keyid
  signMessage: (message: Uint8Array) =>
    account.signMessage({ message: { raw: message } }),  // EIP-191 sign
};
```

This bridges viem's account (which can sign) into the interface ERC-8128 expects. The `signMessage` function takes raw bytes (the RFC 9421 signature base) and returns an EIP-191 signature.

---

#### `client.signRequest(url, init?)` — Signs a request without sending it.

```typescript
// x402-client.ts:81
const signedReq = await erc8128.signRequest(absoluteUrl);
```

| | |
|---|---|
| **Input** | A URL (must be absolute) + optional `RequestInit` (method, headers, body) |
| **Output** | A new `Request` object with `Signature`, `Signature-Input`, and `Content-Digest` headers added |
| **Why we use it** | We need to extract the signature headers and merge them with x402 payment headers. If we used `.fetch()`, the request would be sent immediately — we need to sign first, then add payment headers, then send ourselves. |

What it does internally:
1. Builds the RFC 9421 signature base from the request components
2. Generates a nonce (random hex string)
3. Calls `signer.signMessage(signatureBase)` — this is the EIP-191 sign
4. Encodes the `Signature-Input` header (components, keyid, timestamps, nonce)
5. Encodes the `Signature` header (base64 of the signature bytes)
6. Computes `Content-Digest` (SHA-256 of the body, if any)
7. Returns a new Request with these three headers attached

---

#### `client.fetch(url, init?)` — Signs and sends in one call.

```typescript
// Not used in our code — we use signRequest instead
const response = await erc8128.fetch("https://api.example.com/data");
```

| | |
|---|---|
| **Input** | Same as `fetch()` — URL + options |
| **Output** | A `Response` — just like `fetch()`, but the request was signed first |
| **When to use** | When you don't need to add extra headers (like x402 payment). For simple authenticated requests. |

We don't use this because we need to merge ERC-8128 headers with x402 headers before sending. `signRequest` gives us the headers; we merge them ourselves.

---

### Server side (verifying requests)

---

#### `verifyRequest({ request, verifyMessage, nonceStore, policy? })` — Verifies a signed request.

```typescript
// erc8128-server.ts:43-51
const result = await verifyRequest({
  request: req,
  verifyMessage: publicClient.verifyMessage,
  nonceStore,
  policy: {
    maxValiditySec: 300,
    clockSkewSec: 10,
  },
});
```

| | |
|---|---|
| **Input: `request`** | The incoming HTTP request (NextRequest, Request, etc.) |
| **Input: `verifyMessage`** | A function that verifies Ethereum signatures — we use viem's `publicClient.verifyMessage`, which does `ecrecover` under the hood |
| **Input: `nonceStore`** | Where to track used nonces (see below) |
| **Input: `policy`** | Verification rules: max signature age, clock skew tolerance |
| **Output** | `{ ok: true, address, chainId, ... }` or `{ ok: false, reason }` |

What it does internally:
1. Reads `Signature-Input` header → parses components, keyid, timestamps, nonce
2. Checks timestamps: is the signature expired? Is `created` in the future (beyond clock skew)?
3. Rebuilds the signature base from the actual request
4. Calls `verifyMessage` (ecrecover) → recovers the signer address
5. Compares recovered address with keyid address
6. Checks `Content-Digest` matches the body (if present)
7. Consumes the nonce (returns false if already used)
8. Returns the result

The `VerifyResult` on success:

```typescript
{
  ok: true,
  address: "0xFD6FCAeB17aAb09507f79E79Cc40fD2465772528",
  chainId: 84532,
  label: "eth",
  components: ["@method", "@path", "@query", "@authority"],
  replayable: false,
  binding: "request-bound"
}
```

---

#### `NonceStore` — The replay protection interface.

```typescript
// erc8128-server.ts:15-27
const nonceStore = {
  async consume(key: string, ttlSeconds: number): Promise<boolean> {
    // ...check if used, mark as used, return true if new
  },
};
```

| | |
|---|---|
| **Interface** | `{ consume(key: string, ttlSeconds: number): Promise<boolean> }` |
| **`consume` returns** | `true` if the nonce is new (first time seen), `false` if it's a replay |
| **Our implementation** | In-memory `Map` with TTL-based expiry. Fine for dev. |
| **Production** | Redis (`SET key EX ttl NX` — atomic, distributed, TTL-based) |

The nonce store is the one piece of state ERC-8128 requires on the server. Everything else is stateless — the signature carries all the information the server needs. But replay protection inherently requires remembering what you've seen before.

---

#### `createVerifierClient({ verifyMessage, nonceStore, defaults? })` — Reusable verifier.

```typescript
// Not used in our code — we use verifyRequest directly
const verifier = createVerifierClient({
  verifyMessage: publicClient.verifyMessage,
  nonceStore,
});
const result = await verifier.verifyRequest({ request });
```

| | |
|---|---|
| **Pattern** | Same as `verifyRequest` but pre-configured. Create once, verify many. |
| **When to use** | If you're verifying in middleware (every request goes through the same verifier). |

We use the standalone `verifyRequest` directly because we only verify in two route handlers, not in global middleware.

---

## How it fits with x402

The two protocols occupy different layers of the same request:

```
Single HTTP request:

Headers:
  Signature-Input: ...        ← ERC-8128: "I am 0xFD6F on chain 84532"
  Signature: ...               ← ERC-8128: cryptographic proof
  Content-Digest: ...          ← ERC-8128: body integrity
  X-PAYMENT: ...               ← x402: "here's my signed USDC transfer"

Server processing order:
  1. ERC-8128 verifyRequest()  → "this is wallet 0xFD6F"
  2. x402 withX402()           → "they paid $0.01 USDC"
  3. Your handler()            → "here's the result"
  4. Response includes both:
     - authenticatedBy: "ERC-8128"
     - txHash: "0xabc...def"
```

They're independent — you can use either without the other. But together, they answer two questions that any paid API needs: "Who is calling?" and "Did they pay?"

---

## Cheat sheet

| What | Package | Side | One-liner |
|------|---------|------|-----------|
| `createSignerClient` | `@slicekit/erc8128` | Browser | "Create a reusable request signer for this wallet" |
| `client.signRequest` | `@slicekit/erc8128` | Browser | "Add Signature + Signature-Input + Content-Digest to this request" |
| `client.fetch` | `@slicekit/erc8128` | Browser | "Sign and send in one call" |
| `verifyRequest` | `@slicekit/erc8128` | Server | "Check the signature, recover address, validate nonce" |
| `createVerifierClient` | `@slicekit/erc8128` | Server | "Pre-configured verifier for middleware use" |
| `NonceStore.consume` | You implement | Server | "Have I seen this nonce before? (replay protection)" |
| `EthHttpSigner` | Interface | Browser | "Bridge between your wallet and the signing SDK" |
