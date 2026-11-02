// V14.5.6: outline đánh số lại từ 1 trong gói (from>1) vẫn trả đúng dòng của chương tuyệt đối; thiếu chương -> không lấy dòng chương khác.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'../shared/core.js'),'utf8');
const box={console,state:{}};vm.createContext(box);
vm.runInContext(src+'\n;this.__t={outlineChapterLines,outlineChapterItems};',box);
const T=box.__t;
const content=['Ch1: Sự kiện: mở màn ở hầm xe, Mỹ Duyên bị bắt.','Ch2: Sự kiện: tra hỏi trong phòng kho.','Ch3: Sự kiện: vả mặt bắt tự hạ thấp; nhét trứng rung.','Ch4: Sự kiện: gặp Lâm Tịnh Nhã ở sảnh.'].join('\n');
const ol={from:7,to:10,content};
let per=T.outlineChapterLines(content,ol);
assert.deepStrictEqual(Object.keys(per).map(Number),[7,8,9,10]);
assert(/vả mặt/.test(per[9]),'chương 9 = dòng Ch3 của gói'); assert(!/vả mặt/.test(per[7]));
assert(/vả mặt/.test(T.outlineChapterItems(content,ol)[9].items.join(' ')));
// số tuyệt đối hợp lệ -> giữ nguyên
const abs=content.replace(/Ch(\d)/g,(m,d)=>'Ch'+(Number(d)+6));
per=T.outlineChapterLines(abs,ol); assert(/vả mặt/.test(per[9])); assert(/mở màn/.test(per[7]));
// không truyền ol / from=1 -> hành vi cũ
assert.deepStrictEqual(Object.keys(T.outlineChapterLines(content)).map(Number),[1,2,3,4]);
assert.deepStrictEqual(Object.keys(T.outlineChapterLines(content,{from:1,to:4})).map(Number),[1,2,3,4]);
console.log('PASS V14.5.6: outline đánh số cục bộ được đổi về số chương tuyệt đối');
