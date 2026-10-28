// V14.3.7: lỗi AI rà vá-được → vá ngay thay vì viết lại; prompt rà MUST_CHANGE chặt hơn.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={checkSceneQuality,sceneKeywordCoverage,buildSceneReviewPrompt,parseSceneReviewResponse,buildAdaptiveSceneWritePrompt,runAdaptiveChapterPipeline,runQuickAutoFix,quickFixNeeded,reviewIsBetter,countWords,sceneErrorsPatchable,buildSceneFixPrompt,applySceneFixInserts,summarizeSceneWarnings,formatSceneNote};', ctx);
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

const FAIL = '{"ok":false,"issues":[{"code":"MUST_CHANGE","msg":"Lan chưa tìm thấy chìa khóa"}]}';
const INSERT = '>>> SAU: Lan đứng đó.\nLan nhận ra chiếc chìa khóa nằm trong ngăn kéo thứ hai của chiếc bàn gỗ cũ.';
// Bọc callAI: nhận ra prompt vá và trả theo kịch bản.
function withFix(m, fixReply) {
  const orig = m.deps.callAI; m.fixCalls = 0;
  m.deps.callAI = async (p, o) => { if (/VÁ CỤC BỘ MỘT SCENE/.test(p)) { m.fixCalls++; m.calls.push('fix'); return { text: fixReply }; } return orig(p, o); };
  return m;
}


(async () => {
await t('vá-trước (mặc định): AI rà báo MUST_CHANGE lần đầu → VÁ ngay, KHÔNG viết lại scene', async () => {
  const m = withFix(mkDeps(() => prose(1650, 'Lan đứng đó.'), { deps: { sceneAiReview: true }, reviewReply: (k) => (k === 2 ? FAIL : '{"ok":true,"issues":[]}') }), INSERT);
  const res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(res && !res.rejected, JSON.stringify(res && res.reason));
  assert.strictEqual(m.fixCalls, 1, JSON.stringify(m.calls));
  assert.strictEqual(m.calls.filter(c => c === 'scene:retry').length, 0, 'không viết lại: ' + JSON.stringify(m.calls));
  assert.deepStrictEqual(Array.from(res.stats.scenePatched), ['S2']); assert.strictEqual(res.stats.sceneKept.length, 0);
  assert.ok(/chìa khóa nằm trong ngăn kéo thứ hai/.test(res.text));
});
await t('vá-trước: vá hỏng (AI trả rác) → vẫn giữ bản cuối + cảnh báo, không hủy job', async () => {
  const m = withFix(mkDeps(() => prose(1650, 'Lan đứng đó.'), { deps: { sceneAiReview: true }, reviewReply: (k) => (k === 2 ? FAIL : '{"ok":true,"issues":[]}') }), 'xin lỗi tôi không làm được');
  const res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(res && !res.rejected, JSON.stringify(res && res.reason));
  assert.deepStrictEqual(Array.from(res.stats.sceneKept), ['S2']);
});
await t('scenePatchFirst:false → quay về luồng cũ (viết lại trước)', async () => {
  const m = withFix(mkDeps(() => prose(1650, 'Lan đứng đó.'), { deps: { scenePatchFirst: false, sceneAiReview: true }, reviewReply: (k) => (k === 2 ? FAIL : '{"ok":true,"issues":[]}') }), INSERT);
  await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(m.calls.filter(c => c === 'scene:retry').length >= 1, JSON.stringify(m.calls)); assert.strictEqual(m.fixCalls, 0);
});
await t('prompt rà AI: MUST_CHANGE chỉ khi cốt lõi hoàn toàn vắng, không đòi ví dụ tự nghĩ', () => {
  const p = T.buildSceneReviewPrompt({ scene: { id: 'S2', mustChange: 'Nhã nghi ngờ tăng lên' }, text: 'x', chapterContract: { allowedCharacters: ['A'], forbiddenDrift: [] } });
  assert.ok(/HOÀN TOÀN vắng/.test(p) && /ĐẠT/.test(p) && /KHÔNG tự nghĩ thêm yêu cầu/.test(p));
});
console.log('OK ' + pass + ' test');
})();
