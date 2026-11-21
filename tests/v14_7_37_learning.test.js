// V14.7.37: sổ rút kinh nghiệm, lọc danh xưng chung, kiểm tra JSON model.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(core + '\n;this.f={lessonStats,activeLessons,lessonsBlock,isGenericAddressName,resolveCharacterTarget,jsonHealthCheck,jsonHealthPrompt,buildAdaptiveSceneWritePrompt,JSON_HEALTH_SAMPLE}', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const ch = (issues, hard) => ({ text: 'x', autoUpdateIssues: issues || [], review: { hardFailures: hard || [], warnings: [] } });
const loc = 'LOCATION_TIME: Văn bản ghi X, trái với kế hoạch là Y';
t('lỗi lặp ở ≥2 chương thành bài học; 1 lần thì chưa nhắc', () => {
  const st = { chapters: [ch([loc]), ch([]), ch([], [loc]), ch(['Thiếu hành động bắt buộc MUST_CHANGE'])] };
  const a = F.activeLessons(st); assert.strictEqual(JSON.stringify(a.map(x => x.key)), '["place"]');
  assert.strictEqual(JSON.stringify(a[0].chapters), '[1,3]');
  const b = F.lessonsBlock(st); assert.ok(/địa điểm/.test(b) && !/hành động bắt buộc/.test(b) && /chương 1, 3/.test(b));
});
t('bài học cũ (>7 chương không tái phạm) tự mờ; tắt tay và tắt hẳn được', () => {
  const chs = [ch([loc]), ch([loc])]; for (let i = 0; i < 9; i++) chs.push(ch([]));
  assert.strictEqual(F.activeLessons({ chapters: chs }).length, 0);
  const st = { chapters: [ch([loc]), ch([loc])], lessonMuted: ['place'] }; assert.strictEqual(F.lessonsBlock(st), '');
  assert.strictEqual(F.lessonsBlock({ chapters: [ch([loc]), ch([loc])], lessonsOff: true }), '');
  assert.ok(F.lessonsBlock({ chapters: [ch([loc]), ch([loc])] }).length > 20);
});
t('xóa chương -> bài học tự cập nhật (tính lại từ chương)', () => {
  const st = { chapters: [ch([loc]), ch([loc])] }; assert.ok(F.lessonsBlock(st)); st.chapters.pop(); assert.strictEqual(F.lessonsBlock(st), '');
});
t('bài học tới prompt scene, và không làm nổ prompt khi không có lỗi', () => {
  const st = { chapters: [ch([loc]), ch([loc])] };
  assert.ok(F.buildAdaptiveSceneWritePrompt({ state: st, scene: { targetWords: 500 } }).includes('RÚT KINH NGHIỆM'));
  assert.ok(!F.buildAdaptiveSceneWritePrompt({ state: { chapters: [] }, scene: { targetWords: 500 } }).includes('RÚT KINH NGHIỆM'));
});
t('danh xưng chung bị loại, tên riêng giữ', () => {
  ['Gã hàng xóm', 'Giám đốc vận hành', 'Bảo vệ', 'người qua đường'].forEach(n => assert.ok(F.isGenericAddressName(n), n));
  ['Quỳnh Anh', 'Giám đốc Hoàng', 'chị Linh', 'Lan', 'Thư ký Lan'].forEach(n => assert.ok(!F.isGenericAddressName(n), n));
  assert.strictEqual(F.resolveCharacterTarget({ characters: [], mainCharProfile: { name: 'Bùi Lạc' } }, 'Gã hàng xóm').kind, 'none');
  assert.strictEqual(F.resolveCharacterTarget({ characters: [], mainCharProfile: { name: 'Bùi Lạc' } }, 'Giám đốc Hoàng').kind, 'new');
  assert.strictEqual(F.resolveCharacterTarget({ characters: [{ id: 'a', name: 'Giám đốc vận hành' }], mainCharProfile: {} }, 'Giám đốc vận hành').kind, 'character');
});
t('kiểm tra JSON: tốt / evidence tóm lược / không phải JSON', () => {
  const good = { characters: [{ name: 'Quỳnh Anh', role: 'thư ký', evidence: 'Cô là thư ký của tổng giám đốc, kiêu ngạo', fieldEvidence: {} }] };
  assert.ok(F.jsonHealthCheck(good).ok);
  const para = { characters: [{ name: 'Quỳnh Anh', evidence: 'Quỳnh Anh bị khống chế bằng video quay lén' }] };
  const r = F.jsonHealthCheck(para); assert.ok(!r.ok && r.notes.some(x => /tóm lược/.test(x)));
  assert.ok(!F.jsonHealthCheck(null).ok);
  assert.ok(F.jsonHealthPrompt().includes(F.JSON_HEALTH_SAMPLE));
});
t('UI: ô model theo bước, nút kiểm tra JSON, danh sách bài học nằm trong client', () => {
  const c = read('app/client.js'); ['stepModelPost', 'stepModelGate', 'jsonHealthBtn', 'lessonList', 'ensureLearningPanel();'].forEach(k => assert.ok(c.includes(k), k));
  assert.ok(!/"stepModels","lessonMuted"/.test(c), 'lessonMuted phải là dữ liệu theo truyện, không toàn cục');
});
process.exit(bad ? 1 : 0);
