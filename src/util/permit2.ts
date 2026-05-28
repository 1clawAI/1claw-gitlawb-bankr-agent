// ERC20 → Permit2 → UniversalRouter approvals for V4 swaps (step 5).

import { encodeFunctionData, maxUint160, maxUint256, type Address, type Hex } from 'viem';
import type { getBasePublicClient } from '../clients/evm-wallet.js';
import { PERMIT2, UNIVERSAL_ROUTER } from './v4-swap.js';
import type { Config } from '../config.js';
import type { IntentRequest } from '../clients/oneclaw.js';
import { submitIntent } from '../clients/oneclaw.js';

const ERC20_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

const PERMIT2_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
] as const;

const PERMIT2_EXPIRATION = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days

async function submitApproval(
  config: Config,
  label: string,
  to: Address,
  data: Hex,
): Promise<string> {
  const intent: IntentRequest = { chain: 'base', to, data, value: '0' };
  const { txHash } = await submitIntent(config, intent);
  return txHash;
}

type BaseClient = ReturnType<typeof getBasePublicClient>;

export async function readTokenBalance(
  client: BaseClient,
  token: Address,
  owner: Address,
): Promise<bigint> {
  return client.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [owner],
  });
}

/** Ensure token → Permit2 and Permit2 → UniversalRouter before a V4 swap. */
export async function ensurePermit2ForSwap(
  config: Config,
  client: BaseClient,
  owner: Address,
  tokenIn: Address,
  amountIn: bigint,
): Promise<void> {
  const erc20Allowance = await client.readContract({
    address: tokenIn,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [owner, PERMIT2],
  });

  if (erc20Allowance < amountIn) {
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [PERMIT2, maxUint256],
    });
    await submitApproval(config, 'erc20→permit2', tokenIn, data);
  }

  const [permit2Amount, expiration] = await client.readContract({
    address: PERMIT2,
    abi: PERMIT2_ABI,
    functionName: 'allowance',
    args: [owner, tokenIn, UNIVERSAL_ROUTER],
  });

  const now = Math.floor(Date.now() / 1000);
  if (permit2Amount < amountIn || expiration <= now) {
    const data = encodeFunctionData({
      abi: PERMIT2_ABI,
      functionName: 'approve',
      args: [tokenIn, UNIVERSAL_ROUTER, maxUint160, PERMIT2_EXPIRATION],
    });
    await submitApproval(config, 'permit2→router', PERMIT2, data);
  }
}
