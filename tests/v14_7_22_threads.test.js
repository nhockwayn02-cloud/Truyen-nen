// V14.7.22: Threads kẹt ở "seeded" / chỉ 1 thread sau 16 chương.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={normalizeThreadStatus,THREAD_STATUSES,fieldQuoteSupports,fieldEvidenceSupports,evidenceSupportsValue};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const SRC = 'Quỳnh Anh siết chặt tay, nhìn chiếc điện thoại đang phát lại đoạn video quay lén. Bùi Lạc chỉ mỉm cười: "Cô biết phải làm gì rồi."';
t('NGUYÊN NHÂN: cổng cũ xóa mọi trạng thái thread vì "developing" không có trong câu trích', () => {
  assert.ok(!F.fieldEvidenceSupports('developing', 'Bùi Lạc chỉ mỉm cười: "Cô biết phải làm gì rồi."', SRC, 0.55));
});
t('chuẩn hóa trạng thái: từ khóa hợp lệ, đồng nghĩa tiếng Việt, rác → rỗng', () => {
  const n = F.normalizeThreadStatus;
  assert.strictEqual(n('developing'), 'developing'); assert.strictEqual(n('Paid Off'), 'paid_off'); assert.strictEqual(n('paid_off'), 'paid_off'); assert.strictEqual(n('đang phát triển'), 'developing'); assert.strictEqual(n('đã giải quyết'), 'resolved'); assert.strictEqual(n('bị chặn'), 'blocked');
  assert.strictEqual(n(''), ''); assert.strictEqual(n('linh tinh xyz'), ''); assert.strictEqual(n('seeded'), 'seeded');
});
t('mô tả thread trừu tượng chỉ cần câu trích thật', () => {
  assert.ok(F.fieldQuoteSupports('Bùi Lạc dùng video quay lén để khống chế Quỳnh Anh', 'Quỳnh Anh siết chặt tay, nhìn chiếc điện thoại đang phát lại đoạn video quay lén.', SRC));
  assert.ok(!F.fieldQuoteSupports('abc def', 'Câu bịa không có trong chương hoàn toàn', SRC));
});
t('worker: gate thread, chuẩn hóa trạng thái, lịch sử đổi trạng thái, prompt hướng dẫn; UI đọc lastUpdated; có nút quét lại', () => {
  const w = fs.readFileSync(path.join(__dirname, '../netlify/functions/write-chapter-background.js'), 'utf8'), c = fs.readFileSync(path.join(__dirname, '../app/client.js'), 'utf8'), h = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(w.includes('x.status = normalizeThreadStatus(x.status)') && !/fieldEvidenceSupports\(x\.status/.test(w) && w.includes('lastUpdatedChapter: n') && w.includes('statusHistory.push') && w.includes('THREADS (tình tiết mở)') && w.includes('seeded|developing|blocked|resolved|paid_off|abandoned'));
  assert.ok(w.includes('fieldQuoteSupports(x.desc, (x.fieldEvidence || {}).desc'));
  assert.ok(c.includes('Number(t.lastUpdated)') && c.includes('threadRescanBtn')); assert.ok(h.includes('id="threadRescanBtn"'));
});
process.exit(bad ? 1 : 0);
