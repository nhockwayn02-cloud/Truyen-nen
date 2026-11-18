// V14.7.31: kết chương có móc, thay đổi quan hệ, nhân vật nữ tự quyết định, biệt danh, mạch chính.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(core + '\n;this.f={endingHookCheck,chapterCraftPlanBlock,mainThreadDrift,plotTermHits,prosePatternGate,buildAdaptiveSceneWritePrompt,buildChapterPlanPrompt,overusedPhraseGuide};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const body = ' Chiếc bàn gỗ đặt cạnh cửa sổ, xe cộ chạy qua đều đều. Im lặng. Hắn thở ra.'.repeat(120);
const plain = (end) => 'Tiếng chuông cửa vang lên.' + body + '\n\n' + end;
t('kết bằng tóm tắt nội tâm/kế hoạch bị bắt', () => { assert.ok(F.endingHookCheck(plain('Cô biết rằng từ giây phút này, mình đã bước vào ván cờ không lối thoát.')).summary); assert.ok(F.endingHookCheck(plain('Hắn chuẩn bị cho bước tiếp theo trong kế hoạch.')).summary); });
t('kết bằng thoại/hình ảnh/biến cố thì không bị bắt', () => { assert.ok(!F.endingHookCheck(plain('“Anh đến muộn rồi.” Tiếng khóa cửa lách cách ngay sau lưng hắn.')).summary); assert.ok(!F.endingHookCheck(plain('Màn hình điện thoại sáng lên: một số lạ vừa gửi đến đúng bản video ấy.')).summary); });
t('cổng cảnh báo kết chương tóm tắt', () => { const g = F.prosePatternGate({ chapters: [] }, 1, plain('Cô biết mình sẽ không còn đường quay lại.')); assert.ok(g.warn.some(x => x.includes('Kết chương'))); });
t('cổng cảnh báo biệt danh lặp trong lời kể', () => { const g = F.prosePatternGate({ chapters: [] }, 1, plain('Màn hình sáng.') + ' Gã bảo vệ cười. Tên bảo vệ nhìn. Gã bảo vệ nói. Gã bảo vệ đứng. Gã bảo vệ đi. Gã bảo vệ dừng.'); assert.ok(g.warn.some(x => x.includes('Biệt danh'))); });
t('prompt scene cuối có KẾT CHƯƠNG CÓ MÓC, scene giữa thì không', () => { const o = { state: {}, scene: { targetWords: 500 }, isFinalScene: true }; assert.ok(F.buildAdaptiveSceneWritePrompt(o).includes('KẾT CHƯƠNG CÓ MÓC')); assert.ok(!F.buildAdaptiveSceneWritePrompt({ ...o, isFinalScene: false }).includes('KẾT CHƯƠNG CÓ MÓC')); });
t('khối kế hoạch: luôn có THAY ĐỔI QUAN HỆ; chỉ chương chia hết 3 mới có hành động tự quyết định', () => { const st = { chapters: [] }; assert.ok(F.chapterCraftPlanBlock(st, 4).includes('THAY ĐỔI QUAN HỆ')); assert.ok(!F.chapterCraftPlanBlock(st, 4).includes('TỰ QUYẾT ĐỊNH')); assert.ok(F.chapterCraftPlanBlock(st, 6).includes('TỰ QUYẾT ĐỊNH')); });
t('mạch chính: 3 chương liền không có tu luyện/âm mưu → bắt buộc beat đẩy mạch; có thì không', () => {
  const quiet = { text: 'Cô bước vào phòng họp và ngồi xuống. '.repeat(50) }, rich = { text: 'Hắn tu luyện, linh khí cuộn vào đan điền, đột phá cảnh giới Luyện Khí tầng hai. '.repeat(5) };
  const st = { chapters: [quiet, quiet, quiet], realmLadder: 'Luyện Khí, Trúc Cơ' };
  assert.strictEqual(F.mainThreadDrift(st, 4), 3); assert.ok(F.chapterCraftPlanBlock(st, 4).includes('MẠCH CHÍNH ĐÃ BỊ BỎ QUÊN'));
  assert.strictEqual(F.mainThreadDrift({ chapters: [quiet, quiet, rich], realmLadder: '' }, 4), 0);
  assert.ok(F.prosePatternGate(st, 4, quiet.text).warn.some(x => x.includes('Mạch chính')));
});
t('prompt kế hoạch chèn khối craftPlanBlock', () => { const p = F.buildChapterPlanPrompt({ chapterNumber: 6, context: 'c', recent: 'r', directive: 'd', mainCharName: 'Bùi Lạc', craftPlanBlock: F.chapterCraftPlanBlock({ chapters: [] }, 6) }); assert.ok(p.includes('THAY ĐỔI QUAN HỆ') && p.includes('TỰ QUYẾT ĐỊNH')); });
t('hướng dẫn tránh cụm sáo có nhắc luân phiên biệt danh', () => assert.ok(F.overusedPhraseGuide({}).includes('luân phiên')));
t('client + worker truyền craftPlanBlock', () => { const c = fs.readFileSync(path.join(__dirname, '../app/client.js'), 'utf8'), w = fs.readFileSync(path.join(__dirname, '../netlify/functions/write-chapter-background.js'), 'utf8'); assert.ok(/craftPlanBlock: chapterCraftPlanBlock\(state, chapterNumber\)/.test(c) && /craftPlanBlock: chapterCraftPlanBlock\(state, chapterNumber\)/.test(w)); });
const REAL = '/mnt/user-data/attachments/2715c23c-f06e-5342-ab65-5b57b1080754/34cde3fb-Truye__n-1.json';
if (fs.existsSync(REAL)) t('trên truyện thật: thống kê cổng', () => {
  const ch = JSON.parse(fs.readFileSync(REAL, 'utf8')).chapters; let e = 0; ch.forEach(c => { if (F.endingHookCheck(c.text).summary) e++; });
  console.log('   kết chương kiểu tóm tắt: ' + e + '/30'); assert.ok(e >= 3);
});
process.exit(bad ? 1 : 0);
