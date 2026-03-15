"use client";

import { useState, useCallback } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { FlowPanel } from "@/components/flow-panel";
import type { PaymentStep } from "@/lib/x402-client";

export interface PaymentEvent {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  steps: PaymentStep[];
  result?: unknown;
  error?: string;
  txHash?: string;
}

export default function Home() {
  const [payments, setPayments] = useState<PaymentEvent[]>([]);
  const [mobileTab, setMobileTab] = useState<"chat" | "flow">("chat");

  const handlePayment = useCallback((event: PaymentEvent) => {
    setPayments((prev) => {
      const existing = prev.findIndex(
        (p) => p.toolCallId === event.toolCallId
      );
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = event;
        return updated;
      }
      return [event, ...prev];
    });
  }, []);

  return (
    <div className="flex h-screen flex-col md:flex-row">
      {/* Mobile tab switcher — only visible on small screens */}
      <div className="flex border-b-2 border-zinc-300 md:hidden">
        <button
          onClick={() => setMobileTab("chat")}
          className={`flex-1 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors ${
            mobileTab === "chat"
              ? "bg-white text-zinc-700 border-b-2 border-zinc-700 -mb-[2px]"
              : "bg-zinc-100 text-zinc-400"
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => setMobileTab("flow")}
          className={`flex-1 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors relative ${
            mobileTab === "flow"
              ? "bg-zinc-50 text-zinc-700 border-b-2 border-zinc-700 -mb-[2px]"
              : "bg-zinc-100 text-zinc-400"
          }`}
        >
          Payments
          {payments.length > 0 && (
            <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center bg-zinc-700 text-[9px] text-white">
              {payments.length}
            </span>
          )}
        </button>
      </div>

      {/* Chat panel */}
      <div
        className={`flex-1 flex-col border-zinc-300 md:flex md:w-1/2 md:border-r-2 ${
          mobileTab === "chat" ? "flex" : "hidden"
        }`}
      >
        <ChatPanel onPayment={handlePayment} />
      </div>

      {/* Flow panel */}
      <div
        className={`flex-1 flex-col md:flex md:w-1/2 ${
          mobileTab === "flow" ? "flex" : "hidden"
        }`}
      >
        <FlowPanel payments={payments} />
      </div>
    </div>
  );
}
