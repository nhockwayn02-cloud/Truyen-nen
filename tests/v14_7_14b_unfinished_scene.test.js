// V14.7.14b: chương trước dừng giữa cảnh nóng -> chương sau được dặn viết tiếp ngay; cảnh đã kết thì không.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={unfinishedHotSceneNote};this.h=textHasNsfwKeyword;', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
t('đuôi chương đang giữa cảnh nóng -> có lưu ý viết tiếp ngay', () => { const n = F.unfinishedHotSceneNote('Hắn đẩy sâu hơn, ả cong người, rên lên trong khi hắn bắt ả nhìn thẳng vào mắt. Hắn vẫn đâm chậm, sâu.'); assert.match(n, /GIỮA cảnh nóng/); assert.match(n, /viết tiếp NGAY/); });
t('cảnh đã tới cao trào/kết -> không thêm lưu ý', () => { assert.equal(F.unfinishedHotSceneNote('Hắn đâm mạnh rồi xuất ra bên trong, ả run lên bần bật và thở dốc.'), ''); });
t('đuôi chương không phải cảnh nóng -> không thêm', () => { assert.equal(F.unfinishedHotSceneNote('Cô bước vào phòng họp, mở máy tính và bắt đầu báo cáo.'), ''); assert.equal(F.unfinishedHotSceneNote(''), ''); });
t('cả hai prompt dùng prevEnding đều gắn lưu ý', () => { assert.equal((core.match(/unfinishedHotSceneNote\(p\.prevEnding\)/g) || []).length, 2); });
t('từ khóa thật trong Outline của người dùng được nhận là cảnh nóng', () => {
  ['Phá trinh trong nhà để xe, tư thế quỳ cúi', 'dùng ngón tay và miệng kích thích đến khi run rẩy', 'Buổi trưa gọi vào kho tài liệu bắt bú', 'Edging dài trên giường', 'Buộc đeo trứng rung nhỏ đi làm', 'nước dâm chảy lênh láng'].forEach(x => assert.ok(ctx.h(x), x));
});
t('câu thường không bị nhận nhầm', () => { ['Cô bước vào phòng họp báo cáo doanh thu quý', 'Hắn rút kiếm đâm vào bóng tối, linh khí dao động', 'Bé bú sữa ở phòng bên'.replace('bú sữa', 'uống sữa')].forEach(x => assert.ok(!ctx.h(x), x)); });
process.exit(bad ? 1 : 0);
