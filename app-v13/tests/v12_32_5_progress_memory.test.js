// V12.32.5: tiến triển bắt buộc, Gate bắt dậm chân, trí nhớ truyện.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const core=fs.readFileSync(path.join(__dirname,'../shared/core.js'),'utf8');
const sb={console};vm.createContext(sb);
vm.runInContext(core+'\n;Object.assign(this,{progressRulesPrompt,storySoFarPrompt,openLoopsPrompt,evaluateReview,buildQualityReviewPrompt,buildChapterPlanPrompt,storyControlPrompt,GATE_REVIEW_SCHEMA});',sb);
// progress rules
const p1=sb.progressRulesPrompt({chapterMatureFocus:'primary'});
assert(/THAY ĐỔI/.test(p1)&&/hai phần ba/.test(p1)&&/cấm lặp lại cùng một hành động/i.test(p1),'luật tiến triển + PRIMARY');
assert(!/hai phần ba/.test(sb.progressRulesPrompt({chapterMatureFocus:'none'})),'không PRIMARY thì không có luật tỉ lệ cảnh nóng');
assert(/TIẾN TRIỂN/.test(sb.storyControlPrompt({})),'story control có tiến triển');
// plan
assert(/THAY ĐỔI\/TIẾN TRIỂN/.test(sb.buildChapterPlanPrompt({chapterNumber:2,context:'',recent:''})),'kế hoạch có mục thay đổi');
// gate
assert(/stagnation/.test(sb.GATE_REVIEW_SCHEMA),'schema stagnation');
const rv=sb.evaluateReview({score:99,stagnation:true,stagnationNotes:['lặp cảnh 3 lần']},{});
assert.strictEqual(rv.verdict,'HARD_FAIL');assert(rv.hardFailures.some(x=>/dậm chân/.test(x)&&/lặp cảnh/.test(x)));
assert(/stagnation=true CHỈ KHI/.test(sb.buildQualityReviewPrompt({draft:'x'})),'review prompt có luật stagnation');
// story so far
const chs=[];for(let i=1;i<=30;i++)chs.push({summary:'**Tóm tắt chương:** Sự kiện số '+i+' xảy ra. '+'Chi tiết dài '.repeat(40)});
const sf=sb.storySoFarPrompt(chs,2800);
assert(sf.length<=3300,'trong ngân sách: '+sf.length);
assert(sf.includes('Ch29:')&&!sf.includes('Ch30:'),'có chương gần, bỏ chương cuối (đã có khối riêng)');
assert(!/Tóm tắt chương/.test(sf),'bỏ tiêu đề **Tóm tắt chương:**');
assert.strictEqual(sb.storySoFarPrompt([{summary:'x'}],2800),'','một chương -> rỗng');
// open loops
const ol=sb.openLoopsPrompt({statusState:{currentState:{unresolved:'Ai gửi thư?',nextHooks:'Gặp Lan'},longTerm:{conflict:'Hùng vs Minh'}}});
assert(/Ai gửi thư/.test(ol)&&/Gặp Lan/.test(ol)&&/Hùng vs Minh/.test(ol));
assert.strictEqual(sb.openLoopsPrompt({}),'');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert(/progressRulesPrompt\(state\)/.test(html)&&/storySoFarPrompt\(/.test(html)&&/openLoopsPrompt\(state\)/.test(html)&&/priorChapters: isRegen/.test(html),'đã nối vào client');
console.log('PASS V12.32.5 progress + memory');
