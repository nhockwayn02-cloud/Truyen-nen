// V14.7.38: bước Arc tự đo theo diễn biến thật, chỉ đưa bước hiện tại + kế vào kế hoạch chương.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(core + '\n;this.f={arcSentences,arcStageEstimate,arcStageBlock,arcProgressPrompt}', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const goal = [
  'Bùi Lạc là bảo vệ ca đêm bị khinh thường trong công ty tài chính.', 'Hắn lén tu luyện Huyền Nguyên Quyết trong góc tối kho lạnh.',
  'Hắn chặn đường nữ thư ký trong thang máy đêm khuya để tống tiền bằng video.', 'Hắn ép ả lên văn phòng riêng và bắt tự cởi đồ quỳ xuống.',
  'Hắn dùng roi da quất vào mông ả và trói tay bằng cà vạt.', 'Hắn dùng trứng rung điều khiển từ xa bắt ả đeo trong cuộc họp.',
  'Ả quỳ trước gương tuyên thệ làm thú cưng của chủ nhân.', 'Hắn mở rộng sang các trưởng phòng khác từng ký lệnh đuổi việc hắn.',
  'Một trưởng phòng bị gài bẫy bằng hồ sơ tài chính giả và khuất phục.', 'Từ miệng những kẻ bị khuất phục lộ ra âm mưu năm xưa về bí mật công nghệ.',
  'Cuối cùng nữ CEO bị bao vây bằng chính bộ máy công ty và quỳ tuyên thệ.', 'Arc khép lại khi hắn nắm cả kim tự tháp trong tay.'].join(' ');
const mk = (sums, extra) => Object.assign({ arcs: [{ name: 'A1', status: 'active', startChapter: 1, endChapterPlanned: 150, goal }], chapters: sums.map(s => ({ summary: s })) }, extra || {});
t('tách câu Arc theo thứ tự, ghép câu quá ngắn', () => { const s = F.arcSentences(goal); assert.ok(s.length >= 6 && s.length <= 12); assert.ok(s[0].includes('bảo vệ ca đêm')); });
t('theo diễn biến thật: chương nói về trứng rung -> bước hiện tại là trứng rung, KHÔNG lộ CEO/âm mưu', () => {
  const st = mk(['Bùi Lạc chặn đường nữ thư ký trong thang máy đêm khuya và tống tiền bằng video', 'Hắn dùng roi da quất vào mông ả và trói tay bằng cà vạt', 'Hắn dùng trứng rung điều khiển từ xa bắt ả đeo trong cuộc họp'], {});
  st.chapters.length = 3; const b = F.arcStageBlock(st, 4);
  assert.ok(/BƯỚC ARC ƯỚC LƯỢNG/.test(b) && /trứng rung/.test(b), b);
  assert.ok(!/nữ CEO|âm mưu năm xưa|kim tự tháp/.test(b), 'không được lộ phần xa của Arc');
});
t('không có chương nào -> lùi về tiến độ chương, vẫn có khối và không nổ', () => { const e = F.arcStageEstimate(mk([]), 1); assert.strictEqual(e.by, 'tiến độ chương'); assert.ok(F.arcStageBlock(mk([]), 1).length > 50); });
t('khớp nhầm ở phần xa bị chặn bởi phần trăm chương', () => {
  const st = mk(['nữ CEO bị bao vây bằng chính bộ máy công ty và quỳ tuyên thệ kim tự tháp']); const e = F.arcStageEstimate(st, 2);
  assert.ok(e.cur <= e.pctIdx + Math.ceil(e.S * 0.3), 'cur=' + e.cur + ' pct=' + e.pctIdx);
});
t('truyện đi nhanh hơn nhịp -> nhắc đào sâu; đi đúng nhịp -> không nhắc', () => {
  const fast = mk(Array(5).fill('Ả quỳ trước gương tuyên thệ làm thú cưng của chủ nhân')); const late = Object.assign(mk(Array(5).fill('Ả quỳ trước gương tuyên thệ làm thú cưng của chủ nhân')), {});
  late.arcs[0].endChapterPlanned = 10;
  assert.ok(/NHANH hơn nhịp/.test(F.arcStageBlock(fast, 40)));
  assert.ok(!/NHANH hơn nhịp/.test(F.arcStageBlock(late, 6)));
});
t('có Outline cho chương -> không chèn bước Arc (Outline thắng); chỉ chèn khi opts.stage', () => {
  const st = mk(['a b c']); assert.ok(!F.arcProgressPrompt(st, 2).includes('BƯỚC ARC ƯỚC LƯỢNG'));
  assert.ok(F.arcProgressPrompt(st, 2, { stage: true }).includes('BƯỚC ARC ƯỚC LƯỢNG'));
});
t('Arc ngắn (<6 câu) hoặc không có Arc -> không chèn gì', () => {
  assert.strictEqual(F.arcStageBlock({ arcs: [{ status: 'active', goal: 'Một câu. Hai câu.' }], chapters: [] }, 1), ''); assert.strictEqual(F.arcStageBlock({ arcs: [], chapters: [] }, 1), '');
});
t('kế hoạch chương (pipeline cảnh) truyền stage:true', () => assert.ok(/arcProgressPrompt\(st, chapterNumber, \{ stage: true \}\)/.test(core)));
process.exit(bad ? 1 : 0);
