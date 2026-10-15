const fs=require('fs'),vm= require('vm'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..');
const core=fs.readFileSync(path.join(root,'shared/core.js'),'utf8');
const sb={console};vm.createContext(sb);
vm.runInContext(core+'\n;Object.assign(this,{applyChapterPatches,parsePatchResponse,buildPatchPrompt});',sb);
const {applyChapterPatches,parsePatchResponse,buildPatchPrompt}=sb;
const draft=['Mỹ Duyên bước vào phòng trọ của Bùi Lạc.','Họ nói chuyện về việc ngày mai.','Bùi Lạc khép cửa lại, cố gắng trấn tĩnh.'].join('\n\n');
const scene='Ngoài hành lang, một bóng người mặc vest xám đứng dưới ánh đèn hỏng. Bùi Lạc nhìn qua khe rèm và nhận ra gã đã xuất hiện ở góc phố từ chiều. Hắn tắt đèn, ra hiệu cho Mỹ Duyên im lặng.';
const r=applyChapterPatches(draft,[{op:'insert_before_end',text:scene}]);
assert.strictEqual(r.applied,1);
assert(r.text.includes(scene));
assert(r.text.endsWith('Bùi Lạc khép cửa lại, cố gắng trấn tĩnh.'));
assert(r.text.indexOf(scene)<r.text.lastIndexOf('Bùi Lạc khép cửa'));
const parsed=parsePatchResponse('{"patches":[{"op":"insert_before_end","text":"CẢNH BỔ SUNG"}]}');
assert.strictEqual(parsed[0].op,'insert_before_end');
const prompt=buildPatchPrompt({chapterNumber:5,review:{hardFailures:['Thiếu sự kiện phát hiện kẻ theo dõi'],warnings:[],rewriteInstructions:[]},draft});
assert(/insert_before_end/.test(prompt));
assert(/beat\/sự kiện bắt buộc/.test(prompt));
for(const file of ['index.html','netlify/functions/write-chapter-background.js']){
 const s=fs.readFileSync(path.join(root,file),'utf8');
 assert(/insert_before_end/.test(s),file+' missing mirrored repair op');
}
console.log('PASS V12.34 targeted beat repair');
