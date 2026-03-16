import { createOpenAI } from "@ai-sdk/openai";
import {
  type UIMessage,
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
} from "ai";
import { z } from "zod";

// Z.AI provider — OpenAI-compatible API with coding plan base URL
const zai = createOpenAI({
  baseURL: "https://api.z.ai/api/coding/paas/v4",
  apiKey: process.env.ZAI_API_KEY,
});

const tools = {
  // Free tools — execute server-side
  add_numbers: tool({
    description: "Add two numbers together",
    inputSchema: z.object({
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
    }),
    execute: async ({ a, b }) => {
      return { result: a + b, type: "free" as const };
    },
  }),

  get_time: tool({
    description: "Get the current UTC time",
    inputSchema: z.object({}),
    execute: async () => {
      return { time: new Date().toISOString(), type: "free" as const };
    },
  }),

  // Paid tools — NO execute. These return to the client for x402 payment.
  square_number: tool({
    description:
      "Square a number. This is a PAID tool that costs $0.01 USDC on Base Sepolia.",
    inputSchema: z.object({
      n: z.number().describe("The number to square"),
    }),
  }),

  random_fact: tool({
    description:
      "Get a random fun fact. This is a PAID tool that costs $0.005 USDC on Base Sepolia.",
    inputSchema: z.object({}),
  }),
};

export async function POST(req: Request) {
  const { messages, walletBalance }: { messages: UIMessage[]; walletBalance?: string } = await req.json();

  const balance = walletBalance || "unknown";
  const isFunded = balance !== "unknown" && balance !== "0.00" && parseFloat(balance) > 0;

  const result = streamText({
    model: zai.chat("glm-4.7"),
    system: `You are an assistant in the x402 Playground — a demo for learning blockchain micropayments.

You have 4 tools:
- add_numbers (FREE): adds two numbers
- get_time (FREE): returns current time
- square_number (PAID — $0.01 USDC): squares a number
- random_fact (PAID — $0.005 USDC): returns a fun fact

User's wallet USDC balance: $${balance}
${!isFunded ? "WARNING: The wallet is NOT funded. If the user asks to use a paid tool, tell them they need to fund their wallet first using the \"Fund\" button on the right panel (Circle faucet, Base Sepolia network). Do NOT call paid tools when the wallet has no balance — it will fail." : ""}

When using paid tools, mention that they cost money. Keep responses concise.`,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(3),
  });

  return result.toUIMessageStreamResponse();
}
