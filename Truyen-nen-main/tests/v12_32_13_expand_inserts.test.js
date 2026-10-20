// V12.32.13: mở rộng chương bằng CHÈN ĐOẠN + trần output; không còn "viết lại toàn bộ chương" vượt giới hạn token.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const core=fs.readFileSync(path.join(__dirname,'../shared/core.js'),'utf8');
const sb={console};vm.createContext(sb);
vm.runInContext(core+'\n;Object.assign(this,{AI_MAX_OUTPUT_TOKENS,wholeRewriteFits,expandMaxTokens,buildExpandInsertPrompt,parseInsertBlocks,applyExpandInserts,acceptExpandInserts,applyChapterPatches,countWords});',sb);
const {AI_MAX_OUTPUT_TOKENS,wholeRewriteFits,expandMaxTokens,buildExpandInsertPrompt,parseInsertBlocks,applyExpandInserts,acceptExpandInserts,applyChapterPatches,countWords}=sb;

// ---- trần output & ước lượng ----
assert.strictEqual(AI_MAX_OUTPUT_TOKENS,7800);
const mk=n=>Array.from({length:n},(_,i)=>'Câu số '+i+' trong đoạn văn kể chuyện về Bùi Lạc và Mỹ Duyên ở tòa nhà Vĩnh Phát.').join(' ');
assert.strictEqual(wholeRewriteFits(mk(150)).fits,true,'chương ngắn (~2000 từ) vừa trần');
const big=wholeRewriteFits(Array.from({length:5309},()=>'từ').join(' ')+' '+'a'.repeat(5309*4));
assert.strictEqual(big.fits,false,'chương ~5300 từ KHÔNG vừa trần → không viết lại cả chương');
assert(expandMaxTokens(1000)<=AI_MAX_OUTPUT_TOKENS && expandMaxTokens(1000)>=3000 && expandMaxTokens(0)===1500 && expandMaxTokens(99999)===AI_MAX_OUTPUT_TOKENS);

// ---- prompt ----
const P=buildExpandInsertPrompt({text:'BẢN-X',wc:2500,goal:3000,target:3200,maxWords:3800,directive:'D',hint:'H',closing:'KẾT',style:'STYLE'});
assert(/KHÔNG viết lại chương/.test(P)&&/>>> SAU:/.test(P)&&/>>> TRƯỚC:/.test(P)&&/BẢN-X/.test(P)&&/ENDING ANCHOR: KẾT/.test(P)&&/Không chèn sau đoạn cuối/.test(P));
assert(!/VIẾT LẠI TOÀN BỘ/.test(P),'prompt mới không đòi viết lại toàn bộ');

// ---- parse ----
const raw='Đây là các chỗ chèn:\n>>> SAU: "đã rời khỏi căn phòng nhỏ."\nGió lùa qua khe cửa. Cô khẽ rùng mình.\n\n"Anh đi thật à?" — cô hỏi.\n>>> TRƯỚC: Chiếc xe lăn bánh\nNgoài sân, tiếng động cơ nổ giòn tan.\n>>> SAU:\nrỗng thì bỏ\n';
const blocks=parseInsertBlocks(raw);
assert.strictEqual(blocks.length,2);
assert.strictEqual(blocks[0].op,'insert_after'); assert.strictEqual(blocks[0].find,'đã rời khỏi căn phòng nhỏ.');
assert(blocks[0].text.includes('"Anh đi thật à?" — cô hỏi.'),'dấu ngoặc kép trong lời thoại không làm vỡ định dạng');
assert.strictEqual(blocks[1].op,'insert_before'); assert.strictEqual(blocks[1].find,'Chiếc xe lăn bánh');

// ---- chương mẫu: có lời thoại, ngoặc, đoạn kết ----
const p1='Thúy đã rời khỏi căn phòng nhỏ. “Tôi đi đây,” cô nói rồi khép cửa lại thật khẽ.';
const p2='Chiếc xe lăn bánh ra khỏi bãi đỗ, hòa vào dòng người buổi chiều.';
const p3='— Anh có nhớ em không? — Mỹ Duyên hỏi.';
const endP='Bùi Lạc không trả lời, chỉ siết chặt tay lái và nhìn thẳng về phía trước.';
const filler=n=>Array.from({length:n},(_,i)=>'Câu đệm '+i+' nói về văn phòng Vĩnh Phát.').join(' ');
const chap=[p1,filler(30),p2,filler(30),p3,filler(30),endP].join('\n\n');
const add1='Gió lùa qua khe cửa. '.repeat(14).trim(), add2='Ngoài sân, tiếng động cơ nổ giòn tan. '.repeat(14).trim();

// chèn SAU đoạn (neo thiếu ngoặc/dấu cuối) → thành đoạn mới, giữ nguyên văn gốc
let r=applyExpandInserts(chap,[{op:'insert_after',find:'nói rồi khép cửa lại thật khẽ',text:add1}],5000);
assert.strictEqual(r.applied,1); assert(r.text.includes(p1+'\n\n'+add1+'\n\n'+filler(30)),'neo thiếu dấu chấm vẫn chèn ở cuối đoạn, không xé câu');
assert(r.text.endsWith(endP),'đoạn kết nguyên vẹn');
// chèn TRƯỚC đoạn (neo bỏ ngoặc mở) → đoạn mới đứng trước
r=applyExpandInserts(chap,[{op:'insert_before',find:'Anh có nhớ em không?',text:add2}],5000);
assert.strictEqual(r.applied,1); assert(r.text.includes(add2+'\n\n'+p3),'neo thiếu gạch thoại đầu đoạn vẫn chèn trước đoạn');
// nhiều khối + giữ phần gốc 100%
r=applyExpandInserts(chap,[{op:'insert_after',find:'nói rồi khép cửa lại thật khẽ.',text:add1},{op:'insert_before',find:'Chiếc xe lăn bánh ra khỏi',text:add2}],5000);
assert.strictEqual(r.applied,2); assert(r.added>=150);
[p1,p2,p3,endP,filler(30)].forEach(s=>assert(r.text.includes(s)));
assert(acceptExpandInserts(chap,r).ok);

// ---- an toàn ----
// chèn sau đoạn cuối (đổi điểm kết) → bỏ
r=applyExpandInserts(chap,[{op:'insert_after',find:'nhìn thẳng về phía trước.',text:add1}],5000);
assert.strictEqual(r.applied,0); assert(/đoạn kết/.test(r.skipped[0].reason)); assert.strictEqual(r.text,chap.trim());
// vượt maxWords → bỏ khối đó, giữ khối còn lại
const lim=countWords(chap)+180;
r=applyExpandInserts(chap,[{op:'insert_after',find:'nói rồi khép cửa lại thật khẽ.',text:add1},{op:'insert_before',find:'Chiếc xe lăn bánh ra khỏi',text:add1+' '+add2+' '+add2}],lim);
assert.strictEqual(r.applied,1); assert(/vượt giới hạn/.test(r.skipped[0].reason)); assert(countWords(r.text)<=lim);
// neo bịa / mơ hồ / thao tác xoá-thay → bỏ
r=applyExpandInserts(chap,[{op:'insert_after',find:'câu này không có trong chương',text:add1},{op:'delete',find:'Thúy'},{op:'replace',find:'Thúy',text:'x'}],5000);
assert.strictEqual(r.applied,0); assert.strictEqual(r.skipped.length,3);
// quá ít → từ chối
assert.strictEqual(acceptExpandInserts(chap,applyExpandInserts(chap,[{op:'insert_after',find:'nói rồi khép cửa lại thật khẽ.',text:'Gió lùa.'}],5000)).ok,false);
assert.strictEqual(acceptExpandInserts(chap,{applied:0,skipped:[{reason:'x'}],added:0}).ok,false);

// ---- bản vá cũ (V12.32.10) vẫn đúng sau khi đổi quy tắc cuối/đầu đoạn ----
assert.strictEqual(applyChapterPatches('Anh đứng dậy. Anh bước ra cửa. Trời mưa.',[{op:'insert_after',find:'Anh đứng dậy.',text:'Chiều muộn rồi.'}]).text,'Anh đứng dậy. Chiều muộn rồi. Anh bước ra cửa. Trời mưa.');
assert.strictEqual(applyChapterPatches('Anh đứng dậy.\n\nTrời mưa.',[{op:'insert_after',find:'Anh đứng dậy',text:'Chiều muộn rồi.'}]).text,'Anh đứng dậy.\n\nChiều muộn rồi.\n\nTrời mưa.');

// ---- nối dây client + worker ----
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'), wk=fs.readFileSync(path.join(__dirname,'../netlify/functions/write-chapter-background.js'),'utf8');
for(const [n,src] of [['client',html],['worker',wk]]){
  assert(/buildExpandInsertPrompt\(\{/.test(src)&&/applyExpandInserts\(/.test(src)&&/acceptExpandInserts\(/.test(src),n+': mở rộng cuối dùng chèn đoạn');
  { const i=src.indexOf('buildExpandInsertPrompt({'), seg=src.slice(i,i+1800); assert(/expandMaxTokens\(/.test(seg)&&!/16000|24000/.test(seg),n+': khối mở rộng xin token vừa đủ, không xin 16000/24000'); }
  assert(/wholeRewriteFits\(oldText\)/.test(src),n+': chặn viết lại cả chương khi quá dài');
  assert(!/Math\.min\(7800,/.test(src),n+': dùng hằng AI_MAX_OUTPUT_TOKENS');
}
assert(!/buildExpandPrompt\(\{/.test(html.replace(/function buildExpandPrompt/,''))&&!/buildExpandPrompt\(\{/.test(wk.replace(/function buildExpandPrompt/,'')),'luồng mở rộng không còn gọi buildExpandPrompt (viết lại toàn bộ)');
const scripts=[...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
scripts.forEach((s,i)=>{ try{ new Function(s);}catch(e){ throw new Error('index.html script #'+i+': '+e.message);} });
console.log('PASS V12.32.13 expand inserts');
