# Solana Devnet evidence

This page records **historical script-generated Devnet transactions**. It does not claim that the complete lifecycle was verified through the Phantom browser UI. On 7 November 2026, a read-only `getSignatureStatuses` query against `https://api.devnet.solana.com` at context slot 519615437 returned all 17 recorded signatures and the deployment signature as **finalized** with the expected results. The release and refund transaction details and both escrow accounts were also read from Devnet. No transaction was sent during this verification.

- **Demo:** [Watch the official video](https://youtu.be/jUbVeMdXkSc)
- **Program:** [8DK8Z1Uz8Nv3KTvVE7kxrm79mijQEL2nC5CAacPHgJ4Z](https://explorer.solana.com/address/8DK8Z1Uz8Nv3KTvVE7kxrm79mijQEL2nC5CAacPHgJ4Z?cluster=devnet)
- **Deployment:** [finalized transaction](https://explorer.solana.com/tx/4VtsgZ7cvJeReCQ1Fshs6KW1z7Qxgut3s2LLBnvgmaaWAB16wE4aotWC6yasBXKy44rvZkrkcjyhmi3edFpF9dXt?cluster=devnet)
- **Original run:** [JSON record](../evidence/devnet-lifecycle-1794018466146.json) · **Prior read-only verification:** [JSON snapshot](../evidence/devnet-lifecycle-1794018466146-rpc-verification.json)

The [browser screenshot gallery](../README.md#screenshots) shows interface states from separate browser escrows; it should not be read as a screenshot record of the script transactions below. In the browser, SHA-256 is computed locally: the selected file stays on the device, and only its hash is recorded on-chain.

The original script stopped while confirming the final double-refund rejection. Its last record therefore says `submitted` and has no overall PASS. Later read-only RPC checks confirmed that signature finalized with the expected error. The original record has not been rewritten.

## Release path

Browser captures: [create](screenshots/02-create-escrow.png) · [fund](screenshots/03-fund-escrow.png) · [submit evidence](screenshots/04-submit-evidence.png) · [approve](screenshots/05-approve-evidence.png) · [release](screenshots/06-release-to-seller.png).

The buyer created and funded the [release escrow](https://explorer.solana.com/address/CmVkARS3jdok39nRGmGfUYkBhzamcLeqw9Rx7CaZYdGL?cluster=devnet); the seller submitted evidence; the buyer approved; then release succeeded. The account’s stored milestone amount was 100,000 lamports (0.0001 Devnet SOL) and its state byte was `Released` when rechecked at finalized slot 519616079. The release transaction reduced the escrow by 100,000 lamports and increased the seller balance by 100,000 lamports.

| Step | Result | Slot | Transaction |
| --- | --- | --- | --- |
| release flow create | Succeeded | 519509406 | [2CimghxLtJit…](https://explorer.solana.com/tx/2CimghxLtJitwtXKB2dMNPS8hKkTSjRr7mSopDc9sd3Ny1ZwxfWtQh5LxftSHdMmBfHHe1HrA5QKV5UchJNchT7r?cluster=devnet) |
| fund | Succeeded | 519509410 | [4j9daABaCriL…](https://explorer.solana.com/tx/4j9daABaCriL9pbiSLor1kqakg2NhYxgWTC4a7fgM2163Syk9E9t42fy5HHZSeuSh1UmpyF7zvFHcvnVtMFoTeot?cluster=devnet) |
| submit evidence | Succeeded | 519509419 | [A7sx9TNrQhni…](https://explorer.solana.com/tx/A7sx9TNrQhniJSjM6nPGzBEqNPjXuRn79ddhWQHjE6qQpykxnqmAQXqZ7RbLgPYteFHeUra5PsCEPX97eXQs4s6?cluster=devnet) |
| approve | Succeeded | 519509422 | [4PSfWaiGhbHS…](https://explorer.solana.com/tx/4PSfWaiGhbHSy9XCgEMqvfE9xc7r8HS4W1ncoZXSXr4hoWy1BzLzmnCdDnsXTPNqUMrGY2DAQney3HnEnhymbGdt?cluster=devnet) |
| release | Succeeded | 519509454 | [2v5PD3eYrU8i…](https://explorer.solana.com/tx/2v5PD3eYrU8i2sEinL7CYSsu26w38mrYuWQXdHuJqHCYHG5g62NudxYD362G3R6u7LCmZKAk1T6ATJ8Nb9NPqzvA?cluster=devnet) |

## Dispute and refund path

Browser captures: [disputed](screenshots/07-disputed.png) · [refunded](screenshots/08-refunded.png).

This is a separate [refund escrow](https://explorer.solana.com/address/96xf2BKWdudapf2yjSfuE7QUQbk9NPKgYYcubsufVTW3?cluster=devnet). Its stored milestone amount was 100,000 lamports (0.0001 Devnet SOL) and its state byte was `Refunded` when rechecked at finalized slot 519616079. The refund transaction reduced the escrow by 100,000 lamports; the buyer’s net balance increased by 90,000 lamports after paying the 10,000-lamport transaction fee. The arbitrator authorized the refund; it was not a timeout refund.

| Step | Result | Slot | Transaction |
| --- | --- | --- | --- |
| refund flow create | Succeeded | 519509462 | [5YY1EdPohf9t…](https://explorer.solana.com/tx/5YY1EdPohf9tpjfXCZuJzmopFVjYBgh9nq1RoAte48Bqy9wRzyJnNTtBiQBPnGxG5Vw7MRsFExFFHXNDq6RSCcep?cluster=devnet) |
| fund refund flow | Succeeded | 519509466 | [3DXwfBCDRtG2…](https://explorer.solana.com/tx/3DXwfBCDRtG2ECg6e9nFN9n4MkDiL9h4T4VQ4u873FodNbTyFCEjga2auUC2SWN6nXma1pyhbLeiuXXM3YqXnTbA?cluster=devnet) |
| dispute | Succeeded | 519509473 | [5nbqcm73Wb8S…](https://explorer.solana.com/tx/5nbqcm73Wb8SxB8vFQDcGaWgy3TT3rYUx8yhVPWyihK9qkwpAg27K2CTa1Py9g5xgh7DymQzsA489Q3sAKT7Ygmb?cluster=devnet) |
| refund | Succeeded | 519509481 | [hDXjVABnJwfd…](https://explorer.solana.com/tx/hDXjVABnJwfdN8RWJekQU3BPJZw8jteVP3MFsCfF62iNLToPnn9eRZFvLFQtSfAig7QZ1zAFVkaw3qMKn1MDpJn?cluster=devnet) |

## Expected rejections

These transactions **failed as intended**; finalization means the failure was recorded, not that the operation succeeded. Custom 2001 is Anchor’s `has_one` constraint failure; custom 6003 is the program’s `InvalidState`.

| Step | Result | Slot | Transaction |
| --- | --- | --- | --- |
| unauthorized approval | Expected rejection · custom 2001 | 519509415 | [dK2b888xVx9w…](https://explorer.solana.com/tx/dK2b888xVx9wd9awMHSnQVqDW6aGv1dfFbjAzzYapeKcwiqTRFAXufy7i3ce4VanxsAdrQDeaqQKpqMj2Sx7w6H?cluster=devnet) |
| invalid recipient | Expected rejection · custom 2001 | 519509451 | [2rL1MLMDm3x8…](https://explorer.solana.com/tx/2rL1MLMDm3x8xn82kernsUe2JydRtFHX6C7rFSUHLEbAMDFPGDqPUf94V6p3wQVpB8Un4XxnhU6rrsYpVZaL2L7D?cluster=devnet) |
| double release | Expected rejection · custom 6003 | 519509459 | [3S5RXm5AueVp…](https://explorer.solana.com/tx/3S5RXm5AueVpy6vmJxaLLqdY5T71Cib1pUbiCMpPHd3Ym9QjmvCNAAPBUBUvQvzcUnF6gNpMyiiuThzfAPEygTRz?cluster=devnet) |
| unauthorized refund | Expected rejection · custom 2001 | 519509477 | [6552Qh3x5VdW…](https://explorer.solana.com/tx/6552Qh3x5VdWcgEmZB5TSSJ9HgDLuXkQ9E2Ua3Jx8DoCrorgR9Z1QZ5HTkD8J3ft4QiMe7kMVTFDSiKr6ys8D347?cluster=devnet) |
| double refund | Expected rejection · custom 6003 | 519509491 | [4BXz74N66WqR…](https://explorer.solana.com/tx/4BXz74N66WqRxn5wPiLhQpjELk55tJzaqpEMP5Nnmzu56Li13h5Qqbpk48SvzPRDQybS7AV7o6256AKh93ZyVdxT?cluster=devnet) |

## Test-party setup

These Devnet transfers initialized the disposable seller, arbitrator, and stranger accounts for the script run. They are setup transactions, not escrow settlement.

| Step | Result | Slot | Transaction |
| --- | --- | --- | --- |
| initialize seller | Succeeded | 519509395 | [3nDv8GZAzUFj…](https://explorer.solana.com/tx/3nDv8GZAzUFjpFfwudRC7aCVhm3hJzUQSpYSm4uezAGZhALLGeE7dWQCKeETYWbiaCtPUDg2Y7FpmN1WDcN6Ktyt?cluster=devnet) |
| initialize arbitrator | Succeeded | 519509398 | [2ahaAq7wpfjg…](https://explorer.solana.com/tx/2ahaAq7wpfjgEZNkPRENzQEARxmMiiMQbSzGVdAYe42WWzPRNECALaPveTpA76gHCZt1SC3LTXA996v6LxrQ8y8e?cluster=devnet) |
| initialize stranger | Succeeded | 519509402 | [4MMsW2AsZthu…](https://explorer.solana.com/tx/4MMsW2AsZthuRwsoZqS6VmtMLi6b55GRUjCWUM8QaJg2znymn8JKUXxhqux4hbUQjDPKBMpc1DqY63DcV9J8TUAS?cluster=devnet) |

## How to recheck

Open any transaction in Solana Explorer with `cluster=devnet`, confirm its status and error field, and inspect its account keys and program logs. To inspect a historical escrow in the app without a wallet, paste the account address into **Open a milestone** and select **Load escrow**. Devnet data and public RPC availability can change or reset. [Judge guide →](JUDGE_GUIDE.md) · [Security model →](SECURITY.md)
