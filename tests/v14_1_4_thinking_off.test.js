// V14.1.4: lệnh trích xuất/JSON gửi tới endpoint không phải OpenRouter (AnonRouter) phải kèm thinking:{type:"disabled"}; bị 400 thì gọi lại không kèm.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'../netlify/functions/write-chapter-background.js'),'utf8');
const mod={exports:{}};const bodies=[];let rejectThinking=false;
const sandbox={module:mod,exports:mod.exports,console,process,Buffer,setTimeout,clearTimeout,URL,AbortController,TextDecoder,TextEncoder,
  require:n=>(n==='@netlify/blobs'?{getStore(){},connectLambda(){}}:require(n)),
  fetch:async(url,opt)=>{ const b=JSON.parse(opt.body); bodies.push(b);
    if(rejectThinking&&b.thinking) return {ok:false,status:400,text:async()=>'unknown field thinking'};
    return {ok:true,status:200,headers:{get:()=>'application/json'},json:async()=>({choices:[{message:{content:'{}'},finish_reason:'stop'}]})}; }};
vm.createContext(sandbox);
vm.runInContext(src+'\n;module.exports.call=callOpenRouter;',sandbox);
const call=mod.exports.call;
const base={endpoint:'https://api.anonrouter.ai/v1/chat/completions',apiKey:'k',model:'deepseek/deepseek-v4-flash',messages:[{role:'user',content:'x'}],maxTokens:1000};
(async()=>{
  await call(base);
  assert.deepStrictEqual(bodies[0].thinking,{type:'disabled'},'trích xuất trên AnonRouter phải tắt thinking');
  assert.strictEqual(bodies[0].reasoning,undefined,'không gửi tham số reasoning của OpenRouter');
  bodies.length=0; await call(Object.assign({},base,{creative:true}));
  assert.strictEqual(bodies[0].thinking,undefined,'viết văn không đổi hành vi');
  bodies.length=0; await call(Object.assign({},base,{endpoint:'https://openrouter.ai/api/v1/chat/completions'}));
  assert.strictEqual(bodies[0].thinking,undefined,'OpenRouter giữ cách cũ'); assert.deepStrictEqual(bodies[0].reasoning,{enabled:false});
  bodies.length=0; rejectThinking=true; const r=await call(base);
  assert.strictEqual(bodies.length,2,'400 -> gọi lại một lần'); assert.strictEqual(bodies[1].thinking,undefined,'lần gọi lại không kèm thinking'); assert.strictEqual(r.text,'{}');
  console.log('PASS V14.1.4: extraction calls disable thinking on non-OpenRouter endpoints, with 400 fallback');
})().catch(e=>{console.error('FAIL V14.1.4:',e.stack||e.message);process.exit(1);});
