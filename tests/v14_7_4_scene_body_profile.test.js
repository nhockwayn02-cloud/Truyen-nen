// V14.7.4: scene phải nhận hồ sơ hình thể (chiều cao, dáng, số đo, tóc, mắt, da...) + chỉ dẫn neo ngoại hình, để không tả "căng thẳng/bó sát" chung chung.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={sceneProfileBlock,buildAdaptiveSceneWritePrompt};', ctx);
const T = ctx.__t; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const hero = { name: 'Thanh Hà', age: '27', gender: 'Nữ', appearance: 'Thư ký, vẻ ngoài nền nã', height: '1m68', bodyType: 'đồng hồ cát, eo thon', measurements: '92-60-95, ngực cup D đầy, nảy', hair: 'tóc đen dài ngang lưng', eyes: 'mắt hai mí', skin: 'da trắng ngà', voice: 'giọng trầm khàn', scent: 'hương hoa nhài', style: 'váy bút chì', scars: 'sẹo nhỏ dưới cằm', tattoos: 'xăm nhỏ ở cổ tay' };
const st = { mature: true, characters: [hero, { name: 'Phụ', age: '30', gender: 'Nam' }] };
t('hồ sơ scene có chiều cao/dáng/SỐ ĐO/tóc/mắt/da/giọng/mùi/sẹo/xăm của nhân vật có mặt', () => {
  const b = T.sceneProfileBlock(st, { characters: ['Thanh Hà'] }, []);
  for (const x of ['1m68', 'đồng hồ cát', '92-60-95', 'cup D', 'tóc đen dài', 'hai mí', 'da trắng ngà', 'trầm khàn', 'hoa nhài', 'sẹo nhỏ', 'xăm nhỏ']) assert.ok(b.includes(x), 'thiếu: ' + x);
});
t('ngoại hình dài không bị cắt cụt ở 110 ký tự', () => {
  const long = Object.assign({}, hero, { appearance: 'A'.repeat(100) + ' đặc điểm nhận dạng quan trọng ở cuối câu mô tả' });
  assert.ok(T.sceneProfileBlock({ characters: [long] }, { characters: ['Thanh Hà'] }, []).includes('đặc điểm nhận dạng'));
});
t('5 nhân vật đầy đủ hồ sơ vẫn không mất hồ sơ của nhân vật thứ 5 do giới hạn tổng', () => {
  const chars = Array.from({ length: 5 }, (_, i) => Object.assign({}, hero, { name: 'NV' + (i + 1), measurements: 'SODO' + (i + 1) + ' ' + 'x'.repeat(40) }));
  const b = T.sceneProfileBlock({ characters: chars }, { characters: chars.map(c => c.name) }, []);
  assert.ok(b.includes('SODO5'), 'nhân vật thứ 5 bị cắt mất');
});
t('prompt scene có chỉ dẫn NEO NGOẠI HÌNH: dùng đúng hồ sơ, cấm tính từ trống thay cho hình thể', () => {
  const p = T.buildAdaptiveSceneWritePrompt({ state: st, scene: { id: 'S1', characters: ['Thanh Hà'], targetWords: 900 }, allowedCast: 'Thanh Hà' });
  assert.match(p, /NEO NGOẠI HÌNH/); assert.match(p, /tính từ trống/); assert.match(p, /SỐ ĐO|số đo/); assert.ok(p.includes('92-60-95'));
});
t('không có nhân vật nào trong scene thì không chèn khối ngoại hình', () => {
  const p = T.buildAdaptiveSceneWritePrompt({ state: st, scene: { id: 'S1', characters: [], targetWords: 900 }, allowedCast: '' });
  assert.ok(!/NEO NGOẠI HÌNH/.test(p));
});
process.exit(bad ? 1 : 0);
