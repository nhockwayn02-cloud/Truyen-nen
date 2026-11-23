// V14.7.40: PRIMARY luôn có cảnh nóng ở Scene Graph (thử lại + tự chèn) và thang khuất phục theo nấc.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert'), Module = require('module'), crypto = require('crypto');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(core + '\n;this.f={planHasHotBeat,submissionStageFor,submissionLadder,submissionLadderBlock,matureScenePlanBlock,injectHotBeat,buildAdaptiveScenePlanPrompt,degenerationCheck,chapterNeedsHeat}', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const hotTxt = 'Hắn ép Mai vào tường, cô run lên, hơi thở nóng, tiếng rên bật ra, đôi môi và cơ thể ướt đẫm trong cảnh làm tình.';
const mk = (chs, extra) => Object.assign({ mature: true, chapterMatureFocus: 'primary', mainCharProfile: { name: 'Lan' }, characters: [{ name: 'Mai', tier: 'supporting', firstAppearance: 1 }], chapters: chs }, extra || {});
t('nấc theo số chương và số lần quan hệ (lấy thấp hơn), không nhảy cóc', () => {
  assert.strictEqual(F.submissionStageFor(0, 0), 1); assert.strictEqual(F.submissionStageFor(1, 5), 1); assert.strictEqual(F.submissionStageFor(5, 1), 2);
  assert.strictEqual(F.submissionStageFor(10, 3), 3); assert.strictEqual(F.submissionStageFor(20, 1), 2); assert.strictEqual(F.submissionStageFor(20, 9), 4);
});
t('nhân vật mới xuất hiện bị khóa ở nấc 1, cấm gọi chủ/tuyên thệ', () => {
  const st = mk([{ text: 'Mai gặp Lan ở văn phòng.' }]); const l = F.submissionLadder(st, 2, st.chapters);
  assert.strictEqual(l.length, 1); assert.strictEqual(l[0].stage, 1);
  const b = F.submissionLadderBlock(st, 2, st.chapters); assert.ok(/Mai/.test(b) && /NẤC 1/.test(b) && /KHÔNG gọi chủ/.test(b));
});
t('nấc tăng dần theo diễn biến thật, nhân vật phụ chung chung bị bỏ', () => {
  const chs = Array.from({ length: 10 }, () => ({ text: hotTxt })), st = mk(chs, { characters: [{ name: 'Mai', tier: 'supporting', firstAppearance: 1 }, { name: 'Gã hàng xóm', tier: 'supporting', firstAppearance: 1 }] });
  const l = F.submissionLadder(st, 11, chs); assert.strictEqual(l.length, 1); assert.strictEqual(l[0].stage, 4); // V14.7.41: thang nhanh hơn, 10 lần gặp + 10 chương → nấc 4
  const l2 = F.submissionLadder(st, 3, chs.slice(0, 1)); assert.strictEqual(l2[0].stage, 2);
});
t('khối kế hoạch: PRIMARY bắt buộc cảnh nóng; none/không mature thì rỗng; SECONDARY không bắt buộc', () => {
  assert.ok(/BẮT BUỘC/.test(F.matureScenePlanBlock(mk([]), 1, [])));
  assert.strictEqual(F.matureScenePlanBlock(mk([], { mature: false }), 1, []), '');
  assert.strictEqual(F.matureScenePlanBlock(mk([], { chapterMatureFocus: 'none' }), 1, []), '');
  assert.ok(!/BẮT BUỘC/.test(F.matureScenePlanBlock(mk([], { chapterMatureFocus: 'secondary' }), 1, [])));
  assert.ok(F.chapterNeedsHeat(mk([])) && !F.chapterNeedsHeat(mk([], { chapterMatureFocus: 'secondary' })));
});
t('prompt Scene Graph chứa khối nóng và không còn câu "chỉ đặt khi mạch truyện cần" khi 18+', () => {
  const p = F.buildAdaptiveScenePlanPrompt({ state: mk([]), matureBlock: F.matureScenePlanBlock(mk([]), 1, []) });
  assert.ok(/LỊCH CẢNH NÓNG/.test(p) && !/chỉ đặt khi mạch truyện cần/.test(p));
  assert.ok(/chỉ đặt khi mạch truyện cần/.test(F.buildAdaptiveScenePlanPrompt({ state: {} })), 'truyện không 18+ giữ nguyên');
});
t('planHasHotBeat + injectHotBeat chèn đúng 2 nhân vật và nâng độ dài', () => {
  const g = { scenes: [{ id: 'S1', characters: ['Lan', 'Mai'], purpose: 'đối chất', beats: ['nói chuyện'], targetWords: 700 }] };
  assert.ok(!F.planHasHotBeat(g));
  F.injectHotBeat(g, mk([{ text: 'x' }]), { allowedCharacters: ['Lan', 'Mai'] });
  assert.ok(F.planHasHotBeat(g) && /Lan và Mai/.test(g.scenes[0].beats.join(' ')) && g.scenes[0].targetWords >= 1100 && g.heatInjected);
});
t('cổng suy biến: bắt "Final rewrite"/lời xin lỗi/lời chat, KHÔNG bắt tiếng rên "á"', () => {
  const prose = 'Hắn đẩy cửa bước vào phòng họp nhỏ và để cánh cửa khép lại sau lưng. Ánh đèn vàng rọi xuống mặt bàn dài mười chỗ ngồi, trên đầu bàn xếp ngay ngắn một chồng hồ sơ cũ. ';
  assert.ok(F.degenerationCheck(prose + '\nFinal rewrite\n' + prose).bad);
  assert.ok(F.degenerationCheck(prose + '\nXin lỗi! Tôi bị lỗi nên viết lại.\n' + prose).bad);
  assert.ok(F.degenerationCheck(prose + ' ừ nhỉ, ok luôn, đúng vậy đó, ờ nhỉ, ' + prose).bad);
  assert.ok(!F.degenerationCheck(prose + ' "Á... á... á!" cô rên, "á!" ' + prose).bad);
});
// ---- pipeline: model lập plan KHÔNG có cảnh nóng -> thử lại -> tự chèn ----
const db = new Map(); const mockBlobs = { connectLambda() {}, getStore() { return { async get(k) { const v = db.get(k); return v ? JSON.parse(v) : null; }, async setJSON(k, v) { db.set(k, JSON.stringify(v)); }, async set(k, v) { db.set(k, typeof v === 'string' ? v : JSON.stringify(v)); }, async delete(k) { db.delete(k); } }; } };
const origLoad = Module._load; Module._load = function (req, ...a) { return req === '@netlify/blobs' ? mockBlobs : origLoad.call(this, req, ...a); };
let sd = 7; const rn = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const ON = 'b c d g h k l m n t v x ch th nh kh ph tr gi qu s r'.split(' '), RI = 'a à á ạ e ê ề i í o ô ố ơ u ư ừ an ân ăn em ên in on ôn ơn un ang anh ênh inh ong ông ung'.split(' ');
const pw = k => Array.from({ length: k }, () => ON[Math.floor(rn() * ON.length)] + RI[Math.floor(rn() * RI.length)]).join(' ');
let planCalls = 0, scenePrompts = [];
global.fetch = async (url, init) => {
  const body = JSON.parse(init.body), sys = (body.messages.find(m => m.role === 'system') || {}).content || '', usr = (body.messages.find(m => m.role === 'user') || {}).content || '';
  const kind = /Lập kế hoạch scene/.test(sys) ? 'plan' : /scene nối tiếp/.test(sys) ? 'scene' : /^\s*KIỂM TRA/.test(usr) ? 'check' : 'other';
  let content = '';
  if (kind === 'plan') { planCalls++; content = JSON.stringify({ chapterGoal: 'g', endingAnchor: 'Lan khóa cửa.', scenes: [1, 2].map(n => ({ id: 'S' + n, location: 'Văn phòng', time: 'Tối ' + n, characters: ['Lan', 'Mai'], purpose: 'p' + n, beats: ['b' + n], mustChange: 'Lan biết ' + n, handoff: 'h' + n, targetWords: 900 })) }); }
  else if (kind === 'scene') { scenePrompts.push(usr); content = pw(900); }
  else content = '{"ok":true,"issues":[]}';
  return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content }, finish_reason: 'stop' }] }), text: async () => content };
};
const worker = require(path.join(__dirname, '../netlify/functions/write-chapter-background.js'));
(async () => {
  const token = 'tok', jobId = 'job40';
  db.set(jobId, JSON.stringify({ jobId, createdAt: Date.now(), status: 'queued', schemaVersion: 9, workerTokenHash: crypto.createHash('sha256').update(token).digest('hex'), apiKeyEncrypted: { encrypted: false, value: 'k' },
    apiEndpoint: 'http://mock/chat/completions', model: 'MAIN', modelNsfw: 'NSFW', forceNsfw: true, draftOnly: true,
    storyState: { chapters: [], characters: [{ name: 'Mai', tier: 'supporting', firstAppearance: 1 }], locations: [], items: [], threads: [], mature: true, nsfwMode: 'always', chapterMatureFocus: 'primary', mainCharProfile: { name: 'Lan' }, arcs: [{ id: 'a1', name: 'Arc 1', goal: 'Lan giữ hồ sơ', active: true }], chapterOutline: '' } }));
  await worker.handler({ httpMethod: 'POST', body: JSON.stringify({ jobId, workerToken: token }), headers: {} });
  const job = JSON.parse(db.get(jobId));
  t('job không bị PLAN_REJECTED dù model không đưa beat nóng', () => { assert.strictEqual(job.status, 'completed', job.error); });
  t('plan được lập lại ít nhất 1 lần vì thiếu cảnh nóng', () => assert.ok(planCalls >= 2, 'planCalls=' + planCalls));
  t('prompt scene có beat cảnh nóng giữa Lan và Mai', () => assert.ok(scenePrompts.some(p => /cảnh nóng giữa Lan và Mai/.test(p))));
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAIL pipeline:', e.stack || e.message); process.exit(1); });
