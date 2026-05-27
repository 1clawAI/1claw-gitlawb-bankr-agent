# 1Claw × GitLawb × Bankr agent

A single-command autonomous agent that runs the full Bankr agentic dev stack end
to end. In one `pnpm agent` it:

1. **Generates an Ed25519 DID** and stores the private key in **1Claw's** HSM-backed vault
2. Uses that DID to **create and push a real repo to GitLawb** (decentralized git on IPFS/libp2p)
3. Calls an LLM through **1Claw's Shroud TEE proxy** to author the repo's contents
4. **Launches a Bankr token** tied to the repo
5. **Signs an on-chain fee swap** through 1Claw's Intents API — the private key never leaves the HSM

The run prints progress at each stage and emits `run-summary.json` with every
artifact (DID, repo URL, token address, swap tx hash).

> This is a **reference implementation**. Optimize for clarity — every file is
> meant to be readable by a developer who's never seen the stack.

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
                       Ed25519     did:key    agent.ts  token CA   swap tx
                       did:key     repo URL   code      on Base    on Base

  Key custody:  the agent's Ed25519 identity key is auto-provisioned with the
                agent; the DID is derived from its public key (step 1). The Base
                signing key lives in the HSM; step 5 signs via the Intents API.
```

## Run it

```bash
pnpm install
cp .env.example .env          # add your 1Claw HUMAN key
pnpm bootstrap                # provisions agent + vault, prompts for other secrets
pnpm agent                    # runs with the agent key; pulls secrets from 1Claw
```

Both commands require real credentials — `pnpm bootstrap` needs `ONECLAW_HUMAN_API_KEY`,
and `pnpm agent` needs the agent key, vault id, and third-party secrets (Bankr, GitLawb CLI)
written by bootstrap.

### How secrets work (two keys, vault-held)

You manage one secret; the agent manages the rest:

- **`ONECLAW_HUMAN_API_KEY`** — yours. Used *only* by `pnpm bootstrap` to create the
  agent, attach a policy, and write secrets to the vault. Never used at runtime.
- **`ONECLAW_AGENT_API_KEY` + `ONECLAW_AGENT_ID`** — the agent's own scoped key,
  written into `.env` by bootstrap. This is all `pnpm agent` needs.

`pnpm bootstrap` prompts for the third-party secrets (Bankr key, Neynar) and stores
them **in the 1Claw vault**, not in `.env`. At runtime the agent pulls them back by
name (`src/secrets.ts`). Shroud reuses the agent key, so no separate LLM key is needed.

```
  pnpm bootstrap                              pnpm agent
  ┌──────────────┐                            ┌──────────────┐
  │  HUMAN key   │── create agent (ocv_) ──▶  │  AGENT key   │── reads ──▶ 1Claw vault
  │  1ck_…       │── + base signing key       │ ocv_… (.env) │            (Bankr, Neynar…)
  │  (you, once) │── vault + read policy ──▶   └──────────────┘
  └──────────────┘── store secrets ───────▶ vault
```

### Environment

| Var | Used by | Notes |
|-----|---------|-------|
| `ONECLAW_HUMAN_API_KEY` | `pnpm bootstrap` | the only key you set by hand (`1ck_…`) |
| `ONECLAW_AGENT_API_KEY` / `ONECLAW_AGENT_ID` / `ONECLAW_VAULT_ID` | `pnpm agent` | written by bootstrap |
| `BANKR_API_KEY`, `NEYNAR_*` | step 4 | stored in the 1Claw vault by bootstrap |
| `SHROUD_API_URL` / `SHROUD_MODEL` | step 3 | Shroud auths with the agent key |
| `GITLAWB_NODE_URL` (+ the `gl` CLI) | step 2 | identity-based, no token |
| `BASE_RPC_URL` | step 5 | Base RPC |

Blank entries in `.env` are treated as unset, so defaults apply.

## Project layout

```
src/
├── bootstrap.ts          # `pnpm bootstrap` — provision agent + vault (human key)
├── agent.ts              # `pnpm agent` — runs all 5 steps sequentially
├── config.ts             # env loading + zod schema
├── secrets.ts            # which secrets live in the vault; runtime overlay
├── logger.ts             # console wrapper, [step N/5] prefixes
├── types.ts              # shared Context + summary types
├── util/
│   ├── timeout.ts        # 30s timeout wrapper for all async I/O
│   └── v4-swap.ts        # Uniswap V4 swap calldata encoder (viem)
├── steps/
│   ├── 01-create-did.ts  # mint Ed25519 key in HSM, did:key
│   ├── 02-push-repo.ts   # create + push GitLawb repo
│   ├── 03-llm-call.ts    # Shroud LLM call, commit generated code
│   ├── 04-launch-token.ts# Bankr token launch
│   └── 05-swap-fees.ts   # 1Claw Intent swap
└── clients/
    ├── oneclaw.ts        # runtime: vault key/secret reads + Intents (agent key)
    ├── oneclaw-admin.ts  # bootstrap: create agent, policy, store secrets (human key)
    ├── gitlawb.ts        # gl CLI repo create/push wrapper
    ├── shroud.ts         # OpenAI-compatible TEE proxy client
    └── bankr.ts          # token launch wrapper
```

## Status

Each client follows the real API surface of its service. Missing credentials or
the GitLawb `gl` CLI cause the run to fail fast with a clear error.

**1Claw** — wired to the real API ([docs](https://docs.1claw.xyz/)):
- Bootstrap (human `1ck_` key): `POST /v1/agents` (guardrails inline: `intents_api_enabled`,
  `tx_allowed_chains`), `POST /v1/vaults` + `/policies`, `POST /v1/agents/{id}/signing-keys`.
- Runtime (agent `ocv_` key, used as Bearer): DID from `GET /v1/agents/me` (`ssh_public_key`),
  secrets via `GET /v1/vaults/{id}/secrets/{path}`, Intents via `POST /v1/agents/{id}/transactions`.
- Shroud: `https://shroud.1claw.xyz/v1`, `X-Shroud-Agent-Key` + `X-Shroud-Provider`,
  model `claude-sonnet-4-5-20250929`.

**Bankr** ([docs](https://docs.bankr.bot/)) — `POST /agent/prompt` → poll
`GET /agent/job/{jobId}`, `X-API-Key`. **GitLawb** ([node](https://github.com/Gitlawb/node)) —
CLI-first (`gl repo create` + `gitlawb://` git remote via execa).

**Remaining `TODO(spec)`** (grep to find):
- **GitLawb identity** — `gl identity new` mints its own did:key; confirm how to make
  the repo owned by the agent's 1Claw DID (`gl identity import`?).
- **Bankr token launch** — parses the contract address from the agent's reply; the
  structured Deploy API would be more robust.
- **Step 5 swap** — the V4 calldata is real, but the token's actual V4 PoolKey
  (fee/tickSpacing/hooks) and Permit2 approvals still need wiring for a live swap.
