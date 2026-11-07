import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const idl = JSON.parse(readFileSync('target/idl/trustflow_escrow.json', 'utf8'));
const expectedGenesis = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const program = '8DK8Z1Uz8Nv3KTvVE7kxrm79mijQEL2nC5CAacPHgJ4Z';
const hash = value => [...createHash('sha256').update(value).digest().subarray(0, 8)];

test('both clients require the full verified Devnet genesis hash', () => {
  for (const file of ['scripts/devnet-lifecycle.mjs', 'lib/escrow.ts']) {
    const text = readFileSync(file, 'utf8');
    assert.match(text, /getGenesisHash\(\)/);
    assert(text.includes(expectedGenesis), file);
    assert(!text.includes('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'), file);
  }
});
test('IDL matches the checked-in escrow instruction interface', () => {
  assert.equal(idl.address, program);
  const specs = {
    create_escrow: [['buyer','seller','arbitrator','escrow','system_program'], [['id','u64'],['amount','u64']]],
    fund: [['escrow','buyer','system_program'], []],
    submit_evidence: [['escrow','seller'], [['hash', {array:['u8',32]}]]],
    approve: [['escrow','buyer'], []],
    release: [['escrow','seller'], []],
    dispute: [['escrow','party'], []],
    refund: [['escrow','buyer','arbitrator'], []],
  };
  assert.deepEqual(idl.instructions.map(i => i.name).sort(), Object.keys(specs).sort());
  for (const i of idl.instructions) {
    assert.deepEqual(i.discriminator, hash(`global:${i.name}`));
    assert.deepEqual(i.accounts.map(a => a.name), specs[i.name][0]);
    assert.deepEqual(i.args.map(a => [a.name, a.type]), specs[i.name][1]);
  }
  assert.deepEqual(idl.accounts.find(a => a.name === 'Escrow').discriminator, hash('account:Escrow'));
  assert.deepEqual(idl.types.find(t => t.name === 'Escrow').type.fields.map(f => f.name), ['id','buyer','seller','arbitrator','amount','evidence_hash','status','bump']);
  assert.deepEqual(idl.types.find(t => t.name === 'Status').type.variants.map(v => v.name), ['Created','Funded','EvidenceSubmitted','Approved','Released','Disputed','Refunded']);
});
