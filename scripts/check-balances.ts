import 'dotenv/config';
import { loadConfig } from '../src/config.js';
import { getBasePublicClient, getSigningAddress } from '../src/clients/evm-wallet.js';
import { readTokenBalance } from '../src/util/permit2.js';

const TOKEN = '0xdED5B8B59089220081A14551E7F225757919CbA3';
const BANKR_DEPLOYER = '0x505a9a42ee134d9788eda0d0820388f7a3cc189c';

async function main(): Promise<void> {
  const config = loadConfig();
  const client = getBasePublicClient(config);
  const agent = await getSigningAddress(config);
  const agentBal = await readTokenBalance(client, TOKEN, agent);
  const bankrBal = await readTokenBalance(client, TOKEN, BANKR_DEPLOYER);
  console.log('agent wallet', agent, 'balance', agentBal.toString());
  console.log('bankr deployer', BANKR_DEPLOYER, 'balance', bankrBal.toString());
}

main();
