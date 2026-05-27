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
# Optional: ONECLAW_HUMAN_API_KEY=1ck_… in .env

pnpm bootstrap   # masked prompts for human + Bankr keys; writes agent creds to .env
pnpm agent       # pulls Bankr from vault; runs all 5 steps
```

`bootstrap` accepts keys from `.env` or **masked interactive prompts** (`*` echo).
Third-party secrets (Bankr, optional Neynar) are stored in the **1Claw vault** and
cleared from `.env` after bootstrap.

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

## Environment

| Variable | Step | Notes |
|----------|------|-------|
| `ONECLAW_HUMAN_API_KEY` | bootstrap | `1ck_…` |
| `ONECLAW_AGENT_*` / `ONECLAW_VAULT_ID` | agent | written by bootstrap |
| `GITLAWB_NODE_URL` | 2 | default `https://node.gitlawb.com` |
| `SHROUD_API_URL` / `SHROUD_MODEL` | 3 | default model `gpt-4o-mini` |
| `BANKR_API_KEY` | 4 | vault at runtime; read-write + Token Launch |
| `BASE_RPC_URL` | 5 | Base mainnet RPC |

Blank `.env` values are treated as unset (zod defaults apply).

## Project layout

```
src/
├── bootstrap.ts              # provision agent, vault, masked secret prompts
├── agent.ts                  # 5-step orchestrator
├── config.ts                 # zod env schema
├── secrets.ts                # vault secret registry + runtime overlay
├── clients/
│   ├── oneclaw-sdk.ts        # @1claw/sdk factory (JWT + x402 auto-pay)
│   ├── oneclaw.ts            # runtime: DID, vault, Intents
│   ├── oneclaw-admin.ts      # bootstrap admin via SDK
│   ├── intents-evm-signer.ts # HSM signer for x402 payments
│   ├── gitlawb.ts            # gl + git push (clone-before-push)
│   ├── shroud.ts             # Shroud OpenAI-compatible client
│   └── bankr.ts              # POST /token-launches/deploy
├── steps/                    # 01–05, one file per step
└── util/
    ├── prompt-secret.ts      # masked stdin for bootstrap
    ├── timeout.ts
    └── v4-swap.ts            # Uniswap V4 calldata (step 5)
```

## Integration details

### 1Claw ([docs](https://docs.1claw.xyz/))

- **`@1claw/sdk`** — JWT exchange from `ocv_` / `1ck_`, vault reads, Intents submit/poll
- **x402** — automatic micropayments on vault 402s via HSM-backed `X402Signer`
- **DID (step 1)** — `GET /v1/agents/me` → `ssh_public_key` (raw base64 Ed25519 or OpenSSH wire format) → `did:key:z…`

### Shroud (step 3)

- `POST https://shroud.1claw.xyz/v1/chat/completions`
- Headers: `X-Shroud-Agent-Key: {agent_id}:{api_key}`, `X-Shroud-Provider` (e.g. `openai`)
- Default model: `gpt-4o-mini` (Claude models require provider keys in vault)

### GitLawb (step 2)

- `gl register --node $GITLAWB_NODE_URL` → `gl repo create` → `git push gitlawb://{gl_did}/{repo}`
- Idempotent: skips create on 409; clones existing repo before each file push

### Bankr (step 4)

- `POST /token-launches/deploy` with `X-API-Key` (not the legacy `/agent/prompt` flow)
- Requires **Bankr Club**, read-write key, and wallet age ≥ 24h
- Clear errors for read-only keys, Club, and wallet cooldown

### Intents (step 5)

- `POST /v1/agents/{id}/transactions` on Base; polls until `tx_hash`
- V4 swap calldata is built in `util/v4-swap.ts` — **PoolKey / Permit2 wiring still TODO** for live swaps against a freshly launched token

## Verified status (May 2026)

| Step | Status |
|------|--------|
| 1 — DID from 1Claw | ✅ |
| 2 — GitLawb push | ✅ (`agent-{uuid-prefix}` repos on public node) |
| 3 — Shroud LLM + commit | ✅ |
| 4 — Bankr token deploy | ⏳ needs Club + 24h wallet (API wired) |
| 5 — Intents swap | 🔧 calldata only; pool/approval TBD |

No stub fallbacks — missing credentials or CLI fail fast with actionable errors.

## Scripts

```bash
pnpm bootstrap   # one-time: agent + vault + vault secrets
pnpm agent       # run the 5-step flow
pnpm typecheck   # tsc --noEmit
```

## License

MIT — see repository root.
