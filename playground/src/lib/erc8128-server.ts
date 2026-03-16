import { verifyRequest } from "@slicekit/erc8128";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { NextRequest } from "next/server";

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

// In-memory nonce store for replay protection
// In production, use Redis or a database
const usedNonces = new Map<string, number>();

const nonceStore = {
  async consume(key: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    // Clean expired entries
    for (const [k, expiry] of usedNonces) {
      if (expiry < now) usedNonces.delete(k);
    }
    // Check if already used
    if (usedNonces.has(key)) return false;
    // Mark as used
    usedNonces.set(key, now + ttlSeconds * 1000);
    return true;
  },
};

/**
 * Verifies an ERC-8128 signed request.
 * Returns the authenticated wallet address, or null if not signed / invalid.
 */
export async function verifyErc8128(
  req: NextRequest
): Promise<{ address: string; chainId: number } | null> {
  // Check if ERC-8128 headers are present
  if (!req.headers.get("signature")) {
    return null;
  }

  try {
    const result = await verifyRequest({
      request: req,
      verifyMessage: publicClient.verifyMessage,
      nonceStore,
      policy: {
        maxValiditySec: 300,
        clockSkewSec: 10,
      },
    });

    if (result.ok) {
      console.log(
        `[erc8128] Authenticated: ${result.address} on chain ${result.chainId}`
      );
      return { address: result.address, chainId: result.chainId };
    } else {
      console.log(`[erc8128] Verification failed: ${result.reason}`);
      return null;
    }
  } catch (err) {
    console.error("[erc8128] Verification error:", err);
    return null;
  }
}
