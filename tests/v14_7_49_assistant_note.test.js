// V14.7.49: model chèn "GHI CHÚ KỸ THUẬT"/lời trợ lý giữa văn → phải bị bắt, cắt, không phạt nhầm văn thường.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8'); const ctx = {}; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__e={degenerationCheck,salvageBeforeDegeneration,stripForeign,stripAssistantNotes,cleanModelArtifacts};', ctx); const E = ctx.__e;
const prose = 'Cô ngồi xuống mép giường, nghe tiếng mưa gõ đều lên cửa kính. Anh không nói gì, chỉ đặt chiếc áo khoác lên lưng ghế rồi ngả người ra sau. Căn phòng chìm trong thứ ánh sáng vàng nhạt của ngọn đèn đầu giường, và hơi thở của hai người dần chậm lại.';
const note = 'GHI CHÚ KỸ THUẬT (không thuộc phần văn xuôi): Tôi nhận thấy đoạn cuối vượt quá phạm vi cho phép và chứa lỗi lai ngữ/tiếng Anh do lỗi tạo sinh ở chuỗi cuối:\n\n- Handoff: Theo yêu cầu S3 chỉ được gợi bằng 1–2 câu cuối; beat cuối cùng nên dành toàn bộ cho S3.\n\n- Lỗi drift phải bỏ: Toàn bộ cụm là thông tin thừa ngoài contract.\n\nNếu bạn muốn tôi xuất bản phiên bản sạch đã sửa (khoảng 680 từ), hãy xác nhận hoặc yêu cầu điều chỉnh thêm nhé!';
const glued = 'Xe cô vẫn còn đậu, cô ta lánhanymorefromkeyfobBattery rồi bỏ đi.';
const raw = [prose, prose + ' ngủ ngon lành.', glued, note].join('\n\n') + '\n\n' + prose;
const dg = E.degenerationCheck(raw); assert.ok(dg.bad && dg.reasons.some(r => /ghi chú kỹ thuật/.test(r)), 'phải bắt ghi chú: ' + JSON.stringify(dg));
assert.ok(dg.reasons.some(r => /Latin dính liền/.test(r)), 'phải bắt chữ Latin dính liền');
const cut = E.stripForeign(raw); assert.ok(!/GHI CHÚ|xác nhận hoặc|Handoff|contract/i.test(cut), 'ghi chú phải bị cắt sạch'); assert.ok(cut.includes('ngủ ngon lành'), 'văn thật phải còn'); assert.ok(cut.trim().endsWith('hơi thở của hai người dần chậm lại.'), 'đoạn văn sau ghi chú còn nguyên');
const sv = E.salvageBeforeDegeneration(raw); assert.ok(sv.includes('ngủ ngon lành') && !/lánhany|GHI CHÚ/.test(sv), 'salvage giữ phần sạch, cắt từ đoạn hỏng');
const clean = [prose, prose, prose + ' "Ghi chú lại số này giúp tôi," cô nói. "Lưu ý, anh đừng gọi sau mười giờ."'].join('\n\n'); assert.ok(!E.degenerationCheck(clean).bad, 'văn thường/thoại có chữ "ghi chú" không bị phạt nhầm'); assert.strictEqual(E.stripForeign(clean).includes('Ghi chú lại số này'), true, 'không cắt nhầm lời thoại');
assert.ok(!E.degenerationCheck([prose,prose,prose+' Anh chơi PlayStation và dùng YouTube suốt đêm.'].join('\n\n')).bad,'tên thương hiệu không bị phạt nhầm');
console.log('PASS bắt + cắt ghi chú trợ lý, bắt chữ Latin dính liền, không phạt nhầm thoại'); 
