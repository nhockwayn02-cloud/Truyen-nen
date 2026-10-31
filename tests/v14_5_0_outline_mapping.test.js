// V14.5.0: cách 3 — mỗi cảnh gắn với mục Outline, app kiểm tra kế hoạch trước khi viết.
// V14.4.4: sự kiện chính của Outline phải có đủ — bù riêng beat còn thiếu.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={outlineChapterItems,validateOutlineMapping,buildOutlineGraph,buildAdaptiveScenePlanPrompt,buildSceneReviewPrompt,buildAdaptiveSceneTopUpPrompt,checkSceneQuality,sceneKeywordCoverage,buildSceneReviewPrompt,parseSceneReviewResponse,buildAdaptiveSceneWritePrompt,runAdaptiveChapterPipeline,runQuickAutoFix,quickFixNeeded,reviewIsBetter,countWords,sceneErrorsPatchable,buildSceneFixPrompt,applySceneFixInserts,summarizeSceneWarnings,formatSceneNote};', ctx);
const T = ctx.__t;
let pass = 0; const t = async (n, f) => { await f(); console.log('PASS ' + n); pass++; };

let _seed = 777; const rnd = () => (_seed = (_seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const LEX = 'mưa đêm cửa sổ ngọn đèn tiếng bước chân hành lang giấy tờ ngăn kéo chìa khóa điện thoại ánh mắt hơi thở căn phòng tấm rèm mùi cà phê chiếc bàn gỗ lá thư cũ'.split(' ');
function prose(words, seedTag) {
  const out = []; let w = 0;
  while (w < words) { const n = 8 + Math.floor(rnd() * 8); const s = []; for (let i = 0; i < n; i++) s.push(LEX[Math.floor(rnd() * LEX.length)]); out.push(s.join(' ') + '.'); w += n; }
  return (seedTag ? seedTag + ' ' : '') + out.join('\n\n');
}
const contract = { allowedCharacters: ['Lan'], canonicalCharacters: ['Lan'], knownCharacters: ['Lan', 'Kim Chi'], forbiddenDrift: [], requiredBeats: [], arcGoal: 'Lan giữ hồ sơ', chapterOutline: 'Lan giữ hồ sơ', mustChange: '', openingContinuity: '', userBrief: '', nameSource: '' };

// ---- pipeline với AI giả ----
const GRAPH = JSON.stringify({ chapterGoal: 'Lan giữ hồ sơ', endingAnchor: 'Lan khóa cửa văn phòng.', scenes: [1, 2, 3].map(n => ({ id: 'S' + n, location: 'Văn phòng', time: 'Tối ' + n, characters: ['Lan'], purpose: 'p' + n, beats: ['b' + n], mustChange: 'Lan biết thêm điều ' + n, handoff: 'sang cảnh ' + (n + 1), targetWords: 1700 })) });
function mkDeps(scenePlan, extra) {
  const calls = []; let sceneCall = 0;
  const deps = Object.assign({
    state: { minChapterWords: 5000, characters: [{ name: 'Lan' }, { name: 'Kim Chi' }], arcs: [{ id: 'a', name: 'A', goal: 'Lan giữ hồ sơ', active: true }] },
    buildContract: () => JSON.parse(JSON.stringify(contract)), requiredBeats: () => '', style: () => '', route: () => ({ model: 'm', nsfw: false }),
    callAI: async (prompt, o) => {
      if (/Lập kế hoạch scene|SCENE GRAPH|"scenes"/.test(prompt) && /chapterGoal/.test(prompt) && !/VIẾT SCENE TIẾP NỐI/.test(prompt) && !/KIỂM TRA MỘT SCENE/.test(prompt) && !/VIẾT BỔ SUNG/.test(prompt)) { calls.push('plan'); return { text: GRAPH }; }
      if (/KIỂM TRA MỘT SCENE/.test(prompt)) { calls.push('sceneReview'); return { text: (extra && extra.reviewReply && extra.reviewReply(calls.filter(c => c === 'sceneReview').length)) || '{"ok":true,"issues":[]}' }; }
      if (/VIẾT BỔ SUNG/.test(prompt)) { calls.push('topup'); return { text: prose(700, 'Lan viết thêm.') }; }
      sceneCall++; calls.push('scene');
      calls.push(/BỊ TỪ CHỐI/.test(prompt) ? 'scene:retry' : 'scene:first');
      return { text: scenePlan(sceneCall, prompt) };
    }
  }, extra && extra.deps);
  return { deps, calls };
}
const OPTS = { context: '', priorChapters: [], model: 'm' };




const CONTENT = ['Chương 6 — Theo dõi kho hàngSự kiện: Hà quan sát nhà kho Song Hành.', '•\tĐêm về, gọi Lan xuống tầng hầm B2.', '•\tBắt Lan ký biên bản giả, đứng yên giữa phòng.', '•\tBắt Lan tự nói một câu cam kết.Kháng cự: Im lặng.Hậu quả: Bị buộc nghe theo.Móc kết: Hà đưa cô về.', 'Chương 7 — Kho thứ haiSự kiện: Hà đến nhà Lan lần hai.'].join('\n');
const planJSON = (maps, extra) => JSON.stringify({ chapterGoal: 'Hà theo dõi kho', endingAnchor: 'Hà đưa Lan về.', scenes: maps.map((m, k) => Object.assign({ id: 'S' + (k + 1), purpose: 'p', beats: ['b'], characters: ['Lan'], location: 'Kho ' + (k + 1), time: 'Đêm', targetWords: 1200, mustChange: 'Lan biết thêm ' + (k + 1), handoff: 'sang cảnh', outlineItems: m }, extra)) });
const isPlan = p => /BẠN LÀ BIÊN KỊCH TIỂU THUYẾT/.test(p);
const withItems = (m, items, replies) => { let n = 0; const orig = m.deps.callAI; m.deps.buildContract = () => Object.assign(JSON.parse(JSON.stringify(contract)), { outlineItems: items, outlineMeta: { hook: 'Hà đưa cô về' } }); m.deps.callAI = async (p, o) => { if (isPlan(p)) { m.planPrompts = (m.planPrompts || []).concat([p]); const r = replies[Math.min(n, replies.length - 1)]; n++; m.calls.push('plan'); return { text: r }; } return orig(p, o); }; return m; };
const ITEMS = ['Hà quan sát nhà kho Song Hành', 'Đêm về, gọi Lan xuống tầng hầm B2', 'Bắt Lan ký biên bản giả, đứng yên giữa phòng', 'Bắt Lan tự nói một câu cam kết'];
(async () => {
await t('tách mục Outline: tiêu đề + Sự kiện + gạch đầu dòng; Kháng cự/Hậu quả/Móc kết thành meta; không lẫn chương khác', () => {
  const r = T.outlineChapterItems(CONTENT);
  assert.deepStrictEqual(Object.keys(r), ['6', '7']);
  assert.deepStrictEqual(Array.from(r[6].items), ITEMS);
  assert.strictEqual(r[6].meta.resistance, 'Im lặng'); assert.strictEqual(r[6].meta.consequence, 'Bị buộc nghe theo'); assert.strictEqual(r[6].meta.hook, 'Hà đưa cô về');
  assert.strictEqual(r[7].items.length, 1);
});
await t('kiểm tra ánh xạ: đúng / thiếu mục / trùng / đảo thứ tự / gom quá nhiều / quá 1 scene nối', () => {
  const sc = maps => ({ scenes: maps.map((m, k) => ({ id: 'S' + (k + 1), outlineItems: m })) });
  assert.deepStrictEqual(Array.from(T.validateOutlineMapping(sc([[1], [2], [3, 4]]), ITEMS)), []);
  assert.ok(T.validateOutlineMapping(sc([[1], [2], [3]]), ITEMS).some(e => /Mục Outline 4 chưa có scene/.test(e)));
  assert.ok(T.validateOutlineMapping(sc([[1, 2], [2], [3, 4]]), ITEMS).some(e => /đảo\/lặp|bị 2 scene/.test(e)));
  assert.ok(T.validateOutlineMapping(sc([[1], [3, 4], [2]]), ITEMS).some(e => /đảo\/lặp thứ tự/.test(e)));
  assert.ok(T.validateOutlineMapping(sc([[1, 2, 3, 4]]), ITEMS).some(e => /1–3 mục LIỀN KỀ/.test(e)));
  assert.ok(T.validateOutlineMapping(sc([[1], [], [2], [], [3, 4]]), ITEMS).some(e => /không gắn mục Outline nào/.test(e)));
  assert.ok(T.validateOutlineMapping(sc([[1], [2, 4], [3]]), ITEMS).length > 0, 'mục không liền kề');
});
await t('dựng cảnh theo mục: 4 mục -> 4 cảnh có outlineItems, handoff dẫn sang mục sau, endingAnchor = Móc kết; >6 mục thì gom', () => {
  const cand = { chapterGoal: 'G', endingAnchor: 'E', scenes: [{ characters: ['Lan'], location: 'Kho', time: 'Đêm' }] };
  const g = T.buildOutlineGraph(cand, ITEMS, { hook: 'Hà đưa cô về' }, { target: 5000 }, contract);
  assert.strictEqual(g.scenes.length, 4); assert.deepStrictEqual(Array.from(g.scenes[2].outlineItems), [3]);
  assert.ok(/Dẫn sang: Bắt Lan tự nói/.test(g.scenes[2].handoff) && g.endingAnchor === 'Hà đưa cô về' && g.scenes[0].characters[0] === 'Lan');
  const g2 = T.buildOutlineGraph(cand, Array.from({ length: 9 }, (_, i) => 'mục số ' + i), {}, { target: 5000 }, contract);
  assert.ok(g2.scenes.length <= 6 && g2.scenes.flatMap(s => s.outlineItems).length === 9);
});
await t('prompt kế hoạch có khối OUTLINE ĐÁNH SỐ khi có mục; không có thì không thêm', () => {
  const p = T.buildAdaptiveScenePlanPrompt({ state: {}, chapterContract: { chapterNumber: 6, arcGoal: 'a', chapterOutline: 'o', requiredBeats: [], allowedCharacters: [], forbiddenDrift: [] }, outlineItems: ITEMS, outlineMeta: { hook: 'Hà đưa cô về' }, requiredBeats: 'REQB' });
  assert.ok(/OUTLINE ĐÁNH SỐ/.test(p) && /3\. Bắt Lan ký biên bản giả/.test(p) && /Móc kết \(endingAnchor\): Hà đưa cô về/.test(p));
  const q = T.buildAdaptiveScenePlanPrompt({ state: {}, chapterContract: { chapterNumber: 6, arcGoal: 'a', chapterOutline: 'o', requiredBeats: [], allowedCharacters: [], forbiddenDrift: [] }, requiredBeats: 'REQB' });
  assert.ok(!/OUTLINE ĐÁNH SỐ/.test(q));
});
await t('pipeline: AI gắn đúng mục -> dùng kế hoạch của AI (1 lần lập), outlineMap=ai', async () => {
  const m = withItems(mkDeps(() => prose(1650, 'Lan đứng đó.')), ITEMS, [planJSON([[1], [2], [3, 4]])]);
  const res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(res && !res.rejected, JSON.stringify(res && res.reason)); assert.strictEqual(m.calls.filter(c => c === 'plan').length, 1);
  assert.strictEqual(res.stats.outlineMap, 'ai'); assert.ok(/OUTLINE ĐÁNH SỐ/.test(m.planPrompts[0]));
});
await t('pipeline: AI gắn sai 2 lần -> dựng cảnh theo từng mục Outline (4 cảnh), outlineMap=fallback, không hủy job', async () => {
  const m = withItems(mkDeps(() => prose(1200, 'Lan đứng đó.')), ITEMS, [planJSON([[1, 2, 3, 4]]), planJSON([[1], [3], [2, 4]])]);
  const res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(res && !res.rejected, JSON.stringify(res && res.reason)); assert.strictEqual(m.calls.filter(c => c === 'plan').length, 2);
  assert.strictEqual(res.stats.outlineMap, 'fallback');
  const graph = JSON.parse(res.plan.split('ADAPTIVE SCENE GRAPH\n')[1]); assert.strictEqual(graph.scenes.length, 4);
  assert.ok(/OUTLINE:/.test(m.planPrompts[1]), 'lần lập lại phải nhận lý do sai ánh xạ');
});
await t('pipeline: chương không có mục Outline (như cũ) -> không đụng tới kế hoạch của AI', async () => {
  const m = mkDeps(() => prose(1650, 'Lan đứng đó.')); const res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(res && !res.rejected); assert.strictEqual(res.stats.outlineMap, '');
});
console.log('OK ' + pass + ' test');
})();
