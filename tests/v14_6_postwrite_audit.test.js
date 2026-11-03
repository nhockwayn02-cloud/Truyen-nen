const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const T = vm.runInNewContext(source + '\n;({ buildChapterPostWriteAudit });', {});
function test(name, fn) { try { fn(); console.log('PASS ' + name); } catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } }
test('post-write audit reports measured length, existing unresolved threads and the time stall without modifying prose', () => {
  const chapter = { text: ('từ ').repeat(350), continuityWarnings: ['kiểm tra vết thương'] };
  const st = { chapters: [{ text: 'chương một' }, { text: 'chương hai' }, chapter], minChapterWords: 350, chapterWordMin: 300, chapterWordMax: 400,
    threads: [{ status: 'developing' }, { status: 'resolved' }], foreshadowing: [{ status: 'seeded' }, { status: 'paid_off' }],
    statusState: { timeLog: [{ chapter: 1, time: 'Ngày 1' }, { chapter: 2, time: 'Ngày 1' }, { chapter: 3, time: 'Ngày 1' }] } };
  const audit = T.buildChapterPostWriteAudit(st, 3);
  assert.equal(audit.chapterNumber, 3); assert.equal(audit.wordCount, 350); assert.equal(audit.withinWordBounds, true);
  assert.equal(audit.unresolvedThreads, 1); assert.equal(audit.unresolvedForeshadowing, 1);
  assert.ok(audit.continuityIssues.some(x => String(x).includes('vết thương')));
  assert.ok(audit.timeStall && audit.timeStall.repeatedMarks === 3);
  assert.equal(chapter.text, ('từ ').repeat(350));
});
test('post-write audit marks min/max violations and ignores future-scoped continuity findings', () => {
  const chapter = { text: ('từ ').repeat(299), continuityWarnings: [] };
  const st = { chapters: [chapter], minChapterWords: 350, chapterWordMin: 300, chapterWordMax: 400, threads: [], foreshadowing: [], statusState: { timeLog: [] } };
  const audit = T.buildChapterPostWriteAudit(st, 1);
  assert.equal(audit.withinWordBounds, false); assert.equal(audit.lengthStatus, 'below_min');
  assert.deepEqual(JSON.parse(JSON.stringify(audit.continuityIssues)), []);
});
