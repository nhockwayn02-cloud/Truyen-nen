// V12.32.6b: văn xuôi thuần tiếng Việt — làm sạch tạp chất + ngắt đoạn chuẩn hơn.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const core=fs.readFileSync(path.join(__dirname,'../shared/core.js'),'utf8');
const sb={console};vm.createContext(sb);
vm.runInContext(core+'\n;Object.assign(this,{stripForeign,formatParagraphs,cleanProseArtifacts,sanitizeChapterText,removeStrayWords});',sb);
const f=sb.stripForeign, fp=sb.formatParagraphs;
// NFC + Ð
assert(f('Ðông ngươí').includes('Đông'),'Ð→Đ');
assert.strictEqual(f('á').normalize('NFC'),f('á'),'đã NFC');
// markdown/html/emoji
let r=f('**Cô** bước vào <b>phòng</b> 😀.\n# Tiêu đề\n> trích dẫn `x`');
assert(!/\*\*|<b>|😀|#|`|^>/m.test(r),'bỏ markdown/html/emoji: '+JSON.stringify(r));
assert(/Cô bước vào phòng/.test(r),'giữ chữ');
// nhãn ngôn ngữ
r=f('Cửa mở: a la la (tiếng Việt) / "Nghe" (tiếng Anh) / "Lệnh" (tiếng Trung).\nCô bước vào.');
assert(!/tiếng (Việt|Anh|Trung)/.test(r)&&r.includes('Cô bước vào.'),'bỏ đoạn rò rỉ nhãn ngôn ngữ: '+JSON.stringify(r));
assert(!/\(tiếng Anh\)/.test(f('Anh nói "hello" (tiếng Anh) rồi đi.'))&&f('Anh nói "hello" (tiếng Anh) rồi đi.').includes('rồi đi'),'bỏ 1 nhãn');
// dòng meta
r=f('Cô đi.\nLưu ý: chương này dài 5000 từ.\n(Còn tiếp)\n“Lưu ý: đừng đi!” anh nói.');
assert(!/chương này dài|Còn tiếp/.test(r)&&/Lưu ý: đừng đi/.test(r),'bỏ meta, giữ lời thoại: '+JSON.stringify(r));
// dấu câu / lặp
const pr=f('Cô ấy đã nói rằng: “Ôi.......... trời ơi, thật là đẹp!!!!!!!!” rồi bước đi.');
assert(pr.includes('…')&&!/!{4,}/.test(pr)&&!/\.{3,}/.test(pr),'dấu câu lặp: '+pr);
assert(!/ha( ha){5,}/.test(f('Cô ấy cười thật lớn, tiếng cười vang khắp căn phòng: ha ha ha ha ha ha ha ha ha rồi mới dừng lại.')),'từ lặp thoái hóa');
// ngắt đoạn: nối dòng cứng
r=fp('Cô bước\nvào phòng, nhìn quanh.\n\nAnh ngồi đó.');
assert(r.split('\n\n').length===2&&/Cô bước vào phòng/.test(r),'nối dòng bị ngắt giữa câu: '+JSON.stringify(r));
// viết tắt không ngắt
r=fp('Anh làm việc tại TP. Hồ Chí Minh từ lâu. Cô gặp TS. Nam ở đó. Họ nói chuyện rất lâu về công việc.');
assert(!/TP\.\n|TS\.\n/.test(r)&&r.includes('TP. Hồ Chí Minh')&&r.includes('TS. Nam'),'không tách ở viết tắt: '+JSON.stringify(r));
// đoạn rác/lặp
r=fp('Đoạn một khá dài để kiểm tra.\n\n/…/\n\nĐoạn một khá dài để kiểm tra.\n\nĐoạn hai.');
assert(r.split('\n\n').length===2,'bỏ đoạn rác + trùng: '+JSON.stringify(r));
// lời thoại vẫn tách riêng
r=fp('Cô nhìn anh. “Anh đi đâu vậy?” Anh đáp: “Anh đi làm.”');
assert(r.split('\n\n').length>=2,'thoại vẫn tách');
// removeStrayWords: khớp nguyên từ
r=sb.removeStrayWords('Cô ấy đứng trước cửa. Anh lookup nhìn cô, lookupx vẫn còn. Anh đi.',['lookup']);
assert(!/\blookup\b/.test(r)&&r.includes('lookupx')&&!/  /.test(r),'xóa đúng từ, không đụng từ chứa nó: '+r);
// sanitizeChapterText không phá chương Việt thường (không mất chữ)
const vn='Hùng bước vào căn phòng tối. “Ai đó?” anh hỏi khẽ.\n\nKhông ai trả lời. Gió thổi qua khe cửa, mang theo mùi ẩm mốc.';
assert.strictEqual(sb.sanitizeChapterText(vn),vn,'văn Việt sạch giữ nguyên');
console.log('PASS V12.32.6b pure prose');
