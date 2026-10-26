// V14.3: VÁ CỤC BỘ scene khi rà AI báo MUST_CHANGE/LOCATION_TIME + hiển thị đủ cảnh báo/scene bị giữ.
// V14.0.16: (1) KIỂM TRA TỪNG SCENE — lỗi nặng viết lại đúng scene đó, cảnh báo chỉ ghi telemetry, rà AI tùy chọn;
//           (2) TỰ SỬA SAU CHẤM NHANH — chỉ sửa khi có lỗi nặng/cảnh báo Canon, giữ bản tốt hơn (Best Draft Guard), không làm chương tụt dưới số từ tối thiểu.
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
await t('helper: sceneErrorsPatchable chỉ true khi MỌI lỗi là MUST_CHANGE/LOCATION_TIME', () => {
  assert.ok(T.sceneErrorsPatchable(['MUST_CHANGE: x', 'LOCATION_TIME: y']));
  assert.ok(!T.sceneErrorsPatchable(['MUST_CHANGE: x', 'CAST: y']));
  assert.ok(!T.sceneErrorsPatchable(['NEW_THREAD: z']) && !T.sceneErrorsPatchable([]));
});

await t('helper: applySceneFixInserts chèn đúng neo; rác / neo sai / chèn quá ít → từ chối', () => {
  const base = 'Lan đứng đó. ' + 'mưa đêm cửa sổ. '.repeat(40) + '\n\nĐoạn cuối của cảnh này khép lại.';
  const ok = T.applySceneFixInserts(base, INSERT);
  assert.ok(ok.ok && /chìa khóa nằm trong ngăn kéo/.test(ok.text) && ok.added >= 8, JSON.stringify(ok));
  assert.ok(ok.text.endsWith('Đoạn cuối của cảnh này khép lại.'), 'đoạn kết phải giữ nguyên');
  assert.ok(!T.applySceneFixInserts(base, 'không có khối nào').ok);
  assert.ok(!T.applySceneFixInserts(base, '>>> SAU: câu không tồn tại trong bản\nCâu dài đủ chữ để chèn vào đây nhé bạn ơi.').ok);
  assert.ok(!T.applySceneFixInserts(base, '>>> SAU: Lan đứng đó.\nNgắn quá.').ok, 'chèn dưới 8 từ bị loại');
  assert.ok(!T.applySceneFixInserts(base, '>>> SAU: Đoạn cuối của cảnh này khép lại.\n' + 'thêm chữ nữa '.repeat(5)).ok, 'chèn vào đoạn kết bị loại');
  assert.ok(!T.applySceneFixInserts(base, '>>> SAU: Lan đứng đó.\n' + 'từ '.repeat(400)).ok, 'chèn quá dài bị loại');
});

await t('pipeline: AI rà báo MUST_CHANGE 2 lượt → VÁ CỤC BỘ (không viết lại lần 3), rà lại qua → nhận bản vá', async () => {
  const m = withFix(mkDeps(() => prose(1650, 'Lan đứng đó.'), { deps: { sceneAiReview: true }, reviewReply: (k) => (k === 2 || k === 3 ? FAIL : '{"ok":true,"issues":[]}') }), INSERT);
  const res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(res && !res.rejected, JSON.stringify(res && res.reason));
  assert.strictEqual(m.fixCalls, 1); assert.deepStrictEqual(Array.from(res.stats.scenePatched), ['S2']); assert.strictEqual(res.stats.sceneKept.length, 0, 'đã vá xong thì không còn là scene bị giữ');
  assert.ok(res.stats.sceneWarnings.some(w => /^S2: ĐÃ VÁ CỤC BỘ/.test(w)), JSON.stringify(res.stats.sceneWarnings));
  assert.ok(/chìa khóa nằm trong ngăn kéo thứ hai/.test(res.text), 'câu vá phải nằm trong chương');
  assert.strictEqual(m.calls.filter(c => c === 'scene').length, 4, 'S1, S2, S2(lại), S3 — KHÔNG có lượt viết thứ 3: ' + JSON.stringify(m.calls));
});

await t('pipeline: đã vá nhưng AI vẫn chê → giữ bản đã vá + cảnh báo GIỮ BẢN CUỐI (liệt kê trong sceneKept)', async () => {
  const m = withFix(mkDeps(() => prose(1650, 'Lan đứng đó.'), { deps: { sceneAiReview: true }, reviewReply: (k) => (k >= 2 && k <= 4 ? FAIL : '{"ok":true,"issues":[]}') }), INSERT);
  const res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(res && !res.rejected, JSON.stringify(res && res.reason));
  assert.deepStrictEqual(Array.from(res.stats.sceneKept), ['S2']); assert.deepStrictEqual(Array.from(res.stats.scenePatched), ['S2']);
  assert.ok(res.stats.sceneWarnings.some(w => /GIỮ BẢN CUỐI/.test(w) && /đã vá/.test(w)), JSON.stringify(res.stats.sceneWarnings));
  assert.ok(/chìa khóa nằm trong ngăn kéo thứ hai/.test(res.text));
});

await t('pipeline: AI vá trả rác → fallback V14.2.4 (giữ bản cuối + cảnh báo), không hủy job', async () => {
  const m = withFix(mkDeps(() => prose(1650, 'Lan đứng đó.'), { deps: { sceneAiReview: true }, reviewReply: (k) => (k === 2 || k === 3 ? FAIL : '{"ok":true,"issues":[]}') }), 'xin lỗi tôi không làm được');
  const res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(res && !res.rejected, JSON.stringify(res && res.reason));
  assert.strictEqual(res.stats.scenePatched.length, 0); assert.deepStrictEqual(Array.from(res.stats.sceneKept), ['S2']);
  assert.ok(res.stats.sceneWarnings.some(w => /GIỮ BẢN CUỐI/.test(w) && /vá cục bộ không thành/.test(w)), JSON.stringify(res.stats.sceneWarnings));
});

await t('pipeline: lỗi CAST / NEW_THREAD (cần gỡ nội dung) → KHÔNG vá chèn, giữ như V14.2.4; sceneAiPatch:false cũng tắt vá', async () => {
  let m = withFix(mkDeps(() => prose(1650, 'Lan đứng đó.'), { deps: { sceneAiReview: true }, reviewReply: (k) => (k === 2 || k === 3 ? '{"ok":false,"issues":[{"code":"NEW_THREAD","msg":"tự mở tuyến mới"}]}' : '{"ok":true,"issues":[]}') }), INSERT);
  let res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.strictEqual(m.fixCalls, 0); assert.deepStrictEqual(Array.from(res.stats.sceneKept), ['S2']);
  m = withFix(mkDeps(() => prose(1650, 'Lan đứng đó.'), { deps: { sceneAiReview: true, sceneAiPatch: false }, reviewReply: (k) => (k === 2 || k === 3 ? FAIL : '{"ok":true,"issues":[]}') }), INSERT);
  res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.strictEqual(m.fixCalls, 0); assert.deepStrictEqual(Array.from(res.stats.sceneKept), ['S2']);
});

await t('pipeline: tắt rà AI scene (mặc định) → không có lượt vá, hành vi cũ giữ nguyên', async () => {
  const m = withFix(mkDeps(() => prose(1650, 'Lan đứng đó.')), INSERT);
  const res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.strictEqual(m.fixCalls, 0); assert.strictEqual(res.stats.scenePatched.length, 0);
});

await t('summarizeSceneWarnings: scene GIỮ/ĐÃ VÁ luôn hiện đủ, cảnh báo thường cắt ở 4 và báo số bị ẩn', () => {
  const w = ['S1: a', 'S1: b', 'S2: GIỮ BẢN CUỐI dù AI rà báo (2 lượt)', 'S2: c', 'S3: ĐÃ VÁ CỤC BỘ (+20 từ)', 'S3: d', 'S3: e', 'S3: f'];
  const r = T.summarizeSceneWarnings({ sceneWarnings: w, sceneKept: ['S2'], scenePatched: ['S3'] }, 4);
  assert.strictEqual(r.shown.length, 2 + 4); assert.ok(r.shown.some(x => /GIỮ BẢN CUỐI/.test(x)) && r.shown.some(x => /ĐÃ VÁ/.test(x)));
  assert.strictEqual(r.hidden, 2); assert.deepStrictEqual(Array.from(r.kept), ['S2']); assert.deepStrictEqual(Array.from(r.patched), ['S3']);
  assert.strictEqual(T.summarizeSceneWarnings(null).shown.length, 0);
});


await t('khôi phục: AI rà chê lượt 1, lượt viết lại làm HỎNG kiểm tra cứng → dùng lại bản lượt 1 (KHÔNG SCENE_REJECTED)', async () => {
  // S2: lượt 1 sạch nhưng AI chê; lượt 2 lẫn Kim Chi (ngoài cast) → trước V14.3 là SCENE_REJECTED cả job.
  let s2 = 0;
  const m = mkDeps((n, prompt) => { if (/BỊ TỪ CHỐI/.test(prompt)) return prose(1650, 'Lan nhìn Kim Chi bước vào.'); return prose(1650, 'Lan đứng đó.'); }, { deps: { sceneAiReview: true }, reviewReply: (k) => (k === 2 ? FAIL : '{"ok":true,"issues":[]}') });
  m.deps.sceneAiPatch = false;
  const res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(res && !res.rejected, JSON.stringify(res && res.reason));
  assert.ok(!/Kim Chi/.test(res.text), 'bản hỏng kiểm tra cứng không được ghép');
  assert.deepStrictEqual(Array.from(res.stats.sceneKept), ['S2']);
  assert.ok(res.stats.sceneWarnings.some(w => /GIỮ BẢN CUỐI/.test(w) && /lượt viết lại sau hỏng/.test(w)), JSON.stringify(res.stats.sceneWarnings));
});

await t('khôi phục: lỗi cứng ngay lượt 1 (không có bản dự phòng) vẫn SCENE_REJECTED như cũ', async () => {
  const m = mkDeps((n) => (n === 1 ? prose(1650, 'Lan đứng đó.') : prose(1650, 'Lan nhìn Kim Chi.')), { deps: { sceneAiReview: true } });
  const res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(res && res.rejected && /SCENE_REJECTED S2/.test(res.reason), JSON.stringify(res));
});

await t('rà AI không đọc được / ok:false không lý do → có cảnh báo, không im lặng coi như đạt', async () => {
  let m = mkDeps(() => prose(1650, 'Lan đứng đó.'), { deps: { sceneAiReview: true }, reviewReply: (k) => (k === 1 ? 'xin lỗi, không phải JSON' : '{"ok":false,"issues":[]}') });
  const res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(res && !res.rejected);
  assert.ok(res.stats.sceneWarnings.some(w => /^S1:.*không đọc được/.test(w)), JSON.stringify(res.stats.sceneWarnings));
  assert.ok(res.stats.sceneWarnings.some(w => /^S2:.*ok=false nhưng không nêu lý do/.test(w)), JSON.stringify(res.stats.sceneWarnings));
});

await t('formatSceneNote: dòng tóm tắt cho đường viết thường; rỗng khi không có gì đáng báo', () => {
  assert.strictEqual(T.formatSceneNote({ sceneWarnings: [], sceneKept: [], scenePatched: [] }), '');
  assert.strictEqual(T.formatSceneNote(null), '');
  const n = T.formatSceneNote({ sceneWarnings: ['S2: GIỮ', 'S3: ĐÃ VÁ', 'S1: x', 'S1: y'], sceneKept: ['S2'], scenePatched: ['S3'] });
  assert.ok(/giữ dù AI rà báo lỗi: S2/.test(n) && /đã vá cục bộ: S3/.test(n) && /2 cảnh báo scene khác/.test(n), n);
});

console.log('\nV14.3: ' + pass + ' nhóm PASS');
})().catch(e => { console.error('FAIL', e && e.stack || e); process.exit(1); });
