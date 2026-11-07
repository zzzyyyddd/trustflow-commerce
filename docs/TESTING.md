# Testing

Tests are grouped by what they actually exercise. Local simulated wallet/RPC tests are not browser tests, and rule-only Rust tests do not verify the deployed program’s account constraints or transfers.

## Prerequisites

Use Node.js 22, npm, and Rust. For IDL generation and validator integration, install compatible Solana and Anchor tools separately; this project was worked on with Solana CLI 2.1.0 and Anchor CLI 0.31.1. The workspace lockfile resolves `anchor-lang` 0.31.3. Dependency downloads and CLI installation require appropriate network access.

The IDL is generated under ignored `target/` and is not part of a fresh checkout. Both JavaScript check commands below read `target/idl/trustflow_escrow.json`. With Anchor 0.31.1 installed at the WSL path used in this project:

```bash
mkdir -p target/idl
RUSTUP_TOOLCHAIN=stable ~/.avm/bin/anchor-0.31.1 idl build -o target/idl/trustflow_escrow.json
```

On a different machine, use the path to the installed Anchor 0.31.1 binary. Do not run `anchor keys sync` against this checkout unless intentionally changing its program ID. Generated keypair files are private and ignored.

## Non-transaction checks

From the project root:

```bash
npm ci
npm run test:checks
npm run test:client
./node_modules/.bin/tsc --noEmit --incremental false
cargo test --workspace --locked
npm run build
```

- `test:checks`: rate-limit/status helper tests and Devnet configuration/IDL comparisons.
- `test:client`: instruction construction and account metas, message-integrity and fee boundaries, mocked blockhash/preflight behavior, diagnostic redaction, and wallet-session disconnect/account-switch races. Wallets and RPCs here are simulated; nothing is broadcast.
- `cargo test`: Rust unit tests for transition rules and related state transitions. It does not start a validator.
- `tsc` checks TypeScript; `build` creates the static frontend export.

**Result on 7 November 2026:** `test:checks` passed 6 tests, `test:client` passed 24 tests, TypeScript passed, `cargo test --locked --offline -q` passed 7 unit tests using a writable temporary Cargo cache, and the frontend production build passed. Results are specific to that environment and are not an audit.

## Local-validator integration — creates local transactions

This suite tests the compiled program against a local validator, including unauthorized actions, recipient constraints, and repeated settlement. It requires a compiled SBF program, validator, and a separate terminal. These commands create **local-validator** transactions and use local airdrops; they do not submit to Devnet.

Terminal 1:

```bash
~/.avm/bin/anchor-0.31.1 build --no-idl
solana-test-validator --reset --bpf-program 8DK8Z1Uz8Nv3KTvVE7kxrm79mijQEL2nC5CAacPHgJ4Z target/deploy/trustflow_escrow.so
```

Terminal 2:

```bash
TRUSTFLOW_TEST_RPC=http://127.0.0.1:8899 \\
TRUSTFLOW_PROGRAM_ID=8DK8Z1Uz8Nv3KTvVE7kxrm79mijQEL2nC5CAacPHgJ4Z npm test
```

The test refuses non-local RPC URLs. It was **not run in this documentation pass**. The generated `target/deploy/*-keypair.json`, if present, must remain private and untracked.

## Devnet lifecycle — creates new Devnet transactions

The historical run in [Devnet evidence](DEVNET_EVIDENCE.md) already exists; it is not necessary to rerun it to review the project. To deliberately run a **new** lifecycle with a funded Devnet development wallet:

```bash
node scripts/devnet-lifecycle.mjs
```

It reads `~/.config/solana/id.json` or `TRUSTFLOW_WALLET` without printing its contents, verifies the Devnet genesis hash, uses the wallet as fee payer, and creates disposable test parties. It transfers 0.001 Devnet SOL to each of three parties and funds two 0.0001 Devnet SOL escrows; rent and fees are additional. It writes a timestamped report under `evidence/`. This command signs and broadcasts new Devnet transactions; run it only when that is intended. Do not share wallet secrets.

## Known gaps

- The historical script run did not record an overall PASS because it stopped while confirming the last expected failure; the final signature was later verified read-only on Devnet.
- The complete browser/Phantom lifecycle is not verified. Client stubs and historic script transactions are not a substitute.
- The local validator suite was not rerun in this documentation pass. The program is upgradeable and unaudited; tests do not prove safety or off-chain delivery.
- Devnet RPC/faucet rate limits, wallet-provider changes, network resets, and unavailable arbitrators can block a demo.
