// V14.1.5: thiếu câu chuyển cảnh không còn là "lỗi nặng"; lỗi cảnh không bị đếm đôi; người vắng mặt nói/làm vẫn là lỗi nặng.
const fs = require('fs'), path = require('path'), assert = require('assert');
const C = new Function(fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8') + ';return {evaluateReview,sceneTransitionOnly,scenePresencePrompt,GATE_REVIEW_SCHEMA}')();
const dup = 'sceneViolation: Nhiều cảnh thiếu chuyển cảnh hợp lý, nhân vật xuất hiện/biến mất đột ngột giữa các cảnh.';
const note = 'Cảnh quán cà phê: không có câu cho thấy Bùi Lạc đã đến quán. Hắn đột ngột xuất hiện, không có mô tả di chuyển.';
let r = C.evaluateReview({ score: 85, hardFailures: [dup], sceneViolation: true, sceneNotes: [note] }, {});
assert.strictEqual(r.hardFailures.length, 0, 'chỉ thiếu chuyển cảnh + bị đếm đôi => 0 lỗi nặng');
assert.strictEqual(r.verdict, 'SOFT_FAIL');
assert.ok(r.warnings.some(w => /Thiếu câu chuyển cảnh/.test(w)), 'chuyển thành cảnh báo');
r = C.evaluateReview({ score: 92, hardFailures: [], sceneViolation: true, sceneNotes: ['Lan vẫn nói chen vào dù đã rời đi từ đoạn trước'] }, {});
assert.strictEqual(r.hardFailures.length, 1, 'người đã rời đi mà còn nói => vẫn là lỗi nặng'); assert.strictEqual(r.verdict, 'HARD_FAIL');
r = C.evaluateReview({ score: 88, hardFailures: ['sceneViolation: Mai trả lời khi không có mặt trong phòng'], sceneViolation: true, sceneNotes: ['Mai trả lời khi không có mặt'] }, {});
assert.strictEqual(r.hardFailures.length, 1, 'không đếm đôi lỗi thật');
assert.strictEqual(C.evaluateReview({ score: 95, hardFailures: [] }, {}).verdict, 'PASS');
assert.ok(/câu cầu nối/.test(C.scenePresencePrompt()), 'prompt viết yêu cầu câu cầu nối khi đổi cảnh');
console.log('PASS V14.1.5 chuyển cảnh: cảnh báo thay vì lỗi nặng, không đếm đôi');
