// V14.7.3: pipeline từng scene phải mang ĐỦ quy tắc 18+ theo mức người dùng chọn (trước đây: nén còn 330 ký tự, "Cực mạnh" bị hạ xuống "Mạnh",
// không có bộ quy tắc erotic) — và vẫn tôn trọng mức nhẹ hơn + rào chắn tuổi.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'app/client.js'), 'utf8'), worker = fs.readFileSync(path.join(root, 'netlify/functions/write-chapter-background.js'), 'utf8'), core = fs.readFileSync(path.join(root, 'shared/core.js'), 'utf8');
function grab(src, startRe, endMarker) { const i = src.search(startRe); assert.ok(i >= 0, 'không thấy ' + startRe); const j = src.indexOf(endMarker, i); return src.slice(i, j + endMarker.length); }
function loadStyleLock(src, st) {
  const code = [grab(src, /const EXPLICIT_PROMPTS = \{/, '\n};'), /const EROTIC_SCENE_LOCK/.test(src) ? grab(src, /const EROTIC_SCENE_LOCK/, '";') : '', grab(src, /function compactSceneStyleLock\(/, '\n}\n')].join('\n');
  const ctx = { state: st, ageGuardPrompt: () => 'RÀO CHẮN TUỔI (bắt buộc): chỉ nhân vật từ 18 tuổi trở lên.', buildVocabularyBlock: () => 'từ vựng giả lập' };
  vm.createContext(ctx); vm.runInContext(code + '\n;globalThis.__f = compactSceneStyleLock;', ctx); return ctx.__f;
}
let bad = 0; const test = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
for (const [name, src] of [['client', client], ['worker', worker]]) {
  test(name + ': "Cực mạnh" dùng đúng mức wild, không bị hạ xuống strong', () => {
    const t = loadStyleLock(src, { mature: true, explicitLevel: 'wild' })(true);
    assert.match(t, /CỰC MẠNH/); assert.match(t, /thô tục/); assert.match(t, /không fade-to-black/i);
  });
  test(name + ': mức Mạnh mang bộ quy tắc cảnh nóng đầy đủ (4 lớp, không tóm tắt cao trào)', () => {
    const t = loadStyleLock(src, { mature: true, explicitLevel: 'strong' })(true);
    assert.match(t, /4 lớp/); assert.match(t, /không tóm tắt/i); assert.match(t, /cơ thể/i); assert.match(t, /RÀO_CHẮN_TUỔI/);
  });
  test(name + ': mức Nhẹ/Gợi cảm KHÔNG bị ép từ thô tục (tôn trọng lựa chọn)', () => {
    for (const lv of ['subtle', 'sensual']) { const t = loadStyleLock(src, { mature: true, explicitLevel: lv })(true); assert.ok(!/thô tục/.test(t.replace(/mức_18\+=[^;]*/, '')), lv); assert.ok(!/4 lớp/.test(t), lv); }
  });
  test(name + ': truyện không bật 18+ không có quy tắc nóng', () => {
    const t = loadStyleLock(src, { mature: false, explicitLevel: 'wild' })(false); assert.ok(!/thô tục|CỰC MẠNH|RÀO_CHẮN/.test(t));
  });
}
test('SCENE_SYSTEM_PROMPT: scene nóng giữa người lớn viết thẳng, giữ rào chắn tuổi tối cao', () => {
  const m = core.match(/const SCENE_SYSTEM_PROMPT = "([^"]*)"/); assert.ok(m);
  assert.match(m[1], /không fade-to-black/i); assert.match(m[1], /RÀO_CHẮN_TUỔI/); assert.match(m[1], /không bao giờ bị chỉ dẫn khác ghi đè/);
});
test('STYLE LOCK trong prompt scene không bị cắt ở 1500 ký tự', () => { assert.ok(!/slice\(0, 1500\)/.test(core.slice(core.indexOf('function buildAdaptiveSceneWritePrompt'), core.indexOf('function buildAdaptiveSceneWritePrompt') + 6000).split('STYLE LOCK')[1] || '')); });
function loadAdultModelFor(src, st) {
  const code = [grab(src, /function adultModelFor\(/, '\n}\n')].join('\n');
  const ctx = { state: st, matureFocusAllowsRouting: () => st.chapterMatureFocus !== 'none', textHasNsfwKeyword: t => /làm tình/.test(t) };
  vm.createContext(ctx); vm.runInContext(code + '\n;globalThis.__f = adultModelFor;', ctx); return ctx.__f;
}
for (const [name, src] of [['client', client], ['worker', worker]]) {
  if (!/function adultModelFor\(/.test(src)) continue;
  test(name + ': adultModelFor — chế độ "Luôn dùng" luôn chuyển model 18+ cho tóm tắt/gợi ý, kể cả khi đoạn không có từ khóa', () => {
    const st = { mature: true, nsfwMode: 'always', modelNsfw: 'unc/model', chapterMatureFocus: 'primary' };
    assert.equal(loadAdultModelFor(src, st)('Anh nhìn cô rất lâu rồi kéo cô vào lòng.'), 'unc/model');
  });
  test(name + ': adultModelFor — chế độ tự động vẫn cần từ khóa; "Không bao giờ"/NONE/tắt 18+ thì không chuyển', () => {
    const f = (st, t) => loadAdultModelFor(src, Object.assign({ mature: true, nsfwMode: 'auto', modelNsfw: 'unc', chapterMatureFocus: 'primary' }, st))(t);
    assert.equal(f({}, 'trời mưa'), undefined); assert.equal(f({}, 'họ làm tình'), 'unc');
    assert.equal(f({ nsfwMode: 'never' }, 'họ làm tình'), undefined); assert.equal(f({ chapterMatureFocus: 'none', nsfwMode: 'always' }, 'x'), undefined); assert.equal(f({ mature: false, nsfwMode: 'always' }, 'x'), undefined);
  });
}
process.exit(bad ? 1 : 0);
