// V14.4.2: Outline đứng CUỐI prompt lập kế hoạch + gợi ý hạ cấp; đối chiếu beat Outline với truyện (0 token).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={buildAdaptiveScenePlanPrompt,outlineMissingBeats,outlineBeatSegments};', ctx);
const T = ctx.__t; let pass = 0; const t = (n, f) => { f(); console.log('PASS ' + n); pass++; };
const cc = { chapterNumber: 6, arcGoal: 'a', chapterOutline: 'OUT', requiredBeats: ['x'], allowedCharacters: [], forbiddenDrift: [] };
t('prompt kế hoạch: Outline lock + checklist nằm SAU gợi ý/mệnh lệnh (cuối prompt); gợi ý hạ cấp và bị cắt 2500', () => {
  const p = T.buildAdaptiveScenePlanPrompt({ state: {}, chapterContract: cc, arcProgress: 'ARCP', requiredBeats: 'REQB', context: 'CTX', recent: 'REC', directive: 'DIR', hint: 'H'.repeat(4000) });
  const at = k => p.indexOf(k);
  assert.ok(at('Bối cảnh/canon') < at('Mệnh lệnh người dùng') && at('Mệnh lệnh người dùng') < at('Gợi ý chương sau'));
  assert.ok(at('Gợi ý chương sau') < at('THỨ TỰ ƯU TIÊN') && at('THỨ TỰ ƯU TIÊN') < at('ARC/OUTLINE LOCK') && at('ARC/OUTLINE LOCK') < at('REQUIRED BEAT CHECKLIST'));
  assert.ok(/THẤP HƠN Outline/.test(p) && !/Gợi ý người dùng:/.test(p));
  assert.ok(p.split('H'.repeat(2500))[1].indexOf('H') !== 0 && !p.includes('H'.repeat(2501)));
  assert.ok(p.trim().endsWith('REQB'));
});
t('prompt kế hoạch: thiếu hint/directive vẫn dựng đúng và không lỗi cú pháp mảng', () => {
  const p = T.buildAdaptiveScenePlanPrompt({ state: {}, chapterContract: cc, requiredBeats: 'REQB' });
  assert.ok(/THỨ TỰ ƯU TIÊN/.test(p) && p.trim().endsWith('REQB'));
});
const OUT = 'Tự hành hạSự kiện: Hà quan sát biệt thự Song Hành. Bắt Lan tự nói câu “tôi là người của kho”; Móc kết: Hà lau mặt cho Lan rồi cho về.';
t('tách beat: bỏ tiêu đề, tách theo nhãn/; và bỏ nhãn', () => {
  const segs = T.outlineBeatSegments(OUT);
  assert.deepStrictEqual(Array.from(segs), ['Hà quan sát biệt thự Song Hành', 'Bắt Lan tự nói câu “tôi là người của kho”', 'Hà lau mặt cho Lan rồi cho về']);
});
t('đối chiếu: beat không thấy trong truyện bị liệt kê; beat đã có thì không', () => {
  const text = 'Hà đứng nhìn biệt thự Song Hành từ xa suốt buổi tối, ghi chép từng ô cửa sổ.';
  const miss = T.outlineMissingBeats(OUT, text, ['Hà', 'Lan']);
  assert.deepStrictEqual(Array.from(miss), ['Bắt Lan tự nói câu “tôi là người của kho”']);
  const full = text + ' Hà bắt Lan tự nói to rằng tôi là người của kho, rồi lau mặt cho cô.';
  assert.deepStrictEqual(Array.from(T.outlineMissingBeats(OUT, full, ['Hà', 'Lan'])), []);
});
t('tên nhân vật không làm tăng độ phủ ảo; outline rỗng -> không báo gì', () => {
  const miss = T.outlineMissingBeats('Sự kiện: Hà gặp Lan tại kho vắng người', 'Hà và Lan đi dạo.', ['Hà', 'Lan']);
  assert.strictEqual(miss.length, 1);
  assert.deepStrictEqual(Array.from(T.outlineMissingBeats('', 'abc', [])), []);
});
console.log('OK ' + pass + ' test');
// ---- V14.4.3
{
  const t2 = (n, f) => { f(); console.log('PASS ' + n); };
  t2('prompt kế hoạch: sự kiện chính Outline phải đủ, vẫn được thêm tình tiết phụ; THREADS chỉ tham khảo', () => {
    const p = T.buildAdaptiveScenePlanPrompt({ state: {}, chapterContract: cc, requiredBeats: 'REQB' });
    assert.ok(/MỌI sự kiện chính của Outline PHẢI có mặt và được viết ĐẦY ĐỦ/.test(p) && /vẫn được thêm chi tiết/.test(p) && /THREADS\/FORESHADOWING chỉ là bối cảnh tham khảo/.test(p));
  });
  t2('buildContextBlock có dòng LƯU Ý ƯU TIÊN cho THREADS/FORESHADOWING (cả bản mirror của worker)', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8'), wk = fs.readFileSync(path.join(__dirname, '../netlify/functions/write-chapter-background.js'), 'utf8');
    [html, wk].forEach(x => assert.ok(x.includes('LƯU Ý ƯU TIÊN: THREADS / FORESHADOWING / TIMELINE / KIẾN THỨC')));
    assert.ok(html.indexOf('LƯU Ý ƯU TIÊN: THREADS') < html.indexOf('"THREADS:\\n"'));
  });
}
