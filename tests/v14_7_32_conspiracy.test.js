// V14.7.32: Âm mưu & kẻ thù (canon) tự dựng cho người dùng là độc giả.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(core + '\n;this.f={buildConspiracyPrompt,conspiracyClean,conspiracyParseTiers,conspiracyBlock,chapterCraftPlanBlock,conspiracyParseClues,conspiracyClueFor};', ctx);
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

const USER_BIBLE = 'Sự thật gốc\n' + 'Một nhóm chiếm linh mạch ngoại ô. '.repeat(120) + '\nBổ sung cố định cho Arc 1\n  •\tTên công ty: Tập đoàn Tài chính Hoàng Gia\n4 vật chứng cố định của Arc 1 (lộ dần):\n\t1\tUSB chứa danh sách tên + bản vẽ → lộ khoảng chương 25–35\n\t2\tQuyết định nhân sự bất thường có chữ ký cấp cao → lộ khoảng chương 40–50\n\t3\tĐoạn ghi âm cuộc họp ngắn trong tầng hầm → lộ khoảng chương 70–80\nĐiều cấm lộ trong toàn bộ Arc 1:\n  •\tDanh tính kẻ chủ mưu cấp cao\nQuy tắc nhân vật: ghi mức liên quan một lần duy nhất.\n';
t('canon dài ~5.600 ký tự của người dùng: phần cuối (vật chứng, điều cấm, quy tắc nhân vật) KHÔNG bị cắt', () => {
  const big = Object.assign({}, st, { conspiracyBible: USER_BIBLE }); assert.ok(USER_BIBLE.length > 3400 && USER_BIBLE.length < 7000);
  const b = F.conspiracyBlock(big, 30); assert.ok(b.includes('Điều cấm lộ trong toàn bộ Arc 1') && b.includes('Quy tắc nhân vật') && b.includes('ghi mức liên quan một lần duy nhất'));
});
t('parse vật chứng dạng "1<tab>… → lộ khoảng chương a–b"', () => { const r = F.conspiracyParseClues(USER_BIBLE); assert.strictEqual(r.length, 3); assert.strictEqual(r[0].from, 25); assert.strictEqual(r[2].to, 80); assert.ok(r[0].text.startsWith('USB')); });
t('vật chứng đến lượt (từ 6 chương trước đến hết khoảng) + vật chứng kế tiếp chỉ gợi nhẹ', () => {
  const big = Object.assign({}, st, { conspiracyBible: USER_BIBLE });
  assert.strictEqual(F.conspiracyClueFor(big, 22).kind, 'due'); assert.ok(F.conspiracyBlock(big, 30).includes('VẬT CHỨNG ĐẾN LƯỢT LỘ (chương 30): USB'));
  assert.strictEqual(F.conspiracyClueFor(big, 10).kind, 'next'); assert.ok(F.conspiracyBlock(big, 10).includes('VẬT CHỨNG KẾ TIẾP (chưa lộ, chỉ được gợi nhẹ): USB'));
  assert.strictEqual(F.conspiracyClueFor(big, 90), null);
});
t('kế hoạch chương: nhắc vật chứng đến lượt, không nhắc khi chưa tới', () => {
  const big = Object.assign({}, st, { chapters: [], conspiracyBible: USER_BIBLE });
  assert.ok(F.chapterCraftPlanBlock(big, 28).includes('VẬT CHỨNG ĐẾN LƯỢT LỘ: USB')); assert.ok(!F.chapterCraftPlanBlock(big, 10).includes('VẬT CHỨNG ĐẾN LƯỢT LỘ'));
});
process.exit(bad ? 1 : 0);
