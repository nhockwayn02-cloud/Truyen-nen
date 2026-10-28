// V14.3.8: cắt câu cụt cuối scene, cầu nối bắt buộc khi đổi nơi/giờ, gộp HANDOFF, từ vay mượn không bị báo "từ lạ", nâng mục tiêu từ trong prompt.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={trimDanglingSceneEnd,sceneBridgeBlock,buildAdaptiveSceneWritePrompt,summarizeSceneWarnings,findStrayWords,buildSceneReviewPrompt,countWords};', ctx);
const T = ctx.__t; let pass = 0; const t = (n, f) => { f(); console.log('PASS ' + n); pass++; };
const body = 'Mỹ Duyên đứng im giữa hành lang, hơi thở đứt quãng và đôi tay run lên. Hắn nhìn cô rất lâu rồi bước tới gần hơn một bước.';
t('trimDangling: bỏ phần câu dở ngắn ở cuối, giữ câu hoàn chỉnh', () => {
  const r = T.trimDanglingSceneEnd(body + ' Cô cắn chặt môi và khẽ nói rằng mình không');
  assert.strictEqual(r, body); 
});
t('trimDangling: câu hoàn chỉnh / kết bằng ngoặc kép giữ nguyên', () => {
  assert.strictEqual(T.trimDanglingSceneEnd(body), body);
  const q = body + ' “Đi theo tôi.”'; assert.strictEqual(T.trimDanglingSceneEnd(q), q);
});
t('trimDangling: phần dở dài > 60 từ thì không đụng (tránh mất nội dung)', () => {
  const longTail = ' ' + Array.from({ length: 80 }, (_, i) => 'chữ' + i).join(' ');
  const x = body + longTail; assert.strictEqual(T.trimDanglingSceneEnd(x), x);
});
t('cầu nối: khác địa điểm/giờ -> có khối CẦU NỐI; cùng nơi hoặc "Tiếp nối" -> không có', () => {
  const a = { location: 'Hành lang văn phòng', time: 'Buổi sáng' }, b = { location: 'Tầng hầm B2', time: 'Buổi tối' };
  assert.ok(/CẦU NỐI BẮT BUỘC/.test(T.sceneBridgeBlock(b, a)));
  assert.strictEqual(T.sceneBridgeBlock({ location: 'Phòng khách căn hộ', time: 'Tiếp nối S1' }, { location: 'Căn hộ', time: 'Đêm' }), '');
  assert.strictEqual(T.sceneBridgeBlock(a, null), '');
});
t('prompt scene có CẦU NỐI khi truyền prevScene', () => {
  const p = T.buildAdaptiveSceneWritePrompt({ state: {}, scene: { id: 'S3', location: 'Tầng hầm B2', time: 'Buổi tối', beats: ['x'], mustChange: 'y' }, prevScene: { location: 'Hành lang', time: 'Buổi sáng' } });
  assert.ok(/CẦU NỐI BẮT BUỘC/.test(p));
});
t('tóm tắt cảnh báo: gộp HANDOFF thành một dòng ngắn', () => {
  const st = { sceneWarnings: ['S2: HANDOFF: dài dài dài', 'S3: HANDOFF: dài dài dài', 'S1: scene ngắn'], sceneKept: [], scenePatched: [] };
  const r = T.summarizeSceneWarnings(st, 4);
  assert.ok(r.shown.some(x => /HANDOFF, không phải lỗi\): S2, S3/.test(x)) && !r.shown.some(x => /dài dài/.test(x)), JSON.stringify(r.shown));
  assert.ok(r.shown.includes('S1: scene ngắn'));
});
t('từ vay mượn (robot, router, notebook, mini...) không bị báo là từ lạ; chữ rò thật vẫn báo', () => {
  const s = T.findStrayWords('Cô mở notebook, bật router rồi nhìn con robot mini và tiếng micro, đo decibel với bộ analog.', []);
  ['notebook', 'router', 'robot', 'mini', 'micro', 'decibel', 'analog'].forEach(w => assert.ok(!s.includes(w), w + ' bị báo nhầm'));
  assert.ok(T.findStrayWords('Hắn nói crazy rất nhỏ rồi quay đi.', []).includes('crazy'));
});
t('rà AI scene: không báo HANDOFF chỉ vì scene sau khác nơi/giờ', () => {
  const p = T.buildSceneReviewPrompt({ scene: { id: 'S2' }, text: 'x', chapterContract: { allowedCharacters: [], forbiddenDrift: [] } });
  assert.ok(/KHÔNG báo vì scene sau khác địa điểm/.test(p));
});
console.log('OK ' + pass + ' test');
