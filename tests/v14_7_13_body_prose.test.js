// V14.7.13: mô tả thân thể phải là văn chương (hình ảnh/cảm giác/tương phản), không đọc số đo khô; vẫn giữ rào chắn dưới 18.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={BODY_PROSE_CRAFT,SCENE_APPEARANCE_ANCHOR,SCENE_ADULT_BODY_ANCHOR,appearanceAnchorPrompt};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
t('BODY_PROSE_CRAFT: cấm đọc số khô, có đủ 4 cách (vật thể, cảm nhận, chuyển động/vải, tương phản)', () => {
  const c = F.BODY_PROSE_CRAFT; assert.match(c, /DỮ KIỆN NGẦM/); assert.match(c, /Cấm báo cáo khô/); ['hình ảnh vật thể', 'cảm nhận của người nhìn', 'chuyển động và vải', 'tương phản'].forEach(k => assert.ok(c.includes(k), k)); assert.match(c, /đổi hẳn góc nhìn/);
});
t('neo ngoại hình, neo cơ thể 18+ và neo trong đường viết thường đều mang văn chương thân thể', () => {
  assert.ok(F.SCENE_APPEARANCE_ANCHOR.includes('VĂN CHƯƠNG THÂN THỂ')); assert.ok(F.SCENE_ADULT_BODY_ANCHOR.includes('VĂN CHƯƠNG THÂN THỂ'));
  assert.ok(F.appearanceAnchorPrompt({ mature: true }, true).includes('VĂN CHƯƠNG THÂN THỂ'));
});
t('không còn ép "bằng con số"; vẫn dịch số liệu hồ sơ thành hình ảnh', () => {
  assert.ok(!/bằng con số hoặc so sánh cụ thể\. Cấm tính từ trống/.test(F.SCENE_APPEARANCE_ANCHOR)); assert.match(F.SCENE_ADULT_BODY_ANCHOR, /DỊCH thành hình ảnh và cảm giác/);
});
t('rào chắn tuổi vẫn còn trong neo ngoại hình 18+', () => { assert.match(F.appearanceAnchorPrompt({ mature: true }, true), /dưới 18 tuổi hoặc không rõ tuổi: KHÔNG tả số đo/); });
process.exit(bad ? 1 : 0);
