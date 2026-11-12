// V14.7.14: cảnh nóng tả từng hành động (lực, tốc độ, cảm giác, âm thanh, phản ứng) + cảnh nóng được nhiều ngân sách từ hơn.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={EROTIC_ACTION_CRAFT,SCENE_ADULT_BODY_ANCHOR,appearanceAnchorPrompt,sceneProfileWithAnchor};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
t('EROTIC_ACTION_CRAFT yêu cầu đủ 5 yếu tố mỗi hành động và nhịp từng đoạn', () => {
  const c = F.EROTIC_ACTION_CRAFT; ['LỰC và TỐC ĐỘ', 'CẢM GIÁC DA THỊT', 'ÂM THANH', 'PHẢN ỨNG CƠ THỂ', 'dừng một nhịp', 'không gộp nhiều hành động'].forEach(k => assert.ok(c.includes(k), k));
});
t('neo cơ thể 18+ và neo đường viết thường (chỉ khi mature) mang quy tắc hành động', () => {
  assert.ok(F.SCENE_ADULT_BODY_ANCHOR.includes('TẢ TỪNG HÀNH ĐỘNG 18+')); assert.ok(F.appearanceAnchorPrompt({ mature: true }, true).includes('TẢ TỪNG HÀNH ĐỘNG 18+')); assert.ok(!F.appearanceAnchorPrompt({ mature: false }, false).includes('TẢ TỪNG HÀNH ĐỘNG 18+'));
});
t('scene thường không nhận quy tắc hành động 18+', () => {
  const st = { mature: true, mainCharProfile: { name: 'A', age: '30' }, characters: [{ name: 'B', age: '28' }] };
  assert.ok(!F.sceneProfileWithAnchor(st, { characters: ['A', 'B'], beat: 'họp bàn dự án' }, ['A', 'B']).includes('TẢ TỪNG HÀNH ĐỘNG 18+'));
  assert.ok(F.sceneProfileWithAnchor(st, { characters: ['A', 'B'], beat: 'cảnh nóng: bắt ả cởi đồ' }, ['A', 'B']).includes('TẢ TỪNG HÀNH ĐỘNG 18+'));
});
t('cảnh nóng được chia ngân sách từ lớn hơn cảnh thường cùng độ dài beat', () => { assert.match(core, /textHasNsfwKeyword\(g\.map\(x => x\.text\)\.join\(' '\)\) \? 1\.6 : 1/); });
process.exit(bad ? 1 : 0);
