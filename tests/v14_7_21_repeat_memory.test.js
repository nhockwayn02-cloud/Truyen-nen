// V14.7.21: hồ sơ nhân vật bị lặp ý (diễn đạt lại) + Memory chỉ ghi 1 sự kiện/16 chương.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={segmentsNearDuplicate,dedupeTextSegments,mergeTextSegments,cleanCharacterRepeats,fieldQuoteSupports};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
// Mẫu lấy từ ảnh chụp ô "tính cách" của Quỳnh Anh (một ý lặp lại nhiều lần với từ ngữ hơi khác).
const REPEATED = ['mâu thuẫn giữa sự kiêu kỳ, tự tôn của một thư ký cấp cao với sự yếu đuối, sợ hãi và hưng phấn khi bị áp chế.', 'dễ bị cuốn theo khoái cảm dù ban đầu sợ hãi.',
  'mâu thuẫn giữa sự tự tôn của một thư ký cấp cao với sự yếu đuối, sợ hãi và hưng phấn khi bị áp chế', 'mâu thuẫn giữa sự kiêu kỳ, tự tôn của một thư ký cấp cao với sự yếu đuối, hưng phấn khi bị áp chế',
  'mâu thuẫn giữa sự kiêu kỳ của một thư ký cấp cao với sự yếu đuối, hưng phấn khi bị áp chế', 'mâu thuẫn giữa sự kiêu kỳ của một thư ký cấp cao và sự yếu đuối, hưng phấn khi bị áp chế',
  'dễ bị chi phối bởi cảm xúc và nỗi sợ hãi bị phát hiện.', 'dễ bị chi phối bởi cảm xúc và nỗi sợ hãi.', 'mâu thuẫn giữa sự kiêu hãnh của một thư ký cấp cao và sự yếu đuối, hưng phấn khi bị áp chế',
  'dễ bị chi phối bởi nỗi sợ và sự nhục nhã.'];
t('diễn đạt lại cùng một ý bị nhận ra là gần trùng; ý khác thì không', () => {
  assert.ok(F.segmentsNearDuplicate(REPEATED[0], REPEATED[2])); assert.ok(F.segmentsNearDuplicate(REPEATED[4], REPEATED[8]));
  assert.ok(!F.segmentsNearDuplicate('thích kiểm soát người khác bằng lời nói', 'sợ bóng tối từ nhỏ do tai nạn'));
});
t('dọn chuỗi lặp từ ảnh: chỉ còn vài ý riêng biệt', () => {
  const before = REPEATED.join('; '), after = F.dedupeTextSegments(before), n = after.split('; ').length;
  assert.ok(n <= 4, 'còn ' + n + ' đoạn: ' + after); assert.ok(after.includes('mâu thuẫn giữa sự kiêu kỳ, tự tôn'), 'giữ bản đầu tiên'); assert.ok(after.includes('cuốn theo khoái cảm'), 'giữ ý khác'); assert.ok(after.length < before.length / 2);
});
t('nối thêm câu diễn đạt lại KHÔNG phình hồ sơ; ý mới thật sự vẫn được thêm', () => {
  const base = REPEATED[0] + '; ' + REPEATED[1];
  assert.strictEqual(F.mergeTextSegments(base, 'mâu thuẫn giữa sự kiêu hãnh của thư ký cấp cao và sự yếu đuối, hưng phấn khi bị áp chế'), base);
  const m = F.mergeTextSegments(base, 'bắt đầu chủ động tìm đến Bùi Lạc sau giờ làm'); assert.ok(m.includes('chủ động tìm đến Bùi Lạc') && m.startsWith(REPEATED[0]));
});
t('cleanCharacterRepeats dọn cả nhân vật phụ lẫn nhân vật chính', () => {
  const st = { mainCharProfile: { name: 'Lạc', personality: REPEATED.slice(0, 6).join('; ') }, characters: [{ name: 'Quỳnh Anh', personality: REPEATED.join('; '), secret: 'ngắn' }] };
  const r = F.cleanCharacterRepeats(st); assert.strictEqual(r.chars, 2); assert.ok(r.fields >= 2 && r.saved > 100); assert.strictEqual(st.characters[0].secret, 'ngắn');
});
t('Memory: ghi sự kiện/điểm gieo/dữ kiện chỉ cần câu trích thật (mẫu bị loại ở ngưỡng cũ nay qua)', () => {
  const SRC = 'Anh từng ở đội đặc nhiệm ba năm, cô nghe đồn từ lâu. Dưới đáy ngăn kéo, chiếc nhẫn cũ hằn một ký hiệu lạ.';
  assert.ok(F.fieldQuoteSupports('Quỳnh Anh biết Bùi Lạc từng là cựu đặc nhiệm', 'Anh từng ở đội đặc nhiệm ba năm, cô nghe đồn từ lâu.', SRC));
  assert.ok(F.fieldQuoteSupports('Chiếc nhẫn cũ sẽ liên quan đến thân phận thật của Bùi Lạc', 'Dưới đáy ngăn kéo, chiếc nhẫn cũ hằn một ký hiệu lạ.', SRC));
  assert.ok(!F.fieldQuoteSupports('x y', 'Câu này hoàn toàn bịa đặt không có trong chương', SRC));
});
t('worker/client/prompt đã nối đúng', () => {
  const w = fs.readFileSync(path.join(__dirname, '../netlify/functions/write-chapter-background.js'), 'utf8'), c = fs.readFileSync(path.join(__dirname, '../app/client.js'), 'utf8'), h = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(!/fieldEvidenceSupports\((e\.summary|f\.description|k\.fact)/.test(w), 'cổng Memory không còn so từ khóa'); assert.ok(w.includes('events = 3–6 sự kiện chính') && w.includes('CHỐNG LẶP HỒ SƠ') && w.includes('return mergeTextSegments(a, b, max)'));
  assert.ok(c.includes('mergeTextSegments(old, value, 2500)') && c.includes('không ép phải điền') && c.includes('charTextCleanBtn')); assert.ok(h.includes('id="charTextCleanBtn"'));
});
process.exit(bad ? 1 : 0);
