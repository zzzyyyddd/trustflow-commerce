// Actual program integration tests. Run only against an explicitly selected local validator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
const url = process.env.TRUSTFLOW_TEST_RPC;
const enabled = url === 'http://127.0.0.1:8899' && !!process.env.TRUSTFLOW_PROGRAM_ID;
if (!enabled) { console.error('Integration tests require TRUSTFLOW_TEST_RPC=http://127.0.0.1:8899 and TRUSTFLOW_PROGRAM_ID; no tests executed.'); process.exit(1); }
const connection = new Connection(url, 'confirmed');
const program = new PublicKey(process.env.TRUSTFLOW_PROGRAM_ID);
const discriminator = name => createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const meta = (pubkey, isSigner = false, isWritable = false) => ({ pubkey, isSigner, isWritable });
const instruction = (name, keys, args = Buffer.alloc(0)) => new TransactionInstruction({ programId: program, keys, data: Buffer.concat([discriminator(name), args]) });
const send = (ix, ...signers) => sendAndConfirmTransaction(connection, new Transaction().add(ix), signers, { commitment: 'confirmed' });
async function setup() {
  const buyer = Keypair.generate(), seller = Keypair.generate(), arb = Keypair.generate(), stranger = Keypair.generate();
  const sig = await connection.requestAirdrop(buyer.publicKey, 2_000_000_000); await connection.confirmTransaction(sig, 'confirmed');
  await send(SystemProgram.transfer({ fromPubkey: buyer.publicKey, toPubkey: seller.publicKey, lamports: 10_000_000 }), buyer);
  await send(SystemProgram.transfer({ fromPubkey: buyer.publicKey, toPubkey: arb.publicKey, lamports: 10_000_000 }), buyer);
  await send(SystemProgram.transfer({ fromPubkey: buyer.publicKey, toPubkey: stranger.publicKey, lamports: 10_000_000 }), buyer);
  const id = randomBytes(8), amount = 20_000_000n;
  const [escrow] = PublicKey.findProgramAddressSync([Buffer.from('escrow'), buyer.publicKey.toBuffer(), id], program);
  const ix = instruction('create_escrow', [meta(buyer.publicKey, true, true), meta(seller.publicKey), meta(arb.publicKey), meta(escrow, false, true), meta(SystemProgram.programId)], Buffer.concat([id, u64(amount)]));
  await send(ix, buyer);
  const fund = () => send(instruction('fund', [meta(escrow, false, true), meta(buyer.publicKey, true, true), meta(SystemProgram.programId)]), buyer);
  const submit = (who = seller) => send(instruction('submit_evidence', [meta(escrow, false, true), meta(who.publicKey, true)], Buffer.alloc(32, 9)), who);
  const approve = (who = buyer) => send(instruction('approve', [meta(escrow, false, true), meta(who.publicKey, true)]), who);
  const release = (recipient = seller.publicKey) => send(instruction('release', [meta(escrow, false, true), meta(recipient, false, true)]), stranger);
  const dispute = (who = buyer) => send(instruction('dispute', [meta(escrow, false, true), meta(who.publicKey, true)]), who);
  const refund = (who = arb, recipient = buyer.publicKey) => send(instruction('refund', [meta(escrow, false, true), meta(recipient, false, true), meta(who.publicKey, true)]), who);
  const status = async () => (await connection.getAccountInfo(escrow)).data[152];
  return { buyer, seller, arb, stranger, escrow, fund, submit, approve, release, dispute, refund, status, amount };
}
test('buyer approval gates seller-bound release and prevents a second settlement', async () => {
  const e = await setup(); await e.fund();
  await assert.rejects(e.release()); await assert.rejects(e.approve()); await assert.rejects(e.submit(e.stranger));
  await e.submit(); await assert.rejects(e.approve(e.stranger)); await e.approve();
  await assert.rejects(e.release(e.stranger.publicKey));
  const before = await connection.getBalance(e.seller.publicKey); await e.release();
  assert.equal(await connection.getBalance(e.seller.publicKey), before + Number(e.amount));
  assert.equal(await e.status(), 4); await assert.rejects(e.release()); await assert.rejects(e.refund());
});
test('only the named arbitrator can refund a disputed escrow to its buyer', async () => {
  const e = await setup(); await e.fund();
  await assert.rejects(e.refund()); await assert.rejects(e.dispute(e.stranger));
  await e.dispute(); await assert.rejects(e.refund(e.stranger)); await assert.rejects(e.refund(e.arb, e.stranger.publicKey));
  const before = await connection.getBalance(e.buyer.publicKey); await e.refund();
  assert.equal(await connection.getBalance(e.buyer.publicKey), before + Number(e.amount));
  assert.equal(await e.status(), 6); await assert.rejects(e.refund()); await assert.rejects(e.release());
});
