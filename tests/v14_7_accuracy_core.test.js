const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const T = vm.runInNewContext(source + '\n;({ extractRequiredBeatItems, auditRequiredBeatEvidence, findRepeatedParagraphs });', {});
function test(name, fn) { try { fn(); console.log('PASS ' + name); } catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } }

test('extracts unique concrete beat codes and useful descriptions, tolerating multiple codes per line', () => {
  const items = T.extractRequiredBeatItems('Include [R#] as a generic example.\n[R1] Lin opens the sealed gate; [R2] the guard hears the alarm.\n[R1] Lin opens the sealed gate.');
  assert.deepEqual(JSON.parse(JSON.stringify(items)), [
    { code: '[R1]', text: 'Lin opens the sealed gate' },
    { code: '[R2]', text: 'the guard hears the alarm' }
  ]);
});
test('verifies beats only with present status and exact non-empty quotations', () => {
  const draft = 'Lin opens the sealed gate. The guard hears the alarm.';
  const r = T.auditRequiredBeatEvidence([{ code: '[R1]' }, { code: '[R2]' }], draft, { items: [
    { code: '[R1]', status: 'present', evidence: 'Lin opens the sealed gate.' },
    { code: '[R2]', status: 'present', evidence: 'The guard hears the alarm.' }
  ] });
  assert.equal(r.status, 'verified');
  assert.deepEqual(JSON.parse(JSON.stringify(r.verifiedCodes)), ['[R1]', '[R2]']);
});
test('fails an explicitly missing beat', () => {
  const r = T.auditRequiredBeatEvidence([{ code: '[R1]' }, { code: '[R2]' }], 'Only beat one.', { items: [
    { code: '[R1]', status: 'present', evidence: 'Only beat one.' }, { code: '[R2]', status: 'missing', evidence: '' }
  ] });
  assert.equal(r.status, 'failed'); assert.deepEqual(JSON.parse(JSON.stringify(r.missingCodes)), ['[R2]']);
});
test('rejects fabricated or non-exact evidence', () => {
  for (const evidence of ['He opens a sealed gate.', 'fabricated']) {
    const r = T.auditRequiredBeatEvidence([{ code: '[R1]' }], 'Lin opens the sealed gate.', { items: [{ code: '[R1]', status: 'present', evidence }] });
    assert.equal(r.status, 'failed');
  }
});
test('fails closed for malformed, incomplete, uncertain, unknown-status and absent audit results', () => {
  const req = [{ code: '[R1]' }], draft = 'A complete passage.';
  for (const result of [null, {}, { items: [] }, { items: [{ code: '[R1]', status: 'uncertain', evidence: draft }] }, { items: [{ code: '[R1]', status: 'maybe', evidence: draft }] }, { items: [{ code: '[R1]', status: 'present' }] }]) {
    assert.equal(T.auditRequiredBeatEvidence(req, draft, result).status, 'failed');
  }
  assert.equal(T.auditRequiredBeatEvidence([], draft, null).status, 'verified');
});
test('finds normalized exact and conservative near-duplicate substantial paragraphs once per pair', () => {
  const a = 'The captain crossed the silent courtyard before sunrise and placed the silver key beneath the old stone fountain.';
  const b = '  The captain crossed the silent courtyard before sunrise and placed the silver key beneath the old stone fountain.  ';
  const c = 'The captain crossed the silent courtyard before sunrise and placed the silver key beneath the ancient stone fountain.';
  const found = T.findRepeatedParagraphs([a, b, c].join('\n\n'));
  assert.ok(found.some(x => x.exact && x.paragraphs.includes(1) && x.paragraphs.includes(2)));
  assert.ok(found.some(x => !x.exact && x.paragraphs.includes(1) && x.paragraphs.includes(3) && x.similarity >= 0.88));
  const pairs = found.map(x => x.paragraphs.slice().sort((x, y) => x-y).join(':'));
  assert.equal(new Set(pairs).size, pairs.length);
});
test('ignores short repeated paragraphs and dialogue fragments', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(T.findRepeatedParagraphs('Stop now.\n\nStop now.\n\n“Come with me,” she said.\n\n“Come with me,” she said.'))), []);
});
