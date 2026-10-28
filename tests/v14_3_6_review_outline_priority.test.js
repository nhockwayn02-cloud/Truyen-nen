// V14.3.6: gợi ý/hướng sửa của AI duyệt phải bám Outline; prompt sửa/vá cho Outline thắng khi mâu thuẫn.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={buildQualityReviewPrompt,buildRewritePrompt,buildPatchPrompt};', ctx);
const T = ctx.__t; let pass = 0; const t = (n, f) => { f(); console.log('PASS ' + n); pass++; };
const review = { rewriteInstructions: ['Xoá 3 đoạn lặp, thay bằng cảnh phụ đời thường'], hardFailures: ['LẶP CẢNH'], warnings: [] };
t('prompt duyệt buộc hướng sửa bám Outline, không thay/xoá beat [R], không thêm cảnh ngoài Outline', () => {
  const p = T.buildQualityReviewPrompt({ chapterNumber: 3, contract: 'CONTRACT', draft: 'x' });
  assert.ok(p.includes('HƯỚNG SỬA (rewriteInstructions, suggestions) PHẢI bám Chapter Contract/Outline'));
  assert.ok(p.includes('KHÔNG đề xuất xoá, thay hoặc làm nhẹ beat'));
});
t('prompt viết lại: Outline thắng hướng sửa', () => {
  const p = T.buildRewritePrompt({ chapterNumber: 3, contract: 'CONTRACT', draft: 'x', review });
  assert.ok(p.includes('OUTLINE/CONTRACT luôn thắng HƯỚNG SỬA'));
  assert.ok(p.includes('chỉ áp dụng phần KHÔNG mâu thuẫn Outline/Contract'));
});
t('prompt vá cục bộ: Outline thắng hướng sửa', () => {
  const p = T.buildPatchPrompt({ chapterNumber: 3, contract: 'CONTRACT', draft: 'x', review });
  assert.ok(p.includes('OUTLINE/CONTRACT luôn thắng HƯỚNG SỬA'));
  assert.ok(p.includes('chỉ áp dụng phần KHÔNG mâu thuẫn Outline/Contract'));
});
console.log('OK ' + pass + ' test');
