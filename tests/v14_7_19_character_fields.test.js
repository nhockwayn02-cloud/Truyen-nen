// V14.7.19: vai trò / quan hệ / ranh giới 18+ / nhân vật chính phải cập nhật từ chương.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={INTERPRETIVE_CHAR_FIELDS,fieldQuoteSupports,fieldEvidenceSupports,divertLockedDetail,applyMainCharUpdate};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const SRC = 'Quỳnh Anh run rẩy, siết chặt mép bàn: "Đừng ở đây... lỡ có người thấy thì em chết mất." Bùi Lạc chỉ cười, không buông tay.';
t('trường diễn giải: chỉ cần câu trích thật trong chương (tóm tắt không trùng từ vẫn qua)', () => {
  const ev = 'Đừng ở đây... lỡ có người thấy thì em chết mất.';
  assert.ok(F.fieldQuoteSupports('Sợ bị bắt gặp nơi công sở, ranh giới là phải kín đáo', ev, SRC));
  assert.ok(!F.fieldEvidenceSupports('Sợ bị bắt gặp nơi công sở, ranh giới là phải kín đáo', ev, SRC, 0.35), 'cổng cũ vẫn làm rụng (xác nhận nguyên nhân)');
});
t('câu trích bịa / rỗng vẫn bị loại', () => {
  assert.ok(!F.fieldQuoteSupports('x y z', 'Câu này không hề có trong chương nào cả', SRC));
  assert.ok(!F.fieldQuoteSupports('x y z', '', SRC)); assert.ok(!F.fieldQuoteSupports('', 'Đừng ở đây... lỡ có người thấy', SRC));
});
t('danh sách trường diễn giải gồm vai trò, quan hệ và toàn bộ trường 18+', () => {
  ['role', 'relevanceToMC', 'sexualExperience', 'boundaries', 'taboos', 'preferences', 'attractionToMC', 'tensionWithMC', 'consentNotes'].forEach(k => assert.ok(F.INTERPRETIVE_CHAR_FIELDS.includes(k), k));
});
t('role đã khóa: vai trò mới vào "Chi tiết mới", không ghi đè', () => {
  const c = { role: 'Thư ký', newDetails: '' }; assert.ok(F.divertLockedDetail(c, 'role', 'Tình nhân bí mật của sếp'));
  assert.strictEqual(c.role, 'Thư ký'); assert.match(c.newDetails, /Vai trò mới: Tình nhân bí mật/); assert.ok(!F.divertLockedDetail(c, 'role', 'Tình nhân bí mật của sếp'), 'không lặp');
});
t('nhân vật chính nhận cập nhật 18+ (nối ý, không ghi đè) và bị chặn nếu < 18 tuổi', () => {
  const p = { name: 'Bùi Lạc', age: '30', preferences: 'thích kiểm soát', boundaries: '' };
  assert.ok(F.applyMainCharUpdate(p, { sexualExperience: 'từng trải', boundaries: 'không để lộ thân phận', preferences: 'thích trì hoãn' }, null, {}));
  assert.strictEqual(p.sexualExperience, 'từng trải'); assert.strictEqual(p.boundaries, 'không để lộ thân phận'); assert.match(p.preferences, /thích kiểm soát; thích trì hoãn/);
  const k = { name: 'X', age: '16', boundaries: '' }; F.applyMainCharUpdate(k, { boundaries: 'abc' }, null, {}); assert.strictEqual(k.boundaries, '', 'rào chắn tuổi');
});
t('worker dùng cổng câu trích cho trường diễn giải và quan hệ', () => {
  const w = fs.readFileSync(path.join(__dirname, '../netlify/functions/write-chapter-background.js'), 'utf8');
  assert.ok(w.includes('INTERPRETIVE_CHAR_FIELDS.includes(field) ? fieldQuoteSupports')); assert.ok(w.includes('fieldQuoteSupports(rel[field]')); assert.ok(w.includes('fieldQuoteSupports(val, evidenceMap'));
  assert.ok(w.includes('if (k === "role") divertLockedDetail(c, k, u[k])'));
});
process.exit(bad ? 1 : 0);
