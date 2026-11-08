// V14.7.5: giới hạn nhân vật có tên không được bóp nghẹt dàn nhân vật: mặc định nới, tác giả chỉnh được trong giao diện, prompt khuyến khích đặt tên người lặp lại.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'shared/core.js'), 'utf8'), client = fs.readFileSync(path.join(root, 'app/client.js'), 'utf8'), html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), worker = fs.readFileSync(path.join(root, 'netlify/functions/write-chapter-background.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(core + '\n;this.__t={normalizeStoryControl,buildChapterPlanPrompt,evaluateReview};', ctx);
const T = ctx.__t; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const cap = sc => T.normalizeStoryControl({ storyControl: sc }).maxNamedCharacters;
t('truyện chưa chỉnh tay (kể cả giá trị 4 cũ do mặc định cũ lưu lại) dùng mức mặc định mới ≥ 6', () => { assert.ok(cap({}) >= 6); assert.ok(cap({ maxNamedCharacters: 4 }) >= 6); assert.ok(cap(undefined) >= 6); });
t('tác giả tự chọn thì được tôn trọng đúng giá trị, trần 12', () => { assert.equal(cap({ maxNamedCharacters: 4, castCapUserSet: true }), 4); assert.equal(cap({ maxNamedCharacters: 10, castCapUserSet: true }), 10); assert.equal(cap({ maxNamedCharacters: 99, castCapUserSet: true }), 12); assert.equal(cap({ maxNamedCharacters: 0, castCapUserSet: true }), 6); });
t('prompt lập kế hoạch dùng đúng giới hạn tác giả chọn (không bị kẹp ở 6)', () => { const p = T.buildChapterPlanPrompt({ maxNamedCharacters: 10, directive: 'x' }); assert.match(p, /TỐI ĐA 10 NHÂN VẬT CÓ TÊN/); });
t('Gate chỉ báo lỗi cứng khi vượt giới hạn hiện hành', () => {
  const r = n => T.evaluateReview({ namedCharacterCount: n, hardFailures: [], warnings: [], score: 95 }, { maxNamedCharacters: 6 });
  assert.ok(!JSON.stringify(r(5)).includes('Vượt số nhân vật')); assert.ok(JSON.stringify(r(7)).includes('Vượt số nhân vật'));
});
t('giao diện có ô chọn số nhân vật có tên tối đa và được lưu vào storyControl với castCapUserSet', () => {
  assert.match(html, /id="maxNamedChars"/); assert.match(client, /\$ID\("maxNamedChars"\)[\s\S]{0,400}castCapUserSet\s*=\s*true/); assert.match(client, /\$ID\("maxNamedChars"\)[\s\S]{0,200}maxNamedCharacters/);
});
t('truyện mới mặc định 6, và prompt không còn ép "ưu tiên KHÔNG TÊN" cho mọi người ngoài NVC', () => {
  assert.ok(!/maxNamedCharacters:4/.test(client.slice(client.indexOf('storyControl:{schemaVersion:1,maxMainEvents:2'), client.indexOf('storyControl:{schemaVersion:1,maxMainEvents:2') + 120)));
  assert.ok(!/ưu tiên nhân vật KHÔNG TÊN RIÊNG/.test(client)); assert.match(client, /vai trò lặp lại[\s\S]{0,200}ĐẶT TÊN/);
});
t('client và worker dùng cùng chuẩn hóa (đã đồng bộ)', () => { assert.ok(/Math\.min\(12, Number\(sc\.maxNamedCharacters\)/.test(client) || /castCapUserSet/.test(client)); assert.ok(/castCapUserSet/.test(worker)); });
process.exit(bad ? 1 : 0);
