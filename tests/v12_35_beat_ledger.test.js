const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..');
const core=fs.readFileSync(path.join(root,'shared/core.js'),'utf8');
const sb={console};vm.createContext(sb);
vm.runInContext(core+'\n;Object.assign(this,{buildChapterPlanPrompt,buildQualityReviewPrompt});',sb);
const plan=sb.buildChapterPlanPrompt({chapterNumber:9,context:'OUTLINE: Ch9: Mỹ Duyên đến phòng trọ; Bùi Lạc phát hiện kẻ theo dõi.',recent:'',directive:'',hint:'',mainCharName:'Bùi Lạc',storyControl:''});
assert(plan.includes('BEAT LEDGER'));
assert(plan.includes('[B1]'));
assert(plan.includes('LEDGER_ORDER'));
const review=sb.buildQualityReviewPrompt({storyControl:'',characterLock:'',contract:'[B1] Mỹ Duyên đến phòng trọ | [B2] Bùi Lạc phát hiện gã vest xám',context:'',warnings:[],draft:'',prevEnding:'',knownNames:[],maxMainEvents:3,maxNamedCharacters:4});
assert(review.includes('BEAT LEDGER AUDIT'));
for(const file of ['index.html','netlify/functions/write-chapter-background.js']){
 const s=fs.readFileSync(path.join(root,file),'utf8');
 assert(s.includes('BEAT LEDGER — CÁCH THI HÀNH'),file+' missing write enforcement');
}
console.log('PASS V12.35 Beat Ledger prompts');
