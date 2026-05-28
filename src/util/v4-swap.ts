// Builds Uniswap V4 exact-in swap calldata for the UniversalRouter on Base (step 5).
// Encodes execute(commands, inputs, deadline) with a single V4_SWAP command whose
// input is (actions, params) = [SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL].
// Pure encoding, no I/O. The signed tx itself is broadcast via 1Claw Intents.

import { encodeAbiParameters, encodeFunctionData, getAddress, type Address, type Hex } from 'viem';

// Base mainnet (chainId 8453).
export const UNIVERSAL_ROUTER: Address = '0x6fF5693b99212Da76ad316178A184AB56D299b43';
export const USDC: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
/** Native ETH currency address used in Uniswap V4 on Base (pairs with Bankr/Doppler launches). */
export const WETH_BASE: Address = '0x4200000000000000000000000000000000000006';
export const PERMIT2: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
export const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';

// UniversalRouter command byte for a V4 swap, and the V4Router action sequence.
const CMD_V4_SWAP: Hex = '0x10';
const ACTIONS: Hex = '0x060c0f'; // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL

const EXECUTE_ABI = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

const EXACT_IN_SINGLE = [
  {
    type: 'tuple',
    components: [
      {
        name: 'poolKey',
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ],
      },
      { name: 'zeroForOne', type: 'bool' },
      { name: 'amountIn', type: 'uint128' },
      { name: 'amountOutMinimum', type: 'uint128' },
      { name: 'hookData', type: 'bytes' },
    ],
  },
] as const;

const CURRENCY_AMOUNT = [
  { name: 'currency', type: 'address' },
  { name: 'amount', type: 'uint256' },
] as const;

export interface V4SwapParams {
  tokenIn: Address;
  tokenOut: Address;
  fee: number; // pool fee, e.g. 10000 = 1%
  tickSpacing: number;
  hooks: Address;
  amountIn: bigint;
  amountOutMinimum: bigint;
  deadline: bigint; // unix seconds
}

// Returns the UniversalRouter.execute calldata for a token -> tokenOut exact-in swap.
// NOTE: V4 pulls the input token via Permit2, so before this tx succeeds the agent
// wallet must have approved tokenIn -> Permit2 and Permit2 -> UniversalRouter (each
// can be a prior 1Claw Intent). This function builds only the swap leg.
export function buildV4ExactInSwap(p: V4SwapParams): { to: Address; data: Hex; value: string } {
  // Currencies in a PoolKey are sorted ascending by address; zeroForOne is true
  // when the input token is the lower-addressed currency0.
  const zeroForOne = p.tokenIn.toLowerCase() < p.tokenOut.toLowerCase();
  const [currency0, currency1] = zeroForOne ? [p.tokenIn, p.tokenOut] : [p.tokenOut, p.tokenIn];

  const swapParams = encodeAbiParameters(EXACT_IN_SINGLE, [
    {
      poolKey: {
        currency0: getAddress(currency0),
        currency1: getAddress(currency1),
        fee: p.fee,
        tickSpacing: p.tickSpacing,
        hooks: getAddress(p.hooks),
      },
      zeroForOne,
      amountIn: p.amountIn,
      amountOutMinimum: p.amountOutMinimum,
      hookData: '0x',
    },
  ]);
  // SETTLE_ALL pays the input token; TAKE_ALL collects the output token.
  const settleParams = encodeAbiParameters(CURRENCY_AMOUNT, [getAddress(p.tokenIn), p.amountIn]);
  const takeParams = encodeAbiParameters(CURRENCY_AMOUNT, [getAddress(p.tokenOut), p.amountOutMinimum]);

  const v4Input = encodeAbiParameters(
    [
      { name: 'actions', type: 'bytes' },
      { name: 'params', type: 'bytes[]' },
    ],
    [ACTIONS, [swapParams, settleParams, takeParams]],
  );

  const data = encodeFunctionData({
    abi: EXECUTE_ABI,
    functionName: 'execute',
    args: [CMD_V4_SWAP, [v4Input], p.deadline],
  });

  return { to: UNIVERSAL_ROUTER, data, value: '0' };
}
