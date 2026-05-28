// Resolve Uniswap V4 PoolKey for a Bankr/Doppler launch from the deploy tx or poolId.

import { decodeEventLog, type Address, type Hex } from 'viem';
import type { getBasePublicClient } from '../clients/evm-wallet.js';

type BaseClient = ReturnType<typeof getBasePublicClient>;

/** Uniswap V4 PoolManager on Base mainnet. */
export const POOL_MANAGER_BASE: Address = '0x498581ff718922c3f8e6a244956af099b2652b2b';

export const INITIALIZE_TOPIC0: Hex =
  '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438';

const INITIALIZE_ABI = [
  {
    type: 'event',
    name: 'Initialize',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
      { name: 'currency0', type: 'address', indexed: true },
      { name: 'currency1', type: 'address', indexed: true },
      { name: 'fee', type: 'uint24', indexed: false },
      { name: 'tickSpacing', type: 'int24', indexed: false },
      { name: 'hooks', type: 'address', indexed: false },
      { name: 'sqrtPriceX96', type: 'uint160', indexed: false },
      { name: 'tick', type: 'int24', indexed: false },
    ],
  },
] as const;

export interface V4PoolKey {
  poolId: Hex;
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

function normalizePoolId(poolId: string): Hex {
  const hex = poolId.startsWith('0x') ? poolId : `0x${poolId}`;
  return hex.toLowerCase() as Hex;
}

function decodeInitializeLog(log: {
  topics: readonly Hex[];
  data: Hex;
  address: Address;
}): V4PoolKey | undefined {
  if (log.address.toLowerCase() !== POOL_MANAGER_BASE.toLowerCase()) return undefined;
  if (log.topics[0]?.toLowerCase() !== INITIALIZE_TOPIC0) return undefined;
  const decoded = decodeEventLog({
    abi: INITIALIZE_ABI,
    data: log.data,
    topics: log.topics as [signature: Hex, ...args: Hex[]],
  });
  return {
    poolId: decoded.args.id as Hex,
    currency0: decoded.args.currency0 as Address,
    currency1: decoded.args.currency1 as Address,
    fee: Number(decoded.args.fee),
    tickSpacing: Number(decoded.args.tickSpacing),
    hooks: decoded.args.hooks as Address,
  };
}

export async function fetchPoolKeyFromDeployTx(
  client: BaseClient,
  deployTxHash: Hex,
  expectedPoolId?: string,
): Promise<V4PoolKey> {
  const receipt = await client.getTransactionReceipt({ hash: deployTxHash });
  const poolIdNorm = expectedPoolId ? normalizePoolId(expectedPoolId) : undefined;

  for (const log of receipt.logs) {
    const key = decodeInitializeLog(log);
    if (!key) continue;
    if (poolIdNorm && key.poolId.toLowerCase() !== poolIdNorm) continue;
    return key;
  }

  throw new Error(
    `[step 5] pool key: no PoolManager Initialize event in deploy tx ${deployTxHash}`,
  );
}

export async function fetchPoolKeyByPoolId(client: BaseClient, poolId: string): Promise<V4PoolKey> {
  const id = normalizePoolId(poolId);
  const logs = await client.getLogs({
    address: POOL_MANAGER_BASE,
    event: INITIALIZE_ABI[0],
    args: { id },
    fromBlock: 0n,
    toBlock: 'latest',
  });

  if (logs.length === 0) {
    throw new Error(`[step 5] pool key: no Initialize log for poolId ${poolId}`);
  }

  const decoded = decodeEventLog({
    abi: INITIALIZE_ABI,
    data: logs[0].data,
    topics: logs[0].topics,
  });

  return {
    poolId: decoded.args.id as Hex,
    currency0: decoded.args.currency0 as Address,
    currency1: decoded.args.currency1 as Address,
    fee: Number(decoded.args.fee),
    tickSpacing: Number(decoded.args.tickSpacing),
    hooks: decoded.args.hooks as Address,
  };
}

/** Counter-currency in the launch pool (Bankr Doppler pairs are typically WETH + token). */
export function counterCurrency(pool: V4PoolKey, tokenIn: Address): Address {
  if (pool.currency0.toLowerCase() === tokenIn.toLowerCase()) return pool.currency1;
  if (pool.currency1.toLowerCase() === tokenIn.toLowerCase()) return pool.currency0;
  throw new Error(`[step 5] pool key: ${tokenIn} is not in pool ${pool.currency0}/${pool.currency1}`);
}
