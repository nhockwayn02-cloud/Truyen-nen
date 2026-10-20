const fs = require('fs');
const assert = require('assert');
const index = fs.readFileSync('index.html','utf8');
const core = fs.readFileSync('shared/core.js','utf8');
const worker = fs.readFileSync('netlify/functions/write-chapter-background.js','utf8');

for (const [name, src] of [['index.html', index], ['shared/core.js', core], ['worker', worker]]) {
  assert.strictEqual((src.match(/function\s+getEndingTarget\s*\(/g) || []).length, 1, `${name}: thiếu hoặc trùng getEndingTarget()`);
}
assert(index.indexOf('function getEndingTarget') < index.indexOf('getEndingTarget(b.hint, b.directive)'), 'index.html: helper phải được khai báo trước điểm sử dụng theo thứ tự file');
assert(index.indexOf('function getEndingTarget') < index.indexOf('const endingTarget = getEndingTarget('), 'index.html: helper phải tồn tại trước autoContinueUntilDone');

console.log('PASS getEndingTarget helper 3/3');
