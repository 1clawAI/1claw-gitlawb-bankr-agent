# 1Claw × GitLawb reference agent

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

  Key custody:  private key is POSTed to the 1Claw vault once (step 1) and is
                never returned or logged. Step 5 signs via the HSM by key handle.
```

## Run it

```bash
pnpm install
cp .env.example .env     # fill in your keys (see below)
pnpm agent
```

With an empty `.env` the agent runs **end-to-end against stubs** — every external
call returns mock data, the DID is still generated with real crypto, and
`run-summary.json` is written. Fill in credentials to light up each real
integration one at a time.

### Environment

| Var | Used by | Required for real run |
|-----|---------|-----------------------|
| `ONECLAW_API_URL` / `ONECLAW_API_KEY` / `ONECLAW_AGENT_ID` | steps 1 & 5 | yes |
| `SHROUD_API_URL` / `SHROUD_API_KEY` / `SHROUD_MODEL` | step 3 | yes |
| `GITLAWB_NODE_URL` (+ the `gl` CLI installed) | step 2 | yes |
| `BANKR_API_URL` / `BANKR_API_KEY` | step 4 | yes |
| `NEYNAR_API_KEY` / `NEYNAR_SIGNER_UUID` / `FARCASTER_FID` | step 4 (Farcaster fallback) | optional |
| `BASE_RPC_URL` | step 5 | yes |

Blank entries in `.env` are treated as unset, so defaults (the URLs above) apply.

## Project layout

```
src/
├── agent.ts              # entrypoint — runs all 5 steps sequentially
├── config.ts             # env loading + zod schema
├── logger.ts             # console wrapper, [step N/5] prefixes
├── types.ts              # shared Context + summary types
├── util/timeout.ts       # 30s timeout wrapper for all async I/O
├── steps/
│   ├── 01-create-did.ts  # Ed25519 keygen, vault store, did:key
│   ├── 02-push-repo.ts   # create + push GitLawb repo
│   ├── 03-llm-call.ts    # Shroud LLM call, commit generated code
│   ├── 04-launch-token.ts# Bankr token launch
│   └── 05-swap-fees.ts   # 1Claw Intent swap
└── clients/
    ├── oneclaw.ts        # vault + Intents wrappers
    ├── gitlawb.ts        # repo create/push wrapper
    ├── shroud.ts         # OpenAI-compatible client
    └── bankr.ts          # token launch wrapper
```

## Status

Each client now follows the real API surface documented by its service (see
[1Claw docs](https://docs.1claw.xyz/), [Bankr docs](https://docs.bankr.bot/),
[GitLawb node](https://github.com/Gitlawb/node)); when a credential is missing it
falls back to a stub so `pnpm agent` always runs end to end. Search for
`TODO(spec)` for the shapes still to be confirmed against live endpoints.

**Confirmed from docs and wired up:**
- **Shroud** — OpenAI-compatible body, auth via `X-Shroud-Agent-Key`, provider
  picked with `X-Shroud-Provider` (`claude-*` → `anthropic`).
- **Bankr** — `POST /agent/prompt` → poll `GET /agent/job/{jobId}`; `X-API-Key` auth.
- **GitLawb** — CLI-first (`gl repo create` + `gitlawb://` git remote via execa).

**Open questions for the spec author:**
- **1Claw key custody** — the spec's step 1 generates the key locally and POSTs the
  private key to the vault. 1Claw's docs say keys are minted *inside* the HSM, so
  this client now requests generation and receives only `{ keyId, publicKey }`. The
  private key never leaves the HSM. Confirm the vault generate endpoint + response.
- **1Claw Intents** — docs reference `POST /v1/agents/:id/transactions`; reconcile
  the exact field names (`chain`/`recipient`/signing-key-path vs `chainId`/`to`/`keyId`).
- **GitLawb identity** — `gl identity new` mints its own did:key; confirm how to make
  the repo owned by the vaulted DID from step 1 (`gl identity import`?).
- **Bankr token launch** — currently parses the contract address from the agent's
  reply; the structured Deploy API would be more robust.
- **Step 5 swap calldata** — Uniswap V4 router address + token→USDC calldata are stubbed.
