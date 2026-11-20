// V14.7.34: dọn bộ nhớ mồ côi sau khi xóa chương.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={pruneOrphanChapterMemory};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const mem = () => ({ timeline: [{ chapter: 3 }, { chapter: 16 }], memoryEvents: [{ chapter: 16 }], foreshadowing: [{ plantedChapter: 2, lastUpdated: 2 }, { plantedChapter: 16, lastUpdated: 16 }], knowledgeLedger: [{ firstChapter: 1, lastUpdated: 3 }, { firstChapter: 16, lastUpdated: 16 }], threads: [{ chapterIntroduced: 1 }, { chapterIntroduced: 16 }], scenes: [{ chapter: 16 }], consentLog: [{ chapter: 16 }], characterStateTracker: { A: { chapter: 3 }, B: { chapter: 16 } }, lastStatusChapter: 16, lastMemorySyncChapter: 16, characters: [{ name: 'X' }], currentStatus: 'giữ' });
t('0 chương: bỏ hết dữ liệu sinh từ chương, giữ nhân vật + Current Status', () => {
  const s = Object.assign(mem(), { chapters: [], layeredMemory: { summaries: { L1: [{}], L2: [], L3: [], L4: [], L5: [{}] } } }); const r = F.pruneOrphanChapterMemory(s);
  assert.strictEqual(s.timeline.length + s.memoryEvents.length + s.foreshadowing.length + s.knowledgeLedger.length + s.threads.length + s.scenes.length + s.consentLog.length, 0);
  assert.strictEqual(Object.keys(s.characterStateTracker).length, 0); assert.strictEqual(s.lastStatusChapter, 0); assert.strictEqual(s.lastMemorySyncChapter, 0);
  assert.strictEqual(s.characters.length, 1); assert.strictEqual(s.currentStatus, 'giữ'); assert.strictEqual(s.layeredMemory.summaries.L1.length, 0); assert.strictEqual(s.layeredMemory.summaries.L5.length, 1); assert.ok(r.total >= 10);
});
t('còn 5 chương: chỉ bỏ mục thuộc chương > 5', () => {
  const s = Object.assign(mem(), { chapters: [{}, {}, {}, {}, {}] }); F.pruneOrphanChapterMemory(s);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.timeline)), [{ chapter: 3 }]); assert.strictEqual(s.foreshadowing.length, 1); assert.strictEqual(s.knowledgeLedger.length, 1); assert.strictEqual(s.threads.length, 1);
  assert.deepStrictEqual(Object.keys(s.characterStateTracker), ['A']); assert.strictEqual(s.lastStatusChapter, 5);
});
t('không có mục mồ côi: không đổi gì, total 0', () => { const s = Object.assign(mem(), { chapters: new Array(16).fill({}) }); const r = F.pruneOrphanChapterMemory(s); assert.strictEqual(r.total, 0); assert.strictEqual(s.timeline.length, 2); });
t('giao diện + client đã nối (nút, sau khi xóa chương, wipe)', () => {
  const h = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8'), c = fs.readFileSync(path.join(__dirname, '../app/client.js'), 'utf8');
  assert.ok(h.includes('id="memoryOrphanBtn"') && c.includes('memoryOrphanBtn') && c.includes('if(wipe) try{ pruneOrphanChapterMemory(state); }catch(_){}'));
});
process.exit(bad ? 1 : 0);
