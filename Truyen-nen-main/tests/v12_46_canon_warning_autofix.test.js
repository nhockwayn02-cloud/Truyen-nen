// V12.46 — nút AI tự sửa không bỏ qua cảnh báo Canon có hướng xử lý.
const assert = require('assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const sb = { console }; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared', 'core.js'), 'utf8') + '\n;Object.assign(this,{runGateLoop,hasActionableCanonWarning});', sb);
assert(sb.hasActionableCanonWarning({ warnings: ['Canon: nhân vật biết thông tin chưa được thiết lập'] }));
assert(!sb.hasActionableCanonWarning({ warnings: ['Văn phong hơi dài'] }));
(async () => {
  const chapter = { text: 'Bản thảo cũ', wordCount: 3 }, seen = [];
  let n = 0;
  const out = await sb.runGateLoop(chapter, {
    review: async () => ({ ok: true, review: n++ === 0
      ? { score: 95, verdict: 'PASS', hardFailures: [], warnings: ['Canon: cảnh mở đầu sai địa điểm'], rewriteInstructions: ['Nối lại địa điểm theo Canon'] }
      : { score: 95, verdict: 'PASS', hardFailures: [], warnings: [], rewriteInstructions: [] } }),
    rewrite: async review => { seen.push(review.warnings.join('|')); chapter.text = 'Bản thảo đã nối lại'; return { ok: true, patched: 1 }; }
  }, { maxAttempts: 2, forceWarnings: true, acceptSoft: false });
  assert(out.approved && seen.length === 1, 'PASS nhưng có cảnh báo Canon phải chạy sửa một lượt');
  console.log('PASS V12.46 Canon warning autofix');
})().catch(e => { console.error(e); process.exit(1); });
