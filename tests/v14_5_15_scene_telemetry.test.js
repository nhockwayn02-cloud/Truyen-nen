// V14.5.15: telemetry adaptive theo từng scene phải được tạo, trả về trong stats và lưu ở client/worker.
const fs = require('fs'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const worker = fs.readFileSync(path.join(__dirname, '../netlify/functions/write-chapter-background.js'), 'utf8');
let pass = 0;
function t(name, fn) { fn(); console.log('PASS ' + name); pass++; }
t('adaptive pipeline có bộ sưu tập telemetry scene và trả trong stats', () => {
  assert.ok(/const pieces = \[\], sceneStates = \[\], sceneTelemetry = \[\]/.test(core));
  assert.ok(/sceneMetric\s*=\s*\{\s*sceneId/.test(core));
  assert.ok(/sceneTelemetry\.push\(sceneMetric\)/.test(core));
  assert.ok(/sceneTelemetry, strippedCast/.test(core));
});
t('client lưu adaptiveStats và hiển thị telemetry scene', () => {
  assert.ok(/let rawText = "", finishReason = null, adaptiveStats = null/.test(index));
  assert.ok(/adaptiveStats = adaptive\.stats \|\| null/.test(index));
  assert.ok(/plan, adaptiveStats, continuityWarnings/.test(index));
  assert.ok(/TELEMETRY SCENE/.test(index));
});
t('worker dùng cùng telemetry từ shared core và lưu stats vào kết quả chapter', () => {
  assert.ok(/sceneTelemetry/.test(worker));
  assert.ok(/stats\.scenes.*stats\.plannedScenes/.test(worker));
});
console.log('V14.5.15: ' + pass + '/3 PASS');
