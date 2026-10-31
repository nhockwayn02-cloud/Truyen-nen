// V14.4.4: sự kiện chính của Outline phải có đủ — bù riêng beat còn thiếu.
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



const OUTLINE = 'Sự kiện: Lan khóa két số bảy. Lan giấu chìa khóa dưới chậu cây xương rồng.';
const withOutline = (m, text) => { m.deps.buildContract = () => Object.assign(JSON.parse(JSON.stringify(contract)), { chapterOutline: text || OUTLINE }); return m; };
const spyTop = (m) => { const tops = []; const orig = m.deps.callAI; m.deps.callAI = async (p, o) => { if (/VIẾT BỔ SUNG/.test(p)) tops.push(p); return orig(p, o); }; return tops; };
(async () => {
await t('chương đủ từ nhưng thiếu sự kiện Outline -> bù RIÊNG sự kiện còn thiếu (tối đa 2 lượt)', async () => {
  const m = withOutline(mkDeps(() => prose(1650, 'Lan đứng đó.'), { deps: { outlineComplete: true } })); const tops = spyTop(m);
  const res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(res && !res.rejected, JSON.stringify(res && res.reason));
  assert.ok(tops.length >= 1 && tops.length <= 2, 'số lượt bù: ' + tops.length);
  assert.ok(/SỰ KIỆN CHÍNH CỦA OUTLINE CÒN THIẾU/.test(tops[0]) && /khóa két số bảy/.test(tops[0]) && /CHỈ để viết nốt/.test(tops[0]));
});
await t('mặc định (không bật outlineComplete) -> không bù thêm khi đã đủ từ (hành vi cũ)', async () => {
  const m = withOutline(mkDeps(() => prose(1650, 'Lan đứng đó.'))); const tops = spyTop(m);
  await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.strictEqual(tops.length, 0);
});
await t('Outline đã được phủ trong truyện -> không bù', async () => {
  const m = withOutline(mkDeps(() => prose(1650, 'Lan khóa két số bảy rồi giấu chìa khóa dưới chậu cây xương rồng.'), { deps: { outlineComplete: true } })); const tops = spyTop(m);
  await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.strictEqual(tops.length, 0, 'không được bù khi beat đã có');
});
await t('prompt bù: có khối sự kiện thiếu + chế độ completeOnly; không có thì giữ prompt cũ', () => {
  const a = T.buildAdaptiveSceneTopUpPrompt({ currentWords: 5000, needWords: 400, completeOnly: true, missingBeats: ['Lan khóa két số bảy'] });
  assert.ok(/CHỈ để viết nốt/.test(a) && /Lan khóa két số bảy/.test(a) && !/BẮT BUỘC viết ít nhất/.test(a));
  const b = T.buildAdaptiveSceneTopUpPrompt({ currentWords: 3000, needWords: 800 });
  assert.ok(/BẮT BUỘC viết ít nhất/.test(b) && !/SỰ KIỆN CHÍNH CỦA OUTLINE/.test(b));
});
console.log('OK ' + pass + ' test');
})();
