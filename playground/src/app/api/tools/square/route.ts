import { NextRequest, NextResponse } from "next/server";
import { withPayment } from "@/lib/x402-server";

async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const n = Number(searchParams.get("n") || 0);

  return NextResponse.json({
    result: n * n,
    type: "paid",
    price: "$0.01",
  });
}

export const GET = withPayment(handler, "$0.01", "Square a number");
