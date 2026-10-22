// V14.0.20 post-audit: nút "🤖 AI đề xuất" của 0.6 Chapter Outline phải theo cài đặt 18+ và giữ rào chắn tuổi.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..');
const core=fs.readFileSync(path.join(root,'shared/core.js'),'utf8');
const sb={console};vm.createContext(sb);
const A=x=>Array.from(x); // mảng tạo trong vm khác prototype -> chuyển trước khi deepStrictEqual
vm.runInContext(core+'\n;Object.assign(this,{outlineMaturePrompt,outlineAdultViolations,outlineChapterLines,textHasNsfwKeyword,underageNames});',sb);

// 1) 18+ tắt hoặc trọng tâm NONE -> không chèn gì (đúng ngữ nghĩa giao diện)
assert.strictEqual(sb.outlineMaturePrompt({mature:false,chapterMatureFocus:'primary'},10),'');
assert.strictEqual(sb.outlineMaturePrompt({mature:true,chapterMatureFocus:'none'},10),'');
assert.strictEqual(sb.outlineMaturePrompt({},10),'');

// 2) SECONDARY / PRIMARY -> có chỉ thị 18+ ở mức kế hoạch, kèm rào chắn tuổi
const st={mature:true,chapterMatureFocus:'secondary',mainCharProfile:{name:'Linh',age:25},characters:[{name:'Mai',age:16},{name:'Hùng',age:30}]};
let p=sb.outlineMaturePrompt(st,10);
assert(/SECONDARY/.test(p)&&/2–3 trong 10/.test(p),p);
assert(/cảnh nóng/.test(p)&&/KHÔNG tả chi tiết tình dục/.test(p),'beat phải có cụm khoá và không tả chi tiết');
assert(/RÀO CHẮN TUỔI/.test(p)&&/KHÔNG được xuất hiện trong cảnh 18\+: Mai/.test(p)&&!/trong cảnh 18\+: .*Hùng/.test(p),'rào chắn tuổi phải nêu đúng người dưới 18');
assert(/từ 18 tuổi trở lên/.test(p));
p=sb.outlineMaturePrompt(Object.assign({},st,{chapterMatureFocus:'primary'}),10);
assert(/PRIMARY/.test(p)&&/PHẢI có khoảng 4–6 trong 10/.test(p),p);

// 2b) Nhân vật KHÔNG ghi tuổi = người lớn: không bị chặn; chỉ tuổi < 18 mới bị chặn
const st3={mature:true,chapterMatureFocus:'secondary',mainCharProfile:{name:'Linh'},characters:[{name:'Hùng',age:30},{name:'Khoa'},{name:'Vy',age:''},{name:'Mai',age:16}]};
assert.deepStrictEqual(A(sb.underageNames(st3)),['Mai'],'chỉ tuổi < 18 mới bị chặn');
p=sb.outlineMaturePrompt(st3,10);
assert(/không ghi tuổi trong hồ sơ được coi là người lớn/.test(p)&&/KHÔNG được xuất hiện trong cảnh 18\+: Mai/.test(p),p);
assert(!/Khoa|Vy/.test(p),'nhân vật không ghi tuổi không được nằm trong danh sách cấm');
assert(!/KHÔNG đặt cảnh nóng nào/.test(sb.outlineMaturePrompt({mature:true,chapterMatureFocus:'primary',characters:[{name:'Khoa'}]},10)),'không ai ghi tuổi vẫn được đặt cảnh nóng');
assert.deepStrictEqual(A(sb.outlineAdultViolations([{n:1,b:'Cảnh nóng giữa Khoa và Vy sau buổi họp.'}],st3)),[]);
assert.deepStrictEqual(A(sb.outlineAdultViolations([{n:2,b:'Cảnh nóng giữa Khoa và Mai.'}],st3)),[2]);
// 3) Rà kết quả AI: cảnh 18+ dính người dưới 18 / từ chỉ trẻ em -> bị loại
const rows=[
  {n:11,b:'Linh và Hùng nảy sinh căng thẳng sau vụ ký hợp đồng.'},
  {n:12,b:'Cảnh nóng giữa Linh và Hùng, buộc Linh thừa nhận mình bị lệ thuộc.'},
  {n:13,b:'Cảnh nóng giữa Hùng và Mai trong phòng làm việc.'},
  {n:14,b:'Mai kể chuyện cũ cho Linh nghe ở quán cà phê.'},
  {n:15,b:'Cảnh nóng với một nữ sinh ở trường.'}
];
assert.deepStrictEqual(A(sb.outlineAdultViolations(rows,st)),[13,15]);
assert.deepStrictEqual(A(sb.outlineAdultViolations(rows.slice(0,2),st)),[]);
// tên ngắn không được khớp nhầm giữa từ ("An" trong "hoàn")
const st2={mature:true,characters:[{name:'An',age:15}]};
assert.deepStrictEqual(A(sb.outlineAdultViolations([{n:1,b:'Cảnh nóng khi hoàn tất thương vụ giữa Linh và Hùng.'}],st2)),[]);
assert.deepStrictEqual(A(sb.outlineAdultViolations([{n:2,b:'Cảnh nóng giữa An và Hùng.'}],st2)),[2]);

// 4) Outline AI trả đúng dạng "ChN: ..." thì tách được từng chương và nhận ra chương 18+
const content='Ch11: Linh gặp Hùng.\nCh12: Cảnh nóng giữa Linh và Hùng, làm đổi quyền lực giữa hai người.';
const m=sb.outlineChapterLines(content);
assert(!sb.textHasNsfwKeyword(m[11])&&sb.textHasNsfwKeyword(m[12]),'cụm "cảnh nóng" phải kích hoạt định tuyến NSFW');

// 5) Handler của nút đã được nối thật vào prompt + bước rà tuổi
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const i=html.indexOf('$ID("outlineAIGenerateBtn").addEventListener'); assert(i>0);
const handler=html.slice(i,html.indexOf('function currentOutline()',i));
assert(/outlineMaturePrompt\(state,\s*10\)/.test(handler),'handler phải gọi outlineMaturePrompt');
assert(/outlineAdultViolations\(/.test(handler),'handler phải rà tuổi kết quả AI');
console.log('PASS V14.0.20 outline AI theo cài đặt 18+ + rào chắn tuổi');
