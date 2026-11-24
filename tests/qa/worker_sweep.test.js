const h = require('./worker_harness'); const R = [];
const rec = (id, area, name, status, evidence) => { R.push({ id, area, name, status, evidence }); console.log(status.padEnd(4), id, name, '—', String(evidence).slice(0, 220)); };
const endsClean = t => /[.!?…"”»)]\s*$/.test(String(t || '').trim());
const paras = t => String(t || '').split(/\n+/).map(s => s.trim()).filter(s => s.length > 60);
const dups = t => { const m = new Map(); let d = 0; paras(t).forEach(p => { const k = p.toLowerCase(); m.set(k, (m.get(k) || 0) + 1); }); m.forEach(n => { if (n > 1) d += n - 1; }); return d; };
(async () => {
  // W1 chương dài ~9000 từ
  h.reset(); h.planScenes = 6; h.sceneWords = 1500;
  let job = await h.runJob('w1', { storyState: { chapterWordMin: 6500, chapterWordMax: 9500, minChapterWords: 8000 } }); let ch = job.resultChapter || {};
  rec('W1', 'Chương dài', '6 scene × 1500 từ ≈ 9000 từ: hoàn tất, đủ nội dung, kết sạch, không lặp đoạn', job.status === 'completed' && h.wc(ch.text) >= 6500 && endsClean(ch.text) && dups(ch.text) === 0 ? 'PASS' : 'FAIL', `status=${job.status} words=${h.wc(ch.text)} issues=${JSON.stringify(ch.autoUpdateIssues).slice(0,120)} endsClean=${endsClean(ch.text)} dupParas=${dups(ch.text)} truncated=${ch.truncated} err=${job.error || ''}`);
  // W2 scene bị cắt giữa chừng (finish=length) lần 1 rồi tốt
  h.reset(); h.planScenes = 3; h.sceneWords = 900; let cut = 0;
  h.setScript(rec2 => { if (rec2.kind === 'scene' && rec2.n === 2 && !cut) { cut++; const t = h.prose(450, 'T'); return { content: t.slice(0, t.length - 25), finish: 'length' }; } });
  job = await h.runJob('w2', {}); ch = job.resultChapter || {};
  rec('W2', 'Viết nền / cắt giữa chừng', 'scene bị cắt (finish=length, đứt giữa câu) → phải thử lại/nối tiếp, chương không đứt giữa câu', job.status === 'completed' && endsClean(ch.text) && !/[a-zà-ỹ,]$/i.test(String(ch.text).trim()) ? 'PASS' : 'FAIL', `status=${job.status} words=${h.wc(ch.text)} endsClean=${endsClean(ch.text)} sceneCalls=${h.calls.filter(c => c.kind === 'scene').length} tail="${String(ch.text || '').trim().slice(-60)}"`);
  // W3 scene cuối luôn bị cắt
  h.reset(); h.planScenes = 2; h.sceneWords = 900;
  h.setScript(rec2 => { if (rec2.kind === 'scene') { const t = h.prose(300, 'U'); return { content: t.slice(0, t.length - 25), finish: 'length' }; } });
  job = await h.runJob('w3', {}); ch = job.resultChapter || {};
  const flagged = job.status !== 'completed' || (ch.autoUpdateIssues || []).some(x => /^Thiếu từ:/.test(x)) && /^⚠ Thiếu từ/.test(String(job.progress || ''));
  rec('W3', 'Viết nền / cắt giữa chừng', 'mọi lượt đều bị cắt → không được lưu im lặng như chương hoàn chỉnh (phải fail hoặc cảnh báo)', flagged ? 'PASS' : 'FAIL', `status=${job.status} truncatedFlag=${ch.truncated} words=${h.wc(ch.text)} err=${String(job.error || '').slice(0, 120)}`);
  // W4 API lỗi
  const apiCase = async (id, label, st, msg, retryAfter, okAfter, expect) => {
    h.reset(); h.planScenes = 2; h.sceneWords = 700; let n = 0;
    h.setScript(rec2 => { if (rec2.kind === 'scene' && (okAfter ? n++ < okAfter : true)) return { status: st, message: msg, headers: retryAfter ? { 'retry-after': '0' } : {} }; });
    const j = await h.runJob(id, {}); const err = String(j.error || ''); const sceneCalls = h.calls.filter(c => c.kind === 'scene').length;
    const leaked = /k-secret-123456/.test(JSON.stringify(j)); const ok = expect(j, err, sceneCalls) && !leaked;
    rec(id, 'API', label, ok ? 'PASS' : 'FAIL', `status=${j.status} sceneCalls=${sceneCalls} leakedKey=${leaked} err="${err.slice(0, 150)}"`);
  };
  await apiCase('W4a', 'API 429 rồi OK: thử lại có giới hạn và hoàn tất', 429, 'Rate limit', true, 1, (j, e, n) => j.status === 'completed' && n <= 8);
  await apiCase('W4b', 'API 403 liên tục: báo rõ 403, thử lại có giới hạn, không lộ key', 403, 'Workspace/privacy: model not allowed', false, 0, (j, e, n) => j.status !== 'completed' && /403/.test(e) && n <= 12);
  await apiCase('W4c', 'API 404 Model not found: báo rõ mã/ tên model', 404, 'Model not found', false, 0, (j, e, n) => j.status !== 'completed' && /404|không tìm thấy|not found/i.test(e) && n <= 12);
  await apiCase('W4d', 'API 402/hết token: báo rõ, không treo', 402, 'Insufficient credits / out of tokens', false, 0, (j, e, n) => j.status !== 'completed' && /402|credit|token|hết/i.test(e) && n <= 12);
  await apiCase('W4e', 'API 401 key sai: báo rõ, không lộ key', 401, 'Invalid API key k-secret-123456', false, 0, (j, e, n) => j.status !== 'completed' && /401|key/i.test(e) && !/k-secret-123456/.test(e) && n <= 12);
  // W5 định tuyến model
  h.reset(); h.planScenes = 2; h.sceneWords = 700; job = await h.runJob('w5a', { forceNsfw: false });
  const kinds = k => Array.from(new Set(h.calls.filter(c => c.kind === k).map(c => c.model)));
  rec('W5a', 'Viết nền / đúng model', 'chương thường: plan+scene dùng MAIN, không dùng NSFW', job.status === 'completed' && kinds('scene').join() === 'MAIN' && kinds('plan').join() === 'MAIN' ? 'PASS' : 'FAIL', `plan=${kinds('plan')} scene=${kinds('scene')} other=${kinds('other')} nsfwUsed=${h.calls.some(c => c.model === 'NSFW')}`);
  h.reset(); h.planScenes = 2; h.sceneWords = 700; job = await h.runJob('w5b', { forceNsfw: true, storyState: { mature: true, nsfwMode: 'always', chapterMatureFocus: 'primary' } });
  rec('W5b', 'Viết nền / đúng model', 'chương 18+: scene dùng NSFW', job.status === 'completed' && kinds('scene').includes('NSFW') ? 'PASS' : 'FAIL', `plan=${kinds('plan')} scene=${kinds('scene')} other=${kinds('other')} status=${job.status} err=${job.error || ''}`);
  // W6 viết nhiều chương liên tiếp: 12 chương, đồng bộ trạng thái giữa các job
  h.reset(); h.planScenes = 3; h.sceneWords = 800; let chapters = [], characters = [{ name: 'Mai', tier: 'supporting', firstAppearance: 1 }], fails = [], words = [], dupTotal = 0, tailMissing = 0, openRepeat = 0;
  for (let i = 1; i <= 12; i++) {
    h.calls.length = 0;
    const j = await h.runJob('m' + i, { storyState: { chapters: chapters.slice(), characters } }); const c = j.resultChapter;
    if (j.status !== 'completed' || !c) { fails.push(i + ':' + j.status + ':' + String(j.error || '').slice(0, 60)); break; }
    words.push(h.wc(c.text)); dupTotal += dups(c.text);
    if (chapters.length) { const prevTail = paras(chapters[chapters.length - 1].text).slice(-1)[0] || ''; const sp = h.calls.filter(x => x.kind === 'scene')[0]; if (sp && prevTail && !sp.usr.includes(prevTail.slice(0, 40))) tailMissing++; const open = paras(c.text)[0]; if (open && chapters.some(pc => paras(pc.text).includes(open))) openRepeat++; }
    chapters.push({ title: c.title, text: c.text, wordCount: h.wc(c.text), summary: c.summary || '' });
  }
  rec('W6', 'Viết tiếp chương / nhiều chương', '12 chương liên tiếp: tất cả hoàn tất, không lặp đoạn, độ dài ổn định', !fails.length && chapters.length === 12 && dupTotal === 0 ? 'PASS' : 'FAIL', `done=${chapters.length}/12 fails=${fails.join('|')} words=${words.join(',')} dupParas=${dupTotal}`);
  rec('W6b', 'Viết tiếp chương / mạch truyện', 'prompt scene đầu của chương N chứa đoạn cuối chương N-1 (giữ mạch)', tailMissing === 0 ? 'PASS' : 'FAIL', `chương thiếu đuôi chương trước: ${tailMissing}/11`);
  rec('W6c', 'Viết tiếp chương / lặp đoạn', 'chương mới không mở bằng đoạn y nguyên của chương cũ', openRepeat === 0 ? 'PASS' : 'FAIL', `openRepeat=${openRepeat}`);
  // W7 model lặp lại đoạn cuối chương trước ở đầu chương mới
  h.reset(); h.planScenes = 2; h.sceneWords = 700; const prev = chapters[chapters.length - 1]; const rep = paras(prev.text).slice(-2).join('\n\n');
  h.setScript(rec2 => { if (rec2.kind === 'scene' && rec2.n === 0) return { content: rep + '\n\n' + h.prose(600, 'V') }; });
  job = await h.runJob('w7', { storyState: { chapters: chapters.slice(), characters } }); ch = job.resultChapter || {};
  const hasRep = rep && String(ch.text || '').includes(paras(prev.text).slice(-1)[0]);
  rec('W7', 'Viết tiếp chương / lặp đoạn', 'model chép lại 2 đoạn cuối chương trước vào đầu chương mới → phải bị chặn/gỡ', job.status !== 'completed' || !hasRep ? 'PASS' : 'FAIL', `status=${job.status} repeatedInFinal=${hasRep} calls=${h.calls.filter(c => c.kind === 'scene').length}`);
  console.log('\nTỔNG:', R.filter(r => r.status === 'PASS').length + ' PASS /', R.filter(r => r.status === 'FAIL').length + ' FAIL');
  process.exit(R.some(r => r.status === 'FAIL') ? 1 : 0);
})().catch(e => { console.error('CRASH', e.stack || e.message); process.exit(1); });
