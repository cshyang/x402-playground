"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOrCreateWallet,
  getUsdcBalance,
  getEthBalance,
  shortenAddress,
} from "./wallet";
import type { Address } from "viem";

interface WalletState {
  address: Address | null;
  privateKey: `0x${string}` | null;
  shortAddress: string;
  usdcBalance: string;
  ethBalance: string;
  isLoading: boolean;
  error: string | null;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    privateKey: null,
    shortAddress: "",
    usdcBalance: "0.00",
    ethBalance: "0.00",
    isLoading: true,
    error: null,
  });

  // Use ref to avoid stale closure in setInterval
  const addressRef = useRef<Address | null>(null);

  // Initialize wallet on mount
  useEffect(() => {
    try {
      const { privateKey, address } = getOrCreateWallet();
      addressRef.current = address;
      setState((prev) => ({
        ...prev,
        address,
        privateKey,
        shortAddress: shortenAddress(address),
        isLoading: false,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to create wallet",
      }));
    }
  }, []);

  // Fetch balances
  const refreshBalances = useCallback(async () => {
    const address = addressRef.current;
    if (!address) return;

    try {
      console.log("[wallet] fetching balances for", address);
      const [usdc, eth] = await Promise.all([
        getUsdcBalance(address),
        getEthBalance(address),
      ]);
      console.log("[wallet] USDC:", usdc, "ETH:", eth);

      setState((prev) => ({
        ...prev,
        usdcBalance: parseFloat(usdc).toFixed(2),
        ethBalance: parseFloat(eth).toFixed(4),
        error: null,
      }));
    } catch (err) {
      console.error("[wallet] balance fetch error:", err);
      setState((prev) => ({
        ...prev,
        error:
          err instanceof Error ? err.message : "Failed to fetch balances",
      }));
    }
  }, []);

  // Fetch balances on init and every 15 seconds
  useEffect(() => {
    if (!state.address) return;

    refreshBalances();
    const interval = setInterval(refreshBalances, 15_000);
    return () => clearInterval(interval);
  }, [state.address, refreshBalances]);

  return {
    ...state,
    refreshBalances,
  };
}
