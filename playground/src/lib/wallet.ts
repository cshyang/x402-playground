import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  type Address,
} from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

// USDC contract address on Base Sepolia
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

// Minimal ERC-20 ABI — just what we need to read balance
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

const STORAGE_KEY = "x402-playground-wallet";

// ─── Wallet Creation & Storage ────────────────────────────────

export function getOrCreateWallet(): {
  privateKey: `0x${string}`;
  address: Address;
} {
  // Check localStorage for existing wallet
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const { privateKey } = JSON.parse(stored);
      const account = privateKeyToAccount(privateKey);
      return { privateKey, address: account.address };
    }
  }

  // Generate new wallet
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  // Store it
  if (typeof window !== "undefined") {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ privateKey, address: account.address })
    );
  }

  return { privateKey, address: account.address };
}

// ─── Blockchain Clients ───────────────────────────────────────

export function getPublicClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });
}

export function getWalletClient(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(),
  });
}

// ─── Balance Reading ──────────────────────────────────────────

export async function getUsdcBalance(address: Address): Promise<string> {
  const client = getPublicClient();

  const balance = await client.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });

  // USDC has 6 decimals
  return formatUnits(balance, 6);
}

export async function getEthBalance(address: Address): Promise<string> {
  const client = getPublicClient();
  const balance = await client.getBalance({ address });
  return formatUnits(balance, 18);
}

// ─── Utilities ────────────────────────────────────────────────

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getBasescanUrl(txHash: string): string {
  return `https://sepolia.basescan.org/tx/${txHash}`;
}

export function getAddressBasescanUrl(address: string): string {
  return `https://sepolia.basescan.org/address/${address}`;
}
