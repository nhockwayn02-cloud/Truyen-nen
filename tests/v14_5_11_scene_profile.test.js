// V14.5.11: prompt viết scene phải chứa hồ sơ nhân vật có mặt (chức vụ, nơi ở, mức sống...) để không bịa nghề/nhà.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={sceneProfileBlock,buildAdaptiveSceneWritePrompt,buildSceneFixPrompt};', ctx);
const T = ctx.__t; let pass = 0; const t = (n, f) => { f(); console.log('PASS ' + n); pass++; };
const st = { mainCharProfile: { name: 'Bùi Lạc', occupation: 'Bảo vệ', gender: 'Nam' }, characters: [
  { name: 'Trần Mỹ Duyên', position: 'Thư ký riêng của chủ tịch', residence: 'Căn hộ cao cấp tầng 20', notes: 'Sống một mình, gu sang trọng', gender: 'Nữ' },
  { name: 'Lâm Tịnh Nhã', position: 'Chủ tịch', gender: 'Nữ' }, { name: 'Người Chết', dead: true, position: 'x' }] };
t('có hồ sơ: chức vụ + nơi ở + ghi chú của đúng nhân vật trong scene; không lấy nhân vật vắng mặt', () => {
  const b = T.sceneProfileBlock(st, { characters: ['Mỹ Duyên', 'Bùi Lạc'] }, []);
  assert.ok(/Thư ký riêng của chủ tịch/.test(b) && /Căn hộ cao cấp tầng 20/.test(b) && /Sống một mình/.test(b) && /Bảo vệ/.test(b));
  assert.ok(!/Lâm Tịnh Nhã/.test(b) && !/Người Chết/.test(b));
  assert.ok(/không thành người giúp việc/.test(b));
});
t('scene không ghi nhân vật -> dùng allowed cast; không có hồ sơ -> rỗng', () => {
  assert.ok(/Thư ký riêng/.test(T.sceneProfileBlock(st, { characters: [] }, ['Trần Mỹ Duyên'])));
  assert.strictEqual(T.sceneProfileBlock(st, { characters: ['Ai Đó'] }, []), ''); assert.strictEqual(T.sceneProfileBlock({}, { characters: ['A'] }, []), '');
});
t('prompt viết scene và prompt vá đều chứa khối hồ sơ', () => {
  const p = T.buildAdaptiveSceneWritePrompt({ state: st, scene: { id: 'S1', characters: ['Mỹ Duyên'], targetWords: 900 }, allowedCast: 'Trần Mỹ Duyên, Bùi Lạc' });
  assert.ok(/HỒ SƠ KHÓA CỦA NHÂN VẬT TRONG SCENE/.test(p) && /Căn hộ cao cấp/.test(p));
  const f = T.buildSceneFixPrompt({ scene: { id: 'S1' }, text: 'abc', errors: ['MUST_CHANGE: x'], profile: T.sceneProfileBlock(st, { characters: ['Mỹ Duyên'] }, []) });
  assert.ok(/Căn hộ cao cấp/.test(f));
});
t('V14.5.12: Current Status tích lũy (nơi ở, công việc, trang phục) cũng vào prompt scene; không có hồ sơ gốc vẫn có khối trạng thái', () => {
  const st2 = Object.assign({}, st, { statusState: { characterStates: [{ name: 'Trần Mỹ Duyên', status: 'unchanged', changes: { occupation: 'Thư ký riêng của chủ tịch', residence: 'Căn hộ cao cấp tầng 20', clothing: 'Váy công sở xám', publicPersonality: 'Điềm tĩnh, chuyên nghiệp' } }] } });
  const b = T.sceneProfileBlock(st2, { characters: ['Mỹ Duyên'] }, []);
  assert.ok(/TRẠNG THÁI HIỆN TẠI/.test(b) && /nơi ở hiện tại: Căn hộ cao cấp tầng 20/.test(b) && /Váy công sở xám/.test(b) && /Điềm tĩnh/.test(b));
  const onlyStatus = T.sceneProfileBlock({ statusState: st2.statusState, characters: [{ name: 'Trần Mỹ Duyên' }] }, { characters: ['Mỹ Duyên'] }, []);
  assert.ok(/TRẠNG THÁI NHÂN VẬT TRONG SCENE/.test(onlyStatus) && /Căn hộ cao cấp/.test(onlyStatus));
});
console.log('OK ' + pass + ' test');
