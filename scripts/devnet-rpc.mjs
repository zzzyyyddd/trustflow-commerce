import assert from 'node:assert/strict';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function retryRateLimit(operation, { attempts = 5, sleep = delay } = {}) {
  for (let i = 0; i < attempts; i++) {
    try { return await operation(); } catch (error) {
      if (!/\b429\b|too many requests/i.test(String(error?.message || error)) || i === attempts - 1) throw error;
      await sleep(Math.min(8000, 500 * 2 ** i));
    }
  }
}
export async function waitForSignature(rpc, signature, { timeout = 90000, interval = 2000, sleep = delay, now = Date.now } = {}) {
  const deadline = now() + timeout;
  while (now() < deadline) {
    const result = await retryRateLimit(() => rpc.getSignatureStatuses([signature], {searchTransactionHistory: true}), {sleep});
    const status = result.value[0];
    if (status && ['confirmed', 'finalized'].includes(status.confirmationStatus)) return status;
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${signature}; inspect the recorded signature before retrying.`);
}
export function assertResult(label, error, expectedCode = null) {
  if (expectedCode === null) return assert.equal(error, null, `${label}: transaction failed`);
  assert.deepEqual(error, {InstructionError: [0, {Custom: expectedCode}]}, `${label}: wrong error`);
}
export function encodeBase58(bytes) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`), result = '';
  while (value) { result = alphabet[Number(value % 58n)] + result; value /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; result = '1' + result; }
  return result;
}
