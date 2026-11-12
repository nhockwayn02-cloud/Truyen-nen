// V14.7.17: cung cảm xúc (kháng cự -> phản bội -> điểm gãy -> day dứt) + kỹ thuật điều khiển nhịp/trì hoãn.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={EROTIC_ARC_PACING_CRAFT,SCENE_ADULT_BODY_ANCHOR,appearanceAnchorPrompt,buildChapterPlanPrompt};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
t('có đủ 4 nấc cảm xúc, hai mạch thể xác/ý chí và không đổ quá nhanh', () => {
  const c = F.EROTIC_ARC_PACING_CRAFT; ['kháng cự', 'cơ thể phản bội', 'ĐIỂM GÃY', 'DAY DỨT SAU KHI ĐỔ', 'HAI mạch riêng', 'không để nhân vật đổ quá nhanh', 'không xóa sự khước từ'].forEach(k => assert.ok(c.toLowerCase().includes(k.toLowerCase()), k));
});
t('căng thẳng = trì hoãn có chủ đích, mỗi lần khác nhau, và pacing ghìm/đẩy', () => {
  const c = F.EROTIC_ARC_PACING_CRAFT; ['TRÌ HOÃN CÓ CHỦ ĐÍCH', 'mỗi lần trì hoãn phải KHÁC nhau', 'GHÌM người đọc', 'ĐẨY tới', 'ĐIỀU KHIỂN TỐC ĐỘ'].forEach(k => assert.ok(c.includes(k), k));
});
t('gắn vào neo 18+ của scene, đường viết thường (mature) và kế hoạch chương', () => {
  assert.ok(F.SCENE_ADULT_BODY_ANCHOR.includes('CUNG CẢM XÚC VÀ NHỊP 18+')); assert.ok(F.appearanceAnchorPrompt({ mature: true }, true).includes('CUNG CẢM XÚC VÀ NHỊP 18+')); assert.ok(!F.appearanceAnchorPrompt({ mature: false }, false).includes('CUNG CẢM XÚC VÀ NHỊP 18+'));
  const p = F.buildChapterPlanPrompt({ chapterNumber: 3, context: 'c', recent: 'r', directive: 'd', mainCharName: 'A', mature: true, matureFocus: 'primary' });
  assert.match(p, /KHÔNG để nhân vật đổ quá nhanh/); assert.match(p, /day dứt sau khi đổ phải có chỗ/);
});
process.exit(bad ? 1 : 0);
