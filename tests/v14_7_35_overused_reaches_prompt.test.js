// V14.7.35: hướng dẫn chống cụm sáo phải TỚI prompt (trước đây bị clip trong khối Từ vựng).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={buildVocabularyBlockFrom,compactOverusedGuide,buildAdaptiveSceneWritePrompt};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
t('khối Từ vựng không còn nhồi guide (để clip 600 không cắt mất)', () => assert.ok(!F.buildVocabularyBlockFrom({ vocabulary: { preferred: 'a' }, chapters: [] }).includes('HẠN CHẾ CỤM SÁO')));
t('prompt scene có bản gọn cụm sáo (<500 ký tự) ngay cả khi từ vựng người dùng rất dài', () => {
  const st = { vocabulary: { preferred: 'x '.repeat(2000) }, chapters: [] }; const g = F.compactOverusedGuide(st); assert.ok(g.includes('run rẩy') && g.length < 500, String(g.length));
  assert.ok(F.buildAdaptiveSceneWritePrompt({ state: st, scene: { targetWords: 500 } }).includes('TRÁNH SÁO'));
});
t('ngữ cảnh client + worker đẩy guide thành dòng riêng (không qua clip)', () => { assert.ok(/lines\.push\(overusedPhraseGuide\(state\)\)/.test(read('app/client.js'))); assert.ok(/p\.push\(overusedPhraseGuide\(state\)\)/.test(read('netlify/functions/write-chapter-background.js'))); });
process.exit(bad ? 1 : 0);
