import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { withX402 } from "@x402/next";
import type { RouteConfig } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";

// Server wallet receives payments — set this to any address you control
// For testnet, it doesn't matter much — we just need a valid address
const PAY_TO = (process.env.X402_PAY_TO ||
  "0x0000000000000000000000000000000000000001") as `0x${string}`;

const NETWORK = "eip155:84532"; // Base Sepolia

// Create the x402 resource server with testnet facilitator
// Register the "exact" EVM scheme so the server knows how to handle it
const facilitator = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator",
});
const server = new x402ResourceServer(facilitator)
  .register(NETWORK, new ExactEvmScheme());

// Helper to wrap a route handler with x402 payment protection
export function withPayment(
  handler: (request: NextRequest) => Promise<NextResponse>,
  price: string,
  description: string
) {
  const routeConfig: RouteConfig = {
    accepts: {
      scheme: "exact",
      payTo: PAY_TO,
      price,
      network: NETWORK,
    },
    description,
  };

  return withX402(handler, routeConfig, server);
}
