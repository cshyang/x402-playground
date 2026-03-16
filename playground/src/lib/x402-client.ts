import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { createSignerClient } from "@slicekit/erc8128";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

export interface PaymentStep {
  label: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string;
}

export interface PaymentResult {
  success: boolean;
  data?: unknown;
  txHash?: string;
  error?: string;
  steps: PaymentStep[];
}

/**
 * Creates an ERC-8128 signer client from a private key.
 * Signs every HTTP request with the wallet's Ethereum identity.
 */
function createErc8128Client(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);

  const signer = {
    chainId: baseSepolia.id, // 84532
    address: account.address,
    signMessage: (message: Uint8Array) =>
      account.signMessage({ message: { raw: message } }),
  };

  return createSignerClient(signer, {
    ttlSeconds: 120,
    binding: "request-bound",
  });
}

/**
 * Makes a request to an x402-gated endpoint, handling:
 *   1. ERC-8128 identity signing (who is calling)
 *   2. x402 payment flow (paying for access)
 *
 * Calls onStep() at each stage so the UI can show progress.
 */
export async function x402Fetch(
  url: string,
  privateKey: `0x${string}`,
  onStep?: (steps: PaymentStep[]) => void
): Promise<PaymentResult> {
  const account = privateKeyToAccount(privateKey);
  const erc8128 = createErc8128Client(privateKey);

  const steps: PaymentStep[] = [
    { label: "ERC-8128 identity", status: "active", detail: `Signing as ${account.address.slice(0, 6)}...${account.address.slice(-4)} on chain ${baseSepolia.id}` },
    { label: "Request sent", status: "pending", detail: `GET ${url}` },
    { label: "Payment required", status: "pending" },
    { label: "Payment details", status: "pending" },
    { label: "Signing USDC authorization", status: "pending" },
    { label: "Retrying with identity + payment", status: "pending" },
    { label: "Settlement", status: "pending" },
    { label: "Response received", status: "pending" },
  ];

  const update = (index: number, status: PaymentStep["status"], detail?: string) => {
    steps[index] = { ...steps[index], status, detail };
    onStep?.([...steps]);
  };

  try {
    // Resolve relative URLs to absolute (ERC-8128 needs full URLs)
    const absoluteUrl = url.startsWith("http")
      ? url
      : `${window.location.origin}${url}`;

    // Step 1: Sign the initial request with ERC-8128
    onStep?.([...steps]);
    const signedReq = await erc8128.signRequest(absoluteUrl);
    const erc8128Headers: Record<string, string> = {};
    signedReq.headers.forEach((v, k) => {
      if (k === "signature" || k === "signature-input" || k === "content-digest") {
        erc8128Headers[k] = v;
      }
    });
    update(0, "done", `ERC-8128 signed: chain ${baseSepolia.id}, addr ${account.address.slice(0, 6)}...${account.address.slice(-4)}`);

    // Step 2: Send the signed request
    update(1, "active", `GET ${url}`);
    const response = await fetch(absoluteUrl, { headers: erc8128Headers });

    if (response.status !== 402) {
      if (response.ok) {
        update(1, "done", `${response.status} OK — no payment needed`);
        const data = await response.json();
        return { success: true, data, steps };
      }
      throw new Error(`Unexpected status: ${response.status}`);
    }

    update(1, "done", `HTTP 402 Payment Required`);

    // Step 3: Got 402 — extract payment info
    update(2, "active");

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });
    const evmSigner = toClientEvmSigner(account, publicClient);

    const client = new x402Client();
    client.register("eip155:84532", new ExactEvmScheme(evmSigner));
    const httpClient = new x402HTTPClient(client);

    const paymentRequired = httpClient.getPaymentRequiredResponse(
      (name) => response.headers.get(name),
      await response.json().catch(() => null)
    );

    update(2, "done", `x402 v${paymentRequired.x402Version}`);

    // Step 4: Parse payment details
    update(3, "active");
    const req = paymentRequired.accepts?.[0];
    const amount = req?.amount || "?";
    const asset = req?.asset
      ? `${req.asset.slice(0, 6)}...${req.asset.slice(-4)}`
      : "USDC";
    const payTo = req?.payTo
      ? `${req.payTo.slice(0, 6)}...${req.payTo.slice(-4)}`
      : "?";
    const scheme = req?.scheme || "?";
    const network = req?.network || "?";

    update(3, "done", `${amount} ${asset} → ${payTo} (${scheme} on ${network})`);

    // Step 5: Sign the USDC payment authorization
    update(4, "active", `Signing with ${account.address.slice(0, 6)}...${account.address.slice(-4)}`);
    const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);

    const payloadScheme = paymentPayload.accepted?.scheme || "exact";
    update(4, "done", `Signed ${payloadScheme} authorization`);

    // Step 6: Retry with BOTH ERC-8128 identity + x402 payment headers
    update(5, "active", "Sending identity + payment signatures");
    const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

    // Re-sign with ERC-8128 for the retry request (new nonce)
    const retryReq = await erc8128.signRequest(absoluteUrl);
    const retryErc8128Headers: Record<string, string> = {};
    retryReq.headers.forEach((v, k) => {
      if (k === "signature" || k === "signature-input" || k === "content-digest") {
        retryErc8128Headers[k] = v;
      }
    });

    const paidResponse = await fetch(absoluteUrl, {
      headers: { ...retryErc8128Headers, ...paymentHeaders },
    });

    update(5, "done", `Identity + payment → ${paidResponse.status}`);

    // Step 7: Facilitator settlement
    update(6, "active", "Facilitator verifying + settling on-chain");
    let txHash: string | undefined;
    let settleDetail = "Settled via facilitator";
    try {
      const settleResponse = httpClient.getPaymentSettleResponse(
        (name) => paidResponse.headers.get(name)
      );
      const settleObj = settleResponse as Record<string, unknown>;
      txHash = settleObj?.txHash as string | undefined;
      if (txHash) {
        settleDetail = `tx: ${txHash.slice(0, 10)}...${txHash.slice(-6)}`;
      }
      if (settleObj?.network) {
        settleDetail += ` on ${settleObj.network}`;
      }
    } catch {
      settleDetail = "Settlement confirmed (no tx details)";
    }
    update(6, "done", settleDetail);

    // Step 8: Get the result
    if (!paidResponse.ok) {
      throw new Error(`Payment accepted but request failed: ${paidResponse.status}`);
    }

    const data = await paidResponse.json();
    const resultPreview = JSON.stringify(data).slice(0, 80);
    update(7, "done", resultPreview.length < JSON.stringify(data).length
      ? resultPreview + "..."
      : resultPreview
    );

    return { success: true, data, txHash, steps };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    const activeIndex = steps.findIndex((s) => s.status === "active");
    if (activeIndex >= 0) {
      update(activeIndex, "error", errorMsg);
    }

    return { success: false, error: errorMsg, steps };
  }
}
