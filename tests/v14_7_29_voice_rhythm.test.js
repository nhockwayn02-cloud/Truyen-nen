// V14.7.29: giọng nội tâm riêng từng người + nhịp câu.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(core + '\n;this.f={reactionModesForScene,innerVoiceBlock,sceneProfileBlock,sentenceRhythmStats,prosePatternGate,buildAdaptiveSceneWritePrompt};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const QA = { name: 'Quỳnh Anh', personality: 'kiêu kỳ, tự tôn của một thư ký cấp cao', speech: 'mỉa mai, gắt gỏng' }, MC = { name: 'Minh Châu', personality: '', speech: '' }, TU = { name: 'Tuấn', personality: 'nhút nhát, dễ bị lấn lướt' };
t('kiểu phản ứng suy từ tính cách', () => { const r = F.reactionModesForScene([QA, TU]); assert.strictEqual(r[0].mode.id, 'giữ thể diện'); assert.strictEqual(r[1].mode.id, 'im lặng nuốt xuống'); });
t('hai người trong cảnh không bao giờ trùng kiểu (kể cả hồ sơ trống / cùng tính cách)', () => { const r = F.reactionModesForScene([QA, MC, { name: 'X', personality: 'kiêu ngạo' }]); const ids = Array.from(r.map(x => x.mode.id)); assert.strictEqual(new Set(ids).size, ids.length); assert.strictEqual(ids.length, 3); });
t('khối giọng nội tâm vào prompt hồ sơ scene', () => { const st = { mainCharProfile: { name: 'Bùi Lạc' }, characters: [QA, MC] }; const b = F.sceneProfileBlock(st, { characters: ['Quỳnh Anh', 'Minh Châu'] }); assert.ok(b.includes('GIỌNG NỘI TÂM RIÊNG') && b.includes('Quỳnh Anh: giữ thể diện')); });
t('nhịp câu: chuỗi câu dài đều bị cảnh báo; có câu ngắn thì không', () => {
  const long = 'Cô bước vào căn phòng rộng lớn với ánh đèn vàng nhạt chiếu xuống nền gạch lạnh lẽo bóng loáng. '.repeat(30);
  const g = F.prosePatternGate({ chapters: [] }, 1, long); assert.ok(g.warn.some(x => x.includes('Nhịp câu')));
  const mixed = ('Cô bước vào căn phòng rộng lớn với ánh đèn vàng nhạt chiếu xuống nền gạch lạnh lẽo bóng loáng. Im lặng. Hắn không nói gì. Cô đứng yên. ').repeat(20);
  assert.ok(!F.prosePatternGate({ chapters: [] }, 1, mixed).warn.some(x => x.includes('Nhịp câu')));
});
t('prompt scene luôn có quy tắc nhịp câu', () => assert.ok(F.buildAdaptiveSceneWritePrompt({ state: {}, scene: { targetWords: 500 } }).includes('NHỊP CÂU')));
process.exit(bad ? 1 : 0);
