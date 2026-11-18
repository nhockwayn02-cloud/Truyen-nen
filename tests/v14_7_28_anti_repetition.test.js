// V14.7.28: chống văn máy móc — cụm sáo lặp, kiểu mở chương.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(core + '\n;this.f={detectOverusedPhrases,overusedPhraseGuide,prosePatternGate,openingKind,chapterOpeningVariationBlock,buildVocabularyBlockFrom,buildAdaptiveSceneWritePrompt};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const filler = ' Chiếc bàn gỗ đặt cạnh cửa sổ, ngoài kia xe cộ chạy qua đều đều và ánh đèn đường vàng nhạt. Im lặng. Hắn thở ra.'.repeat(140);
const mk = (open, extra) => open + filler + (extra || '');
const chap = (open, extra) => ({ text: mk(open, extra) });
const SAMPLE = ' Cô run rẩy, nhục nhã, hơi thở nóng hổi, cô hít một hơi thật sâu, một luồng điện chạy dọc sống lưng, mồ hôi rịn ra, tê dại.';
const prevs = [chap('Bùi Lạc đứng im trong góc hành lang.', ' Bùi Bùi Lạc ra lệnh giọng trầm thấp.'), chap('Bùi Lạc tiến lại gần Quỳnh Anh.', ' Bùi Lạc ra lệnh giọng trầm thấp.'), chap('Quỳnh Anh thức dậy trong căn hộ.', ' Bùi Lạc ra lệnh giọng trầm thấp.')];
t('phát hiện cụm lặp ≥3 chương', () => { const r = F.detectOverusedPhrases(prevs, 10); assert.ok(r.some(x => x.includes('lạc ra lệnh giọng')), JSON.stringify(Array.from(r))); });
t('ít hơn 3 chương thì không đoán', () => assert.strictEqual(F.detectOverusedPhrases(prevs.slice(0, 2), 10).length, 0));
t('khối Từ vựng luôn có danh sách cụm sáo, kể cả khi ô từ vựng trống', () => { const b = F.buildVocabularyBlockFrom({ vocabulary: {}, chapters: prevs }); assert.ok(b.includes('run rẩy') && b.includes('hít một hơi thật sâu') && b.includes('KHÔNG dùng lại')); });
t('cổng: lặp quá gấp đôi → lỗi nặng, nêu cụm và số lần', () => { const g = F.prosePatternGate({ chapters: [] }, 1, mk('Tiếng chuông cửa vang lên.', SAMPLE.repeat(12))); assert.ok(g.hard.length && g.hard[0].includes('run rẩy')); });
t('cổng: vượt nhẹ → chỉ cảnh báo, không chặn', () => { const g = F.prosePatternGate({ chapters: [] }, 1, mk('Tiếng chuông cửa vang lên.', ' Cô run rẩy.'.repeat(6))); assert.strictEqual(g.hard.length, 0); assert.ok(g.warn.some(x => x.includes('run rẩy'))); });
t('cổng: văn sạch → không cảnh báo', () => { const g = F.prosePatternGate({ chapters: [] }, 1, mk('Tiếng chuông cửa vang lên.')); assert.strictEqual(g.hard.length + g.warn.length, 0); });
t('kiểu mở chương: nhận diện', () => { assert.strictEqual(F.openingKind('“Mở cửa.” Hắn nói.'), 'thoại'); assert.strictEqual(F.openingKind('Bùi Lạc đứng im.'), 'nhân vật+động từ'); assert.strictEqual(F.openingKind('Tiếng chuông cửa vang.'), 'thời gian/âm thanh'); });
t('mở giống chương trước → cảnh báo', () => { const g = F.prosePatternGate({ chapters: prevs }, 4, mk('Quỳnh Anh thức dậy trong phòng khác.')); assert.ok(g.warn.some(x => x.includes('Mở chương'))); });
t('3 chương liền mở "nhân vật+động từ" → cảnh báo', () => { const p2 = [chap('Bùi Lạc đứng im.'), chap('Quỳnh Anh bước vào.')]; const g = F.prosePatternGate({ chapters: p2 }, 3, mk('Minh Châu ngồi xuống ghế.')); assert.ok(g.warn.some(x => x.includes('liền'))); });
t('mở bằng thoại → không cảnh báo mở chương', () => { const g = F.prosePatternGate({ chapters: prevs }, 4, mk('“Mở cửa ra.” Tiếng gõ vang lên.')); assert.ok(!g.warn.some(x => /^Mở chương|^3 chương liền/.test(x))); });
t('prompt scene mở chương có khối KIỂU MỞ CHƯƠNG; scene giữa chương thì không', () => {
  const o = { state: { chapters: prevs }, scene: { targetWords: 500, characters: [] }, isOpeningScene: true };
  assert.ok(F.buildAdaptiveSceneWritePrompt(o).includes('KIỂU MỞ CHƯƠNG'));
  assert.ok(!F.buildAdaptiveSceneWritePrompt(Object.assign({}, o, { isOpeningScene: false })).includes('KIỂU MỞ CHƯƠNG'));
});
t('client + worker đã nối cổng vào review', () => {
  const c = fs.readFileSync(path.join(__dirname, '../app/client.js'), 'utf8'), w = fs.readFileSync(path.join(__dirname, '../netlify/functions/write-chapter-background.js'), 'utf8');
  assert.ok(c.includes('og.hard,pg.hard') && w.includes('og.hard, pg.hard'));
});
const REAL = '/mnt/user-data/attachments/2715c23c-f06e-5342-ab65-5b57b1080754/34cde3fb-Truye__n-1.json';
if (fs.existsSync(REAL)) t('trên truyện thật (30 chương): bắt được "run rẩy" và lỗi mở chương', () => {
  const d = JSON.parse(fs.readFileSync(REAL, 'utf8')); const ch = d.chapters;
  const g = F.prosePatternGate({ chapters: ch.slice(0, 14) }, 15, ch[14].text);
  const bad = ch.slice(1).map((c, i) => F.prosePatternGate({ chapters: ch.slice(0, i + 1) }, i + 2, c.text)).filter(x => x.hard.length || x.warn.length).length;
  assert.ok(bad >= 20, 'chỉ ' + bad + '/29 chương bị gắn cờ'); assert.ok(F.detectOverusedPhrases(ch, 10).length >= 3);
});
process.exit(bad ? 1 : 0);
