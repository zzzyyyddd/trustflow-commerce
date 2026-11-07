// Development-only, opt-in diagnostics. Never log transaction bytes, keys, or signatures.
import { ComputeBudgetProgram, Message } from '@solana/web3.js';
import { Buffer } from 'buffer';

type Decoded = { message: Message; version: string };
function decode(bytes: Uint8Array): Decoded | null {
  try { return { message: Message.from(Buffer.from(bytes)), version: 'legacy' }; }
  catch { return null; }
}
function version(bytes: Uint8Array): string {
  if (!bytes.length) return 'empty';
  return (bytes[0] & 0x80) === 0 ? 'legacy' : `v${bytes[0] & 0x7f}`;
}
export function compareTransactionMessages(beforeBytes: Uint8Array, afterBytes: Uint8Array) {
  const before = decode(beforeBytes), after = decode(afterBytes);
  const base = {
    originalVersion: version(beforeBytes),
    returnedVersion: version(afterBytes),
    serializedMessageEqual: Buffer.from(beforeBytes).equals(Buffer.from(afterBytes)),
    originalMessageLength: beforeBytes.length,
    returnedMessageLength: afterBytes.length,
  };
  if (!before || !after) return base;
  const a = before.message, b = after.message;
  const instructions = a.instructions.map((x, i) => {
    const y = b.instructions[i];
    if (!y) return { index: i, present: false };
    const aProgram = a.accountKeys[x.programIdIndex], bProgram = b.accountKeys[y.programIdIndex];
    return {
      index: i,
      present: true,
      programEqual: aProgram.equals(bProgram),
      originalIsComputeBudget: aProgram.equals(ComputeBudgetProgram.programId),
      returnedIsComputeBudget: bProgram.equals(ComputeBudgetProgram.programId),
      dataEqual: x.data === y.data,
      accountCountEqual: x.accounts.length === y.accounts.length,
      accounts: x.accounts.map((ai, j) => {
        const bi = y.accounts[j];
        if (bi === undefined) return { index: j, present: false };
        return {
          index: j, present: true,
          addressEqual: a.accountKeys[ai].equals(b.accountKeys[bi]),
          signerEqual: a.isAccountSigner(ai) === b.isAccountSigner(bi),
          writableEqual: a.isAccountWritable(ai) === b.isAccountWritable(bi),
        };
      }),
    };
  });
  return {
    ...base,
    feePayerEqual: a.accountKeys[0].equals(b.accountKeys[0]),
    recentBlockhashEqual: a.recentBlockhash === b.recentBlockhash,
    instructionCountOriginal: a.instructions.length,
    instructionCountReturned: b.instructions.length,
    accountKeyCountOriginal: a.accountKeys.length,
    accountKeyCountReturned: b.accountKeys.length,
    accountKeyOrderEqual: a.accountKeys.length === b.accountKeys.length && a.accountKeys.every((key, i) => key.equals(b.accountKeys[i])),
    computeBudgetCountOriginal: a.instructions.filter(ix => a.accountKeys[ix.programIdIndex].equals(ComputeBudgetProgram.programId)).length,
    computeBudgetCountReturned: b.instructions.filter(ix => b.accountKeys[ix.programIdIndex].equals(ComputeBudgetProgram.programId)).length,
    instructions,
  };
}
