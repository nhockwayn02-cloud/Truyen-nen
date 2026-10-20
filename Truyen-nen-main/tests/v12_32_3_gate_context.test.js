// V12.32.3: compactGateContext giữ Current Status, bỏ khối văn phong; selfCheck AI chỉ ở vòng 1.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const core=fs.readFileSync(path.join(__dirname,'../shared/core.js'),'utf8');
const sb={console};vm.createContext(sb);
vm.runInContext(core+'\n;this.__c=compactGateContext;this.__r=buildQualityReviewPrompt;this.__w=buildRewritePrompt;',sb);
const ctx=['BIBLE: '+'a'.repeat(1500),'STYLE:\n'+'s'.repeat(500),'CẤM TỪ / ANTI-AI TROPES:\n- x','MỨC MIÊU TẢ: y','ĐỘ KHÓ: z','THREADS:\n- t','CURRENT STATUS — mốc:\n'+'b'.repeat(6000)+'CUỐI_STATUS'].join('\n\n');
const r=sb.__c(ctx,9000,true);
assert(!/STYLE:|CẤM TỪ|MỨC MIÊU TẢ|ĐỘ KHÓ/.test(r),'khối không liên quan bị bỏ trong review');
assert(r.includes('CUỐI_STATUS')&&r.length<=9100,'giữ cuối Current Status, trong ngân sách');
const w=sb.__c(ctx,8000,false);
assert(w.includes('STYLE:')&&w.includes('CẤM TỪ')&&!/MỨC MIÊU TẢ|ĐỘ KHÓ/.test(w),'rewrite giữ STYLE/CẤM TỪ');
assert(sb.__r({context:ctx,draft:'x'}).length<ctx.length+20000);
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert(/selfCheck:async\(attempt\)/.test(html)&&/if\(!attempt\|\|attempt<=1\)/.test(html),'continuity AI chỉ ở vòng 1');
console.log('PASS V12.32.3 gate context + continuity vòng 1');
