// V14.3.6: gợi ý chương sau nhận dàn ý chương đó làm nguồn chuẩn (trước đây chỉ lọt trong ngữ cảnh, dễ bị cắt/lệch).
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const i = src.indexOf('async function generateNextChapterHint'); assert(i > 0);
const fn = src.slice(i, i + 9000);
assert(fn.includes('arcProgressPrompt(state, chapterNumber+1)'), 'prompt gợi ý phải lấy dàn ý chương sau');
assert(fn.includes('<dan_y>') && fn.includes('NGUỒN CHUẨN'), 'dàn ý phải đứng như nguồn chuẩn');
assert(fn.includes('(0) nếu có DÀN Ý CHƯƠNG SAU'), 'thứ tự ưu tiên phải có dàn ý ở bậc 0');
console.log('PASS hint chương sau bám dàn ý\nOK 1 test');
