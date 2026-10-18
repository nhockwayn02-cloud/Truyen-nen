// V12.32.10: AI tự sửa cục bộ (patch) — xoá/thêm/thay đúng đoạn lỗi thay vì viết lại cả chương.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const core=fs.readFileSync(path.join(__dirname,'../shared/core.js'),'utf8');
const sb={console};vm.createContext(sb);
vm.runInContext(core+'\n;Object.assign(this,{runGateLoop,backupBeforeRewrite,buildPatchPrompt,parsePatchResponse,applyChapterPatches,checkPatchAcceptable,countWords});',sb);
const {runGateLoop,backupBeforeRewrite,buildPatchPrompt,parsePatchResponse,applyChapterPatches,checkPatchAcceptable,countWords}=sb;

// --- chương mẫu: thiếu mốc thời gian, thiếu chuyển cảnh, cuối chương lặp đoạn xuống xe ---
const filler=n=>Array.from({length:n},(_,i)=>'Câu đệm số '+i+' nói về công việc trong văn phòng Vĩnh Phát hôm nay.').join(' ');
const dup='Hắn tắt máy xe rồi bước xuống mở cửa cho nàng thư ký, cả hai đi vào nhà trọ. Căn phòng nhỏ chỉ có một chiếc giường và cái quạt cũ kỹ.';
const draft=['Bùi Lạc ngồi trong văn phòng, Thúy vừa rời đi.',filler(60),'Hắn tắt máy xe rồi bước xuống mở cửa cho nàng thư ký, cả hai đi vào nhà trọ. Căn phòng nhỏ chỉ có một chiếc giường và cái quạt cũ kỹ.',filler(60),dup].join('\n\n');
const oldWc=countWords(draft);

// --- AI trả JSON bọc ```json và có chữ thừa ---
const raw='Đây là các chỗ cần vá:\n```json\n{"patches":['
 +'{"op":"insert_start","text":"Chiều thứ Sáu, ánh nắng cuối ngày hắt qua rèm cửa văn phòng."},'
 +'{"op":"insert_after","find":"Thúy vừa rời đi.","text":"Hắn xuống bãi xe, mở cửa cho Mỹ Duyên lên xe rồi nổ máy về hướng nhà trọ."},'
 +'{"op":"delete","find":"Hắn tắt máy xe rồi bước xuống mở cửa cho nàng thư ký","which":"last"}'
 +']}\n```';
const patches=parsePatchResponse(raw);
assert.strictEqual(patches.length,3);

// delete bản lặp: dùng from/to để xoá cả đoạn, giữ bản đầu
const raw2='{"patches":[{"op":"delete","from":"Hắn tắt máy xe rồi bước xuống","to":"cái quạt cũ kỹ.","which":"last"}]}';
const r2=applyChapterPatches(draft,parsePatchResponse(raw2));
assert.strictEqual(r2.applied,1);
assert.strictEqual(r2.text.split('Hắn tắt máy xe rồi bước xuống').length-1,1,'chỉ còn đúng 1 bản');
assert(!/cái quạt cũ kỹ\.\s*$/.test(r2.text.slice(-5))||r2.text.endsWith('Câu đệm số 59 nói về công việc trong văn phòng Vĩnh Phát hôm nay.'));
assert(r2.text.endsWith('Vĩnh Phát hôm nay.'),'bản lặp ở cuối đã bị xoá');
assert.strictEqual(r2.text.indexOf('Căn phòng nhỏ chỉ có một chiếc giường'),r2.text.lastIndexOf('Căn phòng nhỏ chỉ có một chiếc giường'));
assert(checkPatchAcceptable(draft,r2).ok);

// ghép đủ 3 thao tác kiểu "find" ngắn (which = last cho câu bị lặp)
const r1=applyChapterPatches(draft,patches);
assert.strictEqual(r1.applied,3); assert.strictEqual(r1.skipped.length,0);
assert(r1.text.startsWith('Chiều thứ Sáu'),'mốc thời gian ở đầu chương');
assert(/Thúy vừa rời đi\.\n\nHắn xuống bãi xe/.test(r1.text),'find ở cuối đoạn → câu chuyển cảnh thành đoạn mới');
// find giữa đoạn → chèn cùng đoạn, cách một dấu cách
assert.strictEqual(applyChapterPatches('Anh đứng dậy. Anh bước ra cửa. Trời mưa.',[{op:'insert_after',find:'Anh đứng dậy.',text:'Chiều muộn rồi.'}]).text,'Anh đứng dậy. Chiều muộn rồi. Anh bước ra cửa. Trời mưa.');
assert.strictEqual(applyChapterPatches('Anh đứng dậy. Anh bước ra cửa.',[{op:'insert_before',find:'Anh bước ra cửa.',text:'Hắn thở dài.'}]).text,'Anh đứng dậy. Hắn thở dài. Anh bước ra cửa.');
assert(checkPatchAcceptable(draft,r1).ok);
// phần không nhắc đến giữ nguyên 100%
assert(r1.text.includes(filler(60)));

// --- an toàn ---
// find mơ hồ (xuất hiện 2 lần, không có which) → bỏ qua, không đoán
const amb=applyChapterPatches(draft,[{op:'delete',find:'Căn phòng nhỏ chỉ có một chiếc giường'}]);
assert.strictEqual(amb.applied,0); assert(/cần which/.test(amb.skipped[0].reason)); assert.strictEqual(amb.text,draft.replace(/[ \t]+\n/g,'\n').trim());
// find bịa (không có trong bản thảo) → bỏ qua
assert.strictEqual(applyChapterPatches(draft,[{op:'replace',find:'câu này không hề có trong chương',text:'x'}]).applied,0);
// thao tác lạ, thiếu text → bỏ qua; patch tốt vẫn được ghép
const mix=applyChapterPatches(draft,[{op:'explode'},{op:'replace',find:'Thúy vừa rời đi.'},{op:'insert_end',text:'Hết ngày.'}]);
assert.strictEqual(mix.applied,1); assert.strictEqual(mix.skipped.length,2); assert(mix.text.endsWith('Hết ngày.'));
// khớp linh hoạt khoảng trắng/xuống dòng
assert.strictEqual(applyChapterPatches('Anh nói  rằng\nem đi rồi. Hết.',[{op:'replace',find:'nói rằng em đi rồi.',text:'nói em đi.'}]).text,'Anh nói em đi. Hết.');
// range quá dài (>40% chương) bị chặn
assert.strictEqual(applyChapterPatches(draft,[{op:'delete',from:'Bùi Lạc ngồi trong văn phòng',to:'cái quạt cũ kỹ.',which:'last'}]).applied,0);
// xoá gần hết chương / phình quá mức → bị từ chối ở bước kiểm tra cuối
assert.strictEqual(checkPatchAcceptable(draft,{text:'Một câu rất ngắn.',applied:1,skipped:[]}).ok,false);
assert.strictEqual(checkPatchAcceptable(draft,{text:draft+' '+draft,applied:1,skipped:[]}).ok,false);
assert.strictEqual(checkPatchAcceptable(draft,{text:draft,applied:0,skipped:[{reason:'x'}]}).ok,false);
// JSON hỏng / không phải JSON
assert.strictEqual(parsePatchResponse('Xin lỗi, tôi không thể.'),null);
assert.deepStrictEqual(parsePatchResponse('[{"op":"insert_end","text":"a"}]').length,1);

// prompt chứa lỗi + định dạng + bản thảo, và KHÔNG đòi viết lại cả chương
const pr=buildPatchPrompt({chapterNumber:5,review:{hardFailures:['Địa điểm mở chương mâu thuẫn'],warnings:['Thiếu mốc thời gian'],rewriteInstructions:['Bổ sung mốc thời gian']},draft:'BẢN-THẢO-X'});
assert(/KHÔNG viết lại cả chương/.test(pr)&&/Địa điểm mở chương mâu thuẫn/.test(pr)&&/Bổ sung mốc thời gian/.test(pr)&&/BẢN-THẢO-X/.test(pr)&&/"patches"/.test(pr));

// V12.32.11: AI sửa phải THẤY đoạn kết chương trước (như bộ chấm), nếu không sẽ vá mù và tự bịa địa điểm
const pe=buildPatchPrompt({chapterNumber:5,prevEnding:'Họ đi dọc hành lang tầng 7 tòa nhà Vĩnh Phát.',review:{hardFailures:['x']},draft:'D'});
assert(/ĐOẠN KẾT CHƯƠNG TRƯỚC/.test(pe)&&/hành lang tầng 7/.test(pe)&&/nối tiếp đúng/.test(pe),'patch prompt có đoạn kết chương trước');
assert(!/ĐOẠN KẾT CHƯƠNG TRƯỚC/.test(buildPatchPrompt({chapterNumber:1,review:{},draft:'D'})),'chương 1 không có đoạn kết trước');
// --- nối dây trong client + worker ---
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert(/id="autoFixChapterBtn"/.test(html)&&/reviewCurrentChapter\(\{autoFix:true\}\)/.test(html));
assert(/runQualityGate\(ch,n,ch\.plan\|\|"",ctx,\{rewrite:autoFix,forceWarnings:autoFix\}\)/.test(html));
assert(/patchDraftFromReview[\s\S]{0,900}prevEnding:/.test(html)&&/rewriteWholeDraft[\s\S]{0,900}prevEnding:/.test(html),'client truyền prevEnding cho cả vá và viết lại');
assert(/async function patchWorkerDraft[\s\S]{0,900}prevEnding:/.test(fs.readFileSync(path.join(__dirname,'../netlify/functions/write-chapter-background.js'),'utf8')),'worker truyền prevEnding');
assert(/async function rewriteDraftFromReview[\s\S]{0,2500}patchDraftFromReview[\s\S]{0,2500}rewriteWholeDraft/.test(html),'client: vá trước, sửa theo vùng, rồi mới viết lại cả chương');
const wk=fs.readFileSync(path.join(__dirname,'../netlify/functions/write-chapter-background.js'),'utf8');
assert(/async function rewriteWorkerDraft[\s\S]{0,2500}patchWorkerDraft[\s\S]{0,2500}rewriteWorkerWhole/.test(wk),'worker: vá trước, sửa theo vùng, rồi mới viết lại cả chương');
// script trong index.html vẫn biên dịch được
const scripts=[...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
scripts.forEach((s,i)=>{ try{ new Function(s); }catch(e){ throw new Error('index.html script #'+i+' lỗi cú pháp: '+e.message); } });
// --- Gate end-to-end (đúng tình huống 65/100): chấm trượt → AI vá cục bộ → chấm lại đạt → APPROVED ---
(async()=>{
  const ch={text:draft,versions:[],status:'REVISION_REQUIRED'}; let reviews=0, whole=0;
  const out=await runGateLoop(ch,{
    review:async()=>{ reviews++; return reviews===1
      ?{ok:true,review:{verdict:'HARD_FAIL',score:65,hardFailures:['Địa điểm mở chương mâu thuẫn'],warnings:[],rewriteInstructions:['Bổ sung mốc thời gian','Loại bỏ đoạn lặp']}}
      :{ok:true,review:{verdict:'PASS',score:92,hardFailures:[],warnings:[],rewriteInstructions:[]}}; },
    rewrite:async(review)=>{
      const res=applyChapterPatches(ch.text,parsePatchResponse(raw2.replace('"op":"delete"','"op":"delete"')));
      const acc=checkPatchAcceptable(ch.text,res); if(!acc.ok) return acc;
      backupBeforeRewrite(ch,'Trước khi AI vá cục bộ'); ch.text=res.text; return {ok:true}; }
  },{enabled:true,maxAttempts:3});
  assert.strictEqual(out.approved,true); assert.strictEqual(ch.status,'APPROVED'); assert.strictEqual(reviews,2);
  assert.strictEqual(ch.versions.length,1); assert.strictEqual(ch.versions[0].text,draft,'bản gốc được backup');
  assert.strictEqual(whole,0);
  console.log('PASS V12.32.10 patch rewrite');
})().catch(e=>{console.error(e);process.exit(1);});
