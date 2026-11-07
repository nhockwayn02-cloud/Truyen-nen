// V14.7.1: bằng chứng beat phải đủ dài, so khớp theo NFC/khoảng trắng; worker dùng chung chính sách Gate; hiệu năng đoạn lặp.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const T = vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/core.js'), 'utf8') + '\n;({ auditRequiredBeatEvidence, findRepeatedParagraphs });', {});
let bad = 0;
function test(name, fn) { try { fn(); console.log('PASS ' + name); } catch (e) { bad++; console.error('FAIL ' + name + ': ' + e.message); } }
const req = [{ code: '[R1]', text: 'x' }];
const draft = 'Trời mưa rất lớn. Lâm Phong đẩy cánh cổng đá ra, bụi rơi lả tả xuống vai.\n\nKhông ai đáp lại.';
const audit = (ev, status) => T.auditRequiredBeatEvidence(req, draft, { items: [{ code: '[R1]', status: status || 'present', evidence: ev }] }).status;

test('trích dẫn một ký tự / quá ngắn KHÔNG được coi là bằng chứng', () => {
  assert.equal(audit('a'), 'failed');
  assert.equal(audit('.'), 'failed');
  assert.equal(audit('Trời mưa'), 'failed');
});
test('trích dẫn nguyên văn đủ dài vẫn được xác minh', () => {
  assert.equal(audit('Lâm Phong đẩy cánh cổng đá ra, bụi rơi lả tả xuống vai.'), 'verified');
});
test('khác biệt NFC/NFD của dấu tiếng Việt không gây báo sai', () => {
  assert.equal(audit('Lâm Phong đẩy cánh cổng đá ra, bụi rơi lả tả'.normalize('NFD')), 'verified');
  const nfdDraft = draft.normalize('NFD');
  const r = T.auditRequiredBeatEvidence(req, nfdDraft, { items: [{ code: '[R1]', status: 'present', evidence: 'Lâm Phong đẩy cánh cổng đá ra' }] });
  assert.equal(r.status, 'verified');
});
test('khoảng trắng/xuống dòng khác nhau trong trích dẫn không gây báo sai', () => {
  assert.equal(audit('Lâm Phong  đẩy cánh cổng\nđá ra, bụi rơi'), 'verified');
});
test('trích dẫn bịa vẫn bị từ chối, status missing/uncertain vẫn fail', () => {
  assert.equal(audit('Lâm Phong rút kiếm chém đứt cánh cổng đá'), 'failed');
  assert.equal(audit('Lâm Phong đẩy cánh cổng đá ra', 'uncertain'), 'failed');
});
test('đoạn lặp: kết quả không đổi và nhanh với chương dài nhiều đoạn', () => {
  const para = i => Array.from({ length: 40 }, (_, k) => 'từ' + ((i * 7 + k * 13) % 97)).join(' ') + '.';
  const paras = Array.from({ length: 140 }, (_, i) => para(i));
  paras.push(paras[10]);
  const t0 = Date.now();
  const out = T.findRepeatedParagraphs(paras.join('\n\n'));
  assert.ok(Date.now() - t0 < 3000, 'quá chậm: ' + (Date.now() - t0) + 'ms');
  assert.ok(out.some(x => x.exact && x.paragraphs[0] === 11 && x.paragraphs[1] === 141));
});
test('worker dùng accuracyModeQualityGateOptions và ép nháp khi Accuracy Mode bật', () => {
  const w = fs.readFileSync(path.join(root, 'netlify/functions/write-chapter-background.js'), 'utf8');
  assert.match(w, /accuracyModeQualityGateOptions\(job\.storyState,/);
  assert.match(w, /accuracyMode === true\) job\.draftOnly = true/);
  assert.ok(!/acceptSoft: job\.storyState\.qualityAcceptSoft !== false,\s*\n\s*forceWarnings/.test(w), 'worker không được tự dựng acceptSoft nữa');
});
test('worker: lỗi gọi model đi qua redactApiKey (không lộ key vào trạng thái job)', () => {
  const w = fs.readFileSync(path.join(root, 'netlify/functions/write-chapter-background.js'), 'utf8');
  assert.match(w, /async function callOpenRouter\(args\)\s*\{\s*try \{ return await callOpenRouterRaw\(args\)/);
  const fn = w.slice(w.indexOf('function redactApiKey'), w.indexOf('async function callOpenRouter(args)'));
  const redact = vm.runInNewContext(fn + ';redactApiKey', {});
  const K = 'sk-test-SECRET-1234567890abcdef';
  assert.ok(!redact('Incorrect API key provided: ' + K + '.', K).includes(K));
  assert.ok(!redact('Authorization: Bearer abcdefghijklmnop1234', 'zzz').includes('abcdefghijklmnop1234'));
  assert.equal(redact('HTTP 503 down', K), 'HTTP 503 down');
});
console.log(bad ? 'FAIL ' + bad : 'PASS V14.7.1 accuracy hardening');
process.exit(bad ? 1 : 0);
