// V14.0.14: hậu kỳ server phải cập nhật Character Database trong các tình huống thực tế
// (tên rút gọn, nhân vật mới bị AI xếp hạng cao, thiếu chapterEvent, bằng chứng diễn đạt lại).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../netlify/functions/write-chapter-background.js'), 'utf8');
const mod = { exports: {} };
const sandbox = {
  module: mod, exports: mod.exports, console, process, Buffer, setTimeout, clearTimeout, URL, AbortController, TextDecoder, TextEncoder,
  require: (n) => (n === '@netlify/blobs' ? { getStore() {}, connectLambda() {} } : require(n)),
  fetch: async () => { throw new Error('network disabled in test'); }
};
vm.createContext(sandbox);
vm.runInContext(src + '\n;module.exports.__t={runUnifiedPostProcess,unifiedPostprocessPrompt};', sandbox);
const T = mod.exports.__t;
const source = [
  'Minh Anh bước vào quán cà phê lúc chiều muộn. Cô ngồi xuống cạnh cửa sổ và thở dài.',
  'Trần Thu Hà, một cô gái trẻ mặc áo dài trắng, đến muộn mười phút. Thu Hà cười gượng gạo và xin lỗi.',
  'Ông Bảy chủ quán đặt hai ly cà phê lên bàn rồi lẳng lặng quay đi.',
  'Minh Anh cảm thấy lo lắng vì chuyện cũ vẫn chưa được giải quyết.'
].join(' ');
function baseState() {
  return {
    chapters: [], mainCharProfile: { name: 'Lan', age: '25' },
    characters: [{ id: 'c1', name: 'Nguyễn Minh Anh', tier: 'supporting', coreLocked: true, relationships: [], history: [], lastAppearance: 1, mentalState: 'bình tĩnh' }],
    locations: [], items: [], threads: [], timeline: [], foreshadowing: [], knowledgeLedger: [],
    statusState: { schemaVersion: 2, currentState: {}, longTerm: {}, characterStates: [], changeLog: [], conflicts: [] },
    currentStatus: '', lastStatusChapter: 1, lastMemorySyncChapter: 1, nextChapterHint: '', canonVersion: 0
  };
}
function aiOutput() {
  return {
    summary: '**Tóm tắt chương:** Minh Anh gặp Thu Hà ở quán cà phê.',
    characters: [
      // nhân vật có sẵn nhưng AI trả tên đầy đủ trong roster, chương chỉ viết "Minh Anh"
      { id: 'c1', name: 'Nguyễn Minh Anh', mentalState: 'lo lắng vì chuyện cũ chưa giải quyết', chapterEvent: 'Minh Anh gặp Thu Hà',
        evidence: 'Minh Anh cảm thấy lo lắng vì chuyện cũ vẫn chưa được giải quyết.',
        stateEvidence: { mentalState: 'Minh Anh cảm thấy lo lắng vì chuyện cũ vẫn chưa được giải quyết.' } },
      // nhân vật mới, AI xếp "major" và có mô tả ngoại hình diễn đạt lại
      { name: 'Trần Thu Hà', tier: 'major', gender: 'nữ', appearance: 'trẻ, mặc áo dài trắng', chapterEvent: 'Thu Hà đến muộn và xin lỗi',
        evidence: 'Trần Thu Hà, một cô gái trẻ mặc áo dài trắng, đến muộn mười phút.',
        fieldEvidence: { appearance: 'Trần Thu Hà, một cô gái trẻ mặc áo dài trắng, đến muộn mười phút.', gender: 'một cô gái trẻ mặc áo dài trắng' } },
      // nhân vật mới, AI quên chapterEvent
      { name: 'Ông Bảy', tier: 'minor', occupation: 'chủ quán', evidence: 'Ông Bảy chủ quán đặt hai ly cà phê lên bàn rồi lẳng lặng quay đi.',
        fieldEvidence: { occupation: 'Ông Bảy chủ quán đặt hai ly cà phê lên bàn rồi lẳng lặng quay đi.' } }
    ],
    world: { locations: [], items: [], threads: [] },
    status: { changes: {} },
    memory: { events: [], foreshadowing: [], knowledge: [] },
    continuityWarnings: [], nextChapterHint: ''
  };
}
(async () => {
  const state = baseState(), chapter = { text: source, summary: '' };
  sandbox.callWithRetry = async () => ({ text: JSON.stringify(aiOutput()), finishReason: 'stop' });
  const res = await T.runUnifiedPostProcess({ apiEndpoint: 'x', apiKey: 'k', model: 'm' }, chapter, 2, state);
  const names = state.characters.map(c => c.name);
  console.log('NV notes:', res.tasks.NV.notes.join(' | '));
  const minh = state.characters.find(c => c.id === 'c1');
  assert.strictEqual(minh.lastAppearance, 2, 'NV có sẵn (chương dùng tên rút gọn) phải được cập nhật lastAppearance');
  assert.ok(/lo lắng/.test(minh.mentalState), 'mentalState phải cập nhật từ bằng chứng diễn đạt lại');
  assert.ok(names.includes('Trần Thu Hà'), 'NV mới bị AI xếp major vẫn phải được tạo (hạ xuống supporting)');
  assert.notStrictEqual(state.characters.find(c => c.name === 'Trần Thu Hà').tier, 'major');
  assert.ok(names.includes('Ông Bảy'), 'NV mới thiếu chapterEvent vẫn phải được tạo');
  assert.strictEqual(state.characters.filter(c => /Minh Anh/.test(c.name)).length, 1, 'không tạo trùng Minh Anh');

  let draftCalls = 0;
  sandbox.callWithRetry = async () => { draftCalls++; return { text: JSON.stringify(aiOutput()), finishReason: 'stop' }; };
  const draftState = baseState();
  const draftBefore = JSON.stringify(draftState.characters);
  const draftRes = await T.runUnifiedPostProcess({ apiEndpoint: 'x', apiKey: 'k', model: 'm' }, { text: source, status: 'DRAFTED' }, 2, draftState);
  assert.strictEqual(draftCalls, 0, 'chương draft không được gọi hậu kỳ để ghi Character Database');
  assert.strictEqual(JSON.stringify(draftState.characters), draftBefore, 'chương draft không được thay đổi hồ sơ canon');
  assert.strictEqual(draftRes.ok, false, 'draft postprocess phải bị chặn');
  assert(draftRes.problems.some(x => /chưa được chấp nhận|not accepted/i.test(x)), 'phải nêu rõ lý do chapter chưa accepted');
  console.log('PASS V14.0.14 character update');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
