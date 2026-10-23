// V14.1.6: (1) tự chèn câu chuyển cảnh khi chỉ có cảnh báo thiếu chuyển cảnh; (2) gợi ý hành động + nội dung lỗi trên dòng trạng thái.
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const C = new Function(fs.readFileSync(path.join(ROOT, 'shared/core.js'), 'utf8') + ';return {evaluateReview,quickFixNeeded,transitionWarnings,transitionFixReview,reviewActionAdvice,reviewIsBetter,runQuickAutoFix,buildPatchPrompt}')();

const tw = 'Thời gian nhảy từ tối hôm trước sang sáng hôm sau — cần thêm câu chuyển cảnh.';
const soft = C.evaluateReview({ score: 85, hardFailures: ['sceneViolation: thiếu chuyển cảnh, nhân vật xuất hiện đột ngột'], sceneViolation: true, sceneNotes: ['Không có câu chuyển cảnh, hắn đột ngột xuất hiện ở quán'], warnings: [tw, 'Miêu tả ngoại hình chung chung'] }, {});
assert.strictEqual(soft.verdict, 'SOFT_FAIL');
assert.strictEqual(C.quickFixNeeded(soft), true, 'SOFT_FAIL chỉ có cảnh báo chuyển cảnh => vẫn tự sửa');
assert.strictEqual(C.quickFixNeeded(C.evaluateReview({ score: 85, warnings: ['Miêu tả ngoại hình chung chung'] }, {})), false, 'cảnh báo khác không kích hoạt');
assert.ok(C.transitionWarnings(soft).length >= 2);
const fr = C.transitionFixReview(soft);
assert.ok(fr && fr.hardFailures.length === 0 && fr.warnings.length >= 1 && /CHỈ CHÈN/.test(fr.rewriteInstructions[0]) && /KHÔNG dùng replace\/delete/.test(fr.rewriteInstructions[1]));
assert.ok(!fr.warnings.some(w => /ngoại hình/.test(w)), 'review giả chỉ chứa cảnh báo chuyển cảnh');
const prompt = C.buildPatchPrompt({ chapterNumber: 7, review: fr, draft: 'abc' });
assert.ok(/CHỈ CHÈN câu chuyển cảnh/.test(prompt) && /cần thêm câu chuyển cảnh/.test(prompt), 'prompt vá mang đúng hướng sửa');
assert.strictEqual(C.transitionFixReview({ hardFailures: ['x'], warnings: [tw] }), null, 'còn lỗi nặng => dùng luồng sửa thường');

// tie-break: cùng điểm nhưng ít thiếu chuyển cảnh hơn => tốt hơn
const after = C.evaluateReview({ score: 85, warnings: ['Miêu tả ngoại hình chung chung'] }, {});
assert.strictEqual(C.reviewIsBetter(after, soft), true); assert.strictEqual(C.reviewIsBetter(soft, after), false);

(async () => {
  const chapter = { text: 'Đoạn một.\n\nĐoạn hai.', wordCount: 4 };
  let got = null;
  const fx = await C.runQuickAutoFix(chapter, soft, {
    rewrite: async rv => { got = rv; chapter.text += '\n\nHắn rời tòa nhà, lái xe tới quán cà phê.'; return { ok: true, patched: 1 }; },
    review: async () => ({ ok: true, review: after })
  }, { maxRounds: 1, minRoundMs: 0 });
  assert.ok(fx.attempted && fx.improved && !fx.restored, 'bản chèn câu được giữ: ' + JSON.stringify(fx));
  assert.ok(/chuyển cảnh/.test(chapter.text) === false && /quán cà phê/.test(chapter.text), 'văn bản chèn còn nguyên');
  const same = C.evaluateReview({ score: 85, warnings: [tw] }, {});
  const ch2 = { text: 'A.', wordCount: 1 };
  const fx2 = await C.runQuickAutoFix(ch2, soft, { rewrite: async () => { ch2.text += ' X.'; return { ok: true, patched: 1 }; }, review: async () => ({ ok: true, review: C.evaluateReview({ score: 85, warnings: [tw, tw] }, {}) }) }, { maxRounds: 1, minRoundMs: 0 });
  assert.ok(fx2.restored && ch2.text === 'A.', 'bản chèn không cải thiện => khôi phục');

  // 2) gợi ý hành động
  const A = C.reviewActionAdvice;
  assert.strictEqual(A(null), null);
  assert.strictEqual(A({ verdict: 'PASS', hardFailures: [] }).level, 'ok');
  const a1 = A(soft); assert.strictEqual(a1.level, 'read'); assert.ok(/chạy hậu kỳ/i.test(a1.action) && /chuyển cảnh/.test(a1.action));
  const scene = A({ verdict: 'HARD_FAIL', hardFailures: ['Lỗi cảnh/người có mặt: Lan nói khi không có mặt'] }); assert.strictEqual(scene.level, 'fix'); assert.ok(/Duyệt lại/.test(scene.action) && scene.issues[0].kind === 'scene');
  assert.strictEqual(A({ verdict: 'HARD_FAIL', hardFailures: ['Vượt số nhân vật có tên: 7 > 4'] }).level, 'split');
  assert.strictEqual(A({ verdict: 'HARD_FAIL', hardFailures: ['Vượt ngân sách sự kiện: 5 > 3'] }).level, 'split');
  assert.strictEqual(A({ verdict: 'HARD_FAIL', hardFailures: ['Vi phạm Knowledge Ledger / nhân vật biết thông tin chưa thể biết.'] }).level, 'rewrite');
  assert.strictEqual(A({ verdict: 'HARD_FAIL', hardFailures: ['Nhân vật hành xử/nói vượt thiết lập hồ sơ (địa vị)'] }).level, 'fix');
  const long = A({ verdict: 'HARD_FAIL', hardFailures: ['x'.repeat(400)] }); assert.ok(long.issues[0].text.length <= 141, 'lỗi dài được cắt gọn');

  // 3) nối vào hệ thống
  const w = fs.readFileSync(path.join(ROOT, 'netlify/functions/write-chapter-background.js'), 'utf8');
  assert.ok(/transitionFixReview\(rv\)/.test(w) && /patchWorkerDraft\(job, chapter, n, tr\)/.test(w), 'worker dùng vá chèn câu chuyển cảnh');
  const h = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(/reviewActionAdvice\(ch\.review\)/.test(h), 'dòng trạng thái bản nháp dùng gợi ý hành động');
  console.log('PASS V14.1.6 tự chèn câu chuyển cảnh + gợi ý hành động');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
