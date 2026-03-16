"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { x402Fetch } from "@/lib/x402-client";
import { useWallet } from "@/lib/use-wallet";
import type { PaymentEvent } from "@/app/page";

// Map paid tool names to their API endpoints
const PAID_TOOL_ENDPOINTS: Record<string, (input: Record<string, unknown>) => string> = {
  square_number: (input) => `/api/tools/square?n=${input?.n ?? 0}`,
  random_fact: () => `/api/tools/fact`,
};

export function ChatPanel({
  onPayment,
}: {
  onPayment?: (event: PaymentEvent) => void;
}) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wallet = useWallet();
  const walletBalanceRef = useRef(wallet.usdcBalance);
  walletBalanceRef.current = wallet.usdcBalance;

  const { messages, sendMessage, status, addToolResult } = useChat({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: new Proxy({}, {
        get(_, prop) {
          if (prop === "walletBalance") return walletBalanceRef.current;
          return undefined;
        },
        ownKeys() {
          return ["walletBalance"];
        },
        getOwnPropertyDescriptor(_, prop) {
          if (prop === "walletBalance") {
            return { configurable: true, enumerable: true, value: walletBalanceRef.current };
          }
          return undefined;
        },
      }),
    }),
  });

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle paid tool calls — when a paid tool has no result, execute via x402
  const processedToolCalls = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!wallet.privateKey) {
      console.log("[x402] no wallet key yet");
      return;
    }

    for (const message of messages) {
      if (message.role !== "assistant") continue;

      for (const part of message.parts) {
        // Debug: log all tool parts
        if (part.type.startsWith("tool-")) {
          console.log("[x402] tool part:", part.type, "state" in part ? (part as Record<string, unknown>).state : "no-state");
        }

        if (
          part.type.startsWith("tool-") &&
          "toolCallId" in part &&
          "input" in part &&
          "state" in part &&
          part.state === "input-available"
        ) {
          const toolName = part.type.replace("tool-", "");
          const endpointFn = PAID_TOOL_ENDPOINTS[toolName];
          if (!endpointFn) continue;

          const toolCallId = (part as Record<string, unknown>).toolCallId as string;
          if (processedToolCalls.current.has(toolCallId)) continue;

          const toolInput = (part as Record<string, unknown>).input as Record<string, unknown> | undefined;
          if (!toolInput) continue; // input not ready yet

          processedToolCalls.current.add(toolCallId);
          console.log("[x402] processing paid tool:", toolName, "id:", toolCallId, "input:", toolInput);

          // Execute the paid tool via x402
          (async () => {
            const url = endpointFn(toolInput);
            const paymentEvent: PaymentEvent = {
              toolCallId,
              toolName,
              input: toolInput,
              steps: [],
              timestamp: Date.now(),
            };

            const result = await x402Fetch(
              url,
              wallet.privateKey!,
              (steps) => {
                paymentEvent.steps = steps;
                onPayment?.({ ...paymentEvent });
              }
            );

            if (result.success) {
              paymentEvent.result = result.data;
              paymentEvent.txHash = result.txHash;
              paymentEvent.steps = result.steps;
              onPayment?.({ ...paymentEvent });

              // Send result back to the LLM
              addToolResult({
                toolCallId,
                tool: toolName,
                output: result.data,
              });
            } else {
              paymentEvent.error = result.error;
              paymentEvent.steps = result.steps;
              onPayment?.({ ...paymentEvent });

              addToolResult({
                toolCallId,
                tool: toolName,
                state: "output-error",
                errorText: result.error || "Payment failed",
              });
            }

            // Refresh wallet balance after payment
            wallet.refreshBalances();
          })();
        }
      }
    }
  }, [messages, wallet.privateKey, addToolResult, onPayment, wallet]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* Header — sticky */}
      <div className="shrink-0 border-b-2 border-zinc-300 px-5 py-4">
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
          <div className="flex flex-col gap-5 py-4">
            {/* Title */}
            <div className="text-center">
              <div className="text-3xl text-zinc-300 mb-2">&#9674;</div>
              <p className="font-mono text-xs text-zinc-400 uppercase tracking-widest">
                Available Tools
              </p>
            </div>

            {/* Free tools */}
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">
                Free
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => { setInput("What is 12 + 34?"); }}
                  className="border-pixel w-full bg-zinc-50 p-3 text-left hover:bg-zinc-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold">add_numbers</span>
                    <span className="font-mono text-[10px] text-zinc-400">free</span>
                  </div>
                  <p className="font-mono text-[10px] text-zinc-400 mt-1">
                    Add two numbers together
                  </p>
                  <p className="font-mono text-[10px] text-zinc-300 mt-1">
                    Try: &quot;What is 12 + 34?&quot;
                  </p>
                </button>
                <button
                  onClick={() => { setInput("What time is it?"); }}
                  className="border-pixel w-full bg-zinc-50 p-3 text-left hover:bg-zinc-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold">get_time</span>
                    <span className="font-mono text-[10px] text-zinc-400">free</span>
                  </div>
                  <p className="font-mono text-[10px] text-zinc-400 mt-1">
                    Get the current UTC time
                  </p>
                  <p className="font-mono text-[10px] text-zinc-300 mt-1">
                    Try: &quot;What time is it?&quot;
                  </p>
                </button>
              </div>
            </div>

            {/* Paid tools */}
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">
                Paid &middot; x402
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => { setInput("What is 7 squared?"); }}
                  className="border-pixel w-full bg-zinc-100 p-3 text-left hover:bg-zinc-200 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold">square_number</span>
                    <span className="font-mono text-[10px] font-semibold text-zinc-600">$0.01 USDC</span>
                  </div>
                  <p className="font-mono text-[10px] text-zinc-400 mt-1">
                    Square a number — requires x402 payment on Base Sepolia
                  </p>
                  <p className="font-mono text-[10px] text-zinc-300 mt-1">
                    Try: &quot;What is 7 squared?&quot;
                  </p>
                </button>
                <button
                  onClick={() => { setInput("Tell me a fun fact"); }}
                  className="border-pixel w-full bg-zinc-100 p-3 text-left hover:bg-zinc-200 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold">random_fact</span>
                    <span className="font-mono text-[10px] font-semibold text-zinc-600">$0.005 USDC</span>
                  </div>
                  <p className="font-mono text-[10px] text-zinc-400 mt-1">
                    Get a random fun fact — requires x402 payment on Base Sepolia
                  </p>
                  <p className="font-mono text-[10px] text-zinc-300 mt-1">
                    Try: &quot;Tell me a fun fact&quot;
                  </p>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id}>
                <div
                  className={`mb-1 font-mono text-[10px] font-bold uppercase tracking-widest ${
                    message.role === "user"
                      ? "text-slate-500"
                      : "text-emerald-600"
                  }`}
                >
                  {message.role === "user" ? "You" : "Agent"}
                </div>

                <div className="space-y-2">
                  {message.parts.map((part, i) => {
                    switch (part.type) {
                      case "text":
                        return (
                          <div
                            key={`${message.id}-${i}`}
                            className="prose prose-sm prose-zinc max-w-none font-mono text-sm leading-relaxed prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:bg-zinc-100 prose-pre:border-2 prose-pre:border-zinc-300 prose-pre:rounded-none prose-code:text-xs prose-headings:font-mono prose-headings:tracking-wide"
                          >
                            <ReactMarkdown>{part.text}</ReactMarkdown>
                          </div>
                        );

                      case "tool-add_numbers":
                      case "tool-get_time":
                      case "tool-square_number":
                      case "tool-random_fact": {
                        const toolName = part.type.replace("tool-", "");
                        const isPaid = toolName in PAID_TOOL_ENDPOINTS;
                        const isComplete = part.state === "output-available";
                        const isWaiting = (part.state === "input-available" || part.state === "input-streaming") && isPaid;

                        return (
                          <div
                            key={part.toolCallId}
                            className={`border-pixel p-3 ${
                              isPaid ? "bg-zinc-100" : "bg-zinc-50"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                                {isComplete
                                  ? "called"
                                  : isWaiting
                                    ? "paying"
                                    : "calling"}
                              </span>
                              <span className="font-mono text-xs font-semibold">
                                {toolName}
                              </span>
                              {isPaid && (
                                <span className="font-mono text-[10px] text-zinc-400">
                                  (paid)
                                </span>
                              )}
                              {isWaiting && (
                                <span className="font-mono text-[10px] text-zinc-400 animate-pulse">
                                  processing x402...
                                </span>
                              )}
                            </div>
                            {isComplete &&
                              "output" in part &&
                              part.output != null && (
                                <pre className="mt-2 font-mono text-xs text-zinc-600 overflow-x-auto">
                                  {JSON.stringify(
                                    part.output as Record<string, unknown>,
                                    null,
                                    2
                                  )}
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

            {isLoading && (
              <div className="font-mono text-xs text-zinc-400 animate-pulse">
                thinking...
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Quick-try tool chips — always visible */}
      {messages.length > 0 && (
        <div className="flex gap-2 px-4 pt-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {[
            { label: "add_numbers", prompt: "What is 12 + 34?", paid: false },
            { label: "get_time", prompt: "What time is it?", paid: false },
            { label: "square_number", prompt: "What is 9 squared?", paid: true, price: "$0.01" },
            { label: "random_fact", prompt: "Tell me a fun fact", paid: true, price: "$0.005" },
          ].map((tool) => (
            <button
              key={tool.label}
              onClick={() => setInput(tool.prompt)}
              className={`shrink-0 px-2.5 py-1 font-mono text-[10px] border transition-colors ${
                tool.paid
                  ? "border-zinc-400 bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  : "border-zinc-300 bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
              }`}
            >
              {tool.label}
              {tool.price && (
                <span className="ml-1 text-zinc-400">{tool.price}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Floating input area */}
      <div className="px-4 pb-4 pt-2">
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-zinc-300 bg-zinc-100 shadow-sm"
        >
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
