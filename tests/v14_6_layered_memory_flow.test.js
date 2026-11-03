const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const moduleSource = fs.readFileSync(path.join(__dirname, '../app/layered-memory.js'), 'utf8');
async function main() {
  let aiCalls = 0, writes = 0;
  const state = { chapters: Array.from({ length: 4 }, (_, i) => ({ id: 'chapter-' + (i + 1), title: 'Ch ' + (i + 1), text: 'Nội dung ' + (i + 1), summary: 'L1 summary ' + (i + 1) })) };
  const stats = { textContent: '' };
  const context = {
    window: { __XTA__: { state, persist: () => { writes++; }, setStatus: () => {}, callAI: async prompt => { aiCalls++; return { text: 'Lớp tóm tắt ' + aiCalls + ' — ' + prompt.slice(0, 60) }; }, core: {} } },
    document: { readyState: 'complete', getElementById: id => id === 'layeredMemoryStats' ? stats : null },
    console
  };
  vm.createContext(context);
  vm.runInContext(core + '\nwindow.__XTA__.core={buildLayeredMemoryRanges,upsertFrozenLayerSummary};', context);
  vm.runInContext(moduleSource, context);
  const engine = context.window.__XTA_LAYERED_MEMORY__;
  const first = await engine.buildLayeredMemorySummaries({});
  assert.equal(first.failed, 0); assert.equal(state.layeredMemory.summaries.L1.length, 4); assert.equal(state.layeredMemory.summaries.L2.length, 1);
  assert.equal(state.layeredMemory.summaries.L3.length, 0); assert.equal(state.layeredMemory.summaries.L4.length, 0);
  const frozenL1 = state.layeredMemory.summaries.L1[0].summary, frozenL2 = state.layeredMemory.summaries.L2[0].summary;
  state.chapters[0].summary = 'summary đã đổi sau khi đóng băng';
  for (let n = 5; n <= 60; n++) state.chapters.push({ id: 'chapter-' + n, title: 'Ch ' + n, text: 'Nội dung ' + n, summary: 'L1 summary ' + n });
  const at60 = await engine.buildLayeredMemorySummaries({});
  assert.equal(at60.failed, 0); assert.equal(state.layeredMemory.summaries.L1.length, 60);
  assert.equal(state.layeredMemory.summaries.L2.length, 15); assert.equal(state.layeredMemory.summaries.L3.length, 3);
  assert.equal(state.layeredMemory.summaries.L4.length, 1); assert.equal(state.layeredMemory.summaries.L5.length, 1);
  assert.equal(state.layeredMemory.summaries.L1[0].summary, frozenL1); assert.equal(state.layeredMemory.summaries.L2[0].summary, frozenL2);
  const oldL5 = state.layeredMemory.summaries.L5[0].summary;
  for (let n = 61; n <= 120; n++) state.chapters.push({ id: 'chapter-' + n, title: 'Ch ' + n, text: 'Nội dung ' + n, summary: 'L1 summary ' + n });
  const at120 = await engine.buildLayeredMemorySummaries({});
  assert.equal(at120.failed, 0); assert.equal(state.layeredMemory.summaries.L4.length, 2);
  assert.equal(state.layeredMemory.summaries.L5.length, 1); assert.equal(state.layeredMemory.history.length, 1);
  assert.equal(state.layeredMemory.history[0].summary, oldL5); assert.equal(state.layeredMemory.summaries.L5[0].revision, 2);
  assert.ok(aiCalls >= 40); assert.ok(writes >= 4); assert.match(stats.textContent, /L5 · bản tổng hợp toàn truyện: 1 \(lịch sử: 1\)/);
  console.log('PASS layered memory freezes L1–L4, aggregates at 4/20/60 and archives old L5');
}
main().catch(e => { console.error('FAIL layered memory flow:', e && e.stack || e); process.exitCode = 1; });
