import { loadConfig } from '../src/config.js';
import { getBasePublicClient } from '../src/clients/evm-wallet.js';
import { counterCurrency, fetchPoolKeyFromDeployTx } from '../src/util/pool-key.js';

const DEPLOY_TX = '0x88345dfb689d21d550d64612aa71c3bcbf4ea141f365a0aaacf8fb863f58808a';
const POOL_ID = '0xb37077c737198144bc32e6574f68e92af18721d052f74af5678eb66a48049fbc';
const TOKEN = '0xdED5B8B59089220081A14551E7F225757919CbA3';

async function main(): Promise<void> {
  const client = getBasePublicClient(loadConfig());
  const pool = await fetchPoolKeyFromDeployTx(client, DEPLOY_TX, POOL_ID);
  const out = counterCurrency(pool, TOKEN);
  console.log('poolKey:', pool);
  console.log('swap:', TOKEN, '->', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
