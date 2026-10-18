// V12.46 — Semantic Prose Check: sửa cụm vô nghĩa theo ngữ cảnh, không sửa bừa.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const core = fs.readFileSync(require('path').join(__dirname, '..', 'shared', 'core.js'), 'utf8');
const sb = {};
vm.createContext(sb);
vm.runInContext(core + '\n;Object.assign(this,{splitSemanticSentences,buildSemanticProseCheckPrompt,parseSemanticProseCheckResponse,applySemanticProseFixes});', sb);

const text = 'Chi phí này tớn tiền hơn dự kiến. Cô im lặng.';
const rows = sb.splitSemanticSentences(text, 1000);
assert.strictEqual(rows.length, 2, 'tách đúng từng câu');
const prompt = sb.buildSemanticProseCheckPrompt(rows);
assert(/tớn tiền/.test(prompt) && /uncertain/.test(prompt) && /JSON/.test(prompt), 'prompt yêu cầu rà ngữ nghĩa + JSON');
const parsed = sb.parseSemanticProseCheckResponse('```json\n{"items":[{"id":1,"status":"fix","phrase":"tớn tiền","replacement":"tốn tiền","confidence":0.96}] }\n```');
const fixed = sb.applySemanticProseFixes(text, rows, parsed, 0.85);
assert.strictEqual(fixed.text, 'Chi phí này tốn tiền hơn dự kiến. Cô im lặng.', 'chỉ thay đúng cụm nguyên văn');
assert.strictEqual(fixed.applied.length, 1, 'ghi nhận một thay đổi');
const uncertain = sb.applySemanticProseFixes(text, rows, [{id:1,status:'uncertain',phrase:'tớn tiền',replacement:'tốn tiền',confidence:0.62}], 0.85);
assert.strictEqual(uncertain.text, text, 'uncertain không tự sửa');
assert.strictEqual(uncertain.warnings.length, 1, 'uncertain tạo cảnh báo');
const mismatch = sb.applySemanticProseFixes(text, rows, [{id:1,status:'fix',phrase:'không có trong câu',replacement:'x',confidence:0.99}], 0.85);
assert.strictEqual(mismatch.text, text, 'không khớp nguyên văn thì giữ nguyên');
console.log('PASS V12.46 Semantic Prose Check');
