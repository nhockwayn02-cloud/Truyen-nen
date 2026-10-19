const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const box = { console, state: {} };
vm.createContext(box);
vm.runInContext(src + '\n;this.__t={chapterWordLimits,adaptiveChapterWordLimits,compactSceneTail,compactSceneContract,compactSceneStateDelta,buildAdaptiveScenePlanPrompt,normalizeAdaptiveScenePlan,buildAdaptiveSceneWritePrompt};', box);
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

console.log(`\n${pass}/6 PASS`);
