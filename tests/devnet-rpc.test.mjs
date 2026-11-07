import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import { retryRateLimit, waitForSignature, assertResult, encodeBase58 } from '../scripts/devnet-rpc.mjs';

test('rate limits retry with bounded exponential backoff', async () => {
  let count = 0; const sleeps = [];
  assert.equal(await retryRateLimit(async () => { if (++count < 4) throw Error('429 Too Many Requests'); return 'ok'; }, {sleep: async ms => sleeps.push(ms)}), 'ok');
  assert.deepEqual(sleeps, [500, 1000, 2000]);
  count = 0;
  await assert.rejects(retryRateLimit(async () => { count++; throw Error('429'); }, {attempts: 3, sleep: async () => {}}), /429/);
  assert.equal(count, 3);
  count = 0;
  await assert.rejects(retryRateLimit(async () => { count++; throw Error('network error'); }, {sleep: async () => {}}), /network error/);
  assert.equal(count, 1);
});
test('HTTP polling returns an expected rejected confirmation without throwing', async () => {
  let calls = 0, clock = 0;
  const error = {InstructionError: [0, {Custom: 6003}]};
  const rpc = {getSignatureStatuses: async () => ({value: [++calls === 1 ? null : {confirmationStatus: 'finalized', err: error}]})};
  const status = await waitForSignature(rpc, 'signature', {now: () => clock, sleep: async ms => {clock += ms;}});
  assertResult('double refund', status.err, 6003);
  assert.throws(() => assertResult('double refund', status.err, 2001));
  assert.throws(() => assertResult('double refund', null, 6003));
  assert.throws(() => assertResult('success', status.err));
});
test('polling timeout retains the signature in its error', async () => {
  let clock = 0;
  await assert.rejects(waitForSignature({getSignatureStatuses: async () => ({value: [null]})}, 'saved-signature', {timeout: 10, interval: 10, now: () => clock, sleep: async ms => {clock += ms;}}), /saved-signature/);
});
test('transaction signatures use canonical base58', () => {
  const key = Keypair.generate().publicKey;
  assert.equal(encodeBase58(key.toBytes()), key.toBase58());
  assert.equal(encodeBase58(Buffer.alloc(64)), '1'.repeat(64));
  assert.equal(encodeBase58(Buffer.from([0, 0, 1])), '112');
});
