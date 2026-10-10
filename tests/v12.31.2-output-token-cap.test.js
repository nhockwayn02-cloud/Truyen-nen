const fs = require('fs');
const assert = require('assert');
const html = fs.readFileSync('index.html','utf8');
const bg = fs.readFileSync('netlify/functions/write-chapter-background.js','utf8');
assert(html.includes('Math.min(7800, Number(opts.maxTokens) || 2048)'), 'foreground API requests must cap output tokens at 7800');
assert(bg.includes('Math.min(7800, Number(maxTokens) || 4000)'), 'background API requests must cap output tokens at 7800');
assert(bg.includes('maxTokens: Math.min(7800, base * 2)'), 'retry doubling must not exceed output cap');
console.log('V12.31.2 output token cap tests: PASS');
