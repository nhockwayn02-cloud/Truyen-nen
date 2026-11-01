// V14.5.4: tiêu đề/nhãn chỉ dẫn mà model tự thêm bị gỡ trước khi kiểm tra; văn xuôi thật không bị đụng.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'../shared/core.js'),'utf8');
const box={console,state:{}};vm.createContext(box);
vm.runInContext(src+'\n;this.__t={stripSceneLeaks,checkSceneQuality,SCENE_LEAK_RE};',box);
const T=box.__t, S=T.stripSceneLeaks;
const body='Mỹ Duyên đứng yên giữa hành lang, tim đập mạnh khi tiếng bước chân đến gần hơn.';
let t=S('**Scene 2:**\n\n'+body); assert.strictEqual(t,body);
t=S('## Cảnh 2 — Hành lang\n'+body); assert.strictEqual(t,body);
t=S('Scene 2: '+body); assert.strictEqual(t,body,'giữ văn xuôi sau nhãn');
t=S('**Cảnh 3.** '+body); assert.strictEqual(t,body);
t=S(body+'\n\nSTATE DELTA: đã bàn giao\n\n'+body); assert(!/STATE DELTA/.test(t)); assert.strictEqual(t.split('\n\n').length,2);
const clean=body+'\n\n"Cảnh này em không muốn nhớ," cô nói.'; assert.strictEqual(S(clean),clean,'văn xuôi thường không bị đụng');
for (const bad of ['**Scene 2:**\n'+body,'Scene 2: '+body,'STATE DELTA x\n'+body]) assert(!T.SCENE_LEAK_RE.test(S(bad)),'sau gỡ không còn lộ: '+bad);
console.log('PASS V14.5.4: stripSceneLeaks');
