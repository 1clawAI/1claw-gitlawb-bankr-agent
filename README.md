# 1Claw × GitLawb × Bankr Agent

**Launch an autonomous, self-funding AI agent on Base in two commands.**

```bash
pnpm bootstrap   # provision identity + vault + token config
pnpm agent       # deploy token, push code, swap fees — all on-chain
```

## Why use this?

- **Self-sovereign identity** — Your agent gets a cryptographic `did:key` backed by 1Claw's HSM. No custodial risk; the private key never leaves hardware.
- **Zero-secret runtime** — API keys live in 1Claw's encrypted vault, not your `.env`. The agent pulls them at runtime with scoped, revocable access.
- **Token launch in one step** — Deploy a Uniswap V4 token on Base via Bankr with custom name, ticker, and logo. Fees start accruing immediately.
- **HSM-signed swaps** — The agent swaps its launched token on-chain through 1Claw Intents. Signing happens in the HSM — you never touch raw keys.
- **Decentralized code hosting** — Agent source is pushed to GitLawb (IPFS/libp2p git), giving it a permanent, censorship-resistant home.
- **LLM via TEE** — Code generation routes through Shroud's Trusted Execution Environment proxy. Your prompts and outputs stay private.
- **Configurable profile** — Name your agent, vault, and token at bootstrap. Change ticker or logo anytime without re-provisioning.
- **QR funding** — Bootstrap shows side-by-side QR codes for both wallets so you can fund instantly from a mobile wallet.

---

## Quick start

### 1. Install

```bash
git clone https://github.com/1clawAI/1claw-gitlawb-bankr-agent.git
cd 1claw-gitlawb-bankr-agent
pnpm install
cp .env.example .env
```

### 2. Install GitLawb CLI

```bash
curl -fsSL https://gitlawb.com/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
gl identity new   # once per machine
```

### 3. Bootstrap

```bash
pnpm bootstrap
```

You'll be prompted for:

| Prompt | What it does |
|--------|-------------|
| **Agent name** | Labels your 1Claw agent (default `reference-agent`) |
| **Vault name** | Labels the secret store (default `{agent}-secrets`) |
| **Token ticker** | On-chain symbol, e.g. `AGENT` |
| **Token name** | Display name (optional — defaults to `Agent <id>`) |
| **Token image** | HTTPS logo URL (optional) |
| **1Claw key** | Your `1ck_…` human key (masked) |
| **Bankr key** | Your `bk_…` key (masked, stored in vault) |

At the end, bootstrap shows **QR codes** for both wallets (1Claw agent + Bankr) so you can fund them from a phone.

All values can be pre-set in `.env` instead of answering prompts.

### 4. Run the agent

```bash
pnpm agent
```

The agent executes five steps sequentially:

| Step | What happens | Output |
|------|-------------|--------|
| 1 | Derives `did:key` from 1Claw HSM identity | DID string |
| 2 | Creates + pushes a GitLawb repo | `gitlawb://…` URL |
| 3 | Generates `agent.ts` via Shroud TEE LLM | committed code |
| 4 | Launches token on Base via Bankr | token address + poolId |
| 5 | Swaps token → WETH via Uniswap V4 (HSM-signed) | Basescan tx URL |

Results are saved to `run-summary.json`.

---

## Prerequisites

| Requirement | Where to get it |
|-------------|----------------|
| Node.js 20+ | [nodejs.org](https://nodejs.org) |
| 1Claw human API key (`1ck_…`) | [1claw.xyz](https://1claw.xyz) |
| GitLawb CLI v0.3+ | [gitlawb.com/start](https://gitlawb.com/start) |
| Bankr API key (`bk_…`) | [bankr.bot/api](https://bankr.bot/api) — read-write + Token Launch |
| Bankr Club membership | [bankr.bot/club](https://bankr.bot/club) |
| Bankr wallet ≥ 24h old | auto after signup (anti-spam) |

---

## How secrets work

```
  pnpm bootstrap                              pnpm agent
  ┌──────────────┐                            ┌──────────────┐
  │  HUMAN key   │── create agent ─────────▶  │  AGENT key   │── reads ──▶ 1Claw vault
  │  (1ck_…)     │── vault + signing key      │  (ocv_…)     │            (Bankr key, …)
  └──────────────┘── store Bankr in vault     └──────────────┘
```

- **Bootstrap** uses your human key once to provision everything, then it's no longer needed.
- **Runtime** uses only the agent's scoped key (`ocv_…`). Third-party secrets are pulled from the vault.
- `BANKR_API_KEY` is **cleared from `.env`** after bootstrap — it only lives in the vault.
- Override any vault secret locally by setting the env var (e.g. `BANKR_API_KEY=bk_…` in `.env`).

---

## Reuse an existing token (skip redeploy)

Already launched? Set these in `.env` to skip step 4's deploy:

```env
BANKR_EXISTING_TOKEN_ADDRESS=0x…
BANKR_EXISTING_POOL_ID=0x…
BANKR_EXISTING_DEPLOY_TX_HASH=0x…
```

Run only step 5 (swap):

```bash
AGENT_START_STEP=5 AGENT_END_STEP=5 pnpm agent
```

Or dry-run to verify calldata without submitting transactions:

```bash
AGENT_SWAP_DRY_RUN=1 pnpm agent
```

---

## Environment variables

| Variable | When | Notes |
|----------|------|-------|
| `ONECLAW_HUMAN_API_KEY` | bootstrap | `1ck_…` — never needed at runtime |
| `ONECLAW_AGENT_NAME` / `ONECLAW_VAULT_NAME` | bootstrap | resource labels |
| `BANKR_TOKEN_SYMBOL` / `BANKR_TOKEN_NAME` / `BANKR_TOKEN_IMAGE` | bootstrap → step 4 | token metadata |
| `ONECLAW_AGENT_ID` / `ONECLAW_AGENT_API_KEY` / `ONECLAW_VAULT_ID` | runtime | written by bootstrap |
| `GITLAWB_NODE_URL` | step 2 | default `https://node.gitlawb.com` |
| `SHROUD_API_URL` / `SHROUD_MODEL` | step 3 | default `gpt-4o-mini` |
| `BANKR_API_KEY` | step 4 | vault at runtime |
| `BASE_RPC_URL` | step 5 | default `https://mainnet.base.org` |
| `BANKR_EXISTING_TOKEN_ADDRESS` / `_POOL_ID` / `_DEPLOY_TX_HASH` | step 4–5 | skip deploy |
| `AGENT_START_STEP` / `AGENT_END_STEP` | runtime | run a subset (1–5) |
| `AGENT_SWAP_DRY_RUN` | step 5 | `1` = build calldata, skip txs |

Blank values are treated as unset (defaults apply).

---

## Architecture

```
                     ┌─────────────────────────────────────────────┐
                     │                pnpm agent                    │
                     │            (src/agent.ts — 5 steps)          │
                     └───┬─────────┬─────────┬─────────┬─────────┬──┘
                         │         │         │         │         │
                   step 1│   step 2│   step 3│   step 4│   step 5│
                         ▼         ▼         ▼         ▼         ▼
                   ┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐
                   │  1Claw  ││ GitLawb ││ Shroud  ││  Bankr  ││  1Claw  │
                   │  Vault  ││  repos  ││ TEE LLM ││  token  ││ Intents │
                   │  (HSM)  ││ IPFS/p2p││  proxy  ││  launch ││ (HSM)   │
                   └─────────┘└─────────┘└─────────┘└─────────┘└─────────┘
                     did:key     repo URL   agent.ts   token CA   swap tx
```

---

## Project layout

```
src/
├── bootstrap.ts              # provision agent, vault, profile, QR codes
├── bootstrap-settings.ts     # name/ticker/image prompts + validation
├── agent.ts                  # 5-step orchestrator
├── config.ts                 # zod env schema
├── secrets.ts                # vault secret registry + runtime overlay
├── clients/
│   ├── oneclaw-sdk.ts        # @1claw/sdk factory (JWT + x402 auto-pay)
│   ├── oneclaw.ts            # runtime: DID, vault, Intents
│   ├── oneclaw-admin.ts      # bootstrap admin via SDK
│   ├── intents-evm-signer.ts # HSM signer for x402 payments
│   ├── evm-wallet.ts         # agent signing address + Base RPC
│   ├── gitlawb.ts            # gl CLI + git push
│   ├── shroud.ts             # Shroud OpenAI-compatible client
│   └── bankr.ts              # POST /token-launches/deploy
├── steps/                    # 01–05, one file per step
└── util/
    ├── pool-key.ts           # V4 PoolKey from deploy Initialize event
    ├── permit2.ts            # ERC20 + Permit2 approvals
    ├── v4-swap.ts            # Uniswap V4 swap calldata
    ├── qr-display.ts         # terminal QR code rendering
    ├── prompt-secret.ts      # masked stdin input
    ├── prompt-line.ts        # visible stdin input
    └── timeout.ts
```

---

## Integration details

### 1Claw ([docs.1claw.xyz](https://docs.1claw.xyz))

- `@1claw/sdk` — JWT exchange, vault reads, Intents submit/poll
- HSM-backed signing — keys never leave hardware
- DID derivation from agent's Ed25519 `ssh_public_key`
- x402 micropayments on vault 402 responses

### GitLawb ([gitlawb.com](https://gitlawb.com))

- Decentralized git over IPFS/libp2p
- `gl register` → `gl repo create` → `git push`
- Idempotent: skips on 409, handles empty repos

### Shroud

- TEE-proxied LLM at `https://shroud.1claw.xyz/v1`
- Auth: `X-Shroud-Agent-Key: {agent_id}:{api_key}`
- Default model: `gpt-4o-mini`

### Bankr ([docs.bankr.bot](https://docs.bankr.bot))

- `POST /token-launches/deploy` — returns token address + poolId
- Supports name, ticker, image, description, fee routing
- Requires Bankr Club + 24h wallet age
- Use direct HTTPS image URLs (IPFS uploads can fail)

### Uniswap V4 (step 5)

- PoolKey decoded from the deploy tx's `Initialize` event on PoolManager
- Permit2 approval chain: token → Permit2 → UniversalRouter
- Swap: launched token → WETH via `execute(V4_SWAP, …)`

---

## Test status (May 2026)

All steps verified end-to-end on live services:

| Step | Status |
|------|--------|
| Bootstrap | ✅ |
| 1 — DID | ✅ |
| 2 — GitLawb push | ✅ |
| 3 — Shroud LLM | ✅ |
| 4 — Bankr deploy | ✅ |
| 5 — V4 swap | ✅ |

---

## What's next

| Area | Notes |
|------|-------|
| Multi-hop WETH → USDC | Doppler pools are WETH-paired; second hop needed for stablecoin |
| Slippage protection | Currently `amountOutMinimum: 0` — add quoting for production |
| GitLawb ↔ 1Claw DID | Blocked upstream; repos use local `gl` identity |
| CI / tests | Flow needs live keys; mocked unit tests per client |
| Production hardening | Retries, idempotent re-runs, secret rotation |

---

## Scripts

```bash
pnpm bootstrap   # one-time setup
pnpm agent       # run the full flow
pnpm typecheck   # tsc --noEmit
```

## License

MIT
