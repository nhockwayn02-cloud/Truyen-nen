// V14.7.53: cảnh nóng đang dở (chưa cao trào/dư âm) → luật trong prompt + đúng MỘT lượt viết tiếp tại chỗ; cảnh đã khép thì không đụng.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8') + '\n;this.e={hotActOpen,isHotSceneDef};', ctx); const E = ctx.e;
const open = ['Hắn bước tới, mở khóa thắt lưng. Cô quỳ xuống nền xi măng lạnh.', 'Con cặc hắn cứng ngắc, đưa tới sát môi ả dưới vệt đèn pin vàng vọt.', 'Thân cặc trượt vào từng đoạn, nóng và dày; đầu lưỡi ả ép lên gân dưới để giảm cảm giác bị đẩy sâu.', 'Hắn đẩy vào tới cổ họng thì dừng một nhịp, rồi rút ra chậm đến mức nghe tiếng nước bọt nhép nhỏ.', 'Tiếng bước chân vang lên ngoài hành lang. Hắn dừng hẳn, con cặc ngập sâu trong miệng ả.'].join('\n\n');
assert.strictEqual(E.hotActOpen(open), true, 'cảnh bị ngắt chưa cao trào phải bị coi là đang dở');
assert.strictEqual(E.hotActOpen(open + '\n\nHắn xuất ra trong miệng ả, ả nuốt xuống rồi gục xuống, thở hổn hển.'), false, 'đã có cao trào/dư âm thì coi như đã khép');
assert.strictEqual(E.hotActOpen('Họ nói chuyện về hồ sơ.\n\nCô đưa phong bì cho anh.\n\nAnh gật đầu.'), false, 'cảnh không nóng không bị đụng');
assert.ok(E.isHotSceneDef({ beats: ['cảnh nóng trong kho'] }));
const real = '/mnt/user-data/attachments/2715c23c-f06e-5342-ab65-5b57b1080754/13dde173-attachment.txt';
if (fs.existsSync(real)) { const t = fs.readFileSync(real, 'utf8').replace(/^\s*\d+\t/gm, ''); const sc = t.slice(t.indexOf('Lý Ái Vân dừng trước cửa'), t.indexOf('Một giờ mười tám phút')); assert.strictEqual(E.hotActOpen(sc), true, 'file thật: cảnh trong kho bị ngắt phải được nhận ra'); console.log('PASS file thật của người dùng: nhận ra cảnh trong kho còn dở'); }
(async () => {
  const h = require('./qa/worker_harness'); const FIN = /CẢNH NÓNG ĐANG DỞ/;
  const run = async (id, sceneText) => { const fin = [], scenePrompts = []; h.reset(); h.planScenes = 2; h.sceneWords = 500; h.hotScene = 1;
    h.setScript(rec => { if (rec.kind !== 'scene') return null; if (FIN.test(rec.usr)) { fin.push(rec.usr); return { content: h.prose(260, 'K') + ' Hắn xuất ra, ả gục xuống thở hổn hển, im lặng dài.' }; } scenePrompts.push(rec.usr); if (rec.n === 0 && sceneText) return { content: sceneText }; return null; });
    const job = await h.runJob(id, { storyState: { mature: true, chapterWordMin: 700, chapterWordMax: 1800, minChapterWords: 1000 } }); h.hotScene = 0; return { fin, scenePrompts, job }; };
  const a = await run('hot_open', open + ' ' + h.prose(500, 'O')); assert.ok(a.scenePrompts.some(p => /CẢNH NÓNG PHẢI ĐI TRỌN MỘT VÒNG/.test(p)), 'prompt scene nóng phải có luật đi trọn một vòng'); assert.strictEqual(a.fin.length, 1, 'đúng MỘT lượt viết tiếp, thực tế ' + a.fin.length); assert.ok(/xuất ra, ả gục xuống/.test(String((a.job.resultChapter || {}).text || '')), 'phần viết tiếp phải nằm trong chương');
  const b = await run('hot_closed', open + '\n\nHắn xuất ra trong miệng ả, ả nuốt xuống rồi gục xuống, thở hổn hển. ' + h.prose(300, 'C')); assert.strictEqual(b.fin.length, 0, 'cảnh đã khép thì không viết tiếp');
  console.log('PASS cảnh nóng dở → luật trong prompt + đúng 1 lượt viết tiếp; cảnh đã khép không bị đụng'); process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
