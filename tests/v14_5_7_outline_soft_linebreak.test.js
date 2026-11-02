// V14.5.7: outline có ngắt dòng mềm U+2028 (dán từ Word/Docs) vẫn tách đúng chương; chương 9 không rơi về dòng của chương 3.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'../shared/core.js'),'utf8');
const box={console,state:{}};vm.createContext(box);
vm.runInContext(src+'\n;this.__t={outlineChapterLines,outlineChapterItems,arcProgressPrompt};',box);
const T=box.__t, LS=String.fromCharCode(0x2028);
const content=['Giai đoạn 1','CH 3–23',
 'Chương 3 — Đột nhập lần đầu'+LS+'Sự kiện: Bùi Lạc vào căn hộ khi cô vừa tắm xong.',
 '\t•\tCòng tay sau lưng, đeo vòng cổ da dày, bắt quỳ giữa phòng.',
 '\t•\tVả mặt, bắt tự nói lời hạ thấp bản thân.'+LS+'Kháng cự: Rất mạnh.'+LS+'Hậu quả: Bị xâm phạm nhà riêng.'+LS+'Móc kết: Hắn ra về.',
 'Chương 9 — Suýt bị phát hiện'+LS+'Sự kiện: Lén sao chép dữ liệu, suýt bị phát hiện.',
 '\t•\tĐêm đó bắt xuống phòng kho.',
 '\t•\tDùng đồ chơi đụ sâu và chậm.'+LS+'Kháng cự: Im lặng.'+LS+'Hậu quả: Hắn nhận ra rủi ro.'+LS+'Móc kết: Hắn cho mặc quần áo.'].join('\n');
const ol={from:3,to:23,content,name:'Giai đoạn 1'};
const per=T.outlineChapterLines(content,ol);
assert.deepStrictEqual(Object.keys(per).map(Number),[3,9],'phải tách được chương 3 và 9');
assert(/Suýt bị phát hiện/.test(per[9]) && !/Vả mặt/.test(per[9]),'chương 9 không chứa beat chương 3');
assert(/Vả mặt/.test(per[3]));
const it=T.outlineChapterItems(content,ol)[9];
assert(it && it.items.length>=2 && /Im lặng/.test(it.meta.resistance||'') && /Hắn cho mặc/.test(it.meta.hook||''),JSON.stringify(it));
const ap=T.arcProgressPrompt({chapters:new Array(8).fill({}),outlinePlans:[ol],arcs:[]},9);
assert(/VIỆC BẮT BUỘC CỦA CHƯƠNG 9/.test(ap)&&!/Vả mặt/.test(ap),ap.slice(0,300));
console.log('PASS V14.5.7: outline có ngắt dòng mềm U+2028 được tách đúng theo chương');
