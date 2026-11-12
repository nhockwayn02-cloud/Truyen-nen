// V14.7.16: cảnh nóng có nội tâm + hồi tưởng xen kẽ và không bị cắt sang cảnh khác giữa chừng.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={EROTIC_INNER_CRAFT,SCENE_ADULT_BODY_ANCHOR,appearanceAnchorPrompt,buildChapterPlanPrompt};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
t('EROTIC_INNER_CRAFT: nội tâm hai phía, hồi tưởng 1–3 câu, tỉ lệ, không cắt cảnh', () => {
  const c = F.EROTIC_INNER_CRAFT; ['hành động → nội tâm → hành động', 'CẢ HAI phía', 'HỒI TƯỞNG 1–3 câu', '1/4–1/3', 'KHÔNG CẮT CẢNH', 'tu luyện', 'LỒNG vào ngay trong cảnh', 'SAU khi cảnh nóng'].forEach(k => assert.ok(c.includes(k), k));
});
t('neo cơ thể 18+ và đường viết thường (mature) mang nội tâm + không cắt cảnh', () => {
  assert.ok(F.SCENE_ADULT_BODY_ANCHOR.includes('NỘI TÂM VÀ MẠCH CẢNH 18+')); assert.ok(F.appearanceAnchorPrompt({ mature: true }, true).includes('NỘI TÂM VÀ MẠCH CẢNH 18+')); assert.ok(!F.appearanceAnchorPrompt({ mature: false }, false).includes('NỘI TÂM VÀ MẠCH CẢNH 18+'));
});
t('kế hoạch chương: beat giữa lúc quan hệ không thành cảnh riêng', () => {
  const p = F.buildChapterPlanPrompt({ chapterNumber: 3, context: 'c', recent: 'r', directive: 'd', mainCharName: 'A', mature: true, matureFocus: 'primary' });
  assert.match(p, /KHÔNG được thành cảnh riêng chen giữa/); assert.match(p, /LỒNG trong chính cảnh nóng/);
  assert.ok(!/KHÔNG được thành cảnh riêng chen giữa/.test(F.buildChapterPlanPrompt({ chapterNumber: 3, context: 'c', recent: 'r', directive: 'd', mainCharName: 'A', mature: false })));
});
process.exit(bad ? 1 : 0);
