// V14.3.5: chữ pinyin "de" rò vào truyện được tự sửa (ca chắc chắn) và được findStrayWords báo (ca còn lại); "then" tiếng Anh được báo.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={fixPinyinDe,findStrayWords,sanitizeChapterText};', ctx);
const T = ctx.__t; let pass = 0; const t = (n, f) => { f(); console.log('PASS ' + n); pass++; };
t('de + từ xác định/đại từ/tên riêng -> "của"', () => {
  assert.strictEqual(T.fixPinyinDe('Sự kiêu hãnh cuối cùng de một tiểu thư gia đình danh giá.'), 'Sự kiêu hãnh cuối cùng của một tiểu thư gia đình danh giá.');
  assert.strictEqual(T.fixPinyinDe('giọng nói de nàng thư ký run rẩy'), 'giọng nói của nàng thư ký run rẩy');
  assert.strictEqual(T.fixPinyinDe('sức mạnh áp đảo de Bùi Lạc'), 'sức mạnh áp đảo của Bùi Lạc');
  assert.strictEqual(T.fixPinyinDe('cường độ rung de trứng rung lên mức cao nhất'), 'cường độ rung của trứng rung lên mức cao nhất');
});
t('de + động/tính từ KHÔNG tự đoán (để cho bước sửa AI)', () => {
  const x = 'nước dịch de chảy tràn ra ngoài';
  assert.strictEqual(T.fixPinyinDe(x), x);
});
t('tên nước ngoài "Charles de Gaulle" và chữ chứa "de" (đề, deadline) không bị đụng', () => {
  assert.strictEqual(T.fixPinyinDe('ông Charles de Gaulle đến'), 'ông Charles de Gaulle đến');
  assert.strictEqual(T.fixPinyinDe('hạn deadline và demo'), 'hạn deadline và demo');
});
t('sanitizeChapterText tự áp dụng', () => {
  assert.ok(T.sanitizeChapterText('nỗi nhục de một người phụ nữ.').includes('của một người'));
});
t('findStrayWords báo "de" (ca chưa tự sửa được) và "then" rò rỉ, không báo "then cài" hợp lệ', () => {
  assert.ok(T.findStrayWords('nước dịch de chảy tràn', []).includes('de'));
  assert.ok(T.findStrayWords('Hắn hài lòng gật đầu then bất ngờ đưa tay', []).includes('then'));
  assert.ok(!T.findStrayWords('Hắn kéo then cài cửa lại', []).includes('then'));
  assert.ok(!T.findStrayWords('nỗi nhục của cô', []).includes('de'));
});
t('findStrayWords vẫn bắt từ tiếng Anh dài như "ruthless"', () => {
  assert.ok(T.findStrayWords('chủ nhân ruthless của nó', []).includes('ruthless'));
});
console.log('OK ' + pass + ' test');
