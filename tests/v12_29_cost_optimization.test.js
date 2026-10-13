const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'netlify/functions/write-chapter-background.js'), 'utf8');
function assert(ok, msg) { if (!ok) throw new Error(msg); }
assert(html.includes('V12.30: một job hậu kỳ tổng hợp'), 'client does not route automatic canon postprocess through the unified job');
const body = html.slice(html.indexOf('async function runCanonPostProcess'), html.indexOf('async function reviewCurrentChapter'));
assert(body.includes('await startBackgroundPostProcess('), 'client unified postprocess call missing');
assert(!body.includes('await updateCharactersIncremental') && !body.includes('await updateWorldIncremental') && !body.includes('await updateCurrentStatusIncremental') && !body.includes('await updateLongMemoryIncremental'), 'client still launches separate automatic extractor calls');
assert(worker.includes('V12.30: one model request for the whole postprocess.'), 'unified backend postprocess missing');
assert(worker.includes('V12.29 COST: avoid a third model call only to shorten the summary.') || worker.includes('if (wc > 450)'), 'worker summary handling missing');
// V12.32.14: các hàm trích xuất riêng lẻ (nhân vật/thế giới/status/memory) của worker đã bị gỡ vì không còn ai gọi — chỉ còn hậu kỳ gộp một lệnh gọi (V12.30).
for (const fn of ['updateCharacters', 'updateWorld', 'updateCurrentStatus', 'updateLongMemory', 'generateSummary', 'generateNextChapterHint', 'scanScenes']) {
  assert(!new RegExp('function ' + fn + '\\(').test(worker), 'legacy worker function should be removed: ' + fn);
}
assert(html.includes('maxWords') && html.includes('endingGateInstruction'), 'chapter length / ending anchor logic appears missing');
console.log('PASS V12.29/V12.30 cost and unified postprocess assertions');
