// V12.47 — Tạo chương hoàn chỉnh tự chạy Quality Gate và sửa cảnh báo có thể hành động.
const assert = require('assert'), fs = require('fs'), path = require('path');
const html = require('./_read_index.js')();
const worker = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'write-chapter-background.js'), 'utf8');
assert(/id="writeChapterBtn">✦ Tạo Chương Hoàn Chỉnh/.test(html));
assert(/id="autoRepairOnCreateToggle"/.test(html));
assert(/autoRepairOnCreate:true/.test(html));
assert(/autoRepairOnCreateToggle.*addEventListener/.test(html));
assert(/const autonomousRepair = state\.accuracyMode===true \|\| \(state\.autoRepairOnCreate !== false && state\.qualityGateEnabled !== false\);/.test(html), 'Accuracy Mode forces repair; otherwise legacy auto-repair preferences remain in force');
assert(/runQualityGate\(chapterObj, chapterNumber, plan, reviewContext, \{rewrite:autonomousRepair,forceWarnings:autonomousRepair\}\)/.test(html));
assert(/Semantic Prose Check/.test(html) && /Targeted Segment Repair/.test(html));
// V14.7.1: worker dùng chung chính sách Gate với client (acceptSoft/forceWarnings do accuracyModeQualityGateOptions quyết định).
assert(/accuracyModeQualityGateOptions\(job\.storyState,\s*\{[^}]*forceWarnings:\s*job\.storyState\.autoRepairOnCreate !== false/.test(worker));
assert(/acceptSoft:\s*strict \? false : st\.qualityAcceptSoft !== false/.test(worker));
console.log('PASS V12.47 autonomous chapter pipeline');
