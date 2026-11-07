// Local simulated messages only; this is not a real Phantom response.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ComputeBudgetProgram, Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { compareTransactionMessages } from '../lib/transaction-diagnostics.ts';
const buyer = Keypair.generate(), seller = Keypair.generate(), other = Keypair.generate();
const blockhash = Keypair.generate().publicKey.toBase58();
function transaction() {
  return new Transaction({feePayer:buyer.publicKey,recentBlockhash:blockhash}).add(
    ComputeBudgetProgram.setComputeUnitLimit({units:200000}),
    SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:seller.publicKey,lamports:1}),
  );
}
const message = tx => Buffer.from(tx.serializeMessage());

test('diagnostic accepts a valid signed clone with the same message', () => {
  const original = transaction();
  const before = message(original);
  const clone = Transaction.from(original.serialize({requireAllSignatures:false,verifySignatures:false}));
  clone.partialSign(buyer);
  const report = compareTransactionMessages(before, message(clone));
  assert.equal(report.originalVersion,'legacy'); assert.equal(report.returnedVersion,'legacy');
  assert.equal(report.serializedMessageEqual,true); assert.equal(report.feePayerEqual,true);
  assert.equal(report.recentBlockhashEqual,true); assert.equal(report.instructionCountOriginal,2);
  assert.equal(report.computeBudgetCountOriginal,1); assert.equal(report.computeBudgetCountReturned,1);
  assert(report.instructions.every(ix => ix.present && ix.programEqual && ix.dataEqual));
  assert(!JSON.stringify(report).includes(buyer.publicKey.toBase58()));
  assert(!JSON.stringify(report).includes(seller.publicKey.toBase58()));
  assert(!JSON.stringify(report).includes(blockhash));
  assert(!JSON.stringify(report).includes(clone.signature.toString('base64')));
});

test('diagnostic isolates changed compute budget, recipient, permissions, data and payer', () => {
  const original = transaction(), before = message(original);
  const cases = [
    [tx => tx.add(ComputeBudgetProgram.setComputeUnitPrice({microLamports:1})), r => {assert.equal(r.instructionCountReturned,3); assert.equal(r.computeBudgetCountReturned,2);} ],
    [tx => {tx.instructions[1].keys[1].pubkey = other.publicKey;}, r => assert.equal(r.instructions[1].accounts[1].addressEqual,false)],
    [tx => {tx.instructions[1].keys[1].isWritable = false;}, r => assert.equal(r.instructions[1].accounts[1].writableEqual,false)],
    [tx => {tx.instructions[1].data[4] ^= 1;}, r => assert.equal(r.instructions[1].dataEqual,false)],
    [tx => {tx.feePayer = other.publicKey;}, r => assert.equal(r.feePayerEqual,false)],
    [tx => {tx.recentBlockhash = other.publicKey.toBase58();}, r => assert.equal(r.recentBlockhashEqual,false)],
    [tx => {tx.instructions.reverse();}, r => assert.equal(r.instructions[0].programEqual,false)],
  ];
  for (const [mutate, verify] of cases) {
    const tx = transaction(); mutate(tx);
    const report = compareTransactionMessages(before,message(tx));
    assert.equal(report.serializedMessageEqual,false); verify(report);
  }
});
