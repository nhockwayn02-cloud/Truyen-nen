// V14.7.1: không đóng băng L2/L3 khi thiếu nguồn tầng dưới (trước đây tạo L2 từ 3/4 chương rồi khóa vĩnh viễn).
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const moduleSource = fs.readFileSync(path.join(__dirname, '../app/layered-memory.js'), 'utf8');
async function main() {
  let failChapter3 = true;
  const state = { chapters: Array.from({ length: 4 }, (_, i) => ({ id: 'c' + (i + 1), title: 'Ch ' + (i + 1), text: i === 2 ? 'Nội dung 3' : 'Nội dung ' + (i + 1), summary: i === 2 ? '' : 'Tóm tắt ' + (i + 1) })) };
  const context = {
    window: { __XTA__: { state, persist() {}, setStatus() {}, callAI: async () => { if (failChapter3) throw new Error('API lỗi'); return { text: 'Tóm tắt bù' }; } } },
    document: { readyState: 'complete', getElementById: () => null }, console
  };
  vm.createContext(context);
  vm.runInContext(core + '\nwindow.__XTA__.core={buildLayeredMemoryRanges,upsertFrozenLayerSummary};', context);
  vm.runInContext(moduleSource, context);
  const engine = context.window.__XTA_LAYERED_MEMORY__;
  const r1 = await engine.buildLayeredMemorySummaries({});
  assert.ok(r1.failed >= 1, 'phải báo lỗi khi thiếu L1 chương 3');
  assert.equal(state.layeredMemory.summaries.L2.length, 0, 'KHÔNG được đóng băng L2 thiếu chương');
  failChapter3 = false;
  const r2 = await engine.buildLayeredMemorySummaries({});
  assert.equal(r2.failed, 0);
  assert.equal(state.layeredMemory.summaries.L2.length, 1, 'xây bù xong thì L2 được tạo đủ nguồn');
  assert.equal(state.layeredMemory.summaries.L2[0].sourceIds.length, 4);
  console.log('PASS memory: không đóng băng tầng thiếu nguồn, xây bù thành công sau khi có đủ L1');
}
main().catch(e => { console.error('FAIL memory partial sources:', e && e.stack || e); process.exitCode = 1; });
