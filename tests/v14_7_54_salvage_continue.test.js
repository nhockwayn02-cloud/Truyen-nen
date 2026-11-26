// V14.7.54: scene sụp giữa chừng rồi bị cắt còn ngắn → đúng MỘT lượt viết tiếp phần còn thiếu; scene không sụp thì không đụng.
const assert = require('assert');
(async () => {
  const h = require('./qa/worker_harness'); const CONT = /SCENE BỊ CẮT GIỮA CHỪNG/;
  const run = async (id, collapse) => { const cont = []; h.reset(); h.planScenes = 2; h.sceneWords = 500;
    h.setScript(rec => { if (rec.kind !== 'scene') return null; if (CONT.test(rec.usr)) { cont.push(rec.usr); return { content: h.prose(240, 'Z') + ' Nàng gọi hắn là chủ, lần vỡ thứ hai.' }; } if (rec.n === 0 && collapse) return { content: h.prose(400, 'A') + ' ' + 'america '.repeat(40) }; return null; });
    const job = await h.runJob(id, { storyState: { chapterWordMin: 700, chapterWordMax: 1800, minChapterWords: 1000 } }); return { cont, job }; };
  const a = await run('salv_collapse', true);
  assert.strictEqual(a.cont.length, 1, 'đúng MỘT lượt viết tiếp, thực tế ' + a.cont.length);
  assert.ok(/nàng gọi hắn là chủ/i.test(String((a.job.resultChapter || {}).text || '')), 'phần viết tiếp phải nằm trong chương');
  const b = await run('salv_ok', false); assert.strictEqual(b.cont.length, 0, 'scene không sụp thì không viết tiếp');
  console.log('PASS scene sụp rồi bị cắt → 1 lượt viết tiếp phần thiếu; scene bình thường không bị đụng'); process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
