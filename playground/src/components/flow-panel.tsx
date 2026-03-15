"use client";

import { useState } from "react";
import { useWallet } from "@/lib/use-wallet";
import { getAddressBasescanUrl, getBasescanUrl } from "@/lib/wallet";
import type { PaymentEvent } from "@/app/page";

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
  const totalSpent = completedPayments.length * 0.01; // simplified

  return (
    <div className="flex h-full flex-col bg-zinc-50">
      {/* Wallet display */}
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
                    className="font-mono text-[10px] text-zinc-400 hover:text-zinc-700"
                    title="Copy full address"
                  >
                    {copied ? "copied!" : "copy"}
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
              className="btn-pixel-accent bg-zinc-800 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white"
            >
              Fund
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

          {!wallet.isLoading && wallet.usdcBalance === "0.00" && !wallet.error && (
            <div className="mt-3 border border-amber-300 bg-amber-50 p-2">
              <p className="font-mono text-[10px] font-semibold text-amber-700">
                Wallet not funded
              </p>
              <p className="font-mono text-[10px] text-amber-600 mt-0.5">
                Paid tools need USDC. Click &quot;Fund&quot; to get free testnet USDC from
                Circle faucet. Select Base Sepolia network.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Session summary */}
      <div className="border-b-2 border-zinc-300 px-5 py-2.5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
          Session: {payments.length} payment{payments.length !== 1 ? "s" : ""}{" "}
          &middot; ${totalSpent.toFixed(3)} spent
        </p>
      </div>

      {/* Payment log */}
      <div className="flex-1 overflow-y-auto p-5">
        {payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="border-pixel bg-white px-6 py-4 text-center">
              <div className="text-2xl text-zinc-300 mb-2">&#9632;</div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                No payments yet
              </p>
              <p className="mt-1 font-mono text-[10px] text-zinc-400">
                Use a paid tool to see the flow
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {payments.map((payment, idx) => (
              <div key={payment.toolCallId} className="border-pixel bg-white p-4">
                {/* Payment header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-zinc-400">
                      #{payments.length - idx}
                    </span>
                    <span className="font-mono text-xs font-semibold">
                      {payment.toolName}
                    </span>
                    {payment.input &&
                      Object.keys(payment.input).length > 0 && (
                        <span className="font-mono text-[10px] text-zinc-400">
                          ({JSON.stringify(payment.input)})
                        </span>
                      )}
                  </div>
                  {payment.error && (
                    <span className="font-mono text-[10px] text-red-500">
                      failed
                    </span>
                  )}
                </div>

                {/* Payment steps */}
                <div className="space-y-1.5">
                  {payment.steps.map((step, stepIdx) => (
                    <div key={stepIdx}>
                      <div className="flex items-center gap-2">
                        <span className={`w-4 text-center font-mono text-xs ${
                          step.status === "done"
                            ? "text-emerald-500"
                            : step.status === "error"
                              ? "text-red-500"
                              : step.status === "active"
                                ? "text-zinc-500"
                                : "text-zinc-300"
                        }`}>
                          {step.status === "done"
                            ? "\u2713"
                            : step.status === "active"
                              ? "\u25CB"
                              : step.status === "error"
                                ? "\u2717"
                                : "\u00B7"}
                        </span>
                        <span
                          className={`font-mono text-[10px] font-semibold ${
                            step.status === "active"
                              ? "text-zinc-700 animate-pulse"
                              : step.status === "done"
                                ? "text-zinc-600"
                                : step.status === "error"
                                  ? "text-red-500"
                                  : "text-zinc-300"
                          }`}
                        >
                          {stepIdx + 1}. {step.label}
                        </span>
                      </div>
                      {step.detail && (
                        <div className="ml-6 mt-0.5">
                          <span className={`font-mono text-[10px] break-all ${
                            step.status === "error"
                              ? "text-red-400"
                              : "text-zinc-400"
                          }`}>
                            {step.detail}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Tx link */}
                {payment.txHash && (
                  <div className="mt-2 pt-2 border-t border-zinc-200">
                    <a
                      href={getBasescanUrl(payment.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] text-zinc-500 underline decoration-zinc-300 hover:text-zinc-700"
                    >
                      View on Basescan &nearr;
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
