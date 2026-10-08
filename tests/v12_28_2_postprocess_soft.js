// V12.28.2 — Status/Memory hậu kỳ là soft tasks: lỗi của chúng không biến chương đã viết thành ⚠ Status/Memory.
const Module = require("module"), crypto = require("crypto"), path = require("path"), assert = require("assert");
const db = new Map();
const mockBlobs = { connectLambda(){}, getStore(){ return { async get(k){ const v=db.get(k); return v ? JSON.parse(v) : null; }, async setJSON(k,v){ db.set(k,JSON.parse(JSON.stringify(v))); }, async delete(k){db.delete(k);} }; } };
const origLoad = Module._load;
Module._load = function(req,...a){ return req === "@netlify/blobs" ? mockBlobs : origLoad.call(this,req,...a); };
let statusCalls=0, memoryCalls=0;
const LONG = ("Gió thổi qua con phố vắng, cô bước đi giữa đêm mưa lạnh. ".repeat(250)).trim();
global.fetch = async (url, init) => {
  const body=JSON.parse(init.body||"{}");
  const prompt=JSON.stringify(body.messages||[]);
  if(prompt.includes("CẬP NHẬT CURRENT STATUS")){ statusCalls++; return {ok:false,status:503,headers:{get:()=>"application/json"},text:async()=>"temporary",json:async()=>({})}; }
  if(prompt.includes("CẬP NHẬT LONG-TERM MEMORY")){ memoryCalls++; return {ok:false,status:503,headers:{get:()=>"application/json"},text:async()=>"temporary",json:async()=>({})}; }
  let content='{}';
  if(prompt.includes("bộ máy tóm tắt")) content='Tóm tắt ngắn.';
  else if(prompt.includes("CẬP NHẬT NHÂN VẬT")) content='[]';
  else if(prompt.includes("CẬP NHẬT THẾ GIỚI")) content='{"locations":[],"items":[],"threads":[]}';
  else if(prompt.includes("GỢI Ý CHƯƠNG SAU")) content='Gợi ý chương kế tiếp.';
  return {ok:true,status:200,headers:{get:()=>"application/json"},json:async()=>({choices:[{message:{content},finish_reason:"stop"}]}),text:async()=>content};
};
const worker=require(path.join(__dirname,"../netlify/functions/write-chapter-background.js"));
(async()=>{
  const token="tok", jobId="soft1";
  const state={
    storyId:"s1", chapters:[{id:"c1",title:"Chương 1",text:LONG,wordCount:900,briefUsed:"",status:"DRAFTED",review:{},sync:{}}], currentChapterIndex:0,
    characters:[],locations:[],items:[],threads:[],scenes:[],timeline:[],foreshadowing:[],knowledgeLedger:[],memoryEvents:[],
    currentStatus:"Status cũ",statusState:{},lastStatusChapter:0,lastMemorySyncChapter:0,canonVersion:0,minChapterWords:500,qualityGateEnabled:false,
    mature:false,nsfwMode:"never",mainCharProfile:{name:"Lan"},chaptersSinceBackup:0,nextChapterHint:""
  };
  db.set(jobId,JSON.stringify({jobId,createdAt:Date.now(),status:"queued",schemaVersion:9,mode:"postprocess",chapterNumber:1,baseChapterCount:1,
    workerTokenHash:crypto.createHash("sha256").update(token).digest("hex"),apiKeyEncrypted:{encrypted:false,value:"k"},apiEndpoint:"http://mock/chat/completions",model:"m",storyState:state}));
  const r=await worker.handler({httpMethod:"POST",body:JSON.stringify({jobId,workerToken:token}),headers:{}});
  assert.strictEqual(r.statusCode,200,"handler phải hoàn thành");
  const job=db.get(jobId), ch=job.storyState.chapters[0];
  assert.strictEqual(job.status,"completed");
  assert.strictEqual(statusCalls>0,true,"Status phải được thử");
  assert.strictEqual(memoryCalls>0,true,"Memory phải được thử");
  assert(!((ch.autoUpdateIssues||[]).some(x=>/^Status(?:\\b|:)|^Memory(?:\\b|:)/i.test(String(x)))),"Status/Memory không được chui vào autoUpdateIssues: "+JSON.stringify(ch.autoUpdateIssues));
  assert.strictEqual(ch.sync.status,"SYNCED","chương vẫn SYNCED dù Status/Memory lỗi mềm");
  assert.strictEqual(ch.postProcess.status,"DONE");
  assert.strictEqual(ch.postProcess.tasks.Status.status,"FAILED");
  assert.strictEqual(ch.postProcess.tasks.Memory.status,"FAILED");
  console.log("PASS V12.28.2 soft Status/Memory: chương vẫn SYNCED, không còn ⚠ Status/Memory trên chapter");
})().catch(e=>{console.error("FAIL",e.message);process.exit(1);});
