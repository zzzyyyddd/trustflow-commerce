// Local client tests: the RPC and wallet below are simulated. No transaction is broadcast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { createInstruction, actionInstruction, connection, lamports, programId, send } from '../lib/escrow.ts';
import idl from '../target/idl/trustflow_escrow.json' with { type: 'json' };
const buyer = Keypair.generate(), seller = Keypair.generate(), arbitrator = Keypair.generate();
const lookup = name => idl.instructions.find(i => i.name === name);

test('create and action instructions match the IDL account order, flags and discriminators', async () => {
  const {address, instruction} = await createInstruction(buyer.publicKey, seller.publicKey, arbitrator.publicKey, 42n, lamports('0.001'));
  assert.equal(programId().toBase58(), idl.address);
  const escrow = {address, buyer:buyer.publicKey, seller:seller.publicKey, arbitrator:arbitrator.publicKey, amount:1000000n, evidence:'', status:0, id:42n};
  const actions = ['fund','submit_evidence','approve','release','dispute','refund'];
  const check = (ix, spec) => {
    assert.deepEqual([...ix.data.subarray(0, 8)], spec.discriminator);
    assert.deepEqual(ix.keys.map(k => [k.isSigner,k.isWritable]), spec.accounts.map(a => [!!a.signer,!!a.writable]));
  };
  check(instruction, lookup('create_escrow'));
  assert.equal(instruction.data.readBigUInt64LE(8),42n); assert.equal(instruction.data.readBigUInt64LE(16),1000000n);
  for (const name of actions) {
    const actor = name === 'submit_evidence' ? seller.publicKey : name === 'refund' ? arbitrator.publicKey : buyer.publicKey;
    const ix = await actionInstruction(name, escrow, actor, name === 'submit_evidence' ? new Uint8Array(32).fill(5) : undefined);
    check(ix, lookup(name));
    if (name === 'release') assert(ix.keys[1].pubkey.equals(seller.publicKey));
    if (name === 'refund') assert(ix.keys[1].pubkey.equals(buyer.publicKey));
  }
  await assert.rejects(createInstruction(buyer.publicKey,buyer.publicKey,arbitrator.publicKey,1n,1n), /different wallets/);
  assert.throws(() => lamports('0')); assert.throws(() => lamports('0.0000000001'));
});

test('client retains signed signature and distinguishes confirmed, failed and unknown outcomes', async () => {
  const original = Object.fromEntries(['getGenesisHash','getLatestBlockhash','sendRawTransaction','getSignatureStatuses'].map(k => [k, connection[k]]));
  const restore = () => { for (const [name, value] of Object.entries(original)) connection[name] = value; };
  const updates = [];
  try {
    connection.getGenesisHash = async () => 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    connection.getLatestBlockhash = async () => ({blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight:100});
    connection.sendRawTransaction = async () => updates.at(-1).signature;
    connection.getSignatureStatuses = async () => ({value:[{confirmationStatus:'confirmed',err:null}]});
    const wallet = {publicKey:buyer.publicKey, signTransaction:async tx => {tx.partialSign(buyer);return tx;}};
    const instruction = SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:seller.publicKey,lamports:1});
    const sig = await send(wallet, instruction, u => updates.push(u));
    assert.deepEqual(updates.map(u=>u.status), ['awaiting-wallet','submitting','pending','confirmed']);
    assert.equal(updates.at(-1).signature, sig);
    updates.length=0;
    connection.getSignatureStatuses = async () => ({value:[{confirmationStatus:'confirmed',err:{InstructionError:[0,{Custom:6003}]}}]});
    await assert.rejects(send(wallet, instruction, u => updates.push(u)), /Transaction failed/);
    assert.equal(updates.at(-1).status, 'failed'); assert(updates.at(-1).signature);
    updates.length=0; connection.sendRawTransaction = async () => {throw Error('network failure');};
    await assert.rejects(send(wallet, instruction, u => updates.push(u)), /network failure/);
    assert.equal(updates.at(-1).status,'unknown'); assert(updates.at(-1).signature);
    updates.length=0; let broadcast=false; connection.sendRawTransaction = async () => {broadcast=true; return '';};
    await assert.rejects(send({publicKey:buyer.publicKey, signTransaction:async tx => {tx.add(new TransactionInstruction({programId:SystemProgram.programId,keys:[],data:Buffer.alloc(0)}));tx.partialSign(buyer);return tx;}}, instruction, u => updates.push(u)), /wallet changed/);
    assert.equal(broadcast,false);
    connection.getGenesisHash = async () => 'mainnet';
    await assert.rejects(send(wallet, instruction, u => updates.push(u)), /not Solana Devnet/);
  } finally { restore(); }
});
