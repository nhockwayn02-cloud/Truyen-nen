// V14.5.9: sổ bằng chứng sự kiện Outline — mỗi mục được giao cho scene, AI trích câu bằng chứng, thiếu thì vá cục bộ đúng scene, cuối chương chốt bằng sổ.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={evidenceInText,buildBeatEvidencePrompt,parseBeatEvidence,beatMissingError,buildSceneFixPrompt,buildAdaptiveScenePlanPrompt,runAdaptiveChapterPipeline,countWords};', ctx);
const T = ctx.__t; let pass = 0; const t = async (n, f) => { await f(); console.log('PASS ' + n); pass++; };
let _seed = 4242; const rnd = () => (_seed = (_seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const LEX = 'mưa đêm cửa sổ ngọn đèn tiếng bước chân hành lang giấy tờ ngăn kéo chìa khóa điện thoại ánh mắt hơi thở căn phòng tấm rèm mùi cà phê chiếc bàn gỗ lá thư cũ'.split(' ');
function prose(words, first) {
  const out = []; let w = 0;
  while (w < words) { const n = 8 + Math.floor(rnd() * 8); const s = []; for (let i = 0; i < n; i++) s.push(LEX[Math.floor(rnd() * LEX.length)]); out.push(s.join(' ') + '.'); w += n; }
  return (first ? first + '\n\n' : '') + out.join('\n\n');
}
const contract = { allowedCharacters: ['Lan'], canonicalCharacters: ['Lan'], knownCharacters: ['Lan', 'Kim Chi'], forbiddenDrift: [], requiredBeats: [], arcGoal: 'Hà theo dõi kho', chapterOutline: 'Sự kiện: Hà quan sát nhà kho.', mustChange: '', openingContinuity: '', userBrief: '', nameSource: '' };
const ITEMS = ['Hà quan sát nhà kho Song Hành', 'Đêm về, gọi Lan xuống tầng hầm B2', 'Bắt Lan ký biên bản giả, đứng yên giữa phòng', 'Bắt Lan tự nói một câu cam kết'];
const SENT = ['', 'Hà đứng quan sát nhà kho Song Hành từ xa suốt buổi tối mưa.', 'Đêm về Hà gọi Lan xuống tầng hầm B2 và khóa cửa lại.', 'Hà bắt Lan ký biên bản giả rồi bắt cô đứng yên giữa phòng.', 'Hà bắt Lan tự nói một câu cam kết trước mặt anh, giọng Lan run lên nhưng cô vẫn nói hết câu.'];
const PLAN = JSON.stringify({ chapterGoal: 'Hà theo dõi kho', endingAnchor: 'Hà đưa Lan về.', scenes: [[1], [2], [3, 4]].map((m, k) => ({ id: 'S' + (k + 1), purpose: 'p', beats: ['b'], characters: ['Lan'], location: 'Kho ' + (k + 1), time: 'Đêm', targetWords: 1650, mustChange: 'Lan biết thêm ' + (k + 1), handoff: 'sang cảnh', outlineItems: m })) });
function mk(opts) {
  opts = opts || {}; const calls = []; let sc = 0; const seenEv = [];
  const sceneFirst = n => opts.noMap ? (n === 1 ? SENT[1] : '') : n === 1 ? SENT[1] : n === 2 ? SENT[2] : (opts.omit4 ? SENT[3] : SENT[3] + ' ' + SENT[4]);
  const deps = Object.assign({
    state: { minChapterWords: 5000, characters: [{ name: 'Lan' }] },
    buildContract: () => Object.assign(JSON.parse(JSON.stringify(contract)), opts.noMap ? { outlineItems: [], chapterOutline: 'Sự kiện: ' + ITEMS[0] + '; ' + ITEMS[1] + '.' } : { outlineItems: ITEMS, outlineMeta: { hook: 'Hà đưa cô về' } }),
    requiredBeats: () => '', style: () => '', route: () => ({ model: 'm', nsfw: false }), outlineComplete: true,
    callAI: async (p) => {
      if (/BẠN LÀ BIÊN KỊCH TIỂU THUYẾT/.test(p)) { calls.push('plan'); return { text: PLAN }; }
      if (/KIỂM TRA SỰ KIỆN BẮT BUỘC/.test(p)) {
        const scope = /của CHƯƠNG/.test(p) ? 'chapter' : 'scene'; calls.push('evidence:' + scope);
        const body = p.split('VĂN BẢN:\n')[1] || '';
        const ns = Array.from(p.split('SỰ KIỆN CẦN KIỂM TRA:\n')[1].split('\n\nVĂN BẢN:')[0].matchAll(/^(\d+)\. /gm)).map(x => Number(x[1]));
        seenEv.push(ns.join(','));
        const items = ns.map(n => body.includes(SENT[n]) ? { n, done: true, evidence: opts.fakeEvidence ? 'câu này hoàn toàn không có trong văn bản đâu nhé' : SENT[n] } : { n, done: false, evidence: '' });
        return { text: JSON.stringify({ items }) };
      }
      if (/VÁ CỤC BỘ MỘT SCENE/.test(p)) {
        calls.push('fix');
        const body = (p.split(/=====\n/)[1] || '').split('\n\n')[0].trim().split(/\s+/);
        return { text: '>>> SAU: ' + body.slice(-8).join(' ') + '\n' + (opts.noMap ? SENT[2] : SENT[4]) };
      }
      if (/VIẾT BỔ SUNG/.test(p)) { calls.push('topup'); return { text: prose(700, 'Lan viết thêm.') }; }
      sc++; calls.push('scene');
      return { text: prose(1650, sceneFirst(sc)) };
    }
  }, opts.deps);
  return { deps, calls, seenEv };
}
const OPTS = { context: '', priorChapters: [], model: 'm' };
(async () => {
await t('evidenceInText: nguyên văn đúng; bịa thì sai; lệch vài chữ vẫn nhận; quá ngắn không nhận', () => {
  const txt = 'Hà đứng quan sát nhà kho Song Hành từ xa suốt buổi tối mưa. Lan im lặng.';
  assert.ok(T.evidenceInText('Hà đứng quan sát nhà kho Song Hành từ xa', txt));
  assert.ok(T.evidenceInText('Hà đứng quan sát nhà kho Song Hành từ xa suốt tối mưa', txt));
  assert.ok(!T.evidenceInText('Hà bắt Lan ký biên bản giả rồi đứng yên', txt));
  assert.ok(!T.evidenceInText('Lan im', txt));
});
await t('parseBeatEvidence: done=true nhưng câu trích không có trong văn bản -> coi là THIẾU; thiếu mục -> unknown; JSON hỏng -> null', () => {
  const txt = 'Hà đứng quan sát nhà kho Song Hành từ xa suốt buổi tối mưa.';
  const r = T.parseBeatEvidence(JSON.stringify({ items: [{ n: 1, done: true, evidence: 'Hà đứng quan sát nhà kho Song Hành từ xa' }, { n: 2, done: true, evidence: 'một câu bịa hoàn toàn không tồn tại' }] }), [1, 2, 3], txt);
  assert.deepStrictEqual(Array.from(r.missing), [2]); assert.deepStrictEqual(Array.from(r.unknown), [3]); assert.strictEqual(r.results[0].done, true);
  assert.strictEqual(T.parseBeatEvidence('không phải json', [1], txt), null);
});
await t('prompt kế hoạch yêu cầu mustChange nêu kết quả "xong khi"; prompt bằng chứng liệt kê từng mục', () => {
  const p = T.buildAdaptiveScenePlanPrompt({ state: {}, chapterContract: contract, outlineItems: ITEMS, outlineMeta: {}, requiredBeats: '' });
  assert.ok(/xong khi/.test(p));
  const q = T.buildBeatEvidencePrompt({ items: [{ n: 3, text: ITEMS[2] }], text: 'abc', scope: 'scene' });
  assert.ok(/3\. Bắt Lan ký biên bản giả/.test(q) && /KIỂM TRA SỰ KIỆN BẮT BUỘC/.test(q));
});
await t('chương đủ sự kiện: mỗi scene được kiểm tra bằng chứng, KHÔNG vá, KHÔNG bù, sổ đủ 4 mục', async () => {
  const m = mk(); const r = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(r && !r.rejected, JSON.stringify(r && r.reason));
  assert.deepStrictEqual(m.calls.filter(c => c.startsWith('evidence')), ['evidence:scene', 'evidence:scene', 'evidence:scene']);
  assert.ok(!m.calls.includes('fix') && !m.calls.includes('topup'));
  assert.strictEqual(r.stats.outlineMissing.length, 0); assert.strictEqual(r.stats.beatChecks, 3);
  assert.deepStrictEqual([1, 2, 3, 4].map(n => r.stats.beatLedger[n].done), [true, true, true, true]);
  assert.ok(/Hà bắt Lan tự nói một câu cam kết/.test(r.stats.beatLedger[4].evidence));
});
await t('scene thiếu mục 4: vá CỤC BỘ đúng scene đó (1 lời gọi vá, không nối thêm sau câu kết), sổ ghi done', async () => {
  const m = mk({ omit4: true }); const r = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(r && !r.rejected, JSON.stringify(r && r.reason));
  assert.strictEqual(m.calls.filter(c => c === 'fix').length, 1); assert.ok(!m.calls.includes('topup'));
  assert.ok(r.text.includes(SENT[4]), 'câu sự kiện 4 phải nằm trong chương');
  assert.ok(r.stats.scenePatched.includes('S3')); assert.strictEqual(r.stats.beatLedger[4].done, true); assert.strictEqual(r.stats.outlineMissing.length, 0);
  const pos = r.text.indexOf(SENT[4]); assert.ok(pos < r.text.length - 200, 'không được chèn sau đoạn cuối');
});
await t('AI bịa bằng chứng (câu trích không có trong văn bản) -> bị coi là thiếu và chương KHÔNG được ghi done', async () => {
  const m = mk({ fakeEvidence: true }); const r = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(r && !r.rejected, JSON.stringify(r && r.reason));
  assert.ok(r.stats.outlineMissing.length > 0 || r.stats.beatChecks > 3);
  assert.notStrictEqual(r.stats.beatLedger[1] && r.stats.beatLedger[1].done, true);
});
await t('Outline không đánh số (không có ánh xạ scene): chốt cuối chương bằng 1 lần kiểm tra bằng chứng cả chương, rồi CHÈN mục thiếu vào scene (không nối sau câu kết)', async () => {
  const m = mk({ noMap: true }); const r = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(r && !r.rejected, JSON.stringify(r && r.reason));
  assert.ok(m.calls.includes('evidence:chapter') && m.calls.includes('fix') && !m.calls.includes('topup'), m.calls.join(','));
  assert.ok(r.text.includes(SENT[2]) && r.stats.beatRepaired.length === 1 && r.stats.outlineMissing.length === 0);
  assert.ok(r.text.indexOf(SENT[2]) < r.text.length - 200);
});
await t('tắt bằng deps.sceneBeatCheck=false + beatLedger=false -> không gọi kiểm tra bằng chứng (hành vi cũ)', async () => {
  const m = mk({ deps: { sceneBeatCheck: false, beatLedger: false } }); const r = await T.runAdaptiveChapterPipeline(OPTS, m.deps);
  assert.ok(r && !r.rejected); assert.ok(!m.calls.some(c => c.startsWith('evidence')));
});
console.log('OK ' + pass + ' test');
})().catch(e => { console.error('FAIL', e && e.stack || e); process.exit(1); });
