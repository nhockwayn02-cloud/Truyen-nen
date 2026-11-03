// V14.5.14: mục Outline ghép = ý con; Kháng cự/Hậu quả vào prompt scene; Hậu quả trùng mục bị gỡ; lọc nhận xét "không có lỗi" của Auditor
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={outlineChapterItems,outlineItemParts,sceneScopeOf,sceneScopedChecklistBlock,buildBeatEvidencePrompt,beatMissingError,sceneErrorsPatchable,isNoopAuditNote,evaluateReview,dedupeOutlineMeta};', ctx);
const T = ctx.__t; let pass = 0; const t = (n, f) => { f(); console.log('PASS ' + n); pass++; };
const OUT = [
  'Chương 7 — Dao và nước tiểu Sự kiện: Đến nhà Mỹ Duyên lần hai.',
  '• Mỹ Duyên cầm dao chống trả, bị tước vũ khí.',
  '• Còng tay, đeo vòng cổ, bắt quỳ và tiểu tiện giữa phòng trước mặt hắn.',
  '• Quan hệ, xuất hai lần. Dùng đồ chơi lớn hơn, nhét trứng rung + kẹp núm vú trước khi đi. Kháng cự: Quyết liệt, sau đó khóc và nguyền rủa. Hậu quả: Khóa cửa vô hiệu + bị buộc tiểu trước mặt. Móc kết: Hắn nhìn cô nằm rồi ra về.'
].join('\n');
const ch = T.outlineChapterItems(OUT, null)[7];
const scenes = [
  { id: 'S1', outlineItems: [1, 2], mustChange: 'xong khi cô bị tước dao', beats: ['b'] },
  { id: 'S2', outlineItems: [3], mustChange: 'xong khi cô bị khống chế', beats: ['b'] },
  { id: 'S3', outlineItems: [4], mustChange: 'xong khi hắn ra về', beats: ['b'] }
];
t('Hậu quả trùng mục (bị buộc tiểu) bị gỡ; Kháng cự và Móc kết giữ nguyên', () => {
  assert.strictEqual(ch.meta.consequence, 'Khóa cửa vô hiệu');
  assert.ok(/Quyết liệt/.test(ch.meta.resistance) && /ra về/.test(ch.meta.hook));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(T.dedupeOutlineMeta({ consequence: 'Cô khóc' }, ['Hắn bước vào']))), { consequence: 'Cô khóc' });
});
t('tách ý con: mục ghép >= 3 ý, mục thường thì không', () => {
  assert.strictEqual(T.outlineItemParts(ch.items[2]).length, 4);
  assert.strictEqual(T.outlineItemParts(ch.items[1]).length, 0);
});
t('prompt scene có Kháng cự cho mọi scene có mục, Hậu quả đúng một scene', () => {
  const blocks = scenes.map((s, i) => T.sceneScopedChecklistBlock(s, T.sceneScopeOf(scenes, i, ch.meta, ch.items)));
  blocks.forEach(b => assert.ok(/KHÁNG CỰ CỦA CHƯƠNG/.test(b) && /giằng co thật/.test(b)));
  assert.strictEqual(blocks.filter(b => /HẬU QUẢ CẦN THỂ HIỆN/.test(b)).length, 1);
  assert.ok(/HẬU QUẢ CẦN THỂ HIỆN[^\n]*Khóa cửa vô hiệu/.test(blocks[2]));
});
t('mục ghép có TRÌNH TỰ LIÊN TỤC trong đúng scene, mục thường thì không', () => {
  const b2 = T.sceneScopedChecklistBlock(scenes[1], T.sceneScopeOf(scenes, 1, ch.meta, ch.items));
  assert.ok(/TRÌNH TỰ LIÊN TỤC[^\n]*Còng tay → đeo vòng cổ → bắt quỳ → tiểu tiện/.test(b2));
  const b1 = T.sceneScopedChecklistBlock(scenes[0], T.sceneScopeOf(scenes, 0, ch.meta, ch.items));
  assert.ok(!/TRÌNH TỰ LIÊN TỤC/.test(b1));
});
t('scene cầu nối (không mục) không nhận Kháng cự/Hậu quả', () => {
  const sc = T.sceneScopeOf([{ id: 'S1', outlineItems: [] }], 0, ch.meta, ch.items);
  assert.strictEqual(sc.notes.length, 0);
});
t('kiểm bằng chứng: mục ghép được liệt kê ý con và đòi đủ', () => {
  const p = T.buildBeatEvidencePrompt({ items: [{ n: 3, text: ch.items[2] }, { n: 2, text: ch.items[1] }], text: 'x', scope: 'scene' });
  assert.ok(/GỒM 4 Ý CON/.test(p) && /TẤT CẢ các ý con/.test(p));
  assert.ok(!/Ý CON/.test(p.split('\n').find(l => /^2\. /.test(l))));
  const p2 = T.buildBeatEvidencePrompt({ items: [{ n: 2, text: ch.items[1] }], text: 'x', scope: 'scene' });
  assert.ok(!/Ý CON/.test(p2));
});
t('thiếu mục ghép -> KHÔNG vá chèn (viết lại scene); thiếu mục thường -> vẫn vá chèn', () => {
  const e1 = T.beatMissingError([ch.items[2]]), e2 = T.beatMissingError([ch.items[1]]);
  assert.ok(/THIẾU TRÌNH TỰ BẮT BUỘC/.test(e1) && /SỰ KIỆN BẮT BUỘC/.test(e1));
  assert.strictEqual(T.sceneErrorsPatchable([e1]), false);
  assert.strictEqual(T.sceneErrorsPatchable([e2]), true);
  const mixed = T.beatMissingError([ch.items[2], ch.items[1]]);
  assert.ok(/Đồng thời còn thiếu[^\n]*cầm dao/.test(mixed));
});
t('Auditor: nhận xét "không có lỗi" bị lọc, lỗi thật (kể cả chứa "hợp lý") thì giữ', () => {
  assert.ok(T.isNoopAuditNote('Cảnh mở chương có câu chuyển cảnh hợp lý nên không phải lỗi continuity.'));
  assert.ok(T.isNoopAuditNote('[R1] Giữ nguyên phần đồ chơi - đã đúng nhưng cần đảm bảo thứ tự.'));
  assert.ok(!T.isNoopAuditNote('Chuyển cảnh không hợp lý: nhảy từ quán sang nhà.'));
  assert.ok(!T.isNoopAuditNote('Thiếu chi tiết "trước khi đi" (đúng trình tự nhưng thiếu).'));
  assert.ok(!T.isNoopAuditNote('Cảnh tiểu tiện lặp 3 lần gây dư thừa.'));
  const ev = T.evaluateReview({ score: 95, warnings: ['Đoạn kết hợp lý nên không phải lỗi', 'Lặp cảnh tiểu tiện 3 lần'], hardFailures: ['Mở chương đúng trình tự, hợp lý nên không phải lỗi'] }, {});
  assert.deepStrictEqual(Array.from(ev.warnings), ['Lặp cảnh tiểu tiện 3 lần']);
  assert.strictEqual(ev.hardFailures.length, 0); assert.strictEqual(ev.verdict, 'PASS');
});
console.log('V14.5.14: ' + pass + '/8 PASS');
