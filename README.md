# TrustFlow Commerce — Devnet escrow

A single-milestone SOL escrow. Buyer creates and funds; seller submits a SHA-256 evidence hash; buyer approves; anyone can release to the recorded seller. Before approval either party can dispute, after which only the recorded arbitrator may refund the recorded buyer. There is no timeout refund and no AI authority. Experimental and not audited.

## Verified deployment

Program: [8DK8Z1Uz8Nv3KTvVE7kxrm79mijQEL2nC5CAacPHgJ4Z on Devnet](https://explorer.solana.com/address/8DK8Z1Uz8Nv3KTvVE7kxrm79mijQEL2nC5CAacPHgJ4Z?cluster=devnet). The program account is executable. The [deployment transaction](https://explorer.solana.com/tx/4VtsgZ7cvJeReCQ1Fshs6KW1z7Qxgut3s2LLBnvgmaaWAB16wE4aotWC6yasBXKy44rvZkrkcjyhmi3edFpF9dXt?cluster=devnet) is finalized with no error; its logs identify this program. The deployed program bytes match the local compiled `.so`. The transactions below were checked against Devnet signature statuses.

## Verified Devnet lifecycle

The original [run evidence](evidence/devnet-lifecycle-1794018466146.json) is preserved. The [RPC verification](evidence/devnet-lifecycle-1794018466146-rpc-verification.json) confirms all signatures finalized, including the previously pending double refund. Rejections are expected program errors; this verifies the transactions, not a browser walkthrough.

| Step | Finalized result | Devnet Explorer |
| --- | --- | --- |
| initialize seller | Succeeded | [3nDv8GZAzUFj…](https://explorer.solana.com/tx/3nDv8GZAzUFjpFfwudRC7aCVhm3hJzUQSpYSm4uezAGZhALLGeE7dWQCKeETYWbiaCtPUDg2Y7FpmN1WDcN6Ktyt?cluster=devnet) |
| initialize arbitrator | Succeeded | [2ahaAq7wpfjg…](https://explorer.solana.com/tx/2ahaAq7wpfjgEZNkPRENzQEARxmMiiMQbSzGVdAYe42WWzPRNECALaPveTpA76gHCZt1SC3LTXA996v6LxrQ8y8e?cluster=devnet) |
| initialize stranger | Succeeded | [4MMsW2AsZthu…](https://explorer.solana.com/tx/4MMsW2AsZthuRwsoZqS6VmtMLi6b55GRUjCWUM8QaJg2znymn8JKUXxhqux4hbUQjDPKBMpc1DqY63DcV9J8TUAS?cluster=devnet) |
| release flow create | Succeeded | [2CimghxLtJit…](https://explorer.solana.com/tx/2CimghxLtJitwtXKB2dMNPS8hKkTSjRr7mSopDc9sd3Ny1ZwxfWtQh5LxftSHdMmBfHHe1HrA5QKV5UchJNchT7r?cluster=devnet) |
| fund | Succeeded | [4j9daABaCriL…](https://explorer.solana.com/tx/4j9daABaCriL9pbiSLor1kqakg2NhYxgWTC4a7fgM2163Syk9E9t42fy5HHZSeuSh1UmpyF7zvFHcvnVtMFoTeot?cluster=devnet) |
| unauthorized approval | Rejected, custom 2001 | [dK2b888xVx9w…](https://explorer.solana.com/tx/dK2b888xVx9wd9awMHSnQVqDW6aGv1dfFbjAzzYapeKcwiqTRFAXufy7i3ce4VanxsAdrQDeaqQKpqMj2Sx7w6H?cluster=devnet) |
| submit evidence | Succeeded | [A7sx9TNrQhni…](https://explorer.solana.com/tx/A7sx9TNrQhniJSjM6nPGzBEqNPjXuRn79ddhWQHjE6qQpykxnqmAQXqZ7RbLgPYteFHeUra5PsCEPX97eXQs4s6?cluster=devnet) |
| approve | Succeeded | [4PSfWaiGhbHS…](https://explorer.solana.com/tx/4PSfWaiGhbHSy9XCgEMqvfE9xc7r8HS4W1ncoZXSXr4hoWy1BzLzmnCdDnsXTPNqUMrGY2DAQney3HnEnhymbGdt?cluster=devnet) |
| invalid recipient | Rejected, custom 2001 | [2rL1MLMDm3x8…](https://explorer.solana.com/tx/2rL1MLMDm3x8xn82kernsUe2JydRtFHX6C7rFSUHLEbAMDFPGDqPUf94V6p3wQVpB8Un4XxnhU6rrsYpVZaL2L7D?cluster=devnet) |
| release | Succeeded | [2v5PD3eYrU8i…](https://explorer.solana.com/tx/2v5PD3eYrU8i2sEinL7CYSsu26w38mrYuWQXdHuJqHCYHG5g62NudxYD362G3R6u7LCmZKAk1T6ATJ8Nb9NPqzvA?cluster=devnet) |
| double release | Rejected, custom 6003 | [3S5RXm5AueVp…](https://explorer.solana.com/tx/3S5RXm5AueVpy6vmJxaLLqdY5T71Cib1pUbiCMpPHd3Ym9QjmvCNAAPBUBUvQvzcUnF6gNpMyiiuThzfAPEygTRz?cluster=devnet) |
| refund flow create | Succeeded | [5YY1EdPohf9t…](https://explorer.solana.com/tx/5YY1EdPohf9tpjfXCZuJzmopFVjYBgh9nq1RoAte48Bqy9wRzyJnNTtBiQBPnGxG5Vw7MRsFExFFHXNDq6RSCcep?cluster=devnet) |
| fund refund flow | Succeeded | [3DXwfBCDRtG2…](https://explorer.solana.com/tx/3DXwfBCDRtG2ECg6e9nFN9n4MkDiL9h4T4VQ4u873FodNbTyFCEjga2auUC2SWN6nXma1pyhbLeiuXXM3YqXnTbA?cluster=devnet) |
| dispute | Succeeded | [5nbqcm73Wb8S…](https://explorer.solana.com/tx/5nbqcm73Wb8SxB8vFQDcGaWgy3TT3rYUx8yhVPWyihK9qkwpAg27K2CTa1Py9g5xgh7DymQzsA489Q3sAKT7Ygmb?cluster=devnet) |
| unauthorized refund | Rejected, custom 2001 | [6552Qh3x5VdW…](https://explorer.solana.com/tx/6552Qh3x5VdWcgEmZB5TSSJ9HgDLuXkQ9E2Ua3Jx8DoCrorgR9Z1QZ5HTkD8J3ft4QiMe7kMVTFDSiKr6ys8D347?cluster=devnet) |
| refund | Succeeded | [hDXjVABnJwfd…](https://explorer.solana.com/tx/hDXjVABnJwfdN8RWJekQU3BPJZw8jteVP3MFsCfF62iNLToPnn9eRZFvLFQtSfAig7QZ1zAFVkaw3qMKn1MDpJn?cluster=devnet) |
| double refund | Rejected, custom 6003 | [4BXz74N66WqR…](https://explorer.solana.com/tx/4BXz74N66WqRxn5wPiLhQpjELk55tJzaqpEMP5Nnmzu56Li13h5Qqbpk48SvzPRDQybS7AV7o6256AKh93ZyVdxT?cluster=devnet) |

## Run the app

```bash
cd ~/trustflow-commerce/trustflow-devnet
npm install
npm run dev
```

Open `http://localhost:3000/`. The client defaults to the deployed ID, uses the public Devnet RPC and checks the Devnet genesis hash before signing and sending. Connect Phantom and use three distinct existing Devnet system-account wallets for buyer, seller, and arbitrator. Create and fund an escrow with the buyer; load its address as seller and submit a file hash; load it as buyer and approve; then release. Each transaction requests a wallet signature. Explorer links appear after confirmation. The browser hashes the file locally; exchange and retain the file separately. The hash does not prove quality or ownership. Alternative flow: either party disputes after funding, then the arbitrator refunds. An unavailable arbitrator can leave a disputed escrow stuck. Rent and unsolicited extra lamports remain in the account after settlement.

The wallet may add one compute-unit price instruction; the client caps it at 50,000 micro-lamports per unit (at most 10,000 lamports, or 0.00001 Devnet SOL, for the fixed 200,000-unit limit), in addition to the base transaction fee. All original transaction instructions, account privileges, payer, and blockhash must remain unchanged.

The UI is connected to the configured program rather than a mock; its browser lifecycle has not been verified yet. Historical examples are explicitly labelled and do not initiate transactions. There is no AI service. Never share wallet secrets, use mainnet, or use real funds.

## Judge walkthrough and hosting

The app is a static Next.js export. `vercel.json` directs Vercel to build it and serve `out/`; no server, VPS, server-side wallet, or running laptop is needed after deployment. `.vercelignore` excludes `target/`, which may contain a program keypair. The public Devnet RPC is shared and may rate-limit requests. The configured public program ID is embedded at build time; use the existing default or set `NEXT_PUBLIC_ESCROW_PROGRAM_ID` to the same deployed ID.

1. Open the public deployment and enable Devnet in Phantom. Create three distinct funded Devnet accounts or coordinate with two other people. Public wallet addresses are safe to share; never share seed phrases.
2. Connect the buyer, enter the seller and arbitrator addresses, create the escrow and fund it. Save or share the escrow link.
3. Switch to the seller in Phantom, load the escrow, select an evidence file, and submit its hash. Switch to the buyer to approve. A connected wallet can then release to the recorded seller.
4. To try the dispute path, create and fund a separate escrow. The buyer or seller disputes; switch to the named arbitrator to refund the buyer. The contract has no timeout refund or seller-favoring dispute resolution, so an uncooperative arbitrator can leave a dispute unresolved.
5. For each transaction, approve the wallet prompt and wait for confirmation. If status is unknown, use **Check status** or Explorer before retrying. The site records the signature in the current page; save Explorer links externally if needed.

The historical links demonstrate finalized chain transactions from a prior script run, not the current browser session. A real browser walkthrough with Phantom remains a submission check and must not be claimed complete until each role signs and its Explorer transaction confirms.

## Test and generate IDL in normal WSL

Run these commands where networking and the Cargo cache are available. A new lifecycle run sends new Devnet transactions; the existing evidence does not require a rerun. The IDL command uses the installed Anchor binary directly and the installed stable toolchain, avoiding AVM installation or Solana version switching:

```bash
cd ~/trustflow-commerce/trustflow-devnet
mkdir -p target/idl
RUSTUP_TOOLCHAIN=stable ~/.avm/bin/anchor-0.31.1 idl build -o target/idl/trustflow_escrow.json
npm run build
npm run test:client
npm run test:checks
node scripts/devnet-lifecycle.mjs
```

The Devnet test reads `~/.config/solana/id.json` (or `TRUSTFLOW_WALLET`) without printing its contents. It uses the wallet as buyer and fee payer, creates three ephemeral test parties, and transfers 0.001 Devnet SOL to each. Two escrows use 0.0001 Devnet SOL each; account rent and transaction fees are additional. Generated party keys exist only in memory. The test checks the genesis hash before sending; records each signature before broadcast in a timestamped `evidence/devnet-lifecycle-*.json`; checks state and escrow balances; and verifies the exact error codes for unauthorized approval/refund, incorrect recipient and repeated settlement after first simulating the expected program error. It polls transaction status over HTTP with bounded 429 retries. Inspect the report and Explorer links before claiming a successful flow. A partial report is not a passing test.

Local-validator tests are separate: follow `tests/escrow.integration.test.mjs` setup and use only `http://127.0.0.1:8899`. Rule-only Rust tests can run with `rustc --edition=2021 --test programs/trustflow_escrow/src/rules.rs -o /tmp/trustflow-rules-test && /tmp/trustflow-rules-test`.

## Remaining submission tasks

Demonstrate the browser flow with wallet prompts, capture a demo video, and publish the configured frontend on a free-tier host. The historical run stopped during confirmation of the final expected rejection; its final signature was subsequently verified by RPC, but the original run never recorded a PASS. Independently review the program and dispute model; do not describe this MVP as audited.
