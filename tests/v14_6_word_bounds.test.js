// V14.6: explicit chapter min/max bounds remain backward-compatible with existing target±500 behavior.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const T = vm.runInNewContext(source + '\n;({ chapterWordLimits, chapterLengthAction });', {});
function test(name, fn) { try { fn(); console.log('PASS ' + name); } catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } }
test('existing stories without explicit bounds keep target ±500 and hard cap +600', () => {
  const r = T.chapterWordLimits({ minChapterWords: 5000 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), { target: 5000, minAccept: 4500, maxAccept: 5500, hardMax: 5600 });
});
test('explicit valid min/max are authoritative and target stays inside their interval', () => {
  const r = T.chapterWordLimits({ minChapterWords: 5000, chapterWordMin: 4200, chapterWordMax: 5200 });
  assert.strictEqual(r.minAccept, 4200);
  assert.strictEqual(r.maxAccept, 5200);
  assert.strictEqual(r.hardMax, 5200);
  assert.ok(r.target >= 4200 && r.target <= 5200);
});
test('invalid or incomplete explicit bounds safely fall back to legacy target bounds', () => {
  const invalid = T.chapterWordLimits({ minChapterWords: 5000, chapterWordMin: 6000, chapterWordMax: 4000 });
  const incomplete = T.chapterWordLimits({ minChapterWords: 5000, chapterWordMin: 4200 });
  for (const r of [invalid, incomplete]) assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), { target: 5000, minAccept: 4500, maxAccept: 5500, hardMax: 5600 });
});
test('length action expands below minimum and condenses above explicit maximum without applying legacy slack', () => {
  const st = { minChapterWords: 5000, chapterWordMin: 4200, chapterWordMax: 5200 };
  assert.equal(T.chapterLengthAction(st, 4199).action, 'expand');
  assert.equal(T.chapterLengthAction(st, 5201).action, 'condense');
  assert.equal(T.chapterLengthAction(st, 5000).action, 'within');
});
test('legacy stories retain the existing hard-cap tolerance', () => {
  assert.equal(T.chapterLengthAction({ minChapterWords: 5000 }, 5600).action, 'within');
  assert.equal(T.chapterLengthAction({ minChapterWords: 5000 }, 5601).action, 'condense');
});
