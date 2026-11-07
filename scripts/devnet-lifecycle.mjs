// Devnet-only integration test. Uses the CLI wallet as buyer and fee payer.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { retryRateLimit, waitForSignature, assertResult, encodeBase58 } from './devnet-rpc.mjs';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
const rpc = new Connection('https://api.devnet.solana.com', {commitment: 'confirmed', disableRetryOnRateLimit: true});
const program = new PublicKey('8DK8Z1Uz8Nv3KTvVE7kxrm79mijQEL2nC5CAacPHgJ4Z');
const path = process.env.TRUSTFLOW_WALLET || `${homedir()}/.config/solana/id.json`;
const buyer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
const seller = Keypair.generate(), arbitrator = Keypair.generate(), stranger = Keypair.generate();
const report = { cluster: 'devnet', program: program.toBase58(), buyer: buyer.publicKey.toBase58(), started: new Date().toISOString(), transactions: [] };
const output = `evidence/devnet-lifecycle-${Date.now()}.json`;
const save = () => { mkdirSync('evidence', { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); };
const meta = (pubkey, isSigner = false, isWritable = false) => ({pubkey, isSigner, isWritable});
const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const ix = (name, keys, data = Buffer.alloc(0)) => new TransactionInstruction({programId: program, keys, data: Buffer.concat([createHash('sha256').update(`global:${name}`).digest().subarray(0,8), data])});
async function send(label, instruction, signers = [], expected = null) {
  const block = await retryRateLimit(() => rpc.getLatestBlockhash('confirmed'));
  const tx = new Transaction({feePayer: buyer.publicKey, recentBlockhash: block.blockhash}).add(instruction);
  tx.sign(buyer, ...signers);
  if (expected) {
    const simulation = await retryRateLimit(() => rpc.simulateTransaction(tx));
    assertResult(`${label} simulation`, simulation.value.err, expected.code);
    assert((simulation.value.logs || []).some(line => line.includes(expected.name)), `${label}: unexpected simulation logs`);
  }
  const signature = encodeBase58(tx.signature);
  const entry = {label, signature, explorer:`https://explorer.solana.com/tx/${signature}?cluster=devnet`, status: 'prepared', expectedCode: expected?.code ?? null};
  report.transactions.push(entry); save();
  const returned = await retryRateLimit(() => rpc.sendRawTransaction(tx.serialize(), {skipPreflight: !!expected}));
  assert.equal(returned, signature, `${label}: RPC returned a different signature`);
  entry.status = 'submitted'; save();
  const result = await waitForSignature(rpc, signature);
  entry.status = result.err ? 'rejected' : 'confirmed'; entry.error = result.err; save();
  assertResult(label, result.err, expected?.code ?? null);
  console.log(`${label}: ${signature} ${entry.status}`);
}
async function create(label) {
  const id = randomBytes(8), amount = 100000n;
  const [escrow] = PublicKey.findProgramAddressSync([Buffer.from('escrow'), buyer.publicKey.toBuffer(), id], program);
  await send(`${label} create`, ix('create_escrow',[meta(buyer.publicKey,true,true),meta(seller.publicKey),meta(arbitrator.publicKey),meta(escrow,false,true),meta(SystemProgram.programId)],Buffer.concat([id,u64(amount)])));
  return escrow;
}
const state = async (address, n) => { const a=await retryRateLimit(() => rpc.getAccountInfo(address,'confirmed')); assert(a && a.owner.equals(program)); assert.equal(a.data[152],n); };
const fund = e => ix('fund',[meta(e,false,true),meta(buyer.publicKey,true,true),meta(SystemProgram.programId)]);
const submit = e => ix('submit_evidence',[meta(e,false,true),meta(seller.publicKey,true)],createHash('sha256').update('TrustFlow Devnet demo evidence').digest());
const approve = (e, who=buyer.publicKey) => ix('approve',[meta(e,false,true),meta(who,true)]);
const release = (e, who=seller.publicKey) => ix('release',[meta(e,false,true),meta(who,false,true)]);
const dispute = e => ix('dispute',[meta(e,false,true),meta(buyer.publicKey,true)]);
const refund = (e, who=arbitrator.publicKey) => ix('refund',[meta(e,false,true),meta(buyer.publicKey,false,true),meta(who,true)]);
assert.equal(await retryRateLimit(() => rpc.getGenesisHash()),'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','Refusing non-Devnet RPC');
const account = await retryRateLimit(() => rpc.getAccountInfo(program)); assert(account?.executable,'Program is not deployed');
assert((await retryRateLimit(() => rpc.getBalance(buyer.publicKey))) > 10000000,'Devnet wallet needs at least 0.01 SOL');
save();
for (const [label, party] of [['seller',seller],['arbitrator',arbitrator],['stranger',stranger]]) await send(`initialize ${label}`,SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:party.publicKey,lamports:1000000}));
const a=await create('release flow'); await send('fund',fund(a)); await state(a,1);
await send('unauthorized approval',approve(a,stranger.publicKey),[stranger],{name:'ConstraintHasOne', code:2001});
await send('submit evidence',submit(a),[seller]); await state(a,2);
await send('approve',approve(a)); await state(a,3);
await send('invalid recipient',release(a,stranger.publicKey),[],{name:'ConstraintHasOne', code:2001});
const beforeRelease = await retryRateLimit(() => rpc.getBalance(a));
await send('release',release(a)); await state(a,4); assert.equal(beforeRelease - await retryRateLimit(() => rpc.getBalance(a)), 100000);
await send('double release',release(a),[],{name:'InvalidState', code:6003});
const b=await create('refund flow'); await send('fund refund flow',fund(b));
await send('dispute',dispute(b)); await state(b,5);
await send('unauthorized refund',refund(b,stranger.publicKey),[stranger],{name:'ConstraintHasOne', code:2001});
const beforeRefund = await retryRateLimit(() => rpc.getBalance(b));
await send('refund',refund(b),[arbitrator]); await state(b,6); assert.equal(beforeRefund - await retryRateLimit(() => rpc.getBalance(b)), 100000);
await send('double refund',refund(b),[arbitrator],{name:'InvalidState', code:6003});
report.completed = new Date().toISOString(); report.result = 'PASS'; save(); console.log(`PASS: all lifecycle assertions verified; evidence: ${output}`);
