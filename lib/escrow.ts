import { Buffer } from 'buffer';
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';

export const connection = new Connection('https://api.devnet.solana.com', {commitment: 'confirmed', disableRetryOnRateLimit: true});
const GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const states = ['Created', 'Funded', 'Evidence submitted', 'Approved', 'Released', 'Disputed', 'Refunded'] as const;
export type Escrow = { address: PublicKey; id: bigint; buyer: PublicKey; seller: PublicKey; arbitrator: PublicKey; amount: bigint; evidence: string; status: number };
export type Wallet = { publicKey: PublicKey | null; connect(): Promise<{ publicKey: PublicKey }>; signTransaction(tx: Transaction): Promise<Transaction>; on?(event: string, listener: (key: PublicKey | null) => void): void; removeListener?(event: string, listener: (key: PublicKey | null) => void): void };
export type TransactionStatus = 'awaiting-wallet' | 'submitting' | 'pending' | 'confirmed' | 'failed' | 'unknown';
export type TransactionUpdate = { status: TransactionStatus; signature?: string; detail: string };


export function programId(): PublicKey {
  const id = process.env.NEXT_PUBLIC_ESCROW_PROGRAM_ID || '8DK8Z1Uz8Nv3KTvVE7kxrm79mijQEL2nC5CAacPHgJ4Z';
  return new PublicKey(id);
}
export async function checkDevnet() {
  if (await connection.getGenesisHash() !== GENESIS) throw new Error('RPC is not Solana Devnet.');
}
export function lamports(input: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,9})?$/.test(input)) throw new Error('Enter a positive SOL amount with at most 9 decimals.');
  const [whole, fraction = ''] = input.split('.');
  const value = BigInt(whole) * 1000000000n + BigInt(fraction.padEnd(9, '0'));
  if (value <= 0n || value > 18446744073709551615n) throw new Error('Amount is outside the supported range.');
  return value;
}
export function formatSol(value: bigint): string { const whole = value / 1000000000n; const frac = (value % 1000000000n).toString().padStart(9, '0').replace(/0+$/, ''); return `${whole}${frac ? '.' + frac : ''}`; }
function u64(n: bigint): Uint8Array { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, n, true); return b; }
function concat(...parts: Uint8Array[]): Uint8Array { const b = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { b.set(p, i); i += p.length; } return b; }
async function discriminator(prefix: string, name: string): Promise<Uint8Array> { return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${prefix}:${name}`))).slice(0, 8); }
export async function derive(buyer: PublicKey, id: bigint): Promise<PublicKey> { return (await PublicKey.findProgramAddress([new TextEncoder().encode('escrow'), buyer.toBytes(), u64(id)], programId()))[0]; }
export function randomId(): bigint { const b = crypto.getRandomValues(new Uint8Array(8)); return new DataView(b.buffer).getBigUint64(0, true); }
export async function readEscrow(address: PublicKey): Promise<Escrow> {
  await checkDevnet();
  const info = await connection.getAccountInfo(address, 'confirmed');
  if (!info || !info.owner.equals(programId())) throw new Error('Escrow not found under the configured Devnet program.');
  const b = new Uint8Array(info.data);
  const expected = await discriminator('account', 'Escrow');
  if (b.length < 154 || !expected.every((x, i) => b[i] === x) || b[152] >= states.length) throw new Error('Invalid escrow account data.');
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { address, id: view.getBigUint64(8, true), buyer: new PublicKey(b.slice(16, 48)), seller: new PublicKey(b.slice(48, 80)), arbitrator: new PublicKey(b.slice(80, 112)), amount: view.getBigUint64(112, true), evidence: Array.from(b.slice(120, 152), x => x.toString(16).padStart(2, '0')).join(''), status: b[152] };
}
const meta = (pubkey: PublicKey, isSigner = false, isWritable = false) => ({ pubkey, isSigner, isWritable });
export async function createInstruction(buyer: PublicKey, seller: PublicKey, arbitrator: PublicKey, id: bigint, amount: bigint) {
  if (buyer.equals(seller) || buyer.equals(arbitrator) || seller.equals(arbitrator)) throw new Error('Buyer, seller, and arbitrator must be different wallets.');
  const address = await derive(buyer, id);
  const instruction = new TransactionInstruction({ programId: programId(), keys: [meta(buyer, true, true), meta(seller), meta(arbitrator), meta(address, false, true), meta(SystemProgram.programId)], data: Buffer.from(concat(await discriminator('global', 'create_escrow'), u64(id), u64(amount))) });
  return { address, instruction };
}
export async function actionInstruction(name: 'fund' | 'submit_evidence' | 'approve' | 'release' | 'dispute' | 'refund', e: Escrow, actor: PublicKey, hash?: Uint8Array) {
  let keys;
  switch (name) {
    case 'fund': keys = [meta(e.address, false, true), meta(actor, true, true), meta(SystemProgram.programId)]; break;
    case 'submit_evidence': case 'approve': case 'dispute': keys = [meta(e.address, false, true), meta(actor, true)]; break;
    case 'release': keys = [meta(e.address, false, true), meta(e.seller, false, true)]; break;
    case 'refund': keys = [meta(e.address, false, true), meta(e.buyer, false, true), meta(actor, true)]; break;
  }
  if (name === 'submit_evidence' && (!hash || hash.length !== 32 || hash.every(x => x === 0))) throw new Error('Choose an evidence file first.');
  return new TransactionInstruction({ programId: programId(), keys, data: Buffer.from(concat(await discriminator('global', name), ...(hash ? [hash] : []))) });
}
function base58(bytes: Uint8Array): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`), result = '';
  while (value) { result = alphabet[Number(value % 58n)] + result; value /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; result = '1' + result; }
  return result;
}
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/rejected|user denied|4001/i.test(message)) return 'The wallet request was rejected. You can try again when ready.';
  if (/insufficient funds|insufficient lamports|insufficient balance/i.test(message)) return 'Not enough Devnet SOL for the amount, account rent, or transaction fees. Use the Devnet faucet.';
  if (/429|too many requests/i.test(message)) return 'The public Devnet RPC is rate-limited. Wait a moment and check the existing signature before trying again.';
  if (/6003|0x1773|InvalidState/i.test(message)) return 'This action is not allowed in the current escrow state. Reload the escrow.';
  if (/2001|0x7d1|ConstraintHasOne/i.test(message)) return 'This wallet or recipient does not match the party recorded in the escrow.';
  if (/invalid public key|non-base58/i.test(message)) return 'Enter a valid Solana public address.';
  return message;
}
export async function signatureStatus(signature: string): Promise<'confirmed' | 'failed' | 'pending'> {
  await checkDevnet();
  const response = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
  const status = response.value[0];
  if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) return status.err ? 'failed' : 'confirmed';
  return 'pending';
}
export async function send(wallet: Wallet, instruction: TransactionInstruction, update: (value: TransactionUpdate) => void): Promise<string> {
  await checkDevnet();
  if (!wallet.publicKey) throw new Error('Connect your wallet first.');
  const latest = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({ feePayer: wallet.publicKey, recentBlockhash: latest.blockhash }).add(instruction);
  const originalMessage = Buffer.from(transaction.serializeMessage());
  update({ status: 'awaiting-wallet', detail: 'Approve this transaction in your wallet.' });
  const signed = await wallet.signTransaction(transaction);
  if (!Buffer.from(signed.serializeMessage()).equals(originalMessage)) throw new Error('The wallet changed the transaction. Please try again.');
  if (!signed.signature) throw new Error('The wallet did not sign the transaction.');
  const signature = base58(signed.signature);
  update({ status: 'submitting', signature, detail: 'Signed. Sending to Devnet…' });
  try {
    const returned = await connection.sendRawTransaction(signed.serialize());
    if (returned !== signature) throw new Error('The RPC returned an unexpected transaction signature.');
  } catch (error) {
    update({ status: 'unknown', signature, detail: `Submission could not be confirmed: ${friendlyError(error)} Check the signature before trying again.` });
    throw error;
  }
  update({ status: 'pending', signature, detail: 'Submitted. Waiting for Devnet confirmation…' });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const response = await connection.getSignatureStatuses([signature], {searchTransactionHistory:true});
      const status = response.value[0];
      if (status?.err && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
        const detail = `Transaction failed: ${friendlyError(JSON.stringify(status.err))}`;
        update({status:'failed', signature, detail}); throw new Error(detail);
      }
      if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
        update({status:'confirmed', signature, detail:'Confirmed on Devnet.'}); return signature;
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Transaction failed:')) throw error;
      if (!/429|too many requests/i.test(String(error))) {
        update({status:'unknown', signature, detail:'Confirmation is unavailable. Check the signature before trying again.'}); throw error;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
  update({status:'unknown', signature, detail:'Confirmation is taking longer than expected. Check the signature before trying again.'});
  throw new Error('Confirmation is pending. Check the signature before trying again.');
}
export const explorer = (kind: 'tx' | 'address', value: string) => `https://explorer.solana.com/${kind}/${encodeURIComponent(value)}?cluster=devnet`;
