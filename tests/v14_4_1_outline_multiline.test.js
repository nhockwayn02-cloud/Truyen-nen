// V14.4.1: Outline dạng "Chương N — tiêu đề" + các dòng gạch đầu dòng: toàn bộ khối là của chương N (trước đây chỉ lấy dòng tiêu đề).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={outlineChapterLines,arcProgressPrompt};', ctx);
const T = ctx.__t; let pass = 0; const t = (n, f) => { f(); console.log('PASS ' + n); pass++; };
const CONTENT = ['• dòng mồ côi trước mọi chương phải bị bỏ qua', 'Chương 3 — Đột nhập lần đầuSự kiện: Hà vào kho khi Lan vừa kiểm hàng xong.', '•\tKhóa cửa, lấy chìa, bắt Lan đứng giữa phòng.', '•\tMở két, chụp ảnh hồ sơ.Kháng cự: Rất mạnh.Hậu quả: Bị lộ bí mật.Móc kết: Hắn nhìn cô rồi ra về.', 'Chương 4 — Hồ sơ nơi công sởSự kiện: Lan đi làm.', '- Hà theo dõi suốt buổi sáng', '• Buổi tối gặp ở kho B2.Móc kết: Hắn tắt máy đúng lúc cô sắp gục.', 'Ghi chú chung không gạch đầu dòng, không thuộc chương nào'].join('\n');
t('khối chương gồm cả tiêu đề lẫn các dòng gạch đầu dòng; không lẫn sang chương khác', () => {
  const per = T.outlineChapterLines(CONTENT);
  assert.deepStrictEqual(Object.keys(per), ['3', '4']);
  assert.ok(/Khóa cửa, lấy chìa/.test(per[3]) && /Kháng cự: Rất mạnh/.test(per[3]) && /Móc kết: Hắn nhìn cô rồi ra về/.test(per[3]));
  assert.ok(!/Hà theo dõi/.test(per[3]) && !/mồ côi/.test(per[3]));
  assert.ok(/Hà theo dõi suốt buổi sáng; Buổi tối gặp ở kho B2/.test(per[4]), per[4]);
  assert.ok(!/Ghi chú chung/.test(per[4]));
});
t('định dạng một dòng cũ ("Ch3: ...") vẫn chạy y như trước', () => {
  const per = T.outlineChapterLines('Ch3: Hà vào kho kiểm hàng đêm\nCh4: Lan phát hiện sổ sách bị sửa');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(per)), { 3: 'Hà vào kho kiểm hàng đêm', 4: 'Lan phát hiện sổ sách bị sửa' });
});
t('prompt chương 3 nhận đủ cảnh chính + Kháng cự/Hậu quả/Móc kết; chương 4 chỉ cài móc', () => {
  const st = { chapters: [{}, {}], outlinePlans: [{ name: 'GĐ1', from: 3, to: 4, content: CONTENT }] };
  const p = T.arcProgressPrompt(st, 3);
  assert.ok(/VIỆC BẮT BUỘC CỦA CHƯƠNG 3[^\n]*Khóa cửa[^\n]*Móc kết: Hắn nhìn cô rồi ra về/.test(p), p);
  const m = p.match(/CHƯA làm ở chương này[^\n]*/)[0]; assert.ok(/Hồ sơ nơi công sở/.test(m));
});
console.log('OK ' + pass + ' test');
