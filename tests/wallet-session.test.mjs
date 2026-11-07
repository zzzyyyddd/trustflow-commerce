// Local tests use disposable signers and a stub RPC. No transaction is broadcast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, SystemProgram } from '@solana/web3.js';
import { WalletSession } from '../lib/wallet-session.ts';
import { connection, send } from '../lib/escrow.ts';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
const provider = key => ({publicKey:key.publicKey, disconnectCalls:0, async disconnect(){this.disconnectCalls++;this.publicKey=null;}});

test('disconnect calls the provider and invalidates old work before it resolves', async () => {
  const gate = new WalletSession(), key=Keypair.generate(), wallet=provider(key), pending=deferred();
  wallet.disconnect=async function(){this.disconnectCalls++; await pending.promise; this.publicKey=null;};
  gate.attach(wallet,key.publicKey.toBase58());
  const previous=gate.capture(); const done=gate.disconnect();
  assert.equal(gate.isCurrent(previous),false); assert.equal(gate.matches(previous,wallet,key.publicKey.toBase58()),false);
  await Promise.resolve(); assert.equal(wallet.disconnectCalls,1);
  pending.resolve(); await done;
  gate.attach(wallet,key.publicKey.toBase58()); wallet.publicKey=key.publicKey;
  assert(gate.matches(gate.capture(),wallet,key.publicKey.toBase58()));
  assert.equal(gate.isCurrent(previous),false);
});

test('account switches invalidate callbacks and delayed events from other providers', () => {
  const gate=new WalletSession(), a=Keypair.generate(), b=Keypair.generate(), wallet=provider(a), other=provider(b);
  gate.attach(wallet,a.publicKey.toBase58());const old=gate.capture();wallet.publicKey=b.publicKey;
  assert.equal(gate.isCurrent(old),false); // identity changes are detected even before the event
  assert(gate.switchAccount(wallet,b.publicKey.toBase58()));const current=gate.capture();
  assert(gate.matches(current,wallet,b.publicKey.toBase58()));assert.equal(gate.isCurrent(old),false);
  assert.equal(gate.switchAccount(other,a.publicKey.toBase58()),false);
  assert.equal(gate.clear(other),false);assert(gate.isCurrent(current));
  assert(gate.switchAccount(wallet,''));assert.equal(gate.isCurrent(current),false);
});

for (const change of ['disconnect','account switch']) test(`${change} while a wallet prompt is pending prevents broadcast`, async () => {
  const buyer=Keypair.generate(), next=Keypair.generate(), gate=new WalletSession(), wallet=provider(buyer);
  const deferredSignature=deferred(), asked=deferred(), updates=[];let sent=0;
  const names=['getGenesisHash','getLatestBlockhashAndContext','getBlockHeight','sendRawTransaction'];
  const original=Object.fromEntries(names.map(k=>[k,connection[k]]));
  try {
    connection.getGenesisHash=async()=> 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    connection.getLatestBlockhashAndContext=async()=>({context:{slot:1},value:{blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}});
    connection.getBlockHeight=async()=>90;connection.sendRawTransaction=async()=>{sent++;return '';};
    wallet.signTransaction=async tx=>{asked.resolve();await deferredSignature.promise;tx.partialSign(buyer);return tx;};
    gate.attach(wallet,buyer.publicKey.toBase58());const revision=gate.capture();
    const current=()=>gate.matches(revision,wallet,buyer.publicKey.toBase58());
    const task=send(wallet,SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:next.publicKey,lamports:1}),v=>{if(current())updates.push(v);},current);
    await asked.promise;assert.equal(updates.at(-1).status,'awaiting-wallet');
    if(change==='disconnect') await gate.disconnect(); else {wallet.publicKey=next.publicKey;gate.switchAccount(wallet,next.publicKey.toBase58());}
    const count=updates.length;deferredSignature.resolve();
    await assert.rejects(task,/Wallet session changed/);assert.equal(sent,0);assert.equal(updates.length,count);
  } finally {for(const [name,value] of Object.entries(original))connection[name]=value;}
});

test('a late disconnect completion cannot invalidate a new session', async () => {
  const gate=new WalletSession(), first=Keypair.generate(), second=Keypair.generate(), wallet=provider(first), next=provider(second), pending=deferred();
  wallet.disconnect=async()=>pending.promise;gate.attach(wallet,first.publicKey.toBase58());
  const old=gate.capture(), disconnecting=gate.disconnect();gate.attach(next,second.publicKey.toBase58());const current=gate.capture();
  pending.resolve();await disconnecting;
  assert.equal(gate.isCurrent(old),false);assert(gate.matches(current,next,second.publicKey.toBase58()));
});

test('disconnect during block-height lookup prevents submission after the response arrives', async () => {
  const buyer=Keypair.generate(), seller=Keypair.generate(), gate=new WalletSession(), wallet=provider(buyer), checking=deferred(), started=deferred(), updates=[];
  const names=['getGenesisHash','getLatestBlockhashAndContext','getBlockHeight','sendRawTransaction'];
  const original=Object.fromEntries(names.map(k=>[k,connection[k]]));let sent=0;
  try {
    connection.getGenesisHash=async()=> 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    connection.getLatestBlockhashAndContext=async()=>({context:{slot:1},value:{blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}});
    connection.getBlockHeight=async()=>{started.resolve();await checking.promise;return 90;};
    connection.sendRawTransaction=async()=>{sent++;return '';};
    wallet.signTransaction=async tx=>{tx.partialSign(buyer);return tx;};gate.attach(wallet,buyer.publicKey.toBase58());const revision=gate.capture();
    const current=()=>gate.matches(revision,wallet,buyer.publicKey.toBase58());
    const task=send(wallet,SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:seller.publicKey,lamports:1}),v=>{if(current())updates.push(v);},current);
    await started.promise;await gate.disconnect();const count=updates.length;checking.resolve();
    await assert.rejects(task,/Wallet session changed/);assert.equal(sent,0);assert.equal(updates.length,count);
  } finally {for(const [name,value] of Object.entries(original))connection[name]=value;}
});

test('disconnect after submission suppresses late confirmation updates', async () => {
  const buyer=Keypair.generate(), seller=Keypair.generate(), gate=new WalletSession(), wallet=provider(buyer), submitting=deferred(), started=deferred(), updates=[];
  const names=['getGenesisHash','getLatestBlockhashAndContext','getBlockHeight','sendRawTransaction','getSignatureStatuses'];
  const original=Object.fromEntries(names.map(k=>[k,connection[k]]));let statuses=0;
  try {
    connection.getGenesisHash=async()=> 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    connection.getLatestBlockhashAndContext=async()=>({context:{slot:1},value:{blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}});
    connection.getBlockHeight=async()=>90;
    connection.sendRawTransaction=async()=>{started.resolve();await submitting.promise;return updates.at(-1).signature;};
    connection.getSignatureStatuses=async()=>{statuses++;return {value:[{confirmationStatus:'confirmed',err:null}]};};
    wallet.signTransaction=async tx=>{tx.partialSign(buyer);return tx;};gate.attach(wallet,buyer.publicKey.toBase58());const revision=gate.capture();
    const current=()=>gate.matches(revision,wallet,buyer.publicKey.toBase58());
    const task=send(wallet,SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:seller.publicKey,lamports:1}),v=>{if(current())updates.push(v);},current);
    await started.promise;assert.equal(updates.at(-1).status,'submitting');await gate.disconnect();const count=updates.length;submitting.resolve();
    await assert.rejects(task,/Wallet session changed/);assert.equal(statuses,0);assert.equal(updates.length,count);
  } finally {for(const [name,value] of Object.entries(original))connection[name]=value;}
});

test('a provider disconnect failure still clears the app session', async () => {
  const gate=new WalletSession(), key=Keypair.generate(), wallet=provider(key);
  wallet.disconnect=async()=>{throw new Error('provider unavailable');};gate.attach(wallet,key.publicKey.toBase58());const old=gate.capture();
  await assert.rejects(gate.disconnect(),/provider unavailable/);
  assert.equal(gate.isCurrent(old),false);assert.equal(gate.matches(old,wallet,key.publicKey.toBase58()),false);
});
