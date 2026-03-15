import { NextRequest, NextResponse } from "next/server";
import { withPayment } from "@/lib/x402-server";

const facts = [
  "Honey never spoils — archaeologists found 3000-year-old honey in Egyptian tombs that was still edible.",
  "Octopuses have three hearts and blue blood.",
  "A group of flamingos is called a 'flamboyance'.",
  "Bananas are berries, but strawberries aren't.",
  "The inventor of the Pringles can is buried in one.",
];

async function handler(_request: NextRequest) {
  const fact = facts[Math.floor(Math.random() * facts.length)];

  return NextResponse.json({
    fact,
    type: "paid",
    price: "$0.005",
  });
}

export const GET = withPayment(handler, "$0.005", "Get a random fun fact");
