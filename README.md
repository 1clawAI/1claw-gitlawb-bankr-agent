# 1Claw × GitLawb × Bankr agent

A single-command reference agent that runs the full agentic dev stack end to end.
In one `pnpm agent` it:

1. **Derives a `did:key`** from the 1Claw agent's Ed25519 identity (`ssh_public_key`)
2. **Creates and pushes a GitLawb repo** (decentralized git on IPFS/libp2p)
3. **Generates `agent.ts`** via the **Shroud TEE LLM proxy**
4. **Launches a Bankr token** on Base (`POST /token-launches/deploy`)
5. **Submits a fee swap** through **1Claw Intents** (HSM signing — key never leaves 1Claw)

Progress prints at each stage; `run-summary.json` records artifacts (DID, repo URL,
token address, swap tx hash).

> Reference implementation — optimized for clarity, not production hardening.

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
                       (1Claw)     (gl DID)   code       on Base    on Base
```

**Two DIDs, by design:** Step 1 encodes the agent's canonical identity from 1Claw.
Step 2 registers and pushes under the local **`gl` CLI identity** (HTTP Signatures auth).
GitLawb does not yet support importing the 1Claw HSM key into `gl`.

## Prerequisites

| Requirement | Used for |
|-------------|----------|
| Node.js 20+ | runtime |
| [1Claw](https://1claw.xyz) human API key (`1ck_…`) | `pnpm bootstrap` |
| [GitLawb `gl` CLI](https://gitlawb.com/start) v0.3+ | step 2 (`~/.local/bin` on `PATH`) |
| Bankr API key (`bk_…`) — **read-write**, **Token Launch** enabled | step 4 |
| [Bankr Club](https://bankr.bot/club) | step 4 (Token Launch API) |
| Bankr wallet **≥ 24 hours old** | step 4 (anti-spam) |
| Base signing key on agent (bootstrap provisions) | step 5 |

Install the GitLawb CLI:

```bash
curl -fsSL https://gitlawb.com/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
gl identity new   # once per machine
```

## Quick start

```bash
pnpm install
cp .env.example .env

# Optional — set before bootstrap (or answer prompts interactively):
# ONECLAW_HUMAN_API_KEY=1ck_…
# ONECLAW_AGENT_NAME=my-agent
# ONECLAW_VAULT_NAME=my-agent-secrets
# BANKR_TOKEN_SYMBOL=CLAW
# BANKR_TOKEN_NAME=My Agent Token
# BANKR_TOKEN_IMAGE=https://example.com/logo.png

pnpm bootstrap   # profile + masked API keys → agent, vault, .env
pnpm agent       # 5 steps (Bankr key pulled from vault)
```

### What `bootstrap` configures

| Prompt / `.env` field | 1Claw / Bankr use |
|----------------------|-------------------|
| `ONECLAW_AGENT_NAME` | Agent resource name (default `reference-agent`) |
| `ONECLAW_VAULT_NAME` | Vault label for third-party secrets (default `{agentName}-secrets`) |
| `BANKR_TOKEN_SYMBOL` | Token ticker on deploy (default `AGENT`) |
| `BANKR_TOKEN_NAME` | Token name; blank → `Agent <uuid-prefix>` at deploy |
| `BANKR_TOKEN_IMAGE` | Optional `https` logo URL → Bankr `image` field |
| `ONECLAW_HUMAN_API_KEY` | Masked — provisions agent + vault |
| `BANKR_API_KEY` | Masked — stored in vault, cleared from `.env` |

After bootstrap, `.env` contains agent credentials (`ocv_…`, vault id) and profile fields.
**Only** `BANKR_API_KEY` (and optional Neynar keys) are scrubbed from `.env`; runtime loads them from the vault.

## How secrets work

| Key | When | Purpose |
|-----|------|---------|
| `ONECLAW_HUMAN_API_KEY` (`1ck_…`) | bootstrap only | create agent, vault, policies |
| `ONECLAW_AGENT_API_KEY` (`ocv_…`) + `ONECLAW_AGENT_ID` | runtime | vault reads, Shroud, Intents |
| `bankr_api_key` (vault) | runtime step 4 | Bankr token deploy |
| Shroud | runtime step 3 | reuses `agent_id:api_key` — no separate LLM secret |

```
  pnpm bootstrap                              pnpm agent
  ┌──────────────┐                            ┌──────────────┐
  │  HUMAN key   │── create agent (ocv_) ──▶  │  AGENT key   │── reads ──▶ 1Claw vault
  │  1ck_…       │── vault + signing key      │ ocv_… (.env) │            (Bankr, …)
  └──────────────┘── store Bankr in vault     └──────────────┘
```

Override any vault secret locally by setting the matching env var (e.g. `BANKR_API_KEY`).
Override token metadata anytime via `BANKR_TOKEN_SYMBOL`, `BANKR_TOKEN_NAME`, or `BANKR_TOKEN_IMAGE` in `.env` without re-bootstrapping.

## Environment

| Variable | Step | Notes |
|----------|------|-------|
| `ONECLAW_HUMAN_API_KEY` | bootstrap | `1ck_…` |
| `ONECLAW_AGENT_NAME` / `ONECLAW_VAULT_NAME` | bootstrap | 1Claw labels; written to `.env` |
| `BANKR_TOKEN_SYMBOL` / `BANKR_TOKEN_NAME` / `BANKR_TOKEN_IMAGE` | bootstrap → 4 | ticker, name, optional `https` logo |
| `ONECLAW_AGENT_ID` / `ONECLAW_AGENT_API_KEY` / `ONECLAW_VAULT_ID` | agent | written by bootstrap |
| `GITLAWB_NODE_URL` | 2 | default `https://node.gitlawb.com` |
| `SHROUD_API_URL` / `SHROUD_MODEL` | 3 | default model `gpt-4o-mini` |
| `BANKR_API_KEY` | 4 | vault at runtime; read-write + Token Launch |
| `BASE_RPC_URL` | 5 | Base mainnet RPC |

Blank `.env` values are treated as unset (zod defaults apply).

## Project layout

```
src/
├── bootstrap.ts              # provision agent, vault, profile + secret prompts
├── bootstrap-settings.ts     # agent/vault/ticker/image prompts + validation
├── agent.ts                  # 5-step orchestrator
├── config.ts                 # zod env schema
├── secrets.ts                # vault secret registry + runtime overlay
├── clients/
│   ├── oneclaw-sdk.ts        # @1claw/sdk factory (JWT + x402 auto-pay)
│   ├── oneclaw.ts            # runtime: DID, vault, Intents
│   ├── oneclaw-admin.ts      # bootstrap admin via SDK
│   ├── intents-evm-signer.ts # HSM signer for x402 payments
│   ├── gitlawb.ts            # gl + git push (empty-repo main branch fix)
│   ├── shroud.ts             # Shroud OpenAI-compatible client
│   └── bankr.ts              # POST /token-launches/deploy
├── steps/                    # 01–05, one file per step
└── util/
    ├── prompt-secret.ts      # masked stdin for bootstrap secrets
    ├── prompt-line.ts        # visible stdin for bootstrap profile
    ├── timeout.ts
    └── v4-swap.ts            # Uniswap V4 calldata (step 5)
```

## Integration details

### 1Claw ([docs](https://docs.1claw.xyz/))

- **`@1claw/sdk`** — JWT exchange from `ocv_` / `1ck_`, vault reads, Intents submit/poll
- **Bootstrap** — awaits `1ck_` → JWT before admin calls (agent create, vault, signing key)
- **x402** — automatic micropayments on vault 402s via HSM-backed `X402Signer`
- **DID (step 1)** — `GET /v1/agents/me` → `ssh_public_key` → `did:key:z…`

### Shroud (step 3)

- `POST https://shroud.1claw.xyz/v1/chat/completions`
- Headers: `X-Shroud-Agent-Key: {agent_id}:{api_key}`, `X-Shroud-Provider` (e.g. `openai`)
- Default model: `gpt-4o-mini` (Claude models require provider keys in vault)

### GitLawb (step 2)

- `gl register --node $GITLAWB_NODE_URL` → `gl repo create` → `git push gitlawb://{gl_did}/{repo}`
- Repo name: `agent-{uuid-prefix}` (from 1Claw agent id)
- Idempotent: skips create on 409; ensures `main` exists before first push on empty repos

### Bankr (step 4)

- `POST /token-launches/deploy` with `X-API-Key` (not the legacy `/agent/prompt` flow)
- Body: `tokenName`, `tokenSymbol`, `description`, optional `image` (`https` URL), optional `websiteUrl`
- Requires **Bankr Club**, read-write key, and wallet age ≥ 24h
- Use a **direct** image URL (hosted file); IPFS upload failures can block deploys ([FAQ](https://docs.bankr.bot/faq/token-launching))
- Clear errors for read-only keys, Club, and wallet cooldown

### Intents (step 5)

- `POST /v1/agents/{id}/transactions` on Base; polls until `tx_hash`
- V4 swap calldata is built in `util/v4-swap.ts` — **PoolKey / Permit2 wiring still TODO** for live swaps against a freshly launched token

## Implementation & test status

This table reflects what is **implemented in code** vs what has been **run successfully end-to-end** against live services. There is no automated CI for the full flow.

| Step | Code | E2E tested |
|------|------|------------|
| **Bootstrap** — agent, vault, signing key, profile → `.env` | ✅ | ✅ |
| **1** — DID from 1Claw (`agents/me` → `did:key`) | ✅ | ✅ |
| **2** — GitLawb push (`agent-{uuid-prefix}` on public node) | ✅ | ✅ (empty-repo `main` branch handling) |
| **3** — Shroud LLM + commit `agent.ts` | ✅ | ✅ |
| **4** — Bankr `POST /token-launches/deploy` (ticker, name, optional `image`) | ✅ | ❌ — blocked on **Bankr Club**, **24h wallet**, and write + Token Launch API key; not completed in maintainer runs |
| **5** — 1Claw Intents swap on Base | 🔧 partial | ❌ — intent submit is wired, but V4 **PoolKey** uses placeholders and **Permit2 → UniversalRouter** approval is not implemented for the launched token |

A full green `pnpm agent` run (all five steps without manual intervention) has **not** been recorded in this repository yet.

No stub fallbacks — missing credentials or CLI fail fast with actionable errors.

## Scripts

```bash
pnpm bootstrap   # agent profile + vault secrets + credentials → .env
pnpm agent       # run the 5-step flow
pnpm typecheck   # tsc --noEmit
```

## License

MIT — see repository root.
