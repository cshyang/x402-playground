"use client";

import { useState } from "react";
import { useWallet } from "@/lib/use-wallet";
import { getAddressBasescanUrl, getBasescanUrl } from "@/lib/wallet";
import type { PaymentEvent } from "@/app/page";

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Map step labels to Unicode symbols — terminal-native, consistent everywhere */
const STEP_ICONS: Record<string, string> = {
  "ERC-8128 identity": "\u25C8", // ◈
  "Request sent": "\u2192", // →
  "Payment required": "\u25C6", // ◆
  "Payment details": "\u0024", // $
  "Signing USDC authorization": "\u270E", // ✎
  "Retrying with identity + payment": "\u21BB", // ↻
  Settlement: "\u2B21", // ⬡
  "Response received": "\u23CE", // ⏎
};

function getStepIcon(label: string): string {
  return STEP_ICONS[label] || "\u25CB"; // ○ fallback
}

export function FlowPanel({ payments }: { payments: PaymentEvent[] }) {
  const wallet = useWallet();
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    if (!wallet.address) return;
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const completedPayments = payments.filter(
    (p) => p.steps.some((s) => s.status === "done") && !p.error
  );
  const totalSpent = completedPayments.length * 0.01;

  return (
    <div className="flex h-full flex-col bg-zinc-50">
      {/* Wallet display — light, matches app style */}
      <div className="border-b-2 border-zinc-300 p-5">
        <div className="border-pixel bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                Wallet
              </p>
              {wallet.address ? (
                <div className="mt-1 flex items-center gap-2">
                  <a
                    href={getAddressBasescanUrl(wallet.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-zinc-600 underline decoration-zinc-300 hover:text-zinc-900"
                  >
                    {wallet.shortAddress}
                  </a>
                  <button
                    onClick={copyAddress}
                    className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700"
                    title="Copy full address"
                  >
                    {copied ? "\u2713 copied" : "copy"}
                  </button>
                </div>
              ) : (
                <p className="mt-1 font-mono text-xs text-zinc-400">
                  {wallet.isLoading ? "loading..." : "error"}
                </p>
              )}
            </div>
            <a
              href="https://faucet.circle.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-zinc-300 bg-zinc-800 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-100 transition-colors hover:bg-zinc-700"
            >
              Fund {"\u2197"}
            </a>
          </div>

          <div className="mt-4 flex flex-wrap gap-4 sm:gap-6">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                USDC
              </p>
              <p className="mt-0.5 font-mono text-xl font-bold text-zinc-800">
                ${wallet.usdcBalance}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                ETH (gas)
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-zinc-600">
                {wallet.ethBalance}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                Network
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold">
                Base Sepolia
              </p>
            </div>
          </div>

          {wallet.error && (
            <p className="mt-3 font-mono text-[10px] text-red-500">
              {wallet.error}
            </p>
          )}

          {!wallet.isLoading &&
            wallet.usdcBalance === "0.00" &&
            !wallet.error && (
              <div className="mt-3 border border-amber-300 bg-amber-50 p-2">
                <p className="font-mono text-[10px] font-semibold text-amber-700">
                  Wallet not funded
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-amber-600">
                  Paid tools need USDC. Click &quot;Fund&quot; to get free
                  testnet USDC from Circle faucet. Select Base Sepolia network.
                </p>
              </div>
            )}
        </div>
      </div>

      {/* Session summary — light, matches app style */}
      <div className="border-b-2 border-zinc-300 px-5 py-2.5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
          Session: {payments.length} payment
          {payments.length !== 1 ? "s" : ""} &middot; $
          {totalSpent.toFixed(3)} spent
        </p>
      </div>

      {/* Terminal log — dark, embedded terminal feel */}
      <div className="m-3 flex flex-1 flex-col overflow-hidden rounded-md border border-zinc-300">
        {/* Terminal title bar */}
        <div className="flex items-center gap-1.5 border-b border-zinc-700 bg-zinc-800 px-3 py-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
          <span className="ml-2 font-mono text-[10px] text-zinc-500">
            payment-log
          </span>
        </div>

        {/* Terminal body */}
        <div className="flex-1 overflow-y-auto bg-zinc-950 p-4">
          {payments.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center">
              <p className="font-mono text-xs text-zinc-600">
                <span className="text-emerald-600">❯</span> awaiting paid tool
                execution...
              </p>
              <span className="mt-1 inline-block h-3.5 w-1.5 animate-pulse bg-zinc-600" />
            </div>
          ) : (
            <div className="space-y-4">
              {payments.map((payment, idx) => {
                const isActive = payment.steps.some(
                  (s) => s.status === "active"
                );
                const hasError = !!payment.error;
                const isDone =
                  !isActive &&
                  !hasError &&
                  payment.steps.some((s) => s.status === "done");

                return (
                  <div
                    key={payment.toolCallId}
                    className="font-mono text-xs"
                  >
                    {/* Payment header — p10k prompt style */}
                    <div className="flex items-center gap-2">
                      {/* Prompt symbol */}
                      <span
                        className={
                          hasError
                            ? "text-red-400"
                            : isDone
                              ? "text-emerald-400"
                              : "text-amber-400"
                        }
                      >
                        ❯
                      </span>

                      {/* Tool name */}
                      <span className="font-semibold text-zinc-100">
                        {payment.toolName}
                      </span>

                      {/* Input args */}
                      {payment.input &&
                        Object.keys(payment.input).length > 0 && (
                          <span className="text-zinc-600">
                            {JSON.stringify(payment.input)}
                          </span>
                        )}

                      {/* Spacer */}
                      <span className="flex-1" />

                      {/* Status pill */}
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                          hasError
                            ? "bg-red-900/60 text-red-300"
                            : isDone
                              ? "bg-emerald-900/60 text-emerald-300"
                              : "bg-amber-900/60 text-amber-300"
                        }`}
                      >
                        {hasError ? "ERR" : isDone ? "OK" : "RUN"}
                      </span>

                      {/* Timestamp */}
                      <span className="text-[10px] text-zinc-600">
                        {payment.timestamp
                          ? formatTime(payment.timestamp)
                          : ""}
                      </span>
                    </div>

                    {/* Step log lines */}
                    <div className="ml-3 mt-2 border-l border-zinc-800 pl-3 space-y-1">
                      {payment.steps.map((step, stepIdx) => (
                        <div key={stepIdx}>
                          <div className="flex items-center gap-2">
                            {/* Icon */}
                            <span
                              className={`w-4 text-center text-xs leading-none ${
                                step.status === "done"
                                  ? "text-zinc-500"
                                  : step.status === "active"
                                    ? "text-amber-500"
                                    : step.status === "error"
                                      ? "text-red-500"
                                      : "text-zinc-700"
                              }`}
                            >
                              {getStepIcon(step.label)}
                            </span>

                            {/* Step label */}
                            <span
                              className={`text-[13px] ${
                                step.status === "active"
                                  ? "animate-pulse font-medium text-zinc-100"
                                  : step.status === "done"
                                    ? "text-zinc-400"
                                    : step.status === "error"
                                      ? "text-red-400"
                                      : "text-zinc-700"
                              }`}
                            >
                              {step.label}
                            </span>

                            {/* Spacer */}
                            <span className="flex-1" />

                            {/* Status check on the right */}
                            <span
                              className={`text-xs ${
                                step.status === "done"
                                  ? "text-emerald-600"
                                  : step.status === "error"
                                    ? "text-red-500"
                                    : step.status === "active"
                                      ? "text-amber-500"
                                      : "text-zinc-800"
                              }`}
                            >
                              {step.status === "done"
                                ? "\u2714"
                                : step.status === "active"
                                  ? "\u25B8"
                                  : step.status === "error"
                                    ? "\u2718"
                                    : "\u00B7"}
                            </span>
                          </div>

                          {/* Detail line */}
                          {step.detail && (
                            <p
                              className={`ml-6 mt-0.5 break-all text-[11px] ${
                                step.status === "error"
                                  ? "text-red-500/70"
                                  : "text-zinc-600"
                              }`}
                            >
                              {step.detail}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Tx hash link */}
                    {payment.txHash && (
                      <div className="ml-6 mt-2">
                        <a
                          href={getBasescanUrl(payment.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-zinc-500 underline decoration-zinc-700 hover:text-emerald-400"
                        >
                          ⬡ tx: {payment.txHash.slice(0, 10)}...
                          {payment.txHash.slice(-6)} &nearr;
                        </a>
                      </div>
                    )}

                    {/* Separator between payments */}
                    {idx < payments.length - 1 && (
                      <div className="mt-4 border-t border-zinc-800/50" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
