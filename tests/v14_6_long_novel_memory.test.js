// V14.6 integration contracts for long-novel memory and continuity features.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const index = require('./_read_index.js')();
const core = fs.readFileSync(path.join(root, 'shared/core.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'netlify/functions/write-chapter-background.js'), 'utf8');
const memoryModule = fs.readFileSync(path.join(root, 'app/layered-memory.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app/app.css'), 'utf8');
function test(name, fn) { try { fn(); console.log('PASS ' + name); } catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } }
function has(source, pattern, label) { assert.ok(pattern.test(source), 'missing ' + label); }
test('legacy stories initialize organization, time-log and all six memory levels', () => {
  has(index, /if\(!Array\.isArray\(state\.organizations\)\) state\.organizations = \[\]/, 'organization migration');
  has(index, /state\.statusState\.timeLog/, 'story time log');
  has(index, /summaries: \{ L1: \[\], L2: \[\], L3: \[\], L4: \[\], L5: \[\] \}/, 'L1–L5 defaults');
});
test('switching to expert mode reveals settings-only sections instead of leaving them hidden', () => {
  has(index, /sec\.dataset\.simpleHidden=mode==="simple"&&!essential\?"true":"false"/, 'expert mode visibility reset');
  has(css, /\.sidebar>\.section,\.sidebar>\.api-card\{flex:0 0 auto;\}/, 'settings sections keep intrinsic height');
});
test('organization profiles support create/edit/delete and safe prompt rendering', () => {
  has(index, /id="organizationList"/, 'organization list');
  has(index, /function renderOrganizations\(\)/, 'organization renderer');
  has(index, /organizationAddBtn[\s\S]{0,800}addEventListener/, 'organization creation listener');
  has(index, /data-org-edit/, 'organization editor'); has(index, /data-org-del/, 'organization delete action');
  has(index, /escapeHtml\(org\.(name|description)/, 'HTML escaping');
  has(core, /function organizationProfilesPromptBlock/, 'shared faction prompt helper');
  has(index, /organizationProfilesPromptBlock\(state,/, 'client organization context');
  has(worker, /organizationProfilesPromptBlock\(state,/, 'worker organization context');
});
test('threads are author-editable, carry history and do not reopen terminal states from AI merge', () => {
  has(index, /data-thread-status/, 'status control'); has(index, /data-thread-desc/, 'description control');
  has(index, /source:"author"/, 'author edit provenance'); has(index, /lastManualUpdatedAt/, 'manual timestamp');
  has(index, /statusHistory/, 'thread status history'); has(index, /value="resolved"/, 'resolved option'); has(index, /value="blocked"/, 'blocked option');
  has(index, /localManualAt>remoteManualAt/, 'protect edits during background merge');
});
test('memory layers are built from frozen lower layers and retrieved by both writing runtimes', () => {
  has(memoryModule, /async function buildLayeredMemorySummaries/, 'L1–L5 build routine');
  has(memoryModule, /memoryLayerBuildBtn/, 'manual build control');
  has(core, /function buildLayeredMemoryContextBlock\(st, targetChapter, maxChars\)/, 'bounded retrieval');
  has(core, /L1 · TÓM TẮT CHƯƠNG GẦN/, 'recent L1 context');
  has(index, /buildLayeredMemoryContextBlock\(state,/, 'client memory context');
  has(worker, /buildLayeredMemoryContextBlock\(state,/, 'worker memory context');
});
test('length enforcement expands/condenses safely and persists a post-write continuity audit', () => {
  has(index, /async function condenseChapterToBounds/, 'safe AI condensation');
  has(index, /async function enforceChapterLengthBounds/, 'expand/condense enforcement');
  has(index, /recordChapterPostWriteAudit/, 'per-chapter audit persistence');
  has(core, /function chapterWordLimits\(st\)/, 'backward-compatible min/max rules');
  has(core, /function chapterLengthAction\(st, wordCount\)/, 'length action classifier');
  has(core, /function buildChapterPostWriteAudit\(st, chapterNumber\)/, 'continuity/time audit');
  has(index, /postWriteAudit/, 'visible audit badge');
});
