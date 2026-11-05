// V14.7.1: hợp đồng văn xuôi tiếng Việt có đủ yếu tố kể chuyện (scene có vật cản/giá phải trả, thoại ẩn ý, nhịp, kết cảnh) và vẫn gọn.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const f = vm.runInNewContext(src + '\n;vietnameseNovelWritingPrompt', {});
const t = f();
const checks = [
  ['scene có mong muốn/vật cản/giá phải trả/thay đổi', /vật cản[\s\S]*giá phải trả[\s\S]*thay đổi/],
  ['thoại có ẩn ý, không diễn thuyết', /ẩn ý[\s\S]*không giải thích cốt truyện/],
  ['chi tiết cảm giác không chỉ thị giác', /không chỉ thị giác/],
  ['chậm nhịp ở khoảnh khắc nặng + dư âm', /Chậm nhịp[\s\S]*dư âm/],
  ['kết cảnh bằng bước ngoặt, không tóm tắt cảm xúc', /bước ngoặt[\s\S]*không kết bằng đoạn tóm tắt/],
  ['vẫn cấm meta/nhãn trong văn xuôi', /không chèn nhãn ngày giờ/]
];
let bad = 0;
for (const [n, re] of checks) { if (re.test(t)) console.log('PASS ' + n); else { bad++; console.error('FAIL ' + n); } }
if (t.length > 3200) { bad++; console.error('FAIL prompt quá dài: ' + t.length); } else console.log('PASS độ dài hợp đồng ' + t.length + ' ký tự (≤3200)');
const idx = require('./_read_index.js')(), w = fs.readFileSync(path.join(__dirname, '../netlify/functions/write-chapter-background.js'), 'utf8');
for (const [n, x] of [['client', idx], ['worker', w]]) { if (x.includes('Thoại có ẩn ý')) console.log('PASS đã đồng bộ vào ' + n); else { bad++; console.error('FAIL chưa đồng bộ ' + n); } }
process.exit(bad ? 1 : 0);
