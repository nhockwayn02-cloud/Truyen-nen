// V14.7.51: dấu câu dính chữ + rò từ tiếng Anh lẻ (từ chương 2 thật của người dùng) phải được sửa; câu tiếng Anh cố ý và số giờ không bị đụng.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8') + '\n;this.__e={stripForeign,fixGluedPunctuation,fixEnglishLeaks};', ctx); const E = ctx.__e;
const a = E.stripForeign('Hắn không đáp.Bàn tay hắn hất nhẹ mép váy lên,lùa vào trong,tì ngón tay vào mép ren.Nàng siết bụng né—but chỉ né được nửa phân. Hắn tắt hẳn máy—he tắt hẳn rồi.');
assert.ok(/đáp\. Bàn tay/.test(a) && /lên, lùa vào trong, tì ngón/.test(a), 'thiếu khoảng trắng sau dấu câu: ' + a);
assert.ok(/né — nhưng chỉ/.test(a) && !/\bbut\b/.test(a), 'but → nhưng: ' + a); assert.ok(/máy — hắn tắt/.test(a), 'he → hắn: ' + a);
const b = E.stripForeign('— Quy tắc—from nay—he nói,không thấp. Cô biết phải làm gì và tôi biết cô sẽ làm—or không—and hậu quả tương ứng. Nàng gật—one cái gật ngắn. Nàng nắm thanh sắt đến knuckle trắng bệch. Aftercare của hắn lạnh lùng. Phòng lưu trữ old-file bay mùi.');
['from', 'one cái', ' or ', ' and ', 'knuckle', 'Aftercare', 'old-file'].forEach(x => assert.ok(!b.includes(x), 'còn rò "' + x + '": ' + b));
assert.ok(/từ nay/.test(b) && /hoặc không/.test(b) && /và hậu quả/.test(b) && /một cái gật/.test(b) && /khớp ngón tay trắng/.test(b), 'phải dịch đúng: ' + b);
const keep = E.stripForeign('Lúc 10:30 anh ấy gọi. Cô nghe radio nói: "I love you and you love me." Nàng đáp: "Tôi hiểu, thật đấy." Phiên bản v1.2 ra.');
assert.ok(/10:30/.test(keep) && /I love you and you love me/.test(keep) && /v1\.2/.test(keep) && /Tôi hiểu, thật đấy/.test(keep), 'không được đụng giờ/câu tiếng Anh cố ý/số phiên bản: ' + keep);
const real = '/mnt/user-data/attachments/2715c23c-f06e-5342-ab65-5b57b1080754/0cf71457-attachment.txt';
if (fs.existsSync(real)) { const o = E.stripForeign(fs.readFileSync(real, 'utf8').replace(/^\s*\d+\t/gm, '')); const glued = (o.match(/\p{L}[,;!?.—]\p{L}/gu) || []).filter(x => !/^\p{L}\.\p{L}$/u.test(x)); assert.strictEqual(glued.length, 0, 'file thật còn dính dấu: ' + glued.slice(0, 5)); const en = o.match(/(?<![\p{L}-])(?:but|and|or|he|from|one|knuckle|aftercare|old-file)(?![\p{L}-])/giu) || []; assert.deepStrictEqual(en, [], 'file thật còn rò tiếng Anh'); console.log('PASS chương 2 thật của người dùng: hết dính dấu câu, hết từ Anh rò'); }
console.log('PASS dính dấu câu + rò tiếng Anh được sửa; giờ/câu Anh cố ý/phiên bản không bị đụng');
