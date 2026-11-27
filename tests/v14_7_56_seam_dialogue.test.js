// V14.7.56: (1) cảnh báo đoạn mở scene kể lại scene trước; (2) ghép thoại bị tách khỏi lời dẫn thành đoạn riêng.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8') + '\n;this.e={joinSplitDialogue,seamOverlap,isDialogueTagPara,cleanModelArtifacts};', ctx); const E = ctx.e;
// --- thoại ---
const split = ['— Cô Trịnh còn ba tập hồ sơ chưa nhập kho.', '— Hắn nói chậm, mắt không rời mặt cô ta.', '— Mang về nhà hai lần rồi.', '— Anh điên à!', 'Buông ra!', '— ả giãy, gót giày nhọn trượt trên nền xi măng kêu chói.', '— Tôi là thư ký riêng của bà chủ!'].join('\n\n');
const j = E.joinSplitDialogue(split).split(/\n\n/);
assert.strictEqual(j[0], '— Cô Trịnh còn ba tập hồ sơ chưa nhập kho. — Hắn nói chậm, mắt không rời mặt cô ta.', 'lời dẫn phải được ghép vào câu thoại trước');
assert.strictEqual(j[1], '— Mang về nhà hai lần rồi.');
assert.ok(/^— Anh điên à! Buông ra! — ả giãy, gót giày/.test(j[2]), 'câu thoại ngắn nằm giữa phải được ghép: ' + j[2]);
assert.strictEqual(j[3], '— Tôi là thư ký riêng của bà chủ!');
// không ghép nhầm hai người nói
const two = ['— Vâng.', '— Nhanh lên. Bà giám đốc không thích thấy hành lang có người đứng lơ ngơ.', '— Quy trình cho phép gia hạn ba ngày.', '— Cho phép gia hạn. Không cho phép photo một bản.', '— Anh là bảo vệ.', '— Cô cứ thử phản đối xem.'].join('\n\n');
assert.strictEqual(E.joinSplitDialogue(two), two, 'hai người nói khác nhau không bị ghép');
const narr = ['— Đi theo tôi.', 'Hắn cất điện thoại vào túi.', '— Được.'].join('\n\n'); assert.strictEqual(E.joinSplitDialogue(narr), narr, 'dòng kể không có gạch đầu dòng không bị đụng');
assert.ok(E.cleanModelArtifacts(split).split('\n\n').length < 7, 'cleanModelArtifacts phải ghép thoại');
assert.strictEqual(E.joinSplitDialogue('Không có thoại gạch ngang ở đây.\n\nĐoạn thứ hai.'), 'Không có thoại gạch ngang ở đây.\n\nĐoạn thứ hai.');
// --- lặp đoạn nối ---
const prev = ['Bùi Lạc nhìn chiếc xe đẩy còn một chồng hộp, rồi bước theo ả vào phòng lưu trữ ở cuối hành lang tầng hầm.', 'Cánh cửa sắt rít lên rồi sập lại sau lưng hắn, chốt khóa kêu cạch một tiếng trong bóng tối mới bật đèn.', 'Ả giữ chặt mép cửa và hất đầu về phía trong phòng lưu trữ hồ sơ.'].join('\n\n');
const rest = ['Ả mở tập giấy ép, rút ra một phong bì trắng và đưa về phía hắn bằng hai ngón tay.', 'Hắn nhìn phong bì mà không đưa tay ra nhận, rồi nói rằng năm triệu chưa đủ để mua đoạn băng ấy.', 'Ả im lặng rất lâu, hơi thở gấp dần trong căn phòng đầy mùi giấy ẩm.', 'Đèn huỳnh quang kêu tách tách, và bóng hai người đổ dài xuống nền xi măng.'];
const dup = 'Rời sảnh tầng hầm, Bùi Lạc bước theo ả vào phòng lưu trữ hồ sơ ngay cuối hành lang, lúc năm giờ bốn mươi lăm sáng, khi cánh cửa sắt khép lại sau lưng hắn và chốt khóa kêu cạch trong bóng tối của phòng lưu trữ.';
assert.strictEqual(E.seamOverlap(prev, [dup].concat(rest).join('\n\n')).warn, true, 'đoạn mở kể lại cảnh trước phải bị cảnh báo');
assert.strictEqual(E.seamOverlap(prev, rest.join('\n\n')).warn, false, 'scene nối tự nhiên không bị cảnh báo');
// --- pipeline: scene 2 mở bằng đoạn kể lại → có cảnh báo, văn vẫn nguyên ---
(async () => {
  const h = require('./qa/worker_harness');
  h.reset(); h.planScenes = 2; h.sceneWords = 400;
  const s1 = [h.prose(160, 'P'), prev].join('\n\n');
  h.setScript(rec => { if (rec.kind !== 'scene') return null; if (rec.n === 0) return { content: s1 }; if (rec.n === 1) return { content: [dup].concat(rest, [h.prose(200, 'Q')]).join('\n\n') }; return null; });
  const job = await h.runJob('seam_warn', { storyState: { chapterWordMin: 500, chapterWordMax: 1600, minChapterWords: 700 } });
  const warns = JSON.stringify(((job.resultChapter || {}).autoUpdateIssues || []).concat((job.resultChapter || {}).continuityWarnings || []));
  const txt = String((job.resultChapter || {}).text || '');
  assert.ok(/kể lại việc scene trước/.test(warns + JSON.stringify(job.progress || '') + JSON.stringify(job)), 'pipeline phải ghi cảnh báo nối scene');
  assert.ok(/phong bì trắng/.test(txt), 'văn của scene sau vẫn còn nguyên');
  console.log('PASS ghép thoại bị tách; cảnh báo lặp đoạn nối; hai người nói/dòng kể không bị ghép nhầm; pipeline ghi cảnh báo'); process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
