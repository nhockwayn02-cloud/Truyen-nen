const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const box = { console, state: {} };
vm.createContext(box);
vm.runInContext(src + '\n;this.__t={chapterWordLimits,adaptiveChapterWordLimits,compactSceneTail,compactSceneContract,compactSceneStateDelta,buildAdaptiveScenePlanPrompt,normalizeAdaptiveScenePlan,buildAdaptiveSceneWritePrompt,buildAdaptiveSceneTopUpPrompt,gateHardChecks};', box);
const T = box.__t;
let pass = 0;
function test(name, fn){ fn(); console.log('PASS ' + name); pass++; }

test('giới hạn chương V13 là 4500–5500 và hard cap 5600', () => {
  const limits = T.chapterWordLimits({ minChapterWords: 500 });
  assert.strictEqual(limits.target, 5000);
  assert.strictEqual(limits.minAccept, 4500);
  assert.strictEqual(limits.maxAccept, 5500);
  assert.strictEqual(limits.hardMax, 5600);
  assert.strictEqual(T.adaptiveChapterWordLimits({ minChapterWords: 5200 }).target, 5200);
});

test('Scene Graph chấp nhận số scene linh hoạt và chuẩn hoá ngân sách', () => {
  const p = T.normalizeAdaptiveScenePlan({ chapterGoal: 'g', endingAnchor: 'e', scenes: [
    { id: 'S1', purpose: 'đối thoại và tiết lộ', targetWords: 100 },
    { id: 'S2', purpose: 'hậu quả', targetWords: 4000 },
    { id: 'S3', purpose: 'chuyển hướng', targetWords: 800 }
  ] }, { minChapterWords: 5000 });
  assert.strictEqual(p.scenes.length, 3);
  assert.strictEqual(p.scenes[0].targetWords, 350);
  assert.strictEqual(p.scenes[1].targetWords, 2200);
});

test('Scene write prompt chỉ truyền tail bị giới hạn, không truyền toàn chương', () => {
  const long = 'x'.repeat(20000);
  const prompt = T.buildAdaptiveSceneWritePrompt({
    state: { minChapterWords: 5000 },
    scene: { id: 'S1', targetWords: 900, purpose: 'p' },
    previousTail: long,
    stateDelta: { sceneId: 'S0', handoff: 'h' }
  });
  assert(prompt.includes('CONTRACT'));
  assert(prompt.length < 12000, 'prompt scene phải compact, thực tế ' + prompt.length);
  assert(!prompt.includes('x'.repeat(10000)));
});

test('state delta không chứa lastTail để tránh gửi đuôi scene hai lần', () => {
  const delta = T.compactSceneStateDelta({ sceneId: 'S1', location: 'phòng', lastTail: 'lặp rất dài', handoff: 'tiếp' });
  assert.strictEqual(delta.lastTail, undefined);
  assert.strictEqual(delta.sceneId, 'S1');
});

test('contract compact giữ beat cần thiết nhưng cắt trường dư', () => {
  const c = T.compactSceneContract({ id: 'S1', purpose: 'p'.repeat(900), beats: ['a', 'b'], targetWords: 900, debugOnly: 'x'.repeat(10000) });
  assert(c.beats.length === 2);
  assert(!('debugOnly' in c));
  assert(JSON.stringify(c).length < 700);
});

test('Scene Graph prompt cấm khuôn vai trò cố định', () => {
  const prompt = T.buildAdaptiveScenePlanPrompt({ state: {}, context: 'canon', directive: 'brief' });
  assert(/LINH HOẠT/.test(prompt));
  assert(/không dùng khuôn/.test(prompt));
  assert(/JSON object/.test(prompt));
});

test('required beat checklist được truyền trực tiếp vào plan và scene', () => {
  const required = '[OUTLINE Ch12] [S1] Tu luyện Huyền Nguyên Quyết; [R3] trinh sát hẻm Song Hành';
  const plan = T.buildAdaptiveScenePlanPrompt({ state: {}, context: 'canon', requiredBeats: required });
  const scene = T.buildAdaptiveSceneWritePrompt({ state: {}, scene: { id: 'S1', targetWords: 900 }, requiredBeats: required });
  assert(plan.includes(required));
  assert(scene.includes('REQUIRED CHECKLIST') && scene.includes('Huyền Nguyên Quyết'));
});

test('top-up prompt compact chỉ nhận đuôi và bắt buộc viết thêm diễn biến', () => {
  const prompt = T.buildAdaptiveSceneTopUpPrompt({ currentWords: 2886, needWords: 1614, previousTail: 'x'.repeat(10000), requiredBeats: '[S1] tu luyện' });
  assert(prompt.includes('còn thiếu khoảng 1614 từ'));
  assert(prompt.includes('REQUIRED BEATS') && prompt.includes('tu luyện'));
  assert(!prompt.includes('x'.repeat(10000)));
  assert(prompt.length < 7000);
});

test('Quality Gate hard-fail chương dưới 4.500 từ', () => {
  const short = T.gateHardChecks({ text: Array.from({length: 2886}, (_, i) => 'từ' + i).join(' ') });
  const lengthCheck = short.find(c => c.id === 'text_nonempty');
  assert(lengthCheck && lengthCheck.ok === false);
  assert(T.gateHardChecks({ text: Array.from({length: 4500}, (_, i) => 'từ' + i).join(' ') }).find(c => c.id === 'text_nonempty').ok);
});

test('viết lại chương vẫn đi qua Adaptive Scene + Top-up', () => {
  assert(indexSrc.includes('if(state.adaptiveScenePipeline !== false){'), 'nhánh viết lại không được bỏ qua adaptive pipeline');
  assert(indexSrc.includes('V13.3: viết lại chương cũng phải đi qua Adaptive Scene + Top-up'));
});

test('fallback ngắn cũng bị ép chạy hàng rào Top-up cuối', () => {
  assert(indexSrc.includes('async function topUpShortDraftText'), 'thiếu fallback top-up');
  assert(indexSrc.includes('rawText = await topUpShortDraftText'), 'fallback chưa gọi top-up');
});

console.log(`\n${pass}/11 PASS`);
