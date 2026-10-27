// V14.3.3: scene quá ngắn viết lại tại chỗ; rà AI scene không dùng mustChange cả chương; top-up không lặp outline.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={buildSceneReviewPrompt,buildAdaptiveSceneTopUpPrompt,checkSceneQuality,sceneKeywordCoverage,buildSceneReviewPrompt,parseSceneReviewResponse,buildAdaptiveSceneWritePrompt,runAdaptiveChapterPipeline,runQuickAutoFix,quickFixNeeded,reviewIsBetter,countWords,sceneErrorsPatchable,buildSceneFixPrompt,applySceneFixInserts,summarizeSceneWarnings,formatSceneNote};', ctx);
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


(async () => {
await t('scene quá ngắn (<60% ngân sách) -> viết lại, không cần top-up', async () => {
  const m = mkDeps((k, prompt) => /BỊ TỪ CHỐI/.test(prompt) ? prose(1650, 'Lan đứng đó.') : prose(500, 'Lan đứng đó.'));
  const res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(res && !res.rejected, JSON.stringify(res && res.reason));
  assert.strictEqual(m.calls.filter(c => c === 'scene:retry').length, 3, JSON.stringify(m.calls));
  assert.ok(!m.calls.includes('topup'), 'không còn thiếu từ nên không top-up: ' + JSON.stringify(m.calls));
});
await t('scene luôn ngắn: hết lượt vẫn nhận (không hủy job), top-up lo phần thiếu', async () => {
  const m = mkDeps(() => prose(500, 'Lan đứng đó.'));
  const res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(res && !res.rejected, JSON.stringify(res && res.reason));
});
await t('tắt bằng deps.sceneShortRetry=false: không viết lại scene ngắn', async () => {
  const m = mkDeps(() => prose(500, 'Lan đứng đó.'), { deps: { sceneShortRetry: false } });
  await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.strictEqual(m.calls.filter(c => c === 'scene:retry').length, 0, JSON.stringify(m.calls));
});
await t('rà AI scene: không còn nhận mustChange của cả chương', async () => {
  const p = T.buildSceneReviewPrompt({ scene: { id: 'S3', mustChange: 'riêng S3' }, text: 'x', chapterContract: { allowedCharacters: ['A'], forbiddenDrift: [], mustChange: 'OUTLINE_CẢ_CHƯƠNG_TOKEN' } });
  assert.ok(!p.includes('OUTLINE_CẢ_CHƯƠNG_TOKEN') && p.includes('riêng S3'));
});
await t('top-up: có doneList -> không đưa lại requiredBeats/outline', async () => {
  const cc = { chapterNumber: 3, arcGoal: 'a', chapterOutline: 'OUTLINE_TOKEN', requiredBeats: ['OUTLINE_TOKEN'], mustChange: 'OUTLINE_TOKEN', allowedCharacters: ['A'] };
  const p = T.buildAdaptiveSceneTopUpPrompt({ needWords: 800, requiredBeats: 'OUTLINE_TOKEN', chapterContract: cc, doneList: ['S1: đã kể đoạn đầu'] });
  assert.ok(!p.includes('OUTLINE_TOKEN') && p.includes('ĐÃ KỂ ĐỦ TRONG CHƯƠNG') && p.includes('S1: đã kể đoạn đầu'));
  const old = T.buildAdaptiveSceneTopUpPrompt({ needWords: 800, requiredBeats: 'OUTLINE_TOKEN', chapterContract: cc });
  assert.ok(old.includes('REQUIRED BEATS CÒN PHẢI ĐẢM BẢO'), 'không có doneList -> hành vi cũ');
});
console.log('OK ' + pass + ' test');
})();
