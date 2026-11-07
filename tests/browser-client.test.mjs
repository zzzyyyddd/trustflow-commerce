// Local client tests: the RPC and wallet below are simulated. No transaction is broadcast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { createInstruction, actionInstruction, checkWalletMessage, connection, lamports, programId, send } from '../lib/escrow.ts';
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
  const original = Object.fromEntries(['getGenesisHash','getLatestBlockhashAndContext','getBlockHeight','sendRawTransaction','getSignatureStatuses'].map(k => [k, connection[k]]));
  const restore = () => { for (const [name, value] of Object.entries(original)) connection[name] = value; };
  const updates = [];
  try {
    connection.getGenesisHash = async () => 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    connection.getLatestBlockhashAndContext = async () => ({context:{slot:55},value:{blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight:100}});
    connection.getBlockHeight = async () => 90;
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

test('a simulated wallet-added fee instruction changes the signed message', async () => {
  const { ComputeBudgetProgram, Transaction } = await import('@solana/web3.js');
  const blockhash = Keypair.generate().publicKey.toBase58();
  const ix = SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:seller.publicKey,lamports:1});
  const old = new Transaction({feePayer:buyer.publicKey,recentBlockhash:blockhash}).add(ix);
  const original = Buffer.from(old.serializeMessage());
  // Model the documented wallet behavior, not a real Phantom browser session.
  const walletCopy = Transaction.from(old.serialize({requireAllSignatures:false,verifySignatures:false}));
  walletCopy.add(ComputeBudgetProgram.setComputeUnitPrice({microLamports:1}));
  walletCopy.partialSign(buyer);
  assert(walletCopy.verifySignatures());
  assert(!Buffer.from(walletCopy.serializeMessage()).equals(original));

  const originals = Object.fromEntries(['getGenesisHash','getLatestBlockhashAndContext','getBlockHeight','sendRawTransaction','getSignatureStatuses'].map(k => [k, connection[k]]));
  const updates = [];
  try {
    connection.getGenesisHash = async () => 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    connection.getLatestBlockhashAndContext = async () => ({context:{slot:55},value:{blockhash,lastValidBlockHeight:100}});
    connection.getBlockHeight = async () => 90;
    connection.sendRawTransaction = async () => updates.at(-1).signature;
    connection.getSignatureStatuses = async () => ({value:[{confirmationStatus:'confirmed',err:null}]});
    const wallet = {publicKey:buyer.publicKey, signTransaction:async tx => {
      assert(tx.instructions[0].programId.equals(ComputeBudgetProgram.programId));
      assert.equal(tx.instructions[0].data[0], 2); // SetComputeUnitLimit
      assert.equal(tx.instructions[0].data.readUInt32LE(1), 200000);
      assert.equal(tx.instructions[1].data[0], 3); // SetComputeUnitPrice
      assert.equal(tx.instructions[1].data.readBigUInt64LE(1), 0n);
      const copy = Transaction.from(tx.serialize({requireAllSignatures:false,verifySignatures:false}));
      copy.partialSign(buyer);
      return copy;
    }};
    await send(wallet,ix,u=>updates.push(u));
    assert.equal(updates.at(-1).status,'confirmed');
  } finally { for (const [key,value] of Object.entries(originals)) connection[key] = value; }
});

test('rejects changed payer, blockhash, account, amount, program, flags or invalid signature', async () => {
  const originals = Object.fromEntries(['getGenesisHash','getLatestBlockhashAndContext','getBlockHeight','sendRawTransaction'].map(k => [k, connection[k]]));
  let broadcasts = 0;
  try {
    connection.getGenesisHash = async () => 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    connection.getLatestBlockhashAndContext = async () => ({context:{slot:55},value:{blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}});
    connection.getBlockHeight = async () => 90;
    connection.sendRawTransaction = async () => { broadcasts++; return ''; };
    const mutations = [
      tx => {tx.feePayer = seller.publicKey;},
      tx => {tx.recentBlockhash = Keypair.generate().publicKey.toBase58();},
      tx => {tx.instructions.at(-1).keys[1].pubkey = arbitrator.publicKey;},
      tx => {tx.instructions.at(-1).data[4] ^= 1;},
      tx => {tx.instructions.at(-1).programId = arbitrator.publicKey;},
      tx => {tx.instructions.at(-1).keys[1].isWritable = false;},
      tx => {tx.add(SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:arbitrator.publicKey,lamports:1}));},
    ];
    for (const mutate of mutations) {
      const ix = SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:seller.publicKey,lamports:1});
      await assert.rejects(send({publicKey:buyer.publicKey, signTransaction:async tx => {mutate(tx);return tx;}},ix,()=>{}), /wallet changed/);
    }
    const ix = SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:seller.publicKey,lamports:1});
    await assert.rejects(send({publicKey:buyer.publicKey, signTransaction:async tx => {tx.addSignature(buyer.publicKey,Buffer.alloc(64,1));return tx;}},ix,()=>{}), /valid transaction signature/);
    assert.equal(broadcasts,0);
  } finally { for (const [key,value] of Object.entries(originals)) connection[key] = value; }
});

test('validates the captured two-instruction message shape and fee cap', async () => {
  const {ComputeBudgetProgram, Transaction} = await import('@solana/web3.js');
  const {instruction} = await createInstruction(buyer.publicKey,seller.publicKey,arbitrator.publicKey,42n,1000000n);
  const blockhash=Keypair.generate().publicKey.toBase58();
  const old=new Transaction({feePayer:buyer.publicKey,recentBlockhash:blockhash}).add(ComputeBudgetProgram.setComputeUnitLimit({units:200000}),instruction);
  const before=Buffer.from(old.serializeMessage());
  assert.equal(before.length,301);
  for (const position of [0,1,2]) {
    const clone=Transaction.from(old.serialize({requireAllSignatures:false,verifySignatures:false}));
    clone.instructions.splice(position,0,ComputeBudgetProgram.setComputeUnitPrice({microLamports:50000}));
    clone.partialSign(buyer);
    const after=Buffer.from(clone.serializeMessage());
    assert.equal(after.length,313);
    assert.equal(clone.compileMessage().accountKeys.length,7);
    assert.deepEqual(checkWalletMessage(before,after),{safe:true});
    assert(clone.verifySignatures());
  }
  const excess=Transaction.from(old.serialize({requireAllSignatures:false,verifySignatures:false}));
  excess.add(ComputeBudgetProgram.setComputeUnitPrice({microLamports:50001}));
  const rejection=checkWalletMessage(before,excess.serializeMessage());
  assert.equal(rejection.safe,false);assert.match(rejection.reason,/50001.*50,000/);
});

test('prepopulated zero priority price survives a simulated Phantom signing round-trip', async () => {
  const {ComputeBudgetProgram, Transaction}=await import('@solana/web3.js');
  const names=['getGenesisHash','getLatestBlockhashAndContext','getBlockHeight','sendRawTransaction','getSignatureStatuses'];
  const originals=Object.fromEntries(names.map(k=>[k,connection[k]]));const updates=[];
  try {
    connection.getGenesisHash=async()=> 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    connection.getLatestBlockhashAndContext=async()=>({context:{slot:55},value:{blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}});
    connection.getBlockHeight=async()=>90;
    connection.sendRawTransaction=async()=>updates.at(-1).signature;
    connection.getSignatureStatuses=async()=>({value:[{confirmationStatus:'confirmed',err:null}]});
    const wallet={publicKey:buyer.publicKey,signTransaction:async tx=>{
      const clone=Transaction.from(tx.serialize({requireAllSignatures:false,verifySignatures:false}));
      assert(clone.instructions[1].programId.equals(ComputeBudgetProgram.programId));
      assert.equal(clone.instructions[1].data[0],3);
      assert.equal(clone.instructions[1].data.readBigUInt64LE(1),0n);
      clone.partialSign(buyer);return clone;
    }};
    const {instruction}=await createInstruction(buyer.publicKey,seller.publicKey,arbitrator.publicKey,42n,1000000n);
    await send(wallet,instruction,u=>updates.push(u));assert.equal(updates.at(-1).status,'confirmed');
  } finally {for(const [key,value] of Object.entries(originals))connection[key]=value;}
});

test('rejects unsafe or disguised compute budget additions without broadcasting', async () => {
  const {ComputeBudgetProgram} = await import('@solana/web3.js');
  const originals = Object.fromEntries(['getGenesisHash','getLatestBlockhashAndContext','getBlockHeight','sendRawTransaction'].map(k => [k, connection[k]]));
  let broadcasts = 0;
  try {
    connection.getGenesisHash = async () => 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    connection.getLatestBlockhashAndContext = async () => ({context:{slot:55},value:{blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}});
    connection.getBlockHeight = async () => 90;
    connection.sendRawTransaction = async () => { broadcasts++; return ''; };
    const addPrice = tx => tx.instructions.splice(1,0,ComputeBudgetProgram.setComputeUnitPrice({microLamports:1}));
    const mutations = [
      tx => tx.add(ComputeBudgetProgram.setComputeUnitPrice({microLamports:50001})),
      tx => tx.add(new TransactionInstruction({programId:ComputeBudgetProgram.programId,keys:[],data:Buffer.from([3,1,0,0,0,0,0,0])})),
      tx => tx.add(new TransactionInstruction({programId:ComputeBudgetProgram.programId,keys:[],data:Buffer.from([3,1,0,0,0,0,0,0,0,0])})),
      tx => tx.add(ComputeBudgetProgram.setComputeUnitPrice({microLamports:18446744073709551615n})),
      tx => {tx.add(ComputeBudgetProgram.setComputeUnitPrice({microLamports:1}));tx.add(ComputeBudgetProgram.setComputeUnitPrice({microLamports:1}));},
      tx => tx.add(ComputeBudgetProgram.setComputeUnitLimit({units:1400000})),
      tx => tx.add(ComputeBudgetProgram.requestHeapFrame({bytes:32768})),
      tx => tx.add(new TransactionInstruction({programId:ComputeBudgetProgram.programId,keys:[],data:Buffer.from([4,1,0,0,0])})),
      tx => {const x=ComputeBudgetProgram.setComputeUnitPrice({microLamports:1});x.keys.push({pubkey:buyer.publicKey,isSigner:true,isWritable:true});tx.add(x);},
      tx => {const x=ComputeBudgetProgram.setComputeUnitPrice({microLamports:1});x.programId=SystemProgram.programId;tx.add(x);},
      tx => {addPrice(tx);tx.instructions.at(-1).keys[1].pubkey=arbitrator.publicKey;},
      tx => {addPrice(tx);tx.instructions.at(-1).data[4]^=1;},
      tx => {addPrice(tx);tx.instructions.at(-1).keys[1].isWritable=false;},
      tx => {addPrice(tx);tx.feePayer=seller.publicKey;},
      tx => {addPrice(tx);tx.recentBlockhash=Keypair.generate().publicKey.toBase58();},
      tx => {addPrice(tx);tx.instructions.reverse();},
      tx => {addPrice(tx);tx.instructions[0].data[1]^=1;},
    ];
    for (const mutate of mutations) {
      const instruction=SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:seller.publicKey,lamports:1});
      await assert.rejects(send({publicKey:buyer.publicKey,signTransaction:async tx => {mutate(tx);return tx;}},instruction,()=>{}),/wallet changed/);
    }
    assert.equal(broadcasts,0);
  } finally { for (const [key,value] of Object.entries(originals)) connection[key] = value; }
});

test('checks the actual serialized wire transaction before broadcast', async () => {
  const {Transaction} = await import('@solana/web3.js');
  const originals=Object.fromEntries(['getGenesisHash','getLatestBlockhashAndContext','getBlockHeight','sendRawTransaction'].map(k => [k,connection[k]]));
  let broadcasts=0;
  try {
    connection.getGenesisHash=async()=> 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    connection.getLatestBlockhashAndContext=async()=>({context:{slot:55},value:{blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}});
    connection.getBlockHeight=async()=>90;
    connection.sendRawTransaction=async()=>{broadcasts++;return '';};
    const instruction=SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:seller.publicKey,lamports:1});
    const wallet={publicKey:buyer.publicKey,signTransaction:async tx=>{
      tx.partialSign(buyer);
      const forged=Transaction.from(tx.serialize());
      forged.instructions.at(-1).keys[1].pubkey=arbitrator.publicKey;
      forged.partialSign(buyer);
      tx.serialize=()=>forged.serialize();
      return tx;
    }};
    await assert.rejects(send(wallet,instruction,()=>{}),/wallet changed/);
    assert.equal(broadcasts,0);
  } finally { for (const [key,value] of Object.entries(originals)) connection[key] = value; }
});

test('uses a fresh confirmed blockhash and matching context for preflight', async () => {
  const names = ['getGenesisHash','getLatestBlockhashAndContext','getBlockHeight','sendRawTransaction','getSignatureStatuses'];
  const original = Object.fromEntries(names.map(k => [k, connection[k]]));
  let updates=[], acquisitions=0, signatures=0, broadcasts=0;
  const blockhash=Keypair.generate().publicKey.toBase58();
  try {
    connection.getGenesisHash=async()=> 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    connection.getLatestBlockhashAndContext=async commitment=>{acquisitions++;assert.equal(commitment,'confirmed');return {context:{slot:1234},value:{blockhash,lastValidBlockHeight:100}};};
    connection.getBlockHeight=async config=>{assert.deepEqual(config,{commitment:'confirmed',minContextSlot:1234});return 100;};
    connection.sendRawTransaction=async (wire,options)=>{broadcasts++;assert.deepEqual(options,{skipPreflight:false,preflightCommitment:'confirmed',minContextSlot:1234,maxRetries:3});assert.equal((await import('@solana/web3.js')).Transaction.from(wire).recentBlockhash,blockhash);return updates.at(-1).signature;};
    connection.getSignatureStatuses=async()=>({value:[{confirmationStatus:'confirmed',err:null}]});
    const wallet={publicKey:buyer.publicKey,signTransaction:async tx=>{signatures++;tx.partialSign(buyer);return tx;}};
    const instruction=SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:seller.publicKey,lamports:1});
    await send(wallet,instruction,u=>updates.push(u));
    assert.equal(acquisitions,1);assert.equal(signatures,1);assert.equal(broadcasts,1);assert.equal(updates.at(-1).status,'confirmed');
  } finally {for(const [key,value] of Object.entries(original)) connection[key]=value;}
});

test('expired blockhash after wallet approval is not submitted or automatically re-signed', async () => {
  const names=['getGenesisHash','getLatestBlockhashAndContext','getBlockHeight','sendRawTransaction'];
  const original=Object.fromEntries(names.map(k=>[k,connection[k]])); let broadcasts=0, approvals=0; const updates=[];
  try {
    connection.getGenesisHash=async()=> 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    connection.getLatestBlockhashAndContext=async()=>({context:{slot:1},value:{blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}});
    connection.getBlockHeight=async()=>101;
    connection.sendRawTransaction=async()=>{broadcasts++;return '';};
    const wallet={publicKey:buyer.publicKey,signTransaction:async tx=>{approvals++;tx.partialSign(buyer);return tx;}};
    const instruction=SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:seller.publicKey,lamports:1});
    await assert.rejects(send(wallet,instruction,u=>updates.push(u)),/expired while awaiting approval/);
    assert.equal(updates.at(-1).status,'expired');assert(updates.at(-1).signature);assert.equal(broadcasts,0);assert.equal(approvals,1);
  } finally {for(const [key,value] of Object.entries(original))connection[key]=value;}
});

test('blockhash preflight rejection is failed, while network uncertainty remains unknown', async () => {
  const {SendTransactionError}=await import('@solana/web3.js');
  const names=['getGenesisHash','getLatestBlockhashAndContext','getBlockHeight','sendRawTransaction'];
  const original=Object.fromEntries(names.map(k=>[k,connection[k]]));let updates=[],sends=0,approvals=0;
  try {
    connection.getGenesisHash=async()=> 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    connection.getLatestBlockhashAndContext=async()=>({context:{slot:1},value:{blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}});
    connection.getBlockHeight=async()=>90;
    const wallet={publicKey:buyer.publicKey,signTransaction:async tx=>{approvals++;tx.partialSign(buyer);return tx;}};
    const instruction=SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:seller.publicKey,lamports:1});
    connection.sendRawTransaction=async()=>{sends++;throw new SendTransactionError({action:'simulate',signature:'',transactionMessage:'Transaction simulation failed: Blockhash not found'});};
    await assert.rejects(send(wallet,instruction,u=>updates.push(u)),/could not find the blockhash during preflight/);
    assert.equal(updates.at(-1).status,'failed');assert(updates.at(-1).signature);assert.equal(sends,1);assert.equal(approvals,1);
    updates=[];connection.sendRawTransaction=async()=>{sends++;throw new Error('fetch failed');};
    await assert.rejects(send(wallet,instruction,u=>updates.push(u)),/Submission outcome is unknown/);
    assert.equal(updates.at(-1).status,'unknown');assert(updates.at(-1).signature);assert.equal(sends,2);assert.equal(approvals,2);
  } finally {for(const [key,value] of Object.entries(original))connection[key]=value;}
});

test('expiry after submission keeps the landing outcome unknown and preserves its signature', async () => {
  const names=['getGenesisHash','getLatestBlockhashAndContext','getBlockHeight','sendRawTransaction','getSignatureStatuses'];
  const original=Object.fromEntries(names.map(k=>[k,connection[k]]));let updates=[],heights=0,sends=0;
  try {
    connection.getGenesisHash=async()=> 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    connection.getLatestBlockhashAndContext=async()=>({context:{slot:1},value:{blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}});
    connection.getBlockHeight=async()=>++heights===1?90:101;
    connection.sendRawTransaction=async()=>{sends++;return updates.at(-1).signature;};
    connection.getSignatureStatuses=async()=>({value:[null]});
    const wallet={publicKey:buyer.publicKey,signTransaction:async tx=>{tx.partialSign(buyer);return tx;}};
    const instruction=SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:seller.publicKey,lamports:1});
    await assert.rejects(send(wallet,instruction,u=>updates.push(u)),/validity window ended/);
    assert.equal(updates.at(-1).status,'unknown');assert(updates.at(-1).signature);assert.equal(sends,1);
  } finally {for(const [key,value] of Object.entries(original))connection[key]=value;}
});

test('failure to check block height stops before submission', async () => {
  const names=['getGenesisHash','getLatestBlockhashAndContext','getBlockHeight','sendRawTransaction'];
  const original=Object.fromEntries(names.map(k=>[k,connection[k]]));let updates=[],sends=0;
  try {
    connection.getGenesisHash=async()=> 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    connection.getLatestBlockhashAndContext=async()=>({context:{slot:1},value:{blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}});
    connection.getBlockHeight=async()=>{throw new Error('RPC unavailable');};
    connection.sendRawTransaction=async()=>{sends++;return '';};
    const wallet={publicKey:buyer.publicKey,signTransaction:async tx=>{tx.partialSign(buyer);return tx;}};
    const instruction=SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:seller.publicKey,lamports:1});
    await assert.rejects(send(wallet,instruction,u=>updates.push(u)),/did not submit/);
    assert.equal(updates.at(-1).status,'failed');assert.equal(sends,0);
  } finally {for(const [key,value] of Object.entries(original))connection[key]=value;}
});

test('explains fee limits and rejects duplicate, changed or unrecognized instructions', async () => {
  const {ComputeBudgetProgram, Transaction}=await import('@solana/web3.js');
  const blockhash=Keypair.generate().publicKey.toBase58();
  const business=SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:seller.publicKey,lamports:1});
  const make=(price=false)=>{
    const tx=new Transaction({feePayer:buyer.publicKey,recentBlockhash:blockhash}).add(ComputeBudgetProgram.setComputeUnitLimit({units:200000}));
    if(price) tx.add(ComputeBudgetProgram.setComputeUnitPrice({microLamports:0}));
    return tx.add(business);
  };
  const copy=tx=>Transaction.from(tx.serialize({requireAllSignatures:false,verifySignatures:false}));
  const base=make(), original=Buffer.from(base.serializeMessage());
  const excess=copy(base);excess.add(ComputeBudgetProgram.setComputeUnitPrice({microLamports:50001}));
  assert.match(checkWalletMessage(original,excess.serializeMessage()).reason,/50001.*50,000/);
  const other=copy(base);other.add(ComputeBudgetProgram.requestHeapFrame({bytes:32768}));
  assert.match(checkWalletMessage(original,other.serializeMessage()).reason,/not a valid compute-unit price/);
  const originalWithPrice=make(true), before=Buffer.from(originalWithPrice.serializeMessage());
  const duplicate=copy(originalWithPrice);duplicate.add(ComputeBudgetProgram.setComputeUnitPrice({microLamports:1}));
  assert.match(checkWalletMessage(before,duplicate.serializeMessage()).reason,/duplicate compute-unit price/);
  const modified=copy(originalWithPrice);modified.instructions[1].data[1]=1;
  assert.match(checkWalletMessage(before,modified.serializeMessage()).reason,/original instruction changed/);
  const alteredPayer=copy(originalWithPrice);alteredPayer.feePayer=arbitrator.publicKey;
  assert.match(checkWalletMessage(before,alteredPayer.serializeMessage()).reason,/Account keys, fee payer, or permissions changed/);
});
