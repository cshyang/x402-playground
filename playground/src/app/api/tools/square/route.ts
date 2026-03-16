import { NextRequest, NextResponse } from "next/server";
import { withPayment } from "@/lib/x402-server";
import { verifyErc8128 } from "@/lib/erc8128-server";

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const n = Number(searchParams.get("n") || 0);

  // Verify ERC-8128 identity (optional — logs who is calling)
  const identity = await verifyErc8128(request);

  return NextResponse.json({
    result: n * n,
    type: "paid",
    price: "$0.01",
    ...(identity && {
      authenticatedBy: "ERC-8128",
      caller: identity.address,
      chainId: identity.chainId,
    }),
  });
}

export const GET = withPayment(handler, "$0.01", "Square a number");
