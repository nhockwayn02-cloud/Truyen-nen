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
assert(worker.includes('chunkText(chapter.text, 12000, 400)'), 'character extraction chunk tuning missing');
assert(worker.includes('chunkText(chapter.text, 13000, 400)'), 'world extraction chunk tuning missing');
assert(worker.includes('state.threads.slice(-20).map(x => `${x.type}: ${String(x.desc || "").slice(0, 140)} [${x.status}]`)'), 'world prompt thread context cap missing');
assert(html.includes('maxWords') && html.includes('endingGateInstruction'), 'chapter length / ending anchor logic appears missing');
console.log('PASS V12.29/V12.30 cost and unified postprocess assertions');
