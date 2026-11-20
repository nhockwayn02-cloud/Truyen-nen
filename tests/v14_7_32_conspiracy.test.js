// V14.7.32: Âm mưu & kẻ thù (canon) tự dựng cho người dùng là độc giả.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(core + '\n;this.f={buildConspiracyPrompt,conspiracyClean,conspiracyParseTiers,conspiracyBlock,chapterCraftPlanBlock};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const st = { mainPlot: 'Bùi Lạc là bảo vệ, nắm mảnh ghép của đại âm mưu. Phải đi từ đáy lên.', worldSetting: 'Việt Nam 2026', mainCharProfile: { name: 'Bùi Lạc' }, characters: [{ name: 'Hoàng Yến Nhi', role: 'giám đốc' }, { name: 'Tuấn', role: 'không rõ' }] };
const TXT = 'SỰ THẬT NĂM XƯA: ...\nTẦNG 1 (chương 1–15): Giám đốc tài chính — quyền lực công ty — USB sao lưu — rủi ro bị sa thải\nTẦNG 2 (chương 16–40): Doanh nhân bất động sản — tiền — sổ đỏ giả — bị theo dõi\nTẦNG 3 (chương 41 trở đi): Chủ gia tộc — chính trị — bằng chứng cuối\n';
t('prompt: nhiều phe/tầng, dùng lại nhân vật, người dùng là độc giả, người lớn, bám cốt truyện', () => {
  const p = F.buildConspiracyPrompt(st, {}); ['CÁC PHE PHÁI', 'CÁC TẦNG LỘ DẦN', 'KẺ CHỦ MƯU THẬT', 'KẺ THÙ ĐANG HÀNH ĐỘNG', 'VAI TRÒ TRONG ÂM MƯU', 'Hoàng Yến Nhi', 'người trưởng thành', 'đi từ đáy lên'].forEach(k => assert.ok(p.includes(k), k));
});
t('prompt: bản cũ được đưa vào để tạo lại khác đi', () => assert.ok(F.buildConspiracyPrompt(st, { previous: 'chủ mưu là X' }).includes('đừng lặp lại')));
t('làm sạch: bỏ rào ``` và cắt theo giới hạn', () => { assert.strictEqual(F.conspiracyClean('```text\nabc\n```'), 'abc'); assert.ok(F.conspiracyClean('x\n'.repeat(5000), 1000).length <= 1000); });
t('parse tầng: 3 tầng, tầng cuối vô hạn', () => { const r = F.conspiracyParseTiers(TXT); assert.strictEqual(r.length, 3); assert.strictEqual(r[0].from, 1); assert.strictEqual(r[1].to, 40); assert.strictEqual(r[2].to, Infinity); });
t('khối canon: có nội dung + tầng áp dụng đúng theo chương; rỗng khi chưa lưu', () => {
  const s = Object.assign({}, st, { conspiracyBible: TXT });
  assert.ok(F.conspiracyBlock(s, 20).includes('TẦNG ĐANG ÁP DỤNG (chương 20): TẦNG 2'));
  assert.ok(F.conspiracyBlock(s, 3).includes('TẦNG 1')); assert.ok(F.conspiracyBlock(s, 90).includes('TẦNG 3'));
  assert.strictEqual(F.conspiracyBlock(st, 5), '');
});
t('kế hoạch chương: có dòng ÂM MƯU khi đã lưu, không có khi chưa', () => {
  const s = Object.assign({}, st, { chapters: [], conspiracyBible: TXT });
  assert.ok(F.chapterCraftPlanBlock(s, 20).includes('ÂM MƯU (canon đã chốt): TẦNG ĐANG ÁP DỤNG (chương 20): TẦNG 2'));
  assert.ok(!F.chapterCraftPlanBlock(st, 20).includes('ÂM MƯU (canon'));
});
t('giao diện + client + worker đã nối', () => {
  const h = read('index.html'), c = read('app/client.js'), w = read('netlify/functions/write-chapter-background.js');
  ['conspiracyGenBtn', 'conspiracyBibleInput', 'conspiracySaveBtn'].forEach(k => assert.ok(h.includes('id="' + k + '"'), k));
  assert.ok(c.includes('runConspiracyGenerator') && c.includes('conspiracyBlock(state') && /conspiracyBible: *""/.test(c) && c.includes('conspiracyBible:s.conspiracyBible'));
  assert.ok(w.includes('conspiracyBlock(state'));
});
process.exit(bad ? 1 : 0);
