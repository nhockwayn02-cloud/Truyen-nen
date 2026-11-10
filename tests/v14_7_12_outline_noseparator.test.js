// V14.7.12: outline viết "Chương 6 Nội dung" (không dấu phân cách) phải đúng chương; không được lấy đầu outline gán cho chương khác.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'shared/core.js'), 'utf8'), client = fs.readFileSync(path.join(root, 'app/client.js'), 'utf8'), worker = fs.readFileSync(path.join(root, 'netlify/functions/write-chapter-background.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={outlineChapterLines,outlineChapterItems,outlineHasNumberedChapters};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const txt = 'Chương 1 Bùi Lạc bị Quỳnh Anh mắng nhiếc vì email sai địa chỉ\nChương 2 Hắn gọi Quỳnh Anh ra bãi xe đêm khuya\nChương 6 Huấn luyện tại nhà Quỳnh Anh bằng roi và trói\n- bước phụ thêm của chương sáu';
t('"Chương N nội dung" không dấu phân cách được nhận đúng số chương', () => {
  const m = F.outlineChapterLines(txt, null); assert.deepEqual(Object.keys(m).sort(), ['1', '2', '6']);
  assert.match(m[1], /^Bùi Lạc bị Quỳnh Anh/); assert.match(m[6], /Huấn luyện tại nhà/); assert.match(m[6], /bước phụ thêm/); assert.ok(!/mắng nhiếc/.test(m[6]));
});
t('bộ tách ý (items) cũng nhận đúng', () => { const it = F.outlineChapterItems(txt, null); assert.ok(it[6] && it[6].items.join(' ').includes('Huấn luyện')); assert.ok(!it[6].items.join(' ').includes('mắng nhiếc')); });
t('tiêu đề đơn "Chương 6" đứng một mình + các dòng bên dưới', () => {
  const m = F.outlineChapterLines('Chương 5\nBeat: trứng rung điều khiển từ xa trong giờ làm.\n18+: công khai.\nChương 6\nBeat: huấn luyện tại nhà bằng roi.', null);
  assert.match(m[5], /trứng rung/); assert.match(m[5], /công khai/); assert.ok(!/roi/.test(m[5])); assert.match(m[6], /huấn luyện/);
});
t('định dạng có dấu phân cách và dạng khác không đổi', () => { const m = F.outlineChapterLines('Ch3: nhân vật bước vào phòng họp rất muộn\nCh4 - kết thúc cuộc họp căng thẳng', null); assert.ok(m[3] && m[4]); });
t('outline có đánh số mà không tách được thì không lấy đầu outline; client và worker dùng điều kiện này', () => {
  assert.equal(F.outlineHasNumberedChapters('Chương 1 abc'), true); assert.equal(F.outlineHasNumberedChapters('Mở đầu rồi kết thúc chung chung'), false);
  assert.match(client, /!outlineHasNumberedChapters\(ol\.content\)/); assert.match(worker, /!outlineHasNumberedChapters\(ol\.content\)/);
});
const real = 'Chương 1\nBùi Lạc bị Quỳnh Anh mắng nhiếc vì email sai địa chỉ. Giữa trưa hắn khống chế ả trong phòng nghỉ tầng hầm.\nChương 2\nHắn gọi Quỳnh Anh ra bãi xe đêm. Trong xe kính tối, bắt ả cởi đồ phần trên.\nTrong lúc ả thở dốc, hắn thử hấp thụ linh khí mỏng.\nChương 3\nĐưa ả về nhà riêng của Quỳnh Anh. Phá trinh trong nhà để xe.\nHậu quả: ả sốc nặng.';
t('định dạng thật của người dùng (Chương N một mình, nội dung dòng dưới): dòng và ý đúng chương', () => {
  const m = F.outlineChapterLines(real, null); assert.deepEqual(Object.keys(m).sort(), ['1', '2', '3']); assert.match(m[2], /bãi xe đêm/); assert.match(m[2], /linh khí mỏng/); assert.ok(!/mắng nhiếc/.test(m[2])); assert.match(m[3], /Phá trinh/);
  const it = F.outlineChapterItems(real, null); assert.equal(it[2].items.length, 2); assert.match(it[2].items[1], /linh khí mỏng/); assert.equal(it[1].items.length, 1); assert.match(it[3].meta.consequence || '', /sốc nặng/);
});
process.exit(bad ? 1 : 0);
