import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reports} from '../src/gg24-funding.mjs';
test('two report times are ordered and anchored to distinct public sources',()=>{
  assert.deepEqual(reports.map(r=>r.at.slice(0,10)),['2025-10-31','2025-12-05','2025-12-08','2026-05-27']);
  assert.equal(reports[0].kind,'funding-registration');assert.ok(reports[0].metrics.some(m=>m[1].includes('QmTQic')));
  assert.equal(reports[1].asOf,'2025-12-04');
  assert.ok(reports.filter(r=>r.kind==='funding-report').every(r=>new URL(r.sourceUrl).hostname==='gov.gitcoin.co'&&/^[a-f0-9]{64}$/.test(r.sourceDigest)));
  assert.equal(reports[2].kind,'funding-transfer');assert.match(reports[2].metrics[0][1],/2.000 DAI/);
  assert.match(reports[1].metrics.at(-1)[1],/12 Projekte · 81.800 USD/);
  assert.match(reports[3].metrics[2][1],/13 verschiedene Projektnamen · 83.800 USD/);
});
