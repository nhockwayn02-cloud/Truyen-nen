// V14.4.0: kiểm tra Outline trước khi viết (thuần cấu trúc, dùng mẫu trung tính).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={lintChapterOutline,outlineLintShort,formatOutlineLint};', ctx);
const T = ctx.__t; let pass = 0; const t = (n, f) => { f(); console.log('PASS ' + n); pass++; };

const SIMPLE = 'Hà nhận lệnh kiểm tra kho hàng ban đêm, phát hiện sổ sách bị sửa nhưng chưa biết ai làm. Chương kết khi trưởng ca đột ngột hỏi về chìa khóa kho.';
const HEAVY = 'Đột nhập lần đầu Sự kiện: Hà vào kho khi Lan vừa kiểm hàng xong. Cảnh chính: Khóa cửa, lấy chìa, bắt Lan đứng giữa phòng. Hỏi liên tục, bắt cô tự nói to từng câu: “Tôi biết mật khẩu và sẽ khai ra tất cả mọi thứ.” Mở két lần 1 + lần 2, sau đó chụp ảnh từng tập hồ sơ. Rồi khóa két, bắt đi vài vòng quanh bàn trong khi hắn kéo dây. Kháng cự: Rất mạnh. Hậu quả: Bị lộ bí mật. Móc kết: Hắn nhìn cô rồi ra về.';
const LONG = Array.from({ length: 60 }, (_, i) => 'Ý số ' + i + ' của chương.').join(' ');

t('Outline gọn -> ok, không findings', () => {
  const r = T.lintChapterOutline(SIMPLE);
  assert.strictEqual(r.level, 'ok'); assert.strictEqual(r.findings.length, 0);
});
t('Outline nhiều chi tiết ép buộc -> cảnh báo (high) với các nhóm đúng', () => {
  const r = T.lintChapterOutline(HEAVY), codes = r.findings.map(f => f.code);
  assert.strictEqual(r.level, 'high', JSON.stringify(r));
  ['SECTIONS', 'FORCED', 'SEQ'].forEach(c => assert.ok(codes.includes(c), c + ' thiếu: ' + codes));
});
t('Outline quá dài -> LENGTH high', () => {
  const r = T.lintChapterOutline(LONG);
  assert.ok(r.findings.some(f => f.code === 'LENGTH' && f.sev === 'high')); assert.strictEqual(r.level, 'high');
});
t('chuỗi rỗng -> ok; tên mục có dấu hai chấm trong câu thường không bị đếm quá tay', () => {
  assert.strictEqual(T.lintChapterOutline('').level, 'ok');
  assert.strictEqual(T.lintChapterOutline('Hà đến kho. Lan hỏi: có ai ở đây không?').level, 'ok');
});
t('định dạng thông báo: có tiêu đề, gạch đầu dòng, gợi ý; rút gọn một dòng', () => {
  const r = T.lintChapterOutline(HEAVY), m = T.formatOutlineLint(r, 5);
  assert.ok(/Outline chương 5/.test(m) && /•/.test(m) && /Gợi ý/.test(m));
  assert.ok(T.outlineLintShort(r).includes('mục nhỏ'));
  assert.strictEqual(T.formatOutlineLint(T.lintChapterOutline(SIMPLE), 1), '');
});
console.log('OK ' + pass + ' test');
