// V12.32.9: cảnh & người có mặt, Gate sceneViolation, bỏ ngoặc nhọn rò rỉ.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const core=fs.readFileSync(path.join(__dirname,'../shared/core.js'),'utf8');
const sb={console};vm.createContext(sb);
vm.runInContext(core+'\n;Object.assign(this,{scenePresencePrompt,storyControlPrompt,buildChapterPlanPrompt,evaluateReview,buildQualityReviewPrompt,cleanProseArtifacts,GATE_REVIEW_SCHEMA});',sb);
assert(/CẢNH & NGƯỜI CÓ MẶT/.test(sb.storyControlPrompt({}))&&/tự xuất hiện hay biến mất/.test(sb.scenePresencePrompt()));
assert(/5b\. CẢNH & NGƯỜI CÓ MẶT/.test(sb.buildChapterPlanPrompt({chapterNumber:2,context:'',recent:''})));
assert(/sceneViolation/.test(sb.GATE_REVIEW_SCHEMA)&&/sceneViolation=true CHỈ KHI/.test(sb.buildQualityReviewPrompt({draft:'x'})));
const rv=sb.evaluateReview({score:98,sceneViolation:true,sceneNotes:['Thúy nói dù đã ra ngoài']},{});
assert.strictEqual(rv.verdict,'HARD_FAIL');assert(rv.hardFailures.some(x=>/Lỗi cảnh/.test(x)&&/Thúy/.test(x)));
assert.strictEqual(sb.evaluateReview({score:98},{}).verdict,'PASS');
// ngoặc nhọn
assert.strictEqual(sb.cleanProseArtifacts('Cô đưa ra {phương án tài chính} cho anh.'),'Cô đưa ra phương án tài chính cho anh.');
assert.strictEqual(sb.cleanProseArtifacts('Anh nói {{kế hoạch}} xong.'),'Anh nói kế hoạch xong.');
assert.strictEqual(sb.cleanProseArtifacts('Cô gật đầu.'),'Cô gật đầu.');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert(/CẢNH & NGƯỜI CÓ MẶT/.test(html));
console.log('PASS V12.32.9 scene presence');
