const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../shared/core.js'), 'utf8');
const T = vm.runInNewContext(source + '\n;({ buildLayeredMemoryRanges, upsertFrozenLayerSummary, buildLayeredMemoryContextBlock, organizationProfilesPromptBlock });', {});

function deepEq(actual, expected) { assert.equal(JSON.stringify(actual), JSON.stringify(expected)); }
function test(name, fn) { try { fn(); console.log('✓ ' + name); } catch (e) { console.error('✗ ' + name); throw e; } }

test('defaults create 4/20/60 chapter layers with stable parent mapping', () => {
  const { chunks, arcs, volumes } = T.buildLayeredMemoryRanges(120);
  assert.equal(chunks.length, 30); assert.equal(arcs.length, 6); assert.equal(volumes.length, 2);
  deepEq([chunks[0].id, arcs[0].id, volumes[0].id], ['L2-0001', 'L3-0001', 'L4-0001']);
  deepEq([chunks[0].startChapter, chunks[0].endChapter, chunks[0].expectedEndChapter, chunks[0].arcId, chunks[0].volumeId], [1, 4, 4, 'L3-0001', 'L4-0001']);
  assert.equal(arcs[0].chunkIds.length, 5); assert.equal(arcs[0].volumeId, 'L4-0001');
  assert.equal(volumes[0].arcIds.length, 3);
});
test('partial final groups report actual versus expected boundaries and remain incomplete', () => {
  const r = T.buildLayeredMemoryRanges(23);
  deepEq([r.chunks.at(-1).startChapter, r.chunks.at(-1).endChapter, r.chunks.at(-1).expectedEndChapter, r.chunks.at(-1).complete], [21, 23, 24, false]);
  deepEq([r.arcs.at(-1).startChapter, r.arcs.at(-1).endChapter, r.arcs.at(-1).expectedEndChapter, r.arcs.at(-1).complete], [21, 23, 40, false]);
  deepEq([r.volumes[0].endChapter, r.volumes[0].expectedEndChapter, r.volumes[0].complete], [23, 60, false]);
});
test('zero chapters returns empty layers', () => assert.equal(JSON.stringify(T.buildLayeredMemoryRanges(0)), '{"chunks":[],"arcs":[],"volumes":[]}'));
test('custom positive grouping sizes work', () => {
  const r = T.buildLayeredMemoryRanges(12, { chunkSize: 3, chunksPerArc: 2, arcsPerVolume: 2 });
  assert.equal(r.chunks.length, 4); assert.equal(r.arcs.length, 2); assert.equal(r.volumes.length, 1);
  assert.equal(r.arcs[1].startChapter, 7); deepEq(r.volumes[0].arcIds, ['L3-0001', 'L3-0002']);
});
test('upsert freezes new records and preserves an existing frozen record exactly', () => {
  const frozen = { id: 'x', text: 'old', frozen: true }, incoming = { id: 'x', text: 'new' };
  const old = [frozen], result = T.upsertFrozenLayerSummary(old, incoming);
  assert.notEqual(result, old); assert.equal(result[0], frozen); deepEq(incoming, { id: 'x', text: 'new' });
  const added = T.upsertFrozenLayerSummary([], { id: 'y', text: 'hello' }); deepEq(added, [{ id: 'y', text: 'hello', frozen: true }]);
});
test('upsert replaces unfrozen record without mutating prior array or record', () => {
  const previous = { id: 'x', text: 'old' }, old = [previous], incoming = { id: 'x', text: 'new' };
  const result = T.upsertFrozenLayerSummary(old, incoming);
  assert.notEqual(result, old); deepEq(old, [previous]); assert.equal(previous.frozen, undefined);
  deepEq(result, [{ id: 'x', text: 'new', frozen: true }]);
});
test('invalid IDs return an unchanged copy', () => {
  const old = [{ id: 'x' }]; const result = T.upsertFrozenLayerSummary(old, { text: 'bad' });
  assert.notEqual(result, old); deepEq(result, old);
});
test('prompt context selects only frozen, non-stale summaries that end before the target chapter', () => {
  const st = { layeredMemory: { summaries: {
    L2: [{ id: 'L2-old', endChapter: 4, frozen: true, summary: 'L2 cũ' }, { id: 'L2-future', endChapter: 100, frozen: true, summary: 'không được dùng' }],
    L3: [{ id: 'L3-stale', endChapter: 20, frozen: true, stale: true, summary: 'không được dùng' }],
    L4: [{ id: 'L4-old', endChapter: 60, frozen: true, summary: 'L4 cũ' }],
    L5: [{ id: 'L5-unfrozen', endChapter: 60, frozen: false, summary: 'không được dùng' }]
  } } };
  const text = T.buildLayeredMemoryContextBlock(st, 61, 1000);
  assert.match(text, /L2 cũ/); assert.match(text, /L4 cũ/);
  assert.doesNotMatch(text, /không được dùng/);
});
test('prompt context includes recent eligible frozen L1 summaries but excludes current/future chapters', () => {
  const st = { layeredMemory: { summaries: { L1: [
    { id: 'L1-0001', startChapter: 1, endChapter: 1, frozen: true, summary: 'L1 prior chapter event' },
    { id: 'L1-0002', startChapter: 2, endChapter: 2, frozen: true, summary: 'L1 latest prior event' },
    { id: 'L1-0003', startChapter: 3, endChapter: 3, frozen: true, summary: 'L1 future event' }
  ] } } };
  const text = T.buildLayeredMemoryContextBlock(st, 3, 1200);
  assert.match(text, /L1 prior chapter event|L1 latest prior event/);
  assert.doesNotMatch(text, /L1 future event/);
});
test('prompt context respects a strict character budget', () => {
  const st = { layeredMemory: { summaries: { L2: [{ id: 'x', endChapter: 4, frozen: true, summary: 'A'.repeat(4000) }] } } };
  assert.ok(T.buildLayeredMemoryContextBlock(st, 10, 240).length <= 240);
});
test('organization prompt includes profile/status fields and stays within its budget', () => {
  const st = { organizations: [{ name: 'Hội Bạch Hạc', type: 'Tông môn', leader: 'Lâm', territory: 'Miền Bắc', status: 'hostile', description: 'Kiểm soát cửa ải', historyText: 'Đã phản bội ở chương 3' }] };
  const text = T.organizationProfilesPromptBlock(st, 1000);
  assert.match(text, /Hội Bạch Hạc/); assert.match(text, /hostile/); assert.match(text, /Miền Bắc/); assert.match(text, /chương 3/);
  assert.ok(text.length <= 1000);
});
