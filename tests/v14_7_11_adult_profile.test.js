// V14.7.11: hồ sơ 18+ (kích thước, sở thích) phải vào prompt scene nóng kèm neo tả cụ thể + phản ứng; scene thường không bị lẫn.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'shared/core.js'), 'utf8'), client = fs.readFileSync(path.join(root, 'app/client.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={sceneProfileWithAnchor,buildAdaptiveSceneWritePrompt};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const st = { mature: true, mainCharProfile: { name: 'Bùi Lạc', age: '28', gender: 'nam', sexualExperience: 'Dương vật khi cương khoảng 24–25 cm, chu vi lớn; sau tu luyện tăng chậm kích thước và sức bền.', preferences: 'thích kiểm soát' }, characters: [{ name: 'Linh Chi', age: '27', gender: 'nữ', measurements: '90-62-92' }] };
const hot = { characters: ['Bùi Lạc', 'Linh Chi'], beat: 'Cảnh nóng: hắn bắt ả cởi đồ, phá trinh trên ghế sau xe' }, calm = { characters: ['Bùi Lạc', 'Linh Chi'], beat: 'Hai người họp bàn dự án trong văn phòng' };
t('scene nóng: có đặc điểm 18+ (24–25 cm) và neo tả cơ thể + phản ứng', () => {
  const p = F.sceneProfileWithAnchor(st, hot, ['Bùi Lạc', 'Linh Chi']);
  assert.match(p, /đặc điểm\/kinh nghiệm 18\+: Dương vật khi cương khoảng 24–25 cm/); assert.match(p, /sở thích 18\+: thích kiểm soát/); assert.match(p, /NEO CƠ THỂ 18\+/); assert.match(p, /PHẢN ỨNG/);
});
t('scene nóng không có trường 18+ vẫn có neo cơ thể cho mọi người (ngực, âm hộ...)', () => {
  const p = F.sceneProfileWithAnchor({ mature: true, mainCharProfile: { name: 'A', age: '30' }, characters: [{ name: 'Linh Chi', age: '27', measurements: '90-62-92' }] }, hot, ['A', 'Linh Chi']);
  assert.match(p, /NEO CƠ THỂ 18\+/); assert.match(p, /ngực, núm vú, mông/); assert.match(p, /âm hộ\/lồn/);
});
t('scene thường: không lộ hồ sơ 18+', () => {
  const p = F.sceneProfileWithAnchor(st, calm, ['Bùi Lạc', 'Linh Chi']); assert.ok(!/24–25 cm/.test(p)); assert.ok(!/NEO CƠ THỂ 18\+/.test(p));
});
t('truyện không bật 18+: không đưa hồ sơ 18+ vào', () => { assert.ok(!/24–25 cm/.test(F.sceneProfileWithAnchor({ ...st, mature: false }, hot, ['Bùi Lạc']))); });
t('prompt viết scene nóng chứa neo; đường viết thường không cắt 18+ còn 120 ký tự', () => {
  assert.match(F.buildAdaptiveSceneWritePrompt({ state: st, scene: { ...hot, targetWords: 900 }, allowedCast: 'Bùi Lạc, Linh Chi' }), /NEO CƠ THỂ 18\+/);
  assert.ok(!/p\.sexualExperience\)\.slice\(0,120\)/.test(client)); assert.match(client, /p\.sexualExperience\)\.slice\(0,320\)/);
});
process.exit(bad ? 1 : 0);
