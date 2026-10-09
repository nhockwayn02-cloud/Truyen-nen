// V12.30 regression: one failed unified postprocess call is soft and preserves Status/Memory.
const Module = require('module'), crypto = require('crypto'), path = require('path'), assert = require('assert');
const db = new Map();
const mockBlobs = { connectLambda(){}, getStore(){ return { async get(k){ const v=db.get(k); return v ? JSON.parse(v) : null; }, async setJSON(k,v){ db.set(k,JSON.parse(JSON.stringify(v))); }, async delete(k){db.delete(k);} }; } };
const origLoad = Module._load;
Module._load = function(req,...a){ return req === '@netlify/blobs' ? mockBlobs : origLoad.call(this,req,...a); };
let unifiedCalls=0;
const LONG = ("Gió thổi qua con phố vắng, cô bước đi giữa đêm mưa lạnh. ".repeat(250)).trim();
global.fetch = async (url, init) => {
  const body=JSON.parse(init.body||"{}");
  const prompt=JSON.stringify(body.messages||[]);
  if(prompt.includes("HẬU KỲ TỔNG HỢP CHO CHƯƠNG")){
    unifiedCalls++;
    return {ok:false,status:503,headers:{get:()=>"application/json"},text:async()=>"temporary",json:async()=>({})};
  }
  return {ok:true,status:200,headers:{get:()=>"application/json"},json:async()=>({choices:[{message:{content:'{}'},finish_reason:"stop"}]}),text:async()=>"{}"};
};
const worker=require(path.join(__dirname,"../netlify/functions/write-chapter-background.js"));
(async()=>{
  const token="tok", jobId="soft1";
  const state={
    storyId:"s1", chapters:[{id:"c1",title:"Chương 1",text:LONG,summary:"Tóm tắt cũ",wordCount:900,briefUsed:"",status:"DRAFTED",review:{},sync:{}}], currentChapterIndex:0,
    characters:[{id:"c1",name:"Minh",tier:"major",role:"người gác cửa",occupation:"người gác cửa",coreLocked:true,coreIdentity:{role:"người gác cửa"},physicalState:"đứng ngoài cửa"}],
    locations:[],items:[],threads:[],scenes:[],timeline:[{id:"ev-old",chapter:0,summary:"Sự kiện cũ"}],foreshadowing:[{id:"fs-old",description:"Lời hứa cũ",status:"paid_off"}],knowledgeLedger:[{id:"kl-old",character:"Minh",fact:"Biết bí mật cũ"}],memoryEvents:[],
    currentStatus:"Status cũ",statusState:{schemaVersion:2,currentState:{situation:"Tình hình cũ"},characterStates:[]},lastStatusChapter:0,lastMemorySyncChapter:0,canonVersion:0,minChapterWords:500,qualityGateEnabled:false,
    mature:false,nsfwMode:"never",mainCharProfile:{name:"Lan"},chaptersSinceBackup:0,nextChapterHint:"Gợi ý cũ"
  };
  const oldStatus=JSON.stringify(state.statusState), oldTimeline=JSON.stringify(state.timeline), oldFs=JSON.stringify(state.foreshadowing), oldKl=JSON.stringify(state.knowledgeLedger);
  db.set(jobId,JSON.stringify({jobId,createdAt:Date.now(),status:"queued",schemaVersion:9,mode:"postprocess",chapterNumber:1,baseChapterCount:1,
    workerTokenHash:crypto.createHash("sha256").update(token).digest("hex"),apiKeyEncrypted:{encrypted:false,value:"k"},apiEndpoint:"http://mock/chat/completions",model:"m",storyState:state}));
  const r=await worker.handler({httpMethod:"POST",body:JSON.stringify({jobId,workerToken:token}),headers:{}});
  assert.strictEqual(r.statusCode,200,"handler phải hoàn thành kể cả hậu kỳ mềm lỗi");
  const job=db.get(jobId), ch=job.storyState.chapters[0];
  assert.strictEqual(job.status,"completed");
  assert.strictEqual(unifiedCalls,1,"lỗi API chỉ được thử một lần, không tách ra gọi Status/Memory riêng");
  assert.strictEqual(job.storyState.currentStatus,"Status cũ","Status cũ phải giữ nguyên khi AI lỗi");
  assert.strictEqual(JSON.stringify(job.storyState.statusState),oldStatus,"statusState phải được giữ nguyên");
  assert.strictEqual(JSON.stringify(job.storyState.timeline),oldTimeline,"timeline phải được giữ nguyên");
  assert.strictEqual(JSON.stringify(job.storyState.foreshadowing),oldFs,"foreshadowing phải được giữ nguyên");
  assert.strictEqual(JSON.stringify(job.storyState.knowledgeLedger),oldKl,"knowledge ledger phải được giữ nguyên");
  assert.strictEqual(job.storyState.lastMemorySyncChapter,0,"không tăng cursor khi Memory thất bại");
  assert(!((ch.autoUpdateIssues||[]).some(x=>/^Status(?:\\b|:)|^Memory(?:\\b|:)/i.test(String(x)))),"Status/Memory lỗi mềm không được đưa vào autoUpdateIssues");
  assert.strictEqual(ch.sync.status,"SYNCED","chương đã lưu vẫn SYNCED dù hậu kỳ mềm lỗi");
  assert.strictEqual(ch.postProcess.status,"DONE");
  assert.strictEqual(ch.postProcess.tasks.Status.status,"FAILED");
  assert.strictEqual(ch.postProcess.tasks.Memory.status,"FAILED");
  console.log("PASS V12.30 soft failure: một API call; Status/Memory giữ nguyên khi lỗi");
})().catch(e=>{console.error("FAIL",e.stack||e.message);process.exit(1);});
