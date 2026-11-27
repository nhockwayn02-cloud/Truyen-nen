// V14.7.55: model rò kế hoạch viết cảnh vào chương; giờ giấc/mã số dày.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8') + '\n;this.e={isPlanningLeakPara,planningLeakIndex,stripPlanningLeak,degenerationCheck,salvageBeforeDegeneration,timeCodeDensity,cleanModelArtifacts,TIME_CODE_RULE};', ctx); const E = ctx.e;
const prose = 'Hắn đứng im trong hành lang, nghe tiếng nước nhỏ giọt từ ống thoát phía trên. Cô quay đi, vai khẽ run.';
const leak = ['Chiều nay tan ca thì ghé qua phòng Kiểm toán làm việc với tôi.', 'Viết cảnh S4, khoảng 600 từ, tiếng Việt, nối tiếp từ trạm bảo vệ tầng hầm.', 'Kết bằng móc.', 'Có thể tả cô qua camera? Hmm — nhưng "lần đầu" thì nên tả. Đó là cách hợp lý?', 'Giải pháp: tin ở cuối S3 là tin ngắn chưa ký tên.', 'Tốt. Viết theo trình tự đó.'].join('\n\n');
const text = [prose, prose + ' Thêm một câu nữa cho dài.', leak].join('\n\n');
assert.ok(E.planningLeakIndex(text) >= 0, 'phải nhận ra kế hoạch rò');
assert.ok(E.degenerationCheck((prose + ' ').repeat(1) + text).bad, 'degenerationCheck phải báo bad');
const sv = E.salvageBeforeDegeneration(text); assert.ok(!/Viết cảnh S4|Hmm|Giải pháp/.test(sv) && /nước nhỏ giọt/.test(sv), 'salvage giữ phần văn, bỏ kế hoạch');
const cl = E.cleanModelArtifacts(text); assert.ok(!/Viết cảnh S4|Hmm|Giải pháp|Kết bằng móc/.test(cl) && /nước nhỏ giọt/.test(cl), 'cleanModelArtifacts cắt kế hoạch');
// không báo nhầm văn thường / thoại
const ok = [prose, '"Hmm," hắn nói, "để tôi nghĩ đã."', 'Cô gật đầu. "Tốt." Hắn quay đi.', 'Hắn viết cảnh cáo vào sổ, rồi gấp lại.'].join('\n\n'); assert.strictEqual(E.planningLeakIndex(ok), -1, 'văn thường/thoại không bị báo nhầm'); assert.strictEqual(E.stripPlanningLeak(ok), ok);
assert.ok(/tối đa 2 mốc giờ/.test(E.TIME_CODE_RULE));
const dense = 'Lúc 06:40 hắn xuống. 07:30 hẹn. Hai giờ chiều, 14:00, 17:00. Khu KT-07 mã TF-H-1109 và P-1908, M-04, công văn 114/ĐK-TK.'; const d = E.timeCodeDensity(dense); assert.ok(d.times >= 4 && d.codes >= 4, JSON.stringify(d));
const real = '/mnt/user-data/attachments/2715c23c-f06e-5342-ab65-5b57b1080754/0b033a4f-07.txt';
if (fs.existsSync(real)) { const t = fs.readFileSync(real, 'utf8'); const i = t.indexOf('Viết cảnh S4'), j = t.indexOf('Chương 5: Chương 5'); const seg = t.slice(i - 400, j); assert.ok(E.planningLeakIndex(seg) >= 0, 'file thật: nhận ra kế hoạch rò chương 4'); const st = E.stripPlanningLeak(t.slice(t.indexOf('Chương 4: Chương 4'), j)); assert.ok(!/Viết cảnh S4/.test(st) && st.length > 3000, 'file thật: cắt sạch'); console.log('PASS file thật: chương 4 rò kế hoạch được nhận ra và cắt'); }
console.log('PASS kế hoạch rò bị nhận ra/cắt; văn thường không bị đụng; luật giờ/mã + đếm mật độ'); process.exit(0);
