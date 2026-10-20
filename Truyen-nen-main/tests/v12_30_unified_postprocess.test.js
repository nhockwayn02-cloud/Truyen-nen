// V12.30: hậu kỳ một lần gọi, kiểm thử merge an toàn + rollback khi JSON bị cắt.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../netlify/functions/write-chapter-background.js'), 'utf8');
const mod = { exports: {} };
const sandbox = {
  module: mod, exports: mod.exports, console, process, Buffer, setTimeout, clearTimeout, URL, AbortController, TextDecoder, TextEncoder,
  require: (n) => (n === '@netlify/blobs' ? { getStore() {}, connectLambda() {} } : require(n)),
  fetch: async () => { throw new Error('network disabled in test'); }
};
vm.createContext(sandbox);
vm.runInContext(src + '\n;module.exports.__t={runUnifiedPostProcess,mergeCharacter,mergeStatusChanges,applyWorld,evidenceInText};', sandbox);
const T = mod.exports.__t;
const clone = x => JSON.parse(JSON.stringify(x));
function baseState() {
  return {
    chapters: [], mainCharProfile: { name: 'Lan', age: '25' },
    characters: [{ id:'c1', name:'Minh', tier:'major', role:'người gác cửa', occupation:'người gác cửa', coreLocked:true,
      coreIdentity:{ name:'Minh', role:'người gác cửa', occupation:'người gác cửa' }, physicalState:'đang đứng ngoài cửa', mentalState:'bình tĩnh', relationships:[], history:[], lastAppearance:1 }],
    locations:[{id:'l1',name:'Phố cũ',description:'Địa điểm đã xác lập',status:'active',firstAppearance:1,lastAppearance:1}],
    items:[], threads:[{id:'t1',type:'foreshadowing',desc:'Bí mật cũ',status:'paid_off',history:[{chapter:1,status:'paid_off',note:'đã khép lại'}]}],
    timeline:[{id:'ev-old',chapter:1,type:'event',summary:'Sự kiện cũ cần giữ',causes:'',consequences:''}],
    foreshadowing:[{id:'fs-old',description:'Bí mật cũ',status:'paid_off',plantedChapter:1,lastUpdated:1,characters:'Minh'}],
    knowledgeLedger:[{id:'kl-old',character:'Minh',fact:'Biết đường vào kho',confidence:'direct',firstChapter:1,lastUpdated:1}],
    statusState:{schemaVersion:2,currentState:{time:'đêm cũ',situation:'tình hình cũ',mainEvent:'sự kiện cũ',location:'nhà cũ'},longTerm:{secrets:'bí mật cũ',weaknesses:'điểm yếu cũ'},characterStates:[{characterId:'c1',name:'Minh',status:'updated',changes:{psychology:'vẫn nghi ngờ'},evidence:'Minh vẫn nghi ngờ'},{characterId:'old-status-id',name:'Nhân vật đã xóa',status:'updated',changes:{secret:'bí mật cũ'},evidence:'bằng chứng cũ'}],changeLog:[],conflicts:[]},
    currentStatus:'Current Status cũ', lastStatusChapter:1, lastMemorySyncChapter:1, nextChapterHint:'Gợi ý cũ phải giữ nếu AI không trả gợi ý', canonVersion:0
  };
}
const source = 'Lan gặp Minh tại Phố cũ. Minh nhận được chìa khóa từ Lan. Minh đang cầm chìa khóa. Lan giới thiệu An là người đưa tin. Lan vẫn giữ bí mật cũ.';
function validOutput() {
  return {
    summary:'**Tóm tắt chương:** Lan gặp Minh tại Phố cũ. Minh nhận được chìa khóa từ Lan. Lan giới thiệu An là người đưa tin.',
    characters:[
      {name:'Minh',tier:'minor',role:'đội trưởng mới',occupation:'chỉ huy mới',appearance:'rồng ba đầu',secret:'biết kho báu giả',physicalState:'đang cầm chìa khóa',chapterEvent:'Minh nhận được chìa khóa',evidence:'Minh nhận được chìa khóa từ Lan.',fieldEvidence:{role:'Minh nhận được chìa khóa từ Lan.',occupation:'Minh nhận được chìa khóa từ Lan.',chapterEvent:'Minh nhận được chìa khóa từ Lan.'},stateEvidence:{physicalState:'Minh đang cầm chìa khóa.'},explicitCoreChange:false},
      {name:'An',tier:'major',role:'nhân vật quan trọng',chapterEvent:'Lan giới thiệu An',evidence:'Lan giới thiệu An là người đưa tin.'}
    ],
    world:{
      locations:[{name:'Phố cũ',description:'Nơi Lan gặp Minh',status:'active',evidence:'Lan gặp Minh tại Phố cũ.'},{name:'Thành phố ma',description:'Thành phố hoàn toàn mới',status:'active',evidence:'Lan gặp Minh tại Phố cũ.'}],
      items:[{name:'Chìa khóa',description:'Chìa khóa Minh vừa nhận',owner:'Minh',status:'active',evidence:'Minh nhận được chìa khóa từ Lan.'}],
      threads:[{type:'foreshadowing',desc:'Bí mật cũ',matchExistingDesc:'Bí mật cũ',status:'seeded',evidence:'Lan vẫn giữ bí mật cũ.'}]
    },
    status:{changes:{
      mainEvent:{status:'updated',value:'Minh nhận được chìa khóa từ Lan',evidence:'Minh nhận được chìa khóa từ Lan.'},
      characterChanges:[{characterName:'Minh',status:'updated',changes:{physicalState:'đang cầm chìa khóa'},changeEvidence:{physicalState:'Minh đang cầm chìa khóa.'},evidence:'Minh đang cầm chìa khóa.'},{characterName:'Người lạ',status:'updated',changes:{knowledge:'biết bí mật'},evidence:'Minh nhận được chìa khóa từ Lan.'}],
      conflicts:[]
    }},
    memory:{
      events:[{type:'event',summary:'Minh nhận chìa khóa từ Lan',causes:'',consequences:'',evidence:'Minh nhận được chìa khóa từ Lan.'}],
      foreshadowing:[{description:'Bí mật cũ',match:'Bí mật cũ',status:'seeded',characters:'Minh',evidence:'Lan vẫn giữ bí mật cũ.'}],
      knowledge:[{character:'Minh',fact:'Có chìa khóa từ Lan',confidence:'direct',evidence:'Minh nhận được chìa khóa từ Lan.'}]
    },
    continuityWarnings:[],
    nextChapterHint:'**Gợi ý chương sau:** Lan và Minh tiếp tục xử lý chiếc chìa khóa vừa xuất hiện.'
  };
}
(async () => {
  // Case 1: valid JSON, only one model request, protected canon and existing memories survive.
  {
    const state = baseState(); const chapter = {text:source,summary:'Tóm tắt cũ'};
    let calls=0;
    sandbox.callWithRetry = async () => { calls++; return {text:JSON.stringify(validOutput()),finishReason:'stop'}; };
    const r = await T.runUnifiedPostProcess({apiEndpoint:'x',apiKey:'k',model:'m',storyState:state}, chapter, 2, state);
    assert.strictEqual(calls,1,'chỉ một request hậu kỳ khi API trả thành công');
    assert.strictEqual(r.ok,true,'hậu kỳ hợp lệ phải thành công: '+JSON.stringify(r.problems));
    assert.strictEqual(r.tasks.Continuity.ok,true,'Continuity phải được xử lý từ chính phản hồi tổng hợp');
    const minh=state.characters.find(c=>c.name==='Minh');
    assert.strictEqual(minh.role,'người gác cửa','không đổi role đã khóa');
    assert.strictEqual(minh.occupation,'người gác cửa','không đổi nghề đã khóa');
    assert.strictEqual(minh.tier,'major','không tự đổi tier/xếp hạng nhân vật đã có');
    assert.strictEqual(minh.physicalState,'đang cầm chìa khóa','vẫn cập nhật trạng thái diễn biến có bằng chứng');
    assert.strictEqual(minh.appearance,undefined,'không điền ngoại hình bịa khi không có fieldEvidence');
    assert.strictEqual(minh.secret,undefined,'không điền bí mật suy đoán khi không có fieldEvidence');
    assert(!state.characters.some(c=>c.name==='An'),'không được tạo nhân vật mới tier major dù có evidence');
    assert.strictEqual(state.characters.filter(c=>c.name==='Minh').length,1,'không tạo trùng nhân vật');
    assert.strictEqual(state.locations.filter(x=>x.name==='Phố cũ').length,1,'không nhân đôi địa điểm');
    assert(!state.locations.some(x=>x.name==='Thành phố ma'),'không thêm địa điểm không xuất hiện trong chương dù quote unrelated là thật');
    assert(state.items.some(x=>x.name==='Chìa khóa'),'thêm vật phẩm có evidence');
    assert.strictEqual(state.threads.find(x=>x.id==='t1').status,'paid_off','không mở lại thread đã kết thúc');
    assert.strictEqual(state.foreshadowing.find(x=>x.id==='fs-old').status,'paid_off','không mở lại foreshadowing đã khép');
    assert(state.timeline.some(x=>x.id==='ev-old'&&x.summary==='Sự kiện cũ cần giữ'),'không mất timeline cũ');
    assert(state.knowledgeLedger.some(x=>x.id==='kl-old'&&x.fact==='Biết đường vào kho'),'không mất knowledge cũ');
    assert(state.timeline.some(x=>x.chapter===2&&x.summary==='Minh nhận chìa khóa từ Lan'),'bổ sung sự kiện mới có evidence');
    assert.strictEqual(state.lastMemorySyncChapter,2,'chỉ đánh dấu memory synced khi đủ schema');
    const st=state.statusState;
    assert.strictEqual(st.currentState.situation,'tình hình cũ','field status không được nêu phải giữ nguyên');
    assert.strictEqual(st.currentState.mainEvent,'Minh nhận được chìa khóa từ Lan','cập nhật status hợp lệ');
    assert(st.characterStates.some(x=>x.characterId==='c1' && x.changes.psychology==='vẫn nghi ngờ'),'giữ status nhân vật đã tích lũy');
    assert(st.characterStates.some(x=>x.characterId==='old-status-id' && x.changes.secret==='bí mật cũ'),'không mất status lịch sử của nhân vật bị xóa khỏi roster');
    assert.strictEqual(st.currentState.situation,'tình hình cũ','evidence không chứng minh value thì không ghi đè status');
    assert(!st.characterStates.some(x=>x.name==='Người lạ'),'không tạo status cho nhân vật ngoài roster');
    assert(chapter.summary.startsWith('**Tóm tắt chương:**'),'summary hợp lệ được lưu');
    assert(state.nextChapterHint.includes('Gợi ý chương sau'),'gợi ý mới được lưu');
    console.log('PASS V12.30: one-call merge preserves character core/status/memory');
  }
  // Case 2: truncated result must rollback all mutations and never erase older state.
  {
    const state=baseState(); const before=JSON.stringify(state); const chapter={text:source,summary:'Tóm tắt cũ'};
    let calls=0; sandbox.callWithRetry=async()=>{calls++; return {text:'{"summary":"bị cắt',finishReason:'length'};};
    const r=await T.runUnifiedPostProcess({apiEndpoint:'x',apiKey:'k',model:'m',storyState:state},chapter,2,state);
    assert.strictEqual(calls,4,'V12.32.2: JSON gộp bị cắt -> thử 3 nhóm nhỏ (không gọi AI sửa JSON)');
    assert.strictEqual(r.ok,false,'JSON bị cắt phải thất bại an toàn');
    assert.strictEqual(JSON.stringify(state),before,'state phải rollback nguyên vẹn');
    assert.strictEqual(chapter.summary,'Tóm tắt cũ','summary cũ phải nguyên vẹn');
    console.log('PASS V12.30: truncated JSON rolls back without data loss');
  }
  // Case 3: incomplete memory section preserves records and does not advance the sync cursor.
  {
    const state=baseState(); const beforeTimeline=JSON.stringify(state.timeline); const beforeFS=JSON.stringify(state.foreshadowing); const beforeKL=JSON.stringify(state.knowledgeLedger);
    const o=validOutput(); delete o.memory.knowledge;
    sandbox.callWithRetry=async()=>({text:JSON.stringify(o),finishReason:'stop'});
    const chapter={text:source,summary:'Tóm tắt cũ'};
    const r=await T.runUnifiedPostProcess({apiEndpoint:'x',apiKey:'k',model:'m',storyState:state},chapter,2,state);
    assert.strictEqual(r.ok,true,'các phần hợp lệ khác vẫn có thể hoàn thành');
    assert.strictEqual(JSON.stringify(state.timeline),beforeTimeline,'thiếu một mảng memory thì không merge nửa vời');
    assert.strictEqual(JSON.stringify(state.foreshadowing),beforeFS,'foreshadowing cũ phải nguyên vẹn');
    assert.strictEqual(JSON.stringify(state.knowledgeLedger),beforeKL,'knowledge cũ phải nguyên vẹn');
    assert.strictEqual(state.lastMemorySyncChapter,1,'không đánh dấu đã sync memory nếu schema thiếu');
    assert.strictEqual(r.tasks.Memory.ok,false,'task Memory phải báo thiếu schema');
    console.log('PASS V12.30: incomplete memory output leaves all memory intact');
  }
  // Case 4 (V12.32.2): combined call truncated, but split groups succeed -> data still updates.
  {
    const state=baseState(); const chapter={text:source,summary:'Tóm tắt cũ'}; const out=validOutput(); let calls=0;
    sandbox.callWithRetry=async(a)=>{ calls++; const p=a.messages[a.messages.length-1].content;
      if(calls===1) return {text:'{"summary":"bị cắt',finishReason:'length'};
      const m=p.match(/JSON SCHEMA[^\n]*?: (\{.*\})/s); const sch=m?m[1]:'';
      const o={}; ['summary','characters','world','status','memory','continuityWarnings','nextChapterHint'].forEach(k=>{ if(sch.includes('"'+k+'"')) o[k]=out[k]!==undefined?out[k]:(k==='continuityWarnings'?[]:''); });
      return {text:JSON.stringify(o),finishReason:'stop'}; };
    const r=await T.runUnifiedPostProcess({apiEndpoint:'x',apiKey:'k',model:'m',storyState:state},chapter,2,state);
    assert.strictEqual(r.ok,true,'fallback theo nhóm phải thành công');
    assert.strictEqual(calls,4,'1 lần gộp + 3 nhóm');
    assert(r.tasks.Memory.ok&&r.tasks.Status.ok&&r.tasks.NV.ok&&r.tasks['Thế giới'].ok,'mọi task cập nhật sau fallback');
    assert(state.timeline.length>1,'timeline được thêm');
    console.log('PASS V12.32.2: truncated combined JSON falls back to grouped calls');
  }
})().catch(e=>{console.error('FAIL V12.30 unified postprocess:',e.stack||e.message);process.exit(1);});
