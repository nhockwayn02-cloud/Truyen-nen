const fs = require('fs');
const assert = require('assert');
const html = fs.readFileSync('index.html','utf8');
const bg = fs.readFileSync('netlify/functions/write-chapter-background.js','utf8');
// V14.3: giới hạn nay nằm ở một hằng số dùng chung (AI_MAX_OUTPUT_TOKENS) trong shared/core.js, được đồng bộ vào client và worker.
for (const [name, src] of [['client', html], ['worker', bg]]) {
  assert(/const AI_MAX_OUTPUT_TOKENS = 7800;/.test(src), name + ': thiếu hằng số AI_MAX_OUTPUT_TOKENS = 7800');
  assert(/max_tokens: Math\.max\(1, Math\.min\(AI_MAX_OUTPUT_TOKENS, Number\((opts\.maxTokens|maxTokens)\) \|\| (2048|4000)\)\)/.test(src), name + ': mọi lệnh gọi API phải chặn max_tokens ở AI_MAX_OUTPUT_TOKENS');
}
console.log('V12.31.2 output token cap tests: PASS');
