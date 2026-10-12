// V12.32.7: thời gian truyện — luật thời gian, nhịp, phát hiện đứng yên, cảnh báo Gate.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const core=fs.readFileSync(path.join(__dirname,'../shared/core.js'),'utf8');
const sb={console};vm.createContext(sb);
vm.runInContext(core+'\n;Object.assign(this,{timePrompt,currentTimeMark,timeStallInfo,storyControlPrompt,evaluateReview,buildQualityReviewPrompt,buildChapterPlanPrompt,GATE_REVIEW_SCHEMA});',sb);
// luật có trong story control
const sc=sb.storyControlPrompt({});
assert(/THỜI GIAN TRUYỆN/.test(sc)&&/ĐƯỢC PHÉP nhảy thời gian/.test(sc),'story control có luật thời gian');
assert(!/NHỊP THỜI GIAN/.test(sc),'không chọn nhịp -> không có dòng nhịp');
assert(/KHOẢNG MỘT NGÀY/i.test(sb.storyControlPrompt({storyControl:{timePace:'day'}}))&&/NHỊP THỜI GIAN/.test(sb.storyControlPrompt({storyControl:{timePace:'week'}})));
assert(!/NHỊP THỜI GIAN/.test(sb.storyControlPrompt({storyControl:{timePace:'bậy'}})),'giá trị lạ bị bỏ');
// mốc hiện tại: nhập tay ưu tiên, nếu trống dùng Status
assert.strictEqual(sb.currentTimeMark({storyClock:' Ngày 3 '}),'Ngày 3');
assert.strictEqual(sb.currentTimeMark({storyClock:'',statusState:{currentState:{time:'Tối ngày 5'}}}),'Tối ngày 5');
assert.strictEqual(sb.currentTimeMark({}),'');
assert(/Mốc hiện tại.*Tối ngày 5/.test(sb.timePrompt({statusState:{currentState:{time:'Tối ngày 5'}}})));
// phát hiện đứng yên
const mk=(arr)=>({statusState:{timeLog:arr.map((t,i)=>({chapter:i+1,time:t}))}});
assert.strictEqual(sb.timeStallInfo(mk(['Tối nay','Tối nay.','Tối nay'])).run,3);
assert.strictEqual(sb.timeStallInfo(mk(['Sáng ngày 1','Tối ngày 1','Sáng ngày 2'])),null);
assert.strictEqual(sb.timeStallInfo(mk(['A','B'])),null);
const st=sb.storyControlPrompt(mk(['Tối nay','Tối nay','Tối nay','Tối nay']));
assert(/CẢNH BÁO: 4 chương liên tiếp/.test(st)&&/PHẢI chuyển sang mốc thời gian sau/.test(st));
// kế hoạch + Gate
assert(/THỜI GIAN: ghi mốc thời gian mở chương/.test(sb.buildChapterPlanPrompt({chapterNumber:2,context:'',recent:''})));
assert(/timeStagnation/.test(sb.GATE_REVIEW_SCHEMA)&&/timeStagnation=true CHỈ KHI/.test(sb.buildQualityReviewPrompt({draft:'x'})));
const rv=sb.evaluateReview({score:95,timeStagnation:true,timeNotes:['không có mốc thời gian']},{});
assert.notStrictEqual(rv.verdict,'HARD_FAIL','chỉ cảnh báo mềm');
assert(rv.warnings.some(w=>/Thời gian truyện đứng yên/.test(w)&&/không có mốc/.test(w)));
// client/worker
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert(/id="timePace"/.test(html)&&/currentTimeMark\(state\)/.test(html)&&/mục THỜI GIAN TRUYỆN/.test(html),'client');
const wk=fs.readFileSync(path.join(__dirname,'../netlify/functions/write-chapter-background.js'),'utf8');
assert(/status\.timeLog/.test(wk)&&/changes\.time = mốc ở CUỐI chương/.test(wk),'worker');
console.log('PASS V12.32.7 story time');
