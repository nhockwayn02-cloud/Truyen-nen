// V14.0.16: (1) KIỂM TRA TỪNG SCENE — lỗi nặng viết lại đúng scene đó, cảnh báo chỉ ghi telemetry, rà AI tùy chọn;
//           (2) TỰ SỬA SAU CHẤM NHANH — chỉ sửa khi có lỗi nặng/cảnh báo Canon, giữ bản tốt hơn (Best Draft Guard), không làm chương tụt dưới số từ tối thiểu.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={checkSceneQuality,sceneKeywordCoverage,buildSceneReviewPrompt,parseSceneReviewResponse,buildAdaptiveSceneWritePrompt,runAdaptiveChapterPipeline,runQuickAutoFix,quickFixNeeded,reviewIsBetter,countWords};', ctx);
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

(async () => {
await t('checkSceneQuality: lỗi nặng = ngoài cast / quá ngắn / lộ chỉ dẫn; cảnh báo = ngắn so với ngân sách, mustChange, nhân vật vắng', () => {
  const scene = { id: 'S1', targetWords: 1000, mustChange: 'Lan nhận được bản hợp đồng giả từ giám đốc', characters: ['Lan'] };
  let r = T.checkSceneQuality(prose(900, 'Lan mở cửa.') + ' Lan nhận được bản hợp đồng giả từ giám đốc.', scene, { contract });
  assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.warnings.length, 0, JSON.stringify(r.warnings));
  r = T.checkSceneQuality(prose(200, 'Lan thở dài. Kim Chi bước vào.'), scene, { contract });
  assert.ok(!r.ok && r.errors.some(e => /ngoài allowed cast: Kim Chi/.test(e)), JSON.stringify(r));
  r = T.checkSceneQuality('Quá ngắn.', scene, { contract }); assert.ok(!r.ok && r.errors.includes('scene quá ngắn'));
  r = T.checkSceneQuality('Scene 2: ' + prose(300, 'Lan đứng đó.'), scene, { contract }); assert.ok(!r.ok && r.errors.some(e => /lộ chỉ dẫn/.test(e)), JSON.stringify(r.errors));
  r = T.checkSceneQuality(prose(300, 'Lan đứng đó.') + '\n\nSTATE DELTA: {}', scene, { contract }); assert.ok(!r.ok, 'STATE DELTA rò rỉ phải bị bắt');
  r = T.checkSceneQuality(prose(300, 'Minh nhìn ra ngoài.'), scene, { contract });
  assert.ok(r.ok && r.warnings.some(w => /ngắn hơn 50%/.test(w)) && r.warnings.some(w => /mustChange/.test(w)) && r.warnings.some(w => /nhân vật nào/.test(w)), JSON.stringify(r.warnings));
  r = T.checkSceneQuality(prose(300, 'Lan ngồi xuống') .replace(/\.\s*$/, ' và'), scene, { contract });
  assert.ok(r.warnings.some(w => /giữa câu/.test(w)), 'scene cụt phải có cảnh báo: ' + JSON.stringify(r.warnings));
  r = T.checkSceneQuality(prose(300, 'Lan đóng cửa.'), { id: 'S3', targetWords: 400, characters: ['Lan'] }, { contract, isFinal: true, endingAnchor: 'Lan ký tên vào biên bản bàn giao rồi rời tòa nhà' });
  assert.ok(r.warnings.some(w => /điểm kết/.test(w)), JSON.stringify(r.warnings));
});

await t('parseSceneReviewResponse: lỗi chắc chắn → errors, HANDOFF → warnings, rác → null', () => {
  const p = T.parseSceneReviewResponse('Dạ đây:\n{"ok":false,"issues":[{"code":"MUST_CHANGE","msg":"chưa lộ chìa khóa"},{"code":"HANDOFF","msg":"cuối cảnh chưa dẫn sang S2"}]}');
  assert.deepStrictEqual([p.ok, p.errors.length, p.warnings.length], [false, 1, 1]); assert.ok(/MUST_CHANGE/.test(p.errors[0]));
  assert.strictEqual(T.parseSceneReviewResponse('{"ok":true,"issues":[]}').ok, true);
  assert.strictEqual(T.parseSceneReviewResponse('không phải json'), null);
  const pr = T.buildSceneReviewPrompt({ scene: { id: 'S1', mustChange: 'x y z' }, text: 'văn bản', chapterContract: contract });
  assert.ok(/KIỂM TRA MỘT SCENE/.test(pr) && /VĂN BẢN SCENE/.test(pr) && pr.length < 3000, 'prompt rà scene phải gọn');
});

await t('prompt viết scene: có khối correction khi scene bị từ chối, không có khi lần đầu', () => {
  const base = { state: {}, scene: { id: 'S1', targetWords: 800 }, chapterGoal: 'g' };
  assert.ok(!/BỊ TỪ CHỐI/.test(T.buildAdaptiveSceneWritePrompt(base)));
  assert.ok(/BỊ TỪ CHỐI[\s\S]*ngoài allowed cast: Kim Chi/.test(T.buildAdaptiveSceneWritePrompt(Object.assign({ correction: 'scene dùng nhân vật ngoài allowed cast: Kim Chi' }, base))));
});

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

await t('pipeline: scene dùng nhân vật ngoài cast → viết lại ĐÚNG scene đó 1 lần, chương vẫn tiếp tục', async () => {
  const { deps, calls } = mkDeps((n, prompt) => (n === 2 ? prose(1650, 'Lan nhìn Kim Chi bước vào.') : prose(1650, 'Lan đứng trong văn phòng.')));
  const res = await T.runAdaptiveChapterPipeline(OPTS, deps);
  assert.ok(res && !res.rejected, JSON.stringify(res && res.reason));
  assert.strictEqual(res.stats.sceneRetries, 1); assert.deepStrictEqual(Array.from(res.stats.sceneRewritten), ['S2']);
  assert.strictEqual(calls.filter(c => c === 'scene').length, 4, 'S1,S2,S2(retry),S3: ' + JSON.stringify(calls));
  assert.ok(!/Kim Chi/.test(res.text), 'bản scene lỗi không được ghép vào chương');
});

await t('pipeline: scene lỗi mãi → SCENE_REJECTED sau lượt viết lại (an toàn, không ghép)', async () => {
  const { deps, calls } = mkDeps((n) => (n === 1 ? prose(1650, 'Lan đứng đó.') : prose(1650, 'Lan nhìn Kim Chi.')));
  const res = await T.runAdaptiveChapterPipeline(OPTS, deps);
  assert.ok(res && res.rejected && /SCENE_REJECTED S2 \(sau 2 lượt viết\).*Kim Chi/.test(res.reason), JSON.stringify(res));
  assert.strictEqual(calls.filter(c => c === 'scene').length, 3);
});

await t('pipeline: hết thời gian thì KHÔNG viết lại scene (dừng an toàn)', async () => {
  let left = Infinity; const { deps } = mkDeps((n) => (n === 1 ? prose(1650, 'Lan đứng đó.') : prose(1650, 'Lan nhìn Kim Chi.')), { deps: { timeLeft: () => left, minSceneMs: 1000 } });
  const orig = deps.callAI; let sc = 0; deps.callAI = async (p, o) => { const r = await orig(p, o); if (/VIẾT SCENE TIẾP NỐI/.test(p) && ++sc === 2) left = 10; return r; };
  const res = await T.runAdaptiveChapterPipeline(OPTS, deps);
  assert.ok(res && res.rejected && !/sau 2 lượt/.test(res.reason), JSON.stringify(res));
});

await t('pipeline: cảnh báo mềm không tốn lượt viết lại; chỉ vào telemetry', async () => {
  const { deps, calls } = mkDeps((n) => prose(1650, 'Minh đứng trong văn phòng.'));
  const res = await T.runAdaptiveChapterPipeline(OPTS, deps);
  assert.ok(res && !res.rejected && res.stats.sceneRetries === 0 && res.stats.sceneWarnings.length > 0, JSON.stringify(res.stats));
  assert.strictEqual(calls.filter(c => c === 'scene').length, 3);
});

await t('pipeline: rà AI từng scene (tùy chọn) — lỗi MUST_CHANGE → viết lại scene; tắt thì không gọi', async () => {
  let m = mkDeps(() => prose(1650, 'Lan đứng đó.'), { deps: { sceneAiReview: true }, reviewReply: (k) => (k === 2 ? '{"ok":false,"issues":[{"code":"MUST_CHANGE","msg":"Lan chưa biết thêm điều 2"}]}' : '{"ok":true,"issues":[]}') });
  let res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(res && !res.rejected, JSON.stringify(res && res.reason));
  assert.deepStrictEqual(Array.from(res.stats.sceneRewritten), ['S2']); assert.strictEqual(m.calls.filter(c => c === 'sceneReview').length, 4, JSON.stringify(m.calls));
  m = mkDeps(() => prose(1650, 'Lan đứng đó.'));
  res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.strictEqual(m.calls.filter(c => c === 'sceneReview').length, 0, 'mặc định không rà AI scene');
});

await t('V14.2.4: scene chỉ bị rà AI từ chối mãi → GIỮ bản cuối + cảnh báo (không hủy cả job)', async () => {
  const m = mkDeps(() => prose(1650, 'Lan đứng đó.'), { deps: { sceneAiReview: true }, reviewReply: (k) => (k >= 2 && k <= 3 ? '{"ok":false,"issues":[{"code":"MUST_CHANGE","msg":"Thiếu chi tiết cụ thể theo Contract"}]}' : '{"ok":true,"issues":[]}') });
  const res = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(res && !res.rejected, JSON.stringify(res && res.reason));
  assert.ok(res.stats.sceneWarnings.some(w => /GIỮ BẢN CUỐI/.test(w) && /Thiếu chi tiết/.test(w)), JSON.stringify(res.stats.sceneWarnings));
});

// ---- Tự sửa sau chấm nhanh ----
const REV = (verdict, score, hard = [], warn = []) => ({ verdict, score, hardFailures: hard, warnings: warn, rewriteInstructions: [] });
const mkCh = () => ({ text: prose(5000, 'Bản gốc.'), wordCount: 5000 });

await t('quickFixNeeded: PASS không sửa; HARD_FAIL sửa; SOFT_FAIL chỉ sửa khi có cảnh báo Canon hành động được', () => {
  assert.ok(!T.quickFixNeeded(REV('PASS', 95)));
  assert.ok(T.quickFixNeeded(REV('HARD_FAIL', 50, ['thiếu beat'])));
  assert.ok(!T.quickFixNeeded(REV('SOFT_FAIL', 80, [], ['văn phong hơi lặp'])));
  assert.ok(T.quickFixNeeded(REV('SOFT_FAIL', 80, [], ['Canon: nhân vật sai giới tính'])));
});

await t('runQuickAutoFix: sửa → chấm lại tốt hơn → giữ bản sửa', async () => {
  const ch = mkCh(), orig = ch.text; let rewrites = 0;
  const fx = await T.runQuickAutoFix(ch, REV('HARD_FAIL', 55, ['thiếu beat [R1]']), {
    rewrite: async () => { rewrites++; ch.text = orig + '\n\nĐã vá beat R1.'; ch.wordCount = 5004; return { ok: true, patched: 2 }; },
    review: async () => ({ ok: true, review: REV('PASS', 91) })
  }, { maxRounds: 2, minWords: 4500 });
  assert.ok(fx.attempted && fx.improved && !fx.restored && rewrites === 1, JSON.stringify(fx));
  assert.strictEqual(fx.after.verdict, 'PASS'); assert.ok(/Đã vá beat R1/.test(ch.text)); assert.strictEqual(fx.patched, 2);
});

await t('runQuickAutoFix: bản sửa KÉM HƠN → khôi phục bản cũ (Best Draft Guard)', async () => {
  const ch = mkCh(), orig = ch.text;
  const fx = await T.runQuickAutoFix(ch, REV('HARD_FAIL', 60, ['a']), {
    rewrite: async () => { ch.text = 'hỏng ' + orig; ch.wordCount = 5001; return { ok: true, patched: 1 }; },
    review: async () => ({ ok: true, review: REV('HARD_FAIL', 40, ['a', 'b']) })
  }, { maxRounds: 2 });
  assert.ok(fx.restored && !fx.improved && ch.text === orig && fx.after.score === 60, JSON.stringify(fx));
});

await t('runQuickAutoFix: chấm lại lỗi / sửa bị từ chối / làm chương dưới số từ tối thiểu / hết giờ → luôn giữ bản cũ', async () => {
  let ch = mkCh(), orig = ch.text;
  let fx = await T.runQuickAutoFix(ch, REV('HARD_FAIL', 60, ['a']), { rewrite: async () => { ch.text = 'x'; ch.wordCount = 1; return { ok: true, patched: 1 }; }, review: async () => ({ ok: false, reason: 'review_parse' }) }, {});
  assert.ok(fx.restored && ch.text === orig && /không chấm lại được/.test(fx.reason), JSON.stringify(fx));
  fx = await T.runQuickAutoFix(ch, REV('HARD_FAIL', 60, ['a']), { rewrite: async () => ({ ok: false, reason: 'AI không trả danh sách vá hợp lệ' }), review: async () => { throw new Error('không được gọi'); } }, {});
  assert.ok(fx.attempted && ch.text === orig && /bị từ chối/.test(fx.reason), JSON.stringify(fx));
  ch = mkCh(); orig = ch.text; let reviewed = 0;
  fx = await T.runQuickAutoFix(ch, REV('HARD_FAIL', 60, ['a']), { rewrite: async () => { ch.text = prose(3000, 'cụt.'); ch.wordCount = 3000; return { ok: true, patched: 1 }; }, review: async () => { reviewed++; return { ok: true, review: REV('PASS', 99) }; } }, { minWords: 4500 });
  assert.ok(fx.restored && ch.text === orig && reviewed === 0 && /dưới 4500/.test(fx.reason), JSON.stringify(fx));
  fx = await T.runQuickAutoFix(ch, REV('HARD_FAIL', 60, ['a']), { rewrite: async () => { throw new Error('không được gọi'); }, review: async () => null, timeLeft: () => 5000 }, { minRoundMs: 120000 });
  assert.ok(!fx.attempted && /hết thời gian/.test(fx.reason), JSON.stringify(fx));
  fx = await T.runQuickAutoFix(ch, REV('PASS', 95), { rewrite: async () => { throw new Error('không được gọi'); }, review: async () => null }, {});
  assert.ok(!fx.attempted);
});

await t('runQuickAutoFix: nhiều vòng — vòng 2 chỉ chạy khi vòng 1 cải thiện nhưng chưa hết lỗi', async () => {
  const ch = mkCh(); let round = 0; const seq = [REV('HARD_FAIL', 70, ['b']), REV('PASS', 92)];
  const fx = await T.runQuickAutoFix(ch, REV('HARD_FAIL', 50, ['a', 'b']), {
    rewrite: async () => { round++; ch.text += '\n\nvá ' + round; ch.wordCount += 5; return { ok: true, patched: 1 }; },
    review: async () => ({ ok: true, review: seq[round - 1] })
  }, { maxRounds: 3 });
  assert.strictEqual(fx.rounds, 2); assert.strictEqual(fx.after.verdict, 'PASS'); assert.ok(fx.improved && !fx.restored);
});

console.log('\nV14.0.16: ' + pass + ' nhóm PASS');
})().catch(e => { console.error('FAIL', e && e.stack || e); process.exit(1); });
