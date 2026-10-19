// V12.32.7: thời gian truyện — luật thời gian, nhịp, phát hiện đứng yên, cảnh báo Gate.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const core=fs.readFileSync(path.join(__dirname,'../shared/core.js'),'utf8');
const sb={console};vm.createContext(sb);
vm.runInContext(core+'\n;Object.assign(this,{buildPatchPrompt,timePrompt,currentTimeMark,timeStallInfo,storyControlPrompt,evaluateReview,buildQualityReviewPrompt,buildChapterPlanPrompt,GATE_REVIEW_SCHEMA});',sb);
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
assert(/Dòng thời gian hiện tại.*Tối ngày 5/.test(sb.timePrompt({statusState:{currentState:{time:'Tối ngày 5'}}})));
// phát hiện đứng yên
const mk=(arr)=>({statusState:{timeLog:arr.map((t,i)=>({chapter:i+1,time:t}))}});
assert.strictEqual(sb.timeStallInfo(mk(['Tối nay','Tối nay.','Tối nay'])).run,3);
assert.strictEqual(sb.timeStallInfo(mk(['Sáng ngày 1','Tối ngày 1','Sáng ngày 2'])),null);
assert.strictEqual(sb.timeStallInfo(mk(['A','B'])),null);
const st=sb.storyControlPrompt(mk(['Tối nay','Tối nay','Tối nay','Tối nay']));
assert(/CẢNH BÁO: 4 chương liên tiếp/.test(st)&&/PHẢI cho thời gian trôi tiếp/.test(st));
// kế hoạch + Gate
assert(/DÒNG THỜI GIAN \(ghi chú NỘI BỘ/.test(sb.buildChapterPlanPrompt({chapterNumber:2,context:'',recent:''})));
assert(/timeStagnation/.test(sb.GATE_REVIEW_SCHEMA)&&/timeStagnation=true CHỈ KHI/.test(sb.buildQualityReviewPrompt({draft:'x'})));
const rv=sb.evaluateReview({score:95,timeStagnation:true,timeNotes:['mâu thuẫn ngày: vừa tối đã lại sáng']},{});
assert.notStrictEqual(rv.verdict,'HARD_FAIL','chỉ cảnh báo mềm');
assert(rv.warnings.some(w=>/Thời gian truyện bất nhất hoặc đứng yên/.test(w)&&/mâu thuẫn ngày/.test(w)));
// client/worker
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert(/id="timePace"/.test(html)&&/currentTimeMark\(state\)/.test(html)&&/mục THỜI GIAN TRUYỆN/.test(html),'client');
const wk=fs.readFileSync(path.join(__dirname,'../netlify/functions/write-chapter-background.js'),'utf8');
assert(/status\.timeLog/.test(wk)&&/changes\.time = thời điểm ở CUỐI chương/.test(wk)&&/KHÔNG cập nhật time \(giữ mốc cũ\)/.test(wk),'worker');

// ===== V12.32.15: thời gian chảy theo mạch kể, không nhãn đầu/cuối chương =====
const tp=sb.timePrompt({});
assert(/KHÔNG mở chương bằng dòng\/câu báo ngày giờ/.test(tp)&&/KHÔNG kết chương bằng câu tổng kết thời điểm/.test(tp),'cấm nhãn thời gian đầu/cuối chương');
assert(/Chương không nêu giờ giấc rõ ràng vẫn hoàn toàn đúng/.test(tp)&&/ánh sáng, thời tiết, bữa ăn/.test(tp),'thời gian thể hiện qua chi tiết trong cảnh');
assert(!/ngay đầu chương và mỗi lần chuyển cảnh nêu mốc/.test(tp)&&!/cuối chương để thời điểm rõ ràng/.test(tp),'không còn luật ép mốc đầu/cuối chương');
assert(/ĐƯỢC PHÉP nhảy thời gian/.test(tp)&&/một mệnh đề\/câu nằm ngay trong mạch kể/.test(tp)&&/chỉ trôi về phía trước/.test(tp),'vẫn cho nhảy thời gian trong mạch kể và giữ nhất quán');
const rp=sb.buildQualityReviewPrompt({draft:'x'});
assert(/TUYỆT ĐỐI KHÔNG báo chỉ vì chương không ghi ngày\/giờ/.test(rp)&&/thiếu nhãn thời gian KHÔNG phải lỗi/.test(rp)&&!/cả chương hoàn toàn không có mốc thời gian nào/.test(rp),'Gate không phạt thiếu mốc thời gian');
assert(!/mốc kết chương \+|mốc thời gian mở chương/.test(sb.buildChapterPlanPrompt({chapterNumber:2,context:'',recent:''})),'kế hoạch không ép mốc mở/kết chương');
const pp=sb.buildPatchPrompt?sb.buildPatchPrompt({chapterNumber:2,review:{hardFailures:['x']},draft:'d'}):'';
assert(!pp||/KHÔNG thêm câu\/dòng báo ngày giờ như một nhãn/.test(pp),'AI vá không chèn nhãn thời gian');
assert(!/câu chuyển cảnh rõ/.test(html)&&!/câu chuyển cảnh rõ/.test(wk)&&!/di chuyển \+ mốc thời gian/.test(html+wk),'client/worker không còn chữ cũ "câu chuyển cảnh rõ"');
console.log('PASS V12.32.7 story time');
