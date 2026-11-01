// V14.5.2: model thinking ăn hết token ở bước lập plan -> vớt JSON từ reasoning; callExtract leo thang ngân sách (không lặp cùng giá trị).
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'../netlify/functions/write-chapter-background.js'),'utf8');
const mod={exports:{}};let queue=[];const bodies=[];
const sse=chunks=>({ok:true,status:200,headers:{get:()=>'text/event-stream'},body:{getReader(){let i=0;const enc=new TextEncoder();return{read:async()=>i<chunks.length?{done:false,value:enc.encode('data: '+JSON.stringify(chunks[i++])+'\n\n')}:(i++===chunks.length?{done:false,value:enc.encode('data: [DONE]\n\n')}:{done:true})};}}});
const json=(content,reasoning,fin)=>({ok:true,status:200,headers:{get:()=>'application/json'},json:async()=>({choices:[{message:{content,reasoning},finish_reason:fin||'stop'}]})});
const sandbox={module:mod,exports:mod.exports,console,process,Buffer,setTimeout,clearTimeout,URL,AbortController,TextDecoder,TextEncoder,
  require:n=>(n==='@netlify/blobs'?{getStore(){},connectLambda(){}}:require(n)),
  fetch:async(url,opt)=>{bodies.push(JSON.parse(opt.body));return queue.shift();}};
vm.createContext(sandbox);
vm.runInContext(src+'\n;module.exports.api={callOpenRouter,callExtract};',sandbox);
const {callOpenRouter,callExtract}=mod.exports.api;
const base={endpoint:'https://api.anonrouter.ai/v1/chat/completions',apiKey:'k',model:'deepseek/deepseek-v4.1-flash',messages:[{role:'user',content:'x'}],maxTokens:5000};
const PLAN='{"chapterGoal":"g","scenes":[{"id":"S1"}]}';
(async()=>{
  // 1) stream: content rỗng, JSON nằm trong reasoning
  queue=[sse([{choices:[{delta:{reasoning_content:'Nghĩ... '+PLAN}}]},{choices:[{delta:{},finish_reason:'length'}]}])];
  let r=await callOpenRouter(base); assert(/"scenes"/.test(r.text),'stream: phải vớt JSON từ reasoning');
  // 2) stream: reasoning thường (không có JSON) -> vẫn rỗng
  queue=[sse([{choices:[{delta:{reasoning_content:'chỉ suy nghĩ'}}]},{choices:[{delta:{},finish_reason:'length'}]}])];
  r=await callOpenRouter(base); assert.strictEqual(r.text,'');
  // 3) không stream
  queue=[json('', 'x '+PLAN,'length')]; r=await callOpenRouter(base); assert(/"scenes"/.test(r.text),'non-stream: vớt reasoning');
  queue=[json('', 'không có gì','length')]; r=await callOpenRouter(base); assert.strictEqual(r.text,'');
  // 4) callExtract: rỗng -> 7800 -> có nội dung; không gọi lần 3 trùng 7800
  bodies.length=0; queue=[json('','','length'),json(PLAN,'','stop')];
  r=await callExtract(base,1); assert.strictEqual(r.text,PLAN); assert.deepStrictEqual(bodies.map(b=>b.max_tokens),[5000,7800]);
  // 5) vẫn rỗng sau bậc trần -> đúng 2 lần gọi, không lặp
  bodies.length=0; queue=[json('','','length'),json('','','length'),json('','','length')];
  r=await callExtract(base,1); assert.deepStrictEqual(bodies.map(b=>b.max_tokens),[5000,7800]);
  console.log('PASS V14.5.2: plan thinking-model rescue + callExtract escalation');
})().catch(e=>{console.error('FAIL V14.5.2:',e.stack||e.message);process.exit(1);});
