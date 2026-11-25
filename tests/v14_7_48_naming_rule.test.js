// V14.7.48: prompt viết scene phải buộc đặt tên người mới ngay lần đầu (để Character Database có tên mà ghi).
const assert = require('assert'); const h = require('./qa/worker_harness');
(async () => { let scenePrompts = []; h.setScript((rec) => { if (rec.kind === 'scene') scenePrompts.push(rec.usr + '\n' + rec.sys); return null; });
  const job = await h.runJob('naming1'); assert.ok(scenePrompts.length >= 1, 'phải có lượt viết scene');
  assert.ok(scenePrompts.every(t => /ĐẶT TÊN NGƯỜI MỚI NGAY LẦN ĐẦU/.test(t)), 'mọi prompt scene phải chứa luật đặt tên');
  assert.ok(scenePrompts.every(t => /cô ta\/anh ta/.test(t)), 'luật nêu rõ cấm chỉ dùng đại từ');
  console.log('PASS luật đặt tên có trong mọi prompt scene (' + scenePrompts.length + ' lượt), job=' + job.status); process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
