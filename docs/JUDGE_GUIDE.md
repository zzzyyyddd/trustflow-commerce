# Judge guide

TrustFlow Commerce is a Devnet-only milestone escrow for digital work. A buyer funds SOL; a seller submits an evidence hash; the buyer approves release to the seller. Before approval, a dispute routes to an arbitrator who can refund the buyer. The program verifies roles and state, not off-chain delivery.

**[Watch the official demo video](https://youtu.be/jUbVeMdXkSc)**

## Two-minute read-only route

1. Open the [live app’s historical evidence](https://trustflow-commerce-six.vercel.app/#proof). It separates the happy path, a separate dispute/refund path, and expected rejection tests. These links do not send transactions.
2. Check the finalized [release transaction](https://explorer.solana.com/tx/2v5PD3eYrU8i2sEinL7CYSsu26w38mrYuWQXdHuJqHCYHG5g62NudxYD362G3R6u7LCmZKAk1T6ATJ8Nb9NPqzvA?cluster=devnet) and its [released escrow account](https://explorer.solana.com/address/CmVkARS3jdok39nRGmGfUYkBhzamcLeqw9Rx7CaZYdGL?cluster=devnet).
3. Check the separate finalized [arbitrator refund](https://explorer.solana.com/tx/hDXjVABnJwfdN8RWJekQU3BPJZw8jteVP3MFsCfF62iNLToPnn9eRZFvLFQtSfAig7QZ1zAFVkaw3qMKn1MDpJn?cluster=devnet) and [refunded escrow account](https://explorer.solana.com/address/96xf2BKWdudapf2yjSfuE7QUQbk9NPKgYYcubsufVTW3?cluster=devnet).
4. Check an [unauthorized approval rejected with custom error 2001](https://explorer.solana.com/tx/dK2b888xVx9wd9awMHSnQVqDW6aGv1dfFbjAzzYapeKcwiqTRFAXufy7i3ce4VanxsAdrQDeaqQKpqMj2Sx7w6H?cluster=devnet) and [double refund rejected with custom error 6003](https://explorer.solana.com/tx/4BXz74N66WqRxn5wPiLhQpjELk55tJzaqpEMP5Nnmzu56Li13h5Qqbpk48SvzPRDQybS7AV7o6256AKh93ZyVdxT?cluster=devnet). These are failed transactions by design.

The [screenshot gallery](../README.md#screenshots) shows browser interface states for [create](screenshots/02-create-escrow.png), [fund](screenshots/03-fund-escrow.png), [evidence](screenshots/04-submit-evidence.png), [approval](screenshots/05-approve-evidence.png), and [release](screenshots/06-release-to-seller.png), followed by a separate [dispute](screenshots/07-disputed.png) and [refund](screenshots/08-refunded.png). These screenshots are separate from the script-generated transactions linked above; use Explorer for their verified historical record.

Both accounts recorded 100,000 lamports (0.0001 Devnet SOL) as their milestone amount. At finalized slot 519616079 on 7 November 2026, their state bytes were `Released` and `Refunded`, respectively. [All signatures and provenance →](DEVNET_EVIDENCE.md)

## Optional: try the live browser flow

The complete Phantom browser lifecycle has **not yet been verified**. The following instructions are for an optional new Devnet test, not evidence that it already succeeded.

1. Enable Testnet Mode and select Solana Devnet in Phantom. Use three distinct wallet accounts you control or invite two people. Fund each with free Devnet SOL for fees using the [Solana faucet](https://faucet.solana.com/); the buyer also needs the milestone amount and account rent. The public RPC and faucet can be rate-limited.
2. Connect the **buyer** on the [live app](https://trustflow-commerce-six.vercel.app/). Enter the seller and arbitrator addresses, create an escrow, then fund it. Approve each transaction in Phantom. Save or copy the escrow link.
3. Switch to the **seller**, load the escrow, choose a file, and submit its hash. The browser computes SHA-256 locally; the file remains on your device and only its hash is recorded on-chain. Transfer the file separately to the buyer.
4. Switch to the **buyer**, review the evidence off-chain, and approve. Any connected wallet can trigger release, but the program pays the recorded seller. Verify the signature in Devnet Explorer.
5. For the alternate route, create and fund a **separate escrow**. The buyer or seller disputes it before approval. Switch to the named **arbitrator** and refund the buyer.

Check the displayed signature and escrow before retrying an unknown result. There is no timeout refund, no seller-favoring dispute resolution, and no recovery if the arbitrator is unavailable. Rent remains in settled escrow accounts. The program is upgradeable and unaudited. [Security model →](SECURITY.md)
