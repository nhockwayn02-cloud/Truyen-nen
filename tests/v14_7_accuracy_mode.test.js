const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const coreSource = fs.readFileSync(path.join(root, 'shared/core.js'), 'utf8');
const coreContext = vm.createContext({});
vm.runInContext(coreSource + '\n;globalThis.__accuracyPolicy = typeof accuracyModeQualityGateOptions === "function" ? accuracyModeQualityGateOptions : null;', coreContext);
const accuracyModeQualityGateOptions = coreContext.__accuracyPolicy;
function test(name, fn) {
  try { fn(); console.log('PASS ' + name); }
  catch (error) { console.error('FAIL ' + name + ': ' + error.message); process.exitCode = 1; }
}
function has(source, pattern, label) { assert.ok(pattern.test(source), 'missing ' + label); }

test('accuracy policy overrides relaxed settings but preserves legacy behavior when off', () => {
  assert.equal(typeof accuracyModeQualityGateOptions, 'function', 'missing tested accuracy gate policy');
  const strict = accuracyModeQualityGateOptions({ accuracyMode: true, qualityGateEnabled: false, qualityAcceptSoft: true, requiredBeatBarrier: false, qualityMaxAttempts: 5 }, { rewrite: true });
  assert.equal(strict.enabled, true);
  assert.equal(strict.acceptSoft, false);
  assert.equal(strict.requiredBeatBarrier, true);
  assert.equal(strict.maxAttempts, 3);
  assert.equal(strict.forceWarnings, true);
  const legacy = accuracyModeQualityGateOptions({ accuracyMode: false, qualityGateEnabled: false, qualityAcceptSoft: true, requiredBeatBarrier: false, qualityMaxAttempts: 2 }, {});
  assert.equal(legacy.enabled, false);
  assert.equal(legacy.acceptSoft, true);
  assert.equal(legacy.requiredBeatBarrier, false);
  assert.equal(legacy.maxAttempts, 2);
});

test('per-story accuracy mode is visible, defaults off, persists and round-trips through backup', () => {
  has(index, /id="accuracyModeToggle"/, 'accuracy-mode toggle');
  has(index, /accuracyMode:false/, 'off-by-default new-story state');
  has(index, /accuracyMode:s\.accuracyMode===true/, 'serialized accuracy mode');
  has(index, /out\.accuracyMode=ch\.qualityGate\?\.accuracyMode===true/, 'backward-compatible hydration');
  has(index, /accuracyModeToggle[\s\S]{0,250}addEventListener/, 'accuracy-mode change handler');
  has(index, /function syncAccuracyModeControls\(\)[\s\S]{0,160}mode\.checked=strict/, 'accuracy-mode control hydration');
});

test('accuracy review independently verifies concrete required beats and duplicate paragraphs', () => {
  has(index, /async function runAccuracyBeatAudit\(/, 'independent beat audit');
  has(index, /auditRequiredBeatEvidence\(/, 'exact-evidence verifier integration');
  has(index, /findRepeatedParagraphs\(/, 'long repeated-paragraph scan in review');
  has(index, /draftFingerprint:accuracyTextFingerprint/, 'audit tied to the exact draft text');
  has(index, /accuracyModeQualityGateOptions\(state,\s*opts\)/, 'strict Quality Gate policy used by app');
});

test('ordinary Continue is strictly reviewed before background Canon sync when Accuracy Mode is on', () => {
  const start = index.indexOf('$ID("continueChapterBtn").addEventListener');
  const end = index.indexOf('/* ========== CHECKPOINTS', start);
  assert.ok(start >= 0 && end > start, 'missing normal Continue handler');
  const continueBlock = index.slice(start, end);
  has(continueBlock, /if\(state\.accuracyMode===true\)[\s\S]{0,700}runQualityGate\(/, 'strict gate on the Continue route');
  has(continueBlock, /if\(!continuationGate\.approved\)[\s\S]{0,1200}return;/, 'failed Continue review cannot reach postprocess');
  has(continueBlock, /runQualityGate[\s\S]{0,1200}startBackgroundPostProcess\(/, 'Continue is audited before background sync');
});

test('retrying background postprocess cannot manually override an unresolved accuracy audit', () => {
  const start = index.indexOf('async function retryBackgroundPostProcess(){');
  const end = index.indexOf('/* V14.0.6: VIẾT NHÁP NỀN', start);
  assert.ok(start >= 0 && end > start, 'missing retry-postprocess handler');
  const block = index.slice(start, end);
  const barrier = block.indexOf('blockIfRequiredBeatsMissing(ch,');
  const override = block.indexOf('MANUAL_OVERRIDE');
  const legacyGuard = block.indexOf('if(state.accuracyMode!==true)');
  assert.ok(barrier >= 0 && override > barrier, 'strict barrier must run before any manual-override assignment');
  assert.ok(legacyGuard > barrier && legacyGuard < override, 'manual override must remain confined to legacy mode');
});

test('accuracy repairs are local-only and the beat/repetition barrier protects every canon/export route', () => {
  has(index, /if\(state\.accuracyMode===true\)[\s\S]{0,500}không viết lại toàn chương/i, 'no whole-chapter fallback in accuracy mode');
  has(index, /function chapterAccuracyBarrierStatus\(/, 'accuracy sync barrier');
  has(index, /function requiredBeatBarrierStatus\([\s\S]{0,650}chapterAccuracyBarrierStatus\(/, 'accuracy barrier included in normal Required Beat check');
  has(index, /function startBackgroundPostProcess\([\s\S]{0,450}blockIfRequiredBeatsMissing/, 'postprocess blocked without a fresh passing audit');
  assert.ok((index.match(/blockIfRequiredBeatsMissing\(state\.chapters,"(?:xuất bản|export)/g) || []).length >= 2, 'expected publish/export paths to use the strict barrier');
});
