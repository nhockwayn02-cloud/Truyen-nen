// V14.7.50: (1) salvage cắt đúng chỗ văn bắt đầu trôi; (2) chương trước kết giữa cảnh → scene mở đầu nhận luật "không chốt nhanh";
// (3) nút Viết tiếp có cổng văn suy biến (trình duyệt thật + API giả).
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8'); const ctx = {}; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__e={salvageBeforeDegeneration,degenerationCheck,endsMidScene};', ctx); const E = ctx.__e;
const good = 'Cô ngồi xuống mép giường, nghe tiếng mưa gõ đều lên cửa kính. Anh không nói gì, chỉ đặt chiếc áo khoác lên lưng ghế rồi ngả người ra sau. Căn phòng chìm trong ánh sáng vàng nhạt, hơi thở hai người dần chậm lại.';
const drift = 'Hắn đứng bất động thêm khoảng mười giây để nhịp tim hạ xuống dưới một trăm rồi mới rút ra khỏi chỗ ấy để dòng trắng loãng từ từ chảy dài dọc hai bên đùi nhỏ xuống sàn thành vũng nhỏ ngay cạnh đôi giày cao gót vẫn còn đang đi trên chân lúc nãy nhưng giờ thì gót trái đã tuột hẳn khỏi chân nằm lệch dưới đất cùng với tiếng thở hổn hển của cả hai người trong căn phòng họp nhỏ im lìm đó mà chẳng ai nói thêm lời nào nữa cả. ';
const bad = [good, good, drift + drift, drift + 'các bạn ơi okay bye bye nha mọi người...'].join('\n\n');
const dg = E.degenerationCheck(bad); assert.ok(dg.bad, 'phải bắt văn trôi');
const sv = E.salvageBeforeDegeneration(bad); assert.ok(sv.includes('hơi thở hai người') && !/bye bye|nhịp tim hạ xuống/.test(sv), 'salvage phải cắt ngay trước đoạn trôi, giữ phần sạch');
const real = '/mnt/user-data/attachments/2715c23c-f06e-5342-ab65-5b57b1080754/df1ee1a0-attachment.txt';
if (fs.existsSync(real)) { const t = fs.readFileSync(real, 'utf8').replace(/^\s*\d+\t/gm, ''); const s2 = E.salvageBeforeDegeneration(t); assert.ok(/vỡ hết lớp này tới lớp khác; rồi\.$/.test(s2.trim()), 'file thật: phải cắt đúng tại "…; rồi."'); assert.ok(!/bye bye|Khoan\./.test(s2), 'file thật: phần trôi phải mất'); console.log('PASS file thật của người dùng: cắt đúng chỗ bắt đầu trôi (' + s2.split(/\s+/).length + ' từ giữ lại)'); }
assert.ok(E.endsMidScene(good.repeat(2) + ' để cho nó vỡ hết lớp này tới lớp khác; rồi.'), 'câu bỏ lửng "; rồi." = giữa cảnh');
assert.ok(E.endsMidScene(good.repeat(2) + ' Hắn quay người và'), 'không dấu kết = giữa cảnh');
assert.ok(!E.endsMidScene(good.repeat(2)), 'chương kết trọn câu không bị coi là giữa cảnh');
console.log('PASS salvage cắt đúng chỗ trôi + nhận diện chương kết giữa cảnh');
(async () => {
  const h = require('./qa/worker_harness');
  const run = async (id, lastText) => { const prompts = []; h.reset(); h.setScript(rec => { if (rec.kind === 'scene') prompts.push(rec.usr); return null; });
    const job = await h.runJob(id, { storyState: { chapters: [{ number: 1, title: 'c1', text: lastText, wordCount: 300, status: 'accepted' }] } }); return { prompts, job }; };
  const a = await run('mid1', good.repeat(3) + ' để cho nó vỡ hết lớp này tới lớp khác; rồi.'); assert.ok(a.prompts.length && /CHƯƠNG TRƯỚC DỪNG GIỮA CẢNH/.test(a.prompts[0]), 'scene mở đầu phải có luật cảnh bỏ dở'); assert.ok(a.prompts.some(p => !/CHƯƠNG TRƯỚC DỪNG GIỮA CẢNH/.test(p)), 'các scene sau không nhận luật');
  { const tw = Number((a.prompts[0].match(/"targetWords":(\d+)/) || [])[1]); assert.ok(tw >= 1500, 'scene mở đầu cảnh bỏ dở phải có ngân sách ≥1500 từ, thực tế ' + tw); }
  const b = await run('mid2', good.repeat(3)); assert.ok(b.prompts.length && !/CHƯƠNG TRƯỚC DỪNG GIỮA CẢNH/.test(b.prompts[0]), 'chương trước kết trọn thì không có luật');
  console.log('PASS worker: luật cảnh bỏ dở chỉ gắn cho scene mở đầu khi chương trước kết giữa cảnh');
  const { chromium } = require('playwright'); const br = await chromium.launch(), cx = await br.newContext(); await cx.addInitScript('window.__XTA_TEST__=true'); const p = await cx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); let calls = 0;
  await p.route('**/mock/chat/completions', async r => { calls++; const cleanText = ['Mưa vẫn rơi ngoài hiên.', 'Gió lùa qua khe cửa sổ làm tấm rèm khẽ lay.', 'Cô đặt tách trà xuống bàn rồi nhìn anh rất lâu.', 'Anh nghe tim mình đập chậm lại từng nhịp một.'].map((x, i) => x + ' ' + good.replace('Cô ngồi', ['Cô ngồi', 'Nàng ngồi', 'Chị ngồi', 'Em ngồi'][i]).replace('mưa gõ', ['mưa gõ', 'gió thổi', 'sấm rền', 'mưa rơi'][i])).join('\n\n'); const content = calls === 1 ? bad : cleanText; await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }) }); });
  await p.goto('file://' + path.join(__dirname, '../index.html')); await p.waitForTimeout(1200);
  const res = await p.evaluate(async () => { const s = __xta.state; s.apiEndpoint = 'http://mock/chat/completions'; s.apiKey = 'k-test-123456'; s.model = 'MAIN'; s.nsfwMode = 'off'; s.streamingEnabled = false; s.spellCheckEnabled = false; s.accuracyMode = false;
    const base = 'Mở đầu chương, nhân vật bước vào phòng và nhìn quanh. '.repeat(30) + 'Hắn giữ nguyên nhịp chậm đều đặn để cho nó vỡ hết lớp này tới lớp khác; rồi.'; s.chapters = [{ number: 1, title: 'c1', text: base, wordCount: 280, status: 'accepted', plan: '' }]; s.currentChapterIndex = 0; s.storyId = s.storyId || 'tst'; if (typeof renderAll === 'function') try { renderAll(); } catch (_) {}
    document.getElementById('continueChapterBtn').click(); for (let i = 0; i < 80 && __xta.state.chapters[0].text === base; i++) await new Promise(r => setTimeout(r, 150)); await new Promise(r => setTimeout(r, 500)); return { t: __xta.state.chapters[0].text, base }; });
  assert.ok(res.t.length > res.base.length, 'phải nối được phần sạch'); assert.ok(!/bye bye|nhịp tim hạ xuống/.test(res.t), 'phần trôi không được nối vào chương'); assert.ok(calls >= 2, 'phải viết lại sau khi bắt văn trôi (calls=' + calls + ')'); assert.deepStrictEqual(errs, [], 'không lỗi JS');
  console.log('PASS nút Viết tiếp: bắt văn trôi, viết lại sạch, không nối rác (calls=' + calls + ')'); await br.close(); process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
