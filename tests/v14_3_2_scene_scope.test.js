// V14.3.2: prompt scene chỉ chứa checklist riêng + phát hiện scene kể lại sự kiện cũ bằng câu chữ khác.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={buildAdaptiveSceneWritePrompt,sceneScopeOf,sceneParaphraseOverlap,sceneScopedContract};', ctx);
const T = ctx.__t;
let pass = 0; const t = (n, f) => { f(); console.log('PASS ' + n); pass++; };

const scenes = [
  { id: 'S1', beats: ['vào nhà'], mustChange: 'ALPHA_ENTRY vào nhà', handoff: 'h1' },
  { id: 'S2', beats: ['trói'], mustChange: 'BRAVO_RESTRAIN trói tay', handoff: 'h2' },
  { id: 'S3', beats: ['hành vi chính'], mustChange: 'CHARLIE_MAIN hành vi chính', handoff: 'h3' },
];
const OUTLINE = 'ALPHA_ENTRY BRAVO_RESTRAIN CHARLIE_MAIN toàn bộ chuỗi sự kiện của chương';
const contract = { chapterNumber: 3, arcGoal: 'arc', chapterOutline: OUTLINE, requiredBeats: [OUTLINE], mustChange: OUTLINE, allowedCharacters: ['A'], canonicalCharacters: ['A'] };

t('scope: S2 chỉ có checklist riêng, không có REQUIRED CHECKLIST cả chương', () => {
  const p = T.buildAdaptiveSceneWritePrompt({ state: {}, scene: scenes[1], requiredBeats: OUTLINE, chapterContract: contract, sceneScope: T.sceneScopeOf(scenes, 1) });
  assert(p.includes('CHECKLIST RIÊNG CỦA SCENE S2'));
  assert(!p.includes('REQUIRED CHECKLIST'));
  assert(p.includes('ĐÃ KỂ XONG Ở SCENE TRƯỚC') && p.includes('ALPHA_ENTRY'));
  assert(p.includes('DÀNH CHO SCENE SAU') && p.includes('CHARLIE_MAIN'));
  assert(!p.includes('toàn bộ chuỗi sự kiện của chương'), 'outline cả chương không được lọt vào prompt scene');
});
t('scope: contract trong prompt scene không còn outline/requiredBeats/mustChange', () => {
  const c = T.sceneScopedContract(contract);
  assert(!('chapterOutline' in c) && !('requiredBeats' in c) && !('mustChange' in c));
});
t('scope: scene đầu không có khối ĐÃ KỂ; scene cuối không có khối SCENE SAU', () => {
  const p0 = T.buildAdaptiveSceneWritePrompt({ state: {}, scene: scenes[0], sceneScope: T.sceneScopeOf(scenes, 0) });
  const p2 = T.buildAdaptiveSceneWritePrompt({ state: {}, scene: scenes[2], sceneScope: T.sceneScopeOf(scenes, 2) });
  assert(!p0.includes('ĐÃ KỂ XONG') && p0.includes('DÀNH CHO SCENE SAU'));
  assert(p2.includes('ĐÃ KỂ XONG') && !p2.includes('DÀNH CHO SCENE SAU'));
});
t('không truyền sceneScope -> giữ nguyên hành vi cũ (REQUIRED CHECKLIST)', () => {
  const p = T.buildAdaptiveSceneWritePrompt({ state: {}, scene: scenes[1], requiredBeats: OUTLINE });
  assert(p.includes('REQUIRED CHECKLIST'));
});

const para = (tag, order) => order.map(k => tag + k).join(' ') + '.';
const mk = (tag, n) => Array.from({ length: n }, (_, p) => para(tag, [1, 2, 3, 4, 5, 6, 7, 8].map(k => 'q' + p + 'z' + k)));
t('overlap: bản diễn đạt lại (cùng từ đặc trưng, thêm từ đệm) bị phát hiện', () => {
  const prior = mk('', 6).join('\n\n');
  const again = mk('', 6).map((x, i) => 'rồi ' + x.split(' ').reverse().join(' ') + ' đệm' + i).join('\n\n');
  const r = T.sceneParaphraseOverlap(prior, again);
  assert(r.hit >= 3 && r.hit / r.total >= 0.3, JSON.stringify(r));
});
t('overlap: scene tiến diễn biến mới (từ khác hẳn) KHÔNG bị báo', () => {
  const prior = mk('', 6).join('\n\n');
  const fresh = Array.from({ length: 6 }, (_, p) => [1, 2, 3, 4, 5, 6, 7, 8].map(k => 'n' + p + 'm' + k).join(' ') + '.').join('\n\n');
  const r = T.sceneParaphraseOverlap(prior, fresh);
  assert(r.hit === 0, JSON.stringify(r));
});
console.log('OK ' + pass + ' test');
