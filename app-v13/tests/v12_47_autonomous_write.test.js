// V12.47 — Tạo chương hoàn chỉnh tự chạy Quality Gate và sửa cảnh báo có thể hành động.
const assert = require('assert'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'write-chapter-background.js'), 'utf8');
assert(/id="writeChapterBtn">✦ Tạo Chương Hoàn Chỉnh/.test(html));
assert(/id="autoRepairOnCreateToggle"/.test(html));
assert(/autoRepairOnCreate:true/.test(html));
assert(/autoRepairOnCreateToggle.*addEventListener/.test(html));
assert(/const autonomousRepair = state\.autoRepairOnCreate !== false && state\.qualityGateEnabled !== false;/.test(html));
assert(/runQualityGate\(chapterObj, chapterNumber, plan, reviewContext, \{rewrite:autonomousRepair,forceWarnings:autonomousRepair\}\)/.test(html));
assert(/Semantic Prose Check/.test(html) && /Targeted Segment Repair/.test(html));
assert(/forceWarnings:\s*job\.storyState\.autoRepairOnCreate !== false/.test(worker));
assert(/acceptSoft:\s*job\.storyState\.qualityAcceptSoft !== false/.test(worker));
console.log('PASS V12.47 autonomous chapter pipeline');
