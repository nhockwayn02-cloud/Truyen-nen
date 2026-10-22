// V14.0.20 post-audit: "Gợi ý nhân vật chưa có trong Database" không được gợi ý tên công pháp / cảnh giới của truyện tu luyện.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const core=fs.readFileSync(path.join(__dirname,'../shared/core.js'),'utf8');
const sb={console};vm.createContext(sb);
vm.runInContext(core+'\n;Object.assign(this,{suggestCharacterCandidates});',sb);
const names=(chs,known,opts)=>Array.from(sb.suggestCharacterCandidates(chs,known||[],opts||{})).map(x=>x.name);

// 1) Truyện tu luyện: tên người giữ lại, công pháp/cảnh giới bị loại
const cult=[
 {text:'Bùi Lạc tu luyện Huyền Nguyên Quyết trong hang. Huyền Nguyên Quyết không trao sức mạnh. Hắn dừng ở Luyện Khí tầng một. Linh khí quanh hắn dày. Bùi Lạc đột phá. Lý Thiên Hạo bước vào tông môn.'},
 {text:'Sau bảy tháng Bùi Lạc vẫn ở Luyện Khí. Huyền Nguyên Quyết vận chuyển, tu vi tăng. Lý Thiên Hạo cười lạnh. Nguyễn Văn Công chào. Nguyễn Văn Công rời đi. Trương Công gật đầu.'},
 {text:'Luyện Khí đệ nhất trọng. Huyền Nguyên Quyết. Cảnh Giới Trúc Cơ còn xa. Cảnh Giới Trúc Cơ khó đạt. Lý Thiên Hạo nói. Nguyễn Văn Công quay lại. Bùi Lạc im lặng. Trương Công đi.'}
];
const a=names(cult);
['Bùi Lạc','Lý Thiên Hạo','Nguyễn Văn Công','Trương Công'].forEach(n=>assert(a.includes(n),'phải giữ tên người: '+n+' | '+a.join(', ')));
['Huyền Nguyên Quyết','Luyện Khí','Cảnh Giới Trúc Cơ'].forEach(n=>assert(!a.includes(n),'phải loại thuật ngữ: '+n+' | '+a.join(', ')));

// 2) Truyện hiện đại (không có dấu hiệu tu luyện): "Nguyên Anh" là tên người -> vẫn được gợi ý
const modern=[{text:'Nguyên Anh cười. Lan gặp Nguyên Anh ở quán.'},{text:'Nguyên Anh đến muộn. Nguyên Anh nói nhỏ.'}];
assert(names(modern).includes('Nguyên Anh'),'truyện hiện đại không được lọc "Nguyên Anh"');

// 3) Thể loại khai báo trong Story Bible bật lọc dù ít dấu hiệu trong văn bản
const few=[{text:'Hắn dừng ở Luyện Khí. Luyện Khí còn dài.'},{text:'Luyện Khí là bước đầu. Luyện Khí tầng hai.'}];
assert(names(few).includes('Luyện Khí'),'không có dấu hiệu thể loại -> giữ nguyên hành vi cũ');
assert(!names(few,[],{genre:'Tu tiên huyền huyễn'}).includes('Luyện Khí'),'genre tu tiên -> loại cảnh giới');

// 4) Tên đã có trong Database vẫn không bị gợi ý lại (hành vi cũ)
assert(!names(cult,['Bùi Lạc']).includes('Bùi Lạc'));
console.log('PASS V14.0.20 gợi ý nhân vật loại công pháp/cảnh giới (chỉ khi truyện tu luyện)');
