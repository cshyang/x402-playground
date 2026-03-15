# Wire Vercel AI SDK Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Vercel AI SDK into the x402 playground so Claude can chat and call 4 tools (2 free, 2 paid stubs).

**Architecture:** Next.js App Router API route (`/api/chat`) uses `streamText` with `@ai-sdk/anthropic` Claude provider and 4 tools defined with Zod schemas. The `ChatPanel` component uses `useChat` hook from `@ai-sdk/react` with `DefaultChatTransport` to stream messages and render tool call parts. Paid tools work identically to free tools for now — x402 wiring comes later.

**Tech Stack:** `ai` (v5), `@ai-sdk/react`, `@ai-sdk/anthropic`, `zod`

---

## File Structure

```
playground/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── chat/
│   │   │       └── route.ts        # NEW — streamText + tools + Claude
│   │   ├── layout.tsx              # unchanged
│   │   ├── page.tsx                # unchanged
│   │   └── globals.css             # unchanged
│   ├── components/
│   │   ├── chat-panel.tsx          # MODIFY — useChat hook + message rendering
│   │   └── flow-panel.tsx          # unchanged
├── .env.local                      # NEW — ANTHROPIC_API_KEY
├── package.json                    # MODIFY — add ai deps
```

---

## Chunk 1: Install + API Route + Chat UI

### Task 1: Install dependencies

**Files:**
- Modify: `playground/package.json`

- [ ] **Step 1: Install AI SDK packages**

```bash
cd /Users/cshyang/Documents/agentic-payments/playground
npm install ai @ai-sdk/react @ai-sdk/anthropic zod
```

Expected: packages added to `dependencies` in package.json.

- [ ] **Step 2: Create .env.local with Anthropic API key**

Create `playground/.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...your-key-here...
```

Note: The `@ai-sdk/anthropic` provider reads `ANTHROPIC_API_KEY` automatically — no extra config needed.

---

### Task 2: Create the chat API route

**Files:**
- Create: `playground/src/app/api/chat/route.ts`

- [ ] **Step 1: Create the route with all 4 tools**

```typescript
// playground/src/app/api/chat/route.ts
import { anthropic } from "@ai-sdk/anthropic";
import {
  type UIMessage,
  convertToModelMessages,
  streamText,
  tool,
} from "ai";
import { z } from "zod";

const tools = {
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

  square_number: tool({
    description:
      "Square a number. This is a PAID tool that costs $0.01 USDC.",
    inputSchema: z.object({
      n: z.number().describe("The number to square"),
    }),
    execute: async ({ n }) => {
      // TODO: x402 payment gate — currently returns result for free
      return { result: n * n, type: "paid" as const, price: "$0.01" };
    },
  }),

  random_fact: tool({
    description:
      "Get a random fun fact. This is a PAID tool that costs $0.005 USDC.",
    inputSchema: z.object({}),
    execute: async () => {
      const facts = [
        "Honey never spoils — archaeologists found 3000-year-old honey in Egyptian tombs that was still edible.",
        "Octopuses have three hearts and blue blood.",
        "A group of flamingos is called a 'flamboyance'.",
        "Bananas are berries, but strawberries aren't.",
        "The inventor of the Pringles can is buried in one.",
      ];
      const fact = facts[Math.floor(Math.random() * facts.length)];
      // TODO: x402 payment gate — currently returns result for free
      return { fact, type: "paid" as const, price: "$0.005" };
    },
  }),
};

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: `You are an assistant in the x402 Playground — a demo for learning blockchain micropayments.

You have 4 tools:
- add_numbers (FREE): adds two numbers
- get_time (FREE): returns current time
- square_number (PAID — $0.01 USDC): squares a number
- random_fact (PAID — $0.005 USDC): returns a fun fact

When using paid tools, mention that they cost money. Keep responses concise.`,
    messages: convertToModelMessages(messages),
    tools,
    maxSteps: 3,
  });

  return result.toUIMessageStreamResponse();
}
```

Key points:
- `convertToModelMessages` converts the UI message format to what Claude expects.
- `maxSteps: 3` allows multi-step tool use (Claude calls tool → gets result → responds).
- `toUIMessageStreamResponse()` streams the response with tool call parts.
- Tools return a `type` field ("free" / "paid") so the frontend can distinguish them later.

---

### Task 3: Wire ChatPanel to useChat

**Files:**
- Modify: `playground/src/components/chat-panel.tsx`

- [ ] **Step 1: Replace the component with useChat-powered version**

```tsx
// playground/src/components/chat-panel.tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";

export function ChatPanel() {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, isLoading } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="border-b-2 border-zinc-300 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">&#9830;</span>
          <h1 className="font-mono text-sm font-bold uppercase tracking-widest text-zinc-700">
            x402 Playground
          </h1>
        </div>
        <p className="mt-1 font-mono text-xs text-zinc-400">
          Chat with an agent that has free and paid tools
        </p>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-5">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="text-4xl text-zinc-300">&#9674;</div>
            <p className="font-mono text-xs text-zinc-400 uppercase tracking-wide">
              Send a message to get started
            </p>
            <div className="flex gap-2 mt-2">
              <span className="border-pixel rounded-none bg-zinc-50 px-2 py-1 font-mono text-xs text-zinc-500">
                &quot;What is 2 + 3?&quot;
              </span>
              <span className="border-pixel rounded-none bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-500">
                &quot;What is 7 squared?&quot;
              </span>
            </div>
          </div>
        ) : (
          /* Message list */
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id}>
                {/* Role label */}
                <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  {message.role === "user" ? "You" : "Agent"}
                </div>

                {/* Message parts */}
                <div className="space-y-2">
                  {message.parts.map((part, i) => {
                    switch (part.type) {
                      case "text":
                        return (
                          <p
                            key={`${message.id}-${i}`}
                            className="font-mono text-sm leading-relaxed"
                          >
                            {part.text}
                          </p>
                        );

                      case "tool-add_numbers":
                      case "tool-get_time":
                      case "tool-square_number":
                      case "tool-random_fact": {
                        const toolName = part.type.replace("tool-", "");
                        const isPaid =
                          toolName === "square_number" ||
                          toolName === "random_fact";
                        const isComplete = part.state === "output-available";

                        return (
                          <div
                            key={part.toolCallId}
                            className={`border-pixel p-3 ${
                              isPaid ? "bg-zinc-100" : "bg-zinc-50"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                                {isComplete ? "called" : "calling"}
                              </span>
                              <span className="font-mono text-xs font-semibold">
                                {toolName}
                              </span>
                              {isPaid && (
                                <span className="font-mono text-[10px] text-zinc-400">
                                  (paid)
                                </span>
                              )}
                            </div>
                            {isComplete && part.output && (
                              <pre className="mt-2 font-mono text-xs text-zinc-600 overflow-x-auto">
                                {JSON.stringify(part.output, null, 2)}
                              </pre>
                            )}
                          </div>
                        );
                      }

                      default:
                        return null;
                    }
                  })}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="font-mono text-xs text-zinc-400 animate-pulse">
                thinking...
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Floating input area */}
      <div className="p-4">
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-zinc-300 bg-zinc-100 shadow-sm"
        >
          {/* Row 1: Textarea */}
          <div className="px-4 pt-3 pb-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder='Try "What is 2 + 3?" or "What is 7 squared?"'
              rows={1}
              className="w-full resize-none bg-transparent font-mono text-sm outline-none placeholder:text-zinc-400"
            />
          </div>

          {/* Row 2: Actions bar */}
          <div className="flex items-center justify-between px-4 pb-3 pt-1">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-zinc-400">x402</span>
              <span className="font-mono text-[10px] text-zinc-300">|</span>
              <span className="font-mono text-xs text-zinc-400">
                Base Sepolia
              </span>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-300 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path
                  fillRule="evenodd"
                  d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

Key points:
- `useChat` manages all message state, streaming, and tool execution.
- `DefaultChatTransport({ api: "/api/chat" })` points to our route.
- `sendMessage({ text: input })` sends messages (AI SDK v5 pattern).
- `message.parts` array contains both text and tool call parts.
- Tool parts are typed as `tool-<name>` and have states: `"calling"` or `"output-available"`.
- `isLoading` disables the send button and shows "thinking..." indicator.
- Auto-scroll keeps the latest message in view.

---

### Task 4: Test it

- [ ] **Step 1: Verify .env.local exists with your API key**

```bash
cat playground/.env.local
# Should show: ANTHROPIC_API_KEY=sk-ant-...
```

- [ ] **Step 2: Start dev server and test**

```bash
cd playground && bun dev
```

Open http://localhost:3000 and try:
1. "What is 2 + 3?" → should call `add_numbers`, show tool card, then answer "5"
2. "What time is it?" → should call `get_time`, show tool card, then answer with time
3. "What is 7 squared?" → should call `square_number`, show tool card with "(paid)" label, then answer "49"
4. "Tell me a fun fact" → should call `random_fact`, show tool card with "(paid)" label, then show a fact

Expected behavior:
- Free tool cards have `bg-zinc-50` background
- Paid tool cards have `bg-zinc-100` background with "(paid)" label
- Tool output shows as formatted JSON
- "thinking..." appears while Claude is processing

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: wire Vercel AI SDK with Claude and 4 tools (2 free, 2 paid stubs)"
```
