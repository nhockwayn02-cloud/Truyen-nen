const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const core=fs.readFileSync(path.join(__dirname,'..','shared/core.js'),'utf8');
const sb={console};vm.createContext(sb);vm.runInContext(core+'\n;Object.assign(this,{runGateLoop});',sb);
const chapter={text:'BẢN TỐT HƠN',wordCount:3,status:'DRAFTED'};
let reviewCount=0;
(async()=>{
 const out=await sb.runGateLoop(chapter,{
  selfCheck:async()=>{},
  review:async()=>{reviewCount++; return {ok:true,review: reviewCount===1 ? {score:85,verdict:'HARD_FAIL',hardFailures:['Thiếu beat'],warnings:[]} : {score:75,verdict:'HARD_FAIL',hardFailures:['Thiếu continuity'],warnings:[]}};},
  rewrite:async()=>{chapter.text='BẢN SỬA TỆ HƠN'; chapter.wordCount=4; return {ok:true};},
  onChange:()=>{}
 },{enabled:true,allowRewrite:true,maxAttempts:2,acceptSoft:true});
 assert.strictEqual(out.approved,false);
 assert.strictEqual(chapter.text,'BẢN TỐT HƠN');
 assert.strictEqual(chapter.review.score,85);
 assert.strictEqual(chapter.review.regressionGuard,true);
 console.log('PASS V12.36 Best Draft Guard');
})().catch(e=>{console.error(e);process.exit(1);});
