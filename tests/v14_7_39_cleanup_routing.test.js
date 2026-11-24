// V14.7.39: dọn rò rỉ model, cổng văn suy biến (viết lại bằng model chính), plan/check không dùng model NSFW.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert'), Module = require('module'), crypto = require('crypto');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(core + '\n;this.f={cleanModelArtifacts,degenerationCheck,stripForeign}', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
t('từ tiếng Anh lẻ được thay đúng nghĩa, hoa đầu câu, từ mượn hợp lệ giữ nguyên', () => {
  const o = F.cleanModelArtifacts('Đầu dây ngắt without chờ trả lời. Hắn đi tuần như mọi when: chậm. Tonight là đêm dài. Thùng carton và áo jean ở garage. Cái ổWarm tuyệt đối. Mưa residual lingering trên nền.');
  assert.ok(/ngắt mà không chờ/.test(o) && /như mọi lúc:/.test(o) && /Đêm nay là đêm dài/.test(o) && /ổ ấm tuyệt/.test(o) && /mưa còn đọng lại|Mưa còn đọng lại/.test(o), o);
  assert.ok(/carton/.test(o) && /jean/.test(o) && /garage/.test(o));
  assert.ok(!/without|when|tonight|residual|Warm/i.test(o), o);
});
t('xóa câu rò lệnh, nhãn "Nội tâm người nữ:", dấu * lẻ, ".," và ".:"', () => {
  const o = F.cleanModelArtifacts('Cô run.* Chi tiết dưới đây viết đầy đủ theo mức nội dung người lớn yêu cầu. Cái tát nhẹ.\nNội tâm người nữ: Mình ghê tởm!\nHắn đi ra khỏi phòng., Trong hành lang tối.\nBảng phân ca dán trên tường.: Ca đêm nay.\nHắn *im lặng* nhìn.');
  assert.ok(!/Chi tiết dưới đây/.test(o) && !/Nội tâm người nữ:/.test(o) && !/Cô run\.\*/.test(o) && !/\.,/.test(o) && !/\.:/.test(o), o);
  assert.ok(/\*im lặng\*/.test(o), 'cặp * đóng-mở hợp lệ phải giữ');
  assert.ok(/Mình ghê tởm/.test(o) && /Cái tát nhẹ/.test(o));
});
t('dọn là idempotent và không đụng văn sạch', () => {
  const clean = 'Hắn đứng dậy, nhìn cô ta. "Chị muốn gì?" Giọng hắn trầm. Cô ta không đáp.'; assert.strictEqual(F.cleanModelArtifacts(clean), clean);
  const d = F.cleanModelArtifacts('Ngắt without chờ.'); assert.strictEqual(F.cleanModelArtifacts(d), d);
});
const R = 'long keo long keo lớp vecni ', garble = 'Rồichịtabquaygótđilênphíathang máybằnghaiđườnggótnhọnđiquacủamiếmgIẻướtcủahắnvàkhiđiquathìgiàykhôngdặmxuốngvũngthứhaivàokhoảngtrốnggiữahaicánhtaynóicủahắnvàkhiđiquathìgiàykhôngdặmxuống';
const prose = 'Hắn đẩy cửa bước vào phòng họp nhỏ và để cánh cửa khép lại sau lưng. Ánh đèn vàng rọi xuống mặt bàn dài mười chỗ ngồi, trên đầu bàn xếp sẵn ba thứ khác nhau. Cô ta đứng ở ngưỡng cửa, tay khoanh trước ngực và nhìn hắn bằng ánh mắt dò xét. ';
t('phát hiện: cụm lặp, dòng lặp, chữ dính, không dấu, lẩm bẩm', () => {
  assert.ok(F.degenerationCheck(prose + R.repeat(12)).bad);
  assert.ok(F.degenerationCheck(prose + prose + '\n' + Array(6).fill('Vẫn').join('\n')).bad);
  assert.ok(F.degenerationCheck(prose + garble + ' ' + garble).bad);
  assert.ok(F.degenerationCheck(prose + '\n' + 'Bui Lac roi hanh lang lat da hoa luc chuong noi bo dut tieng thu ba theo buong than may cho hang xuong tang ham hai den kho ho so\n' + 'Thung cat tong xep ba lop cao hon dau moi loi di chi vua mot vai vai ao dong phuc bao ve mau xanh xam da bac mau').bad);
  assert.ok(F.degenerationCheck(prose + '\nKhông.\nViết lại gọn:\n' + prose).bad);
});
t('văn bình thường (cả cụm lặp nhẹ 5-6 lần) KHÔNG bị bắt', () => {
  assert.ok(!F.degenerationCheck(prose.repeat(3)).bad);
  assert.ok(!F.degenerationCheck(prose + 'nhìn chằm chằm vào hắn. '.repeat(5) + prose).bad);
});
t('stripForeign đã gọi bộ dọn', () => assert.ok(!/without/.test(F.stripForeign('Cô ngắt máy without chờ trả lời nào cả.'))));
// ---- pipeline: model viết scene sụp -> viết lại bằng model chính; plan + check không dùng model NSFW ----
const db = new Map(); const mockBlobs = { connectLambda() {}, getStore() { return { async get(k) { const v = db.get(k); return v ? JSON.parse(v) : null; }, async setJSON(k, v) { db.set(k, JSON.stringify(v)); } }; } };
const origLoad = Module._load; Module._load = function (req, ...a) { return req === '@netlify/blobs' ? mockBlobs : origLoad.call(this, req, ...a); };
let sd = 99; const rn = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const ON = 'b c d g h k l m n t v x ch th nh kh ph tr gi qu s r'.split(' '), RI = 'a à á ạ e ê ề i í o ô ố ơ u ư ừ an ân ăn em ên in on ôn ơn un ang anh ênh inh ong ông ung'.split(' ');
const pw = k => Array.from({ length: k }, (_, i) => ON[Math.floor(rn() * ON.length)] + RI[Math.floor(rn() * RI.length)] + (i % 20 === 19 ? '.' : i % 7 === 6 ? ',' : '')).join(' ');   // V14.7.43: có dấu câu — văn thật không là một câu dài 900 từ
let seen = [];
global.fetch = async (url, init) => {
  const body = JSON.parse(init.body), sys = (body.messages.find(m => m.role === 'system') || {}).content || '', usr = (body.messages.find(m => m.role === 'user') || {}).content || '';
  const kind = /Lập kế hoạch scene/.test(sys) ? 'plan' : /scene nối tiếp/.test(sys) ? 'scene' : /^\s*KIỂM TRA/.test(usr) ? 'check' : 'other';
  seen.push({ kind, model: body.model });
  let content = '';
  if (kind === 'plan') content = JSON.stringify({ chapterGoal: 'g', endingAnchor: 'Lan khóa cửa.', scenes: [1, 2].map(n => ({ id: 'S' + n, location: 'Văn phòng', time: 'Tối ' + n, characters: ['Lan'], purpose: 'p' + n, beats: ['b' + n], mustChange: 'Lan biết ' + n, handoff: 'h' + n, targetWords: 900 })) });
  else if (kind === 'scene') content = body.model === 'NSFW' ? ('Hắn bước vào. ' + 'long keo lớp vecni '.repeat(60)) : pw(900);
  else content = '{"ok":true,"issues":[]}';
  return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content }, finish_reason: 'stop' }] }), text: async () => content };
};
const worker = require(path.join(__dirname, '../netlify/functions/write-chapter-background.js'));
(async () => {
  const token = 'tok', jobId = 'job39';
  db.set(jobId, JSON.stringify({ jobId, createdAt: Date.now(), status: 'queued', schemaVersion: 9, workerTokenHash: crypto.createHash('sha256').update(token).digest('hex'), apiKeyEncrypted: { encrypted: false, value: 'k' },
    apiEndpoint: 'http://mock/chat/completions', model: 'MAIN', modelNsfw: 'NSFW', forceNsfw: true, draftOnly: true,
    storyState: { chapters: [], characters: [], locations: [], items: [], threads: [], mature: true, nsfwMode: 'always', chapterMatureFocus: 'primary', mainCharProfile: { name: 'Lan' }, arcs: [{ id: 'a1', name: 'Arc 1', goal: 'Lan giữ hồ sơ', active: true }], chapterOutline: '' } }));
  await worker.handler({ httpMethod: 'POST', body: JSON.stringify({ jobId, workerToken: token }), headers: {} });
  const job = JSON.parse(db.get(jobId));
  t('job hoàn tất và chương KHÔNG chứa văn suy biến', () => { assert.strictEqual(job.status, 'completed', job.error); assert.ok(!F.degenerationCheck(job.resultChapter.text).bad); assert.ok(!/vecni/.test(job.resultChapter.text)); });
  t('lượt viết lại sau khi model NSFW sụp dùng model chính', () => { const sc = seen.filter(x => x.kind === 'scene'); assert.ok(sc.some(x => x.model === 'NSFW') && sc.some(x => x.model === 'MAIN'), JSON.stringify(sc)); });
  t('lập kế hoạch lượt đầu dùng model chính, không dùng NSFW', () => { const p = seen.find(x => x.kind === 'plan'); assert.strictEqual(p.model, 'MAIN'); });
  t('lời gọi kiểm tra JSON không dùng model NSFW', () => { assert.ok(seen.filter(x => x.kind === 'check').every(x => x.model !== 'NSFW'), JSON.stringify(seen.filter(x => x.kind === 'check'))); });
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAIL pipeline:', e.stack || e.message); process.exit(1); });
