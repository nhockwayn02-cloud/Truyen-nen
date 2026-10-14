// V12.32.18: tiến độ Arc + Outline theo từng chương + Gate arcStall.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const core=fs.readFileSync(path.join(__dirname,'../shared/core.js'),'utf8');
const sb={console};vm.createContext(sb);
vm.runInContext(core+'\n;Object.assign(this,{arcProgressPrompt,outlineChapterLines,outlineCoverageLeft,evaluateReview,buildQualityReviewPrompt,buildChapterPlanPrompt,GATE_REVIEW_SCHEMA});',sb);
const chs=n=>Array.from({length:n},()=>({}));
// Arc có chương kết
let st={chapters:chs(11),arcs:[{name:'Báo thù',goal:'Lật tẩy kẻ phản bội',startChapter:10,endChapterPlanned:20,status:'active'}],outlinePlans:[]};
let p=sb.arcProgressPrompt(st);
assert(/chương 3\/11/.test(p)&&/còn 8 chương/.test(p)&&/Lật tẩy/.test(p),p);
// nửa chặng
st.chapters=chs(15);assert(/qua nửa chặng/.test(sb.arcProgressPrompt(st)));
// chương cuối + quá hạn
st.chapters=chs(19);assert(/CHƯƠNG CUỐI DỰ KIẾN/.test(sb.arcProgressPrompt(st)));
st.chapters=chs(25);assert(/QUÁ chương kết/.test(sb.arcProgressPrompt(st)));
// override số chương (Gate/regen)
st.chapters=chs(12);assert(/chương 5\/11/.test(sb.arcProgressPrompt(st,14)));
// arc không có chương kết
const st2={chapters:chs(3),arcs:[{name:'A',goal:'g',startChapter:1,status:'active'}]};
assert(/chưa có chương kết dự kiến/.test(sb.arcProgressPrompt(st2)));
assert.strictEqual(sb.arcProgressPrompt({chapters:[],arcs:[],outlinePlans:[]}),'');
// Outline từng chương
const content='Ch12: A phát hiện lá thư và quyết định chất vấn B.\nChương 13: B chối, A tìm thêm bằng chứng ở kho.\n14) Bằng chứng bị mất, A nghi ngờ người thân.\nMốc kết giai đoạn: A biết kẻ phản bội.';
const map=sb.outlineChapterLines(content);
assert(map[12]&&map[13]&&map[14]&&!map[15]);
const st3={chapters:chs(11),arcs:[],outlinePlans:[{name:'Điều tra',from:12,to:21,content}]};
const p3=sb.arcProgressPrompt(st3);
assert(/VIỆC BẮT BUỘC CỦA CHƯƠNG 12/.test(p3)&&/lá thư/.test(p3)&&/Chương 13 sẽ làm, CHƯA làm/.test(p3)&&/chương này là 1\/10/.test(p3),p3);
// outline không dạng từng chương -> dùng cả khối (tối đa 1500)
const st4={chapters:chs(0),arcs:[],outlinePlans:[{name:'X',from:1,to:5,content:'Mô tả chung '.repeat(200)}]};
const p4=sb.arcProgressPrompt(st4);assert(p4.includes('Mô tả chung')&&p4.length<1800);
// phủ outline
assert.strictEqual(sb.outlineCoverageLeft({chapters:chs(20),outlinePlans:[{to:21}]}),1);
assert.strictEqual(sb.outlineCoverageLeft({chapters:chs(5),outlinePlans:[]}),null);
// Gate
assert(/arcStall/.test(sb.GATE_REVIEW_SCHEMA));
assert(!/arcStall=true CHỈ KHI/.test(sb.buildQualityReviewPrompt({draft:'x'})),'không có arc thì không có luật');
const rp=sb.buildQualityReviewPrompt({draft:'x',arcProgress:'ARC A'});
assert(/arcStall=true CHỈ KHI/.test(rp)&&/TIẾN ĐỘ ARC \/ OUTLINE/.test(rp));
const rv=sb.evaluateReview({score:97,arcStall:true,arcNotes:['chỉ tả cảnh ăn uống']},{});
assert.strictEqual(rv.verdict,'HARD_FAIL');assert(rv.hardFailures.some(x=>/Arc\/Outline/.test(x)&&/ăn uống/.test(x)));
assert(/7a\. TIẾN ĐỘ ARC\/OUTLINE/.test(sb.buildChapterPlanPrompt({chapterNumber:2,context:'',recent:''})));
// client/worker
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert(/arcProgressPrompt\(state, _n\)/.test(html)&&/arcProgressPrompt\(state,chapterNumber\)/.test(html)&&/"chapters":\[\{"chapter"/.test(html.replace(/'/g,'"'))||/chapters":\[\{"chapter":/.test(html),'client');
assert(/outlineCoverageLeft\(state\)/.test(html)&&/mỗi chương một dòng/.test(html));
const wk=fs.readFileSync(path.join(__dirname,'../netlify/functions/write-chapter-background.js'),'utf8');
assert(/arcProgress: arcProgressPrompt\(state, n\)/.test(wk),'worker');
console.log('PASS V12.32.18 arc + outline');
