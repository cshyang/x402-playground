import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
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
 * Makes a request to an x402-gated endpoint, handling the full payment flow.
 * Calls onStep() at each stage so the UI can show progress.
 */
export async function x402Fetch(
  url: string,
  privateKey: `0x${string}`,
  onStep?: (steps: PaymentStep[]) => void
): Promise<PaymentResult> {
  const account = privateKeyToAccount(privateKey);

  const steps: PaymentStep[] = [
    { label: "Request sent", status: "active", detail: `GET ${url}` },
    { label: "Payment required", status: "pending" },
    { label: "Payment details", status: "pending" },
    { label: "Signing authorization", status: "pending" },
    { label: "Retrying with payment", status: "pending" },
    { label: "Settlement", status: "pending" },
    { label: "Response received", status: "pending" },
  ];

  const update = (index: number, status: PaymentStep["status"], detail?: string) => {
    steps[index] = { ...steps[index], status, detail };
    onStep?.([...steps]);
  };

  try {
    // Step 1: Call the endpoint
    onStep?.([...steps]);
    const response = await fetch(url);

    if (response.status !== 402) {
      if (response.ok) {
        update(0, "done", `${response.status} OK — no payment needed`);
        const data = await response.json();
        return { success: true, data, steps };
      }
      throw new Error(`Unexpected status: ${response.status}`);
    }

    update(0, "done", `HTTP 402 Payment Required`);

    // Step 2: Got 402 — extract payment info
    update(1, "active");

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });
    const signer = toClientEvmSigner(account, publicClient);

    const client = new x402Client();
    client.register("eip155:84532", new ExactEvmScheme(signer));
    const httpClient = new x402HTTPClient(client);

    const paymentRequired = httpClient.getPaymentRequiredResponse(
      (name) => response.headers.get(name),
      await response.json().catch(() => null)
    );

    update(1, "done", `x402 v${paymentRequired.x402Version}`);

    // Step 3: Parse payment details
    update(2, "active");
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

    update(2, "done", `${amount} ${asset} → ${payTo} (${scheme} on ${network})`);

    // Step 4: Sign the payment authorization
    update(3, "active", `Signing with ${account.address.slice(0, 6)}...${account.address.slice(-4)}`);
    const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);

    const payloadScheme = paymentPayload.accepted?.scheme || "exact";
    update(3, "done", `Signed ${payloadScheme} authorization from ${account.address.slice(0, 6)}...${account.address.slice(-4)}`);

    // Step 5: Retry with payment header
    update(4, "active", "Sending payment signature in header");
    const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
    const headerNames = Object.keys(paymentHeaders).join(", ");

    const paidResponse = await fetch(url, {
      headers: paymentHeaders,
    });

    update(4, "done", `Headers: ${headerNames} → ${paidResponse.status}`);

    // Step 6: Facilitator settlement
    update(5, "active", "Facilitator verifying + settling on-chain");
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
    update(5, "done", settleDetail);

    // Step 7: Get the result
    if (!paidResponse.ok) {
      throw new Error(`Payment accepted but request failed: ${paidResponse.status}`);
    }

    const data = await paidResponse.json();
    const resultPreview = JSON.stringify(data).slice(0, 80);
    update(6, "done", resultPreview.length < JSON.stringify(data).length
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
