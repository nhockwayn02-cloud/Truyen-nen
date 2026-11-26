// V14.7.52: model thinking ăn hết token ở Hậu kỳ → báo rõ chỗ đổi; đặt "Model Hậu kỳ" thì hậu kỳ chạy ổn bằng model đó, viết cảnh vẫn model chính.
const assert = require('assert'); const h = require('./qa/worker_harness');
const txt = 'Mai bước vào quán cà phê, nhìn thấy Lan đang ngồi cạnh cửa sổ. Lan mỉm cười và vẫy tay. Mai đưa cho Lan chiếc phong bì. '.repeat(15);
const good = JSON.stringify({ summary: 'Mai gặp Lan và đưa phong bì.', characters: [{ name: 'Mai', chapterEvent: 'đưa phong bì', changeEvidence: 'Mai đưa cho Lan chiếc phong bì' }], world: {}, status: { currentStatus: 'Mai và Lan ở quán cà phê.' }, memory: {}, continuityWarnings: [], nextChapterHint: 'Lan mở phong bì.' });
const mk = (extra) => ({ mode: 'postprocess', chapterNumber: 1, storyState: Object.assign({ chapters: [{ number: 1, title: 'c1', text: txt, wordCount: 300, status: 'accepted' }], characters: [{ name: 'Mai', tier: 'supporting', firstAppearance: 1 }] }, extra || {}) });
(async () => {
  const models = new Set(); const think = rec => { models.add(rec.model); return /glm/i.test(String(rec.model)) ? { content: '', finish: 'length', reasoning: 'nghĩ '.repeat(5000) } : { content: good }; };
  h.reset(); h.setScript(think); const bad = await h.runJob('t_bad', Object.assign(mk(), { model: 'z-ai/glm-5.3-flash-uncensored' }));
  const msg = String(bad.postProcessError || bad.progress || bad.error || '');
  assert.ok(/reasoning \d+/.test(msg) && /Model Hậu kỳ/.test(msg) && /mục 10\.3/.test(msg), 'thông báo phải chỉ rõ chỗ đổi model: ' + msg.slice(0, 400)); assert.notStrictEqual(bad.postProcessStatus, 'DONE', 'model thinking → không được báo DONE');
  models.clear(); h.reset(); h.setScript(think); const okj = await h.runJob('t_ok', Object.assign(mk({ stepModels: { post: 'plain/no-think-model' } }), { model: 'z-ai/glm-5.3-flash-uncensored' }));
  assert.strictEqual(okj.postProcessStatus, 'DONE', 'đặt Model Hậu kỳ không-thinking thì hậu kỳ phải xong: ' + okj.postProcessStatus + ' ' + String(okj.postProcessError || '').slice(0, 200));
  assert.ok(models.has('plain/no-think-model') && ![...models].some(m => /glm/i.test(String(m))), 'mọi lượt hậu kỳ phải dùng model bước đã đặt: ' + [...models].join(','));
  console.log('PASS thông báo chỉ rõ chỗ đổi model; đặt Model Hậu kỳ → hậu kỳ DONE bằng model đó'); process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
