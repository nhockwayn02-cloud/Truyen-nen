// QA harness: chạy worker job nền với fetch giả có kịch bản (lỗi chèn cố ý).
const fs = require('fs'), path = require('path'), crypto = require('crypto'), Module = require('module');
const PROJ = path.resolve(__dirname, '../..');
const db = new Map();
const mockBlobs = { connectLambda() {}, getStore() { return { async get(k) { const v = db.get(k); return v ? JSON.parse(v) : null; }, async setJSON(k, v) { db.set(k, JSON.stringify(v)); }, async delete(k) { db.delete(k); }, async list() { return { blobs: [] }; } }; } };
const origLoad = Module._load; Module._load = function (req, ...a) { return req === '@netlify/blobs' ? mockBlobs : origLoad.call(this, req, ...a); };
let sd = 11; const rn = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const ON = 'b c d g h k l m n t v x ch th nh kh ph tr gi qu s r'.split(' '), RI = 'a à á ạ e ê ề i í o ô ố ơ u ư ừ an ân ăn em ên in on ôn ơn un ang anh ênh inh ong ông ung'.split(' ');
const syl = () => ON[Math.floor(rn() * ON.length)] + RI[Math.floor(rn() * RI.length)];
// văn giả có dấu câu: câu ~12 từ, đoạn ~4 câu
function prose(words, tag) { const paras = []; let n = 0; while (n < words) { const sents = []; for (let s = 0; s < 4 && n < words; s++) { const L = 9 + Math.floor(rn() * 8); const w = Array.from({ length: L }, syl); if (s === 0 && tag) w[0] = tag + n; sents.push(w.join(' ') + (s === 3 ? '.' : ',') ); n += L; } let p = sents.join(' '); p = p.replace(/,$/, '.'); paras.push(p.charAt(0).toUpperCase() + p.slice(1)); } return paras.join('\n\n'); }
const wc = t => String(t || '').split(/\s+/).filter(Boolean).length;
const calls = [];
let script = null;
global.fetch = async (url, init) => {
  const body = JSON.parse(init.body), sys = (body.messages.find(m => m.role === 'system') || {}).content || '', usr = (body.messages.find(m => m.role === 'user') || {}).content || '';
  const kind = /Lập kế hoạch scene/.test(sys) ? 'plan' : /scene nối tiếp/.test(sys) ? 'scene' : /^\s*KIỂM TRA/.test(usr) ? 'check' : 'other';
  const rec = { kind, model: body.model, usr, sys, max_tokens: body.max_tokens, n: calls.filter(c => c.kind === kind).length }; calls.push(rec);
  const r = (script && script(rec, body)) || {};
  rec.status = r.status || 200;
  if (rec.status !== 200) return { ok: false, status: rec.status, statusText: 'ERR', headers: { get: h => (r.headers || {})[String(h).toLowerCase()] || null }, json: async () => ({ error: { message: r.message || ('lỗi ' + rec.status) } }), text: async () => r.message || 'err' };
  const content = r.content != null ? r.content : defaultContent(rec);
  return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content }, finish_reason: r.finish || 'stop' }] }), text: async () => content };
};
let planScenes = 2, sceneWords = 900;
function defaultContent(rec) {
  if (rec.kind === 'plan') return JSON.stringify({ chapterGoal: 'g', endingAnchor: 'Lan khóa cửa.', scenes: Array.from({ length: harness.planScenes }, (_, i) => ({ id: 'S' + (i + 1), location: 'Văn phòng', time: 'Tối ' + (i + 1), characters: ['Lan', 'Mai'], purpose: 'p' + (i + 1), beats: ['b' + (i + 1)], mustChange: 'Lan biết ' + (i + 1), handoff: 'h' + (i + 1), targetWords: harness.sceneWords })) });
  if (rec.kind === 'scene') return prose(harness.sceneWords, 'X');
  return '{"ok":true,"issues":[]}';
}
const harness = { db, calls, prose, wc, planScenes, sceneWords, setScript(f) { script = f; }, reset() { calls.length = 0; script = null; },
  async runJob(jobId, over) {
    const worker = require(path.join(PROJ, 'netlify/functions/write-chapter-background.js')); const token = 'tok';
    const base = { jobId, createdAt: Date.now(), status: 'queued', schemaVersion: 9, workerTokenHash: crypto.createHash('sha256').update(token).digest('hex'), apiKeyEncrypted: { encrypted: false, value: 'k-secret-123456' }, apiEndpoint: 'http://mock/chat/completions', model: 'MAIN', modelNsfw: 'NSFW', draftOnly: true,
      storyState: { chapters: [], characters: [{ name: 'Mai', tier: 'supporting', firstAppearance: 1 }], locations: [], items: [], threads: [], mainCharProfile: { name: 'Lan' }, arcs: [{ id: 'a1', name: 'Arc 1', goal: 'Lan giữ hồ sơ', active: true }], chapterOutline: '' } };
    const job = Object.assign(base, over || {}, { storyState: Object.assign(base.storyState, (over && over.storyState) || {}) });
    db.set(jobId, JSON.stringify(job));
    await worker.handler({ httpMethod: 'POST', body: JSON.stringify({ jobId, workerToken: token }), headers: {} });
    return JSON.parse(db.get(jobId));
  } };
module.exports = harness;
