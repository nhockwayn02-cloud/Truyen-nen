// V14.7.36: thẻ NV không được bị bỏ cả hàng chỉ vì evidence cấp hàng là câu tóm lược (Memory/Status chạy mà Character DB trống).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../netlify/functions/write-chapter-background.js'), 'utf8');
const mod = { exports: {} };
const sandbox = { module: mod, exports: mod.exports, console, process, Buffer, setTimeout, clearTimeout, URL, AbortController, TextDecoder, TextEncoder,
  require: (n) => (n === '@netlify/blobs' ? { getStore() {}, connectLambda() {} } : require(n)), fetch: async () => { throw new Error('no net'); } };
vm.createContext(sandbox);
vm.runInContext(src + '\n;module.exports.__t={runUnifiedPostProcess};', sandbox);
const source = 'Quỳnh Anh bước vào phòng nghỉ, mặt tái đi. Cô là thư ký của tổng giám đốc, kiêu ngạo và hay quát mắng người khác. "Anh định tống tiền tôi sao?" Quỳnh Anh run lên khi Lạc giơ điện thoại.';
const mk = () => ({ chapters: [], mainCharProfile: { name: 'Bùi Lạc' }, characters: [{ id: 'c1', name: 'Quỳnh Anh', tier: 'supporting', coreLocked: true, role: '', occupation: '', personality: '', relationships: [], history: [] }],
  locations: [], items: [], threads: [], timeline: [], foreshadowing: [], knowledgeLedger: [], statusState: {}, currentStatus: '', canonVersion: 0 });
const out = ev => ({ summary: '', characters: [{ name: 'Quỳnh Anh', tier: 'supporting', role: 'thư ký của tổng giám đốc', personality: 'kiêu ngạo, hay quát mắng người khác', chapterEvent: 'bị Lạc nắm thóp', evidence: ev,
  fieldEvidence: { role: 'Cô là thư ký của tổng giám đốc', personality: 'kiêu ngạo và hay quát mắng người khác' } }], world: { locations: [], items: [], threads: [] }, status: { changes: { characterChanges: [], conflicts: [] } }, memory: { events: [], foreshadowing: [], knowledge: [] }, continuityWarnings: [], nextChapterHint: '' });
let bad = 0; const t = async (n, f) => { try { await f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const run = async ev => { const st = mk(); let calls = 0; sandbox.callWithRetry = async () => (++calls === 1 ? { text: JSON.stringify(out(ev)), finishReason: 'stop' } : { text: '{}', finishReason: 'stop' });
  await sandbox.module.exports.__t.runUnifiedPostProcess({ apiEndpoint: 'x', apiKey: 'k', model: 'm', storyState: st }, { text: source, summary: '' }, 1, st).catch(() => {}); return st.characters[0]; };
(async () => {
  await t('evidence cấp hàng là câu tóm lược KHÔNG có trong chương -> thẻ vẫn được điền từ fieldEvidence', async () => { const c = await run('Quỳnh Anh bị Lạc khống chế bằng đoạn video quay lén trong phòng'); assert.ok(/thư ký/.test(c.role || ''), 'role=' + c.role); assert.ok(/kiêu ngạo/.test(c.personality || '')); });
  await t('NV đã có trong roster + tên có trong chương, evidence rỗng -> vẫn nhận', async () => { const c = await run(''); assert.ok(/thư ký/.test(c.role || ''), 'role=' + c.role); });
  await t('trường bịa không có trong chương vẫn bị loại', async () => { const st = mk(); sandbox.callWithRetry = async () => ({ text: JSON.stringify(Object.assign(out(''), { characters: [{ name: 'Quỳnh Anh', tier: 'supporting', appearance: 'mọc cánh rồng ba đầu', evidence: '', fieldEvidence: { appearance: 'mọc cánh rồng ba đầu' } }] })), finishReason: 'stop' });
    await sandbox.module.exports.__t.runUnifiedPostProcess({ apiEndpoint: 'x', apiKey: 'k', model: 'm', storyState: st }, { text: source, summary: '' }, 1, st).catch(() => {}); assert.ok(!/rồng/.test(st.characters[0].appearance || '')); });
  process.exit(bad ? 1 : 0);
})();
