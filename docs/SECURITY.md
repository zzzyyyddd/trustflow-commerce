# Security model and limitations

TrustFlow is an experimental, unaudited Solana Devnet project. This document describes the checked-in program and client; it is not an independent review or a guarantee of safety. Never use real funds.

## Authority and state transitions

| Action | Authority and condition | Effect |
| --- | --- | --- |
| Create | Buyer signs and pays account rent; buyer, seller, and arbitrator must be distinct; amount must be nonzero. Seller and arbitrator are supplied as system accounts. | Initializes a program-owned escrow PDA in `Created`. |
| Fund | Recorded buyer signs; state is `Created`. | Transfers the agreed lamports into escrow and moves to `Funded`. |
| Submit evidence | Recorded seller signs; state is `Funded`; hash is nonzero. | Stores 32 bytes and moves to `EvidenceSubmitted`. |
| Approve | Recorded buyer signs; state is `EvidenceSubmitted`. | Moves to `Approved`; the buyer cannot subsequently dispute. |
| Release | Anyone may submit; state is `Approved`; recipient must be the recorded seller. | Transfers the agreed amount to the seller and moves to `Released`. |
| Dispute | Recorded buyer or seller signs; state is `Funded` or `EvidenceSubmitted`. | Moves to `Disputed`, blocking approval and release. |
| Refund | Recorded arbitrator signs; state is `Disputed`; recipient must be the recorded buyer. | Transfers the agreed amount to the buyer and moves to `Refunded`. |

`Released` and `Refunded` are terminal in the checked-in state machine. State and lamport changes occur in one Solana transaction, so a failed instruction does not commit a partial settlement. Account constraints bind the signer and recipient to stored public keys. These design properties are tested but are not an audit.

## Trust and failure modes

- **The buyer judges the evidence.** The buyer can refuse to approve even if work was delivered. Approval is final in this state machine: a dispute cannot be opened afterward, and anyone can trigger the seller-bound release.
- **The arbitrator is trusted and can stall.** Once disputed, only the named arbitrator can authorize the buyer refund. The program has no dispute resolution that pays the seller, no replacement arbitrator, and no timeout refund. An unavailable or uncooperative arbitrator can leave funds locked.
- **A hash is not a delivery guarantee.** The browser computes SHA-256 for the chosen file, but the on-chain program only requires a nonzero 32-byte value; it does not verify that the bytes are a SHA-256 digest, that a file exists, or that work meets its terms. The parties must exchange and retain the file and review it separately. Hashes of guessable or sensitive material can leak information through guessing.
- **The PDA is not closed.** No cancellation or account-close instruction exists. The buyer pays account rent when creating the PDA; rent remains after settlement, as do unsolicited extra lamports. An unfunded `Created` escrow also has no cancellation path.
- **Upgrade authority matters.** The deployed program uses Solana’s upgradeable loader. A read-only Devnet check on 7 November 2026 found an upgrade authority present. It can change deployed behavior; this is not an immutable program. Recheck the current program data on Explorer before relying on that observation.
- **Keys and clients matter.** A compromised buyer, seller, or arbitrator key can exercise that party’s permissions. The UI checks the Devnet genesis hash, validates signed-message integrity, uses an explicit compute budget, and requires wallet signing; these client checks do not replace on-chain authorization or an audit.
- **Network and state can change.** The public Devnet RPC and faucet are rate-limited, confirmations can be delayed, and Devnet may reset. A submitted transaction may still land after a user disconnects. Check the signature and escrow before retrying an uncertain result.

No AI assessment is implemented or authorized to move funds. The project targets Devnet only; no mainnet deployment or production-security claim is documented. [Testing limits →](TESTING.md) · [Recorded evidence →](DEVNET_EVIDENCE.md)
