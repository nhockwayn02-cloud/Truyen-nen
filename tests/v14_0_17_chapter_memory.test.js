const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'shared', 'core.js'), 'utf8');
const box = {};
vm.createContext(box);
vm.runInContext(source + '\n;this.__t={isActiveStoryChapter,isAcceptedStoryChapter,activeStoryChapters,acceptedStoryChapters,buildRecentBlocks,storySoFarPrompt,invalidateChapterDependentRecords};', box);
const T = box.__t;

const chapters = [
  { title: 'C1', summary: 'Canon một', status: 'SYNCED', text: 'Kết một.' },
  { title: 'C2 draft', summary: 'Bản nháp không phải canon', status: 'DRAFTED', text: 'Kết nháp.' },
  { title: 'C3', summary: 'Canon ba', status: 'APPROVED', text: 'Kết ba.' }
];
assert.deepStrictEqual(T.acceptedStoryChapters(chapters).map(c => c.title), ['C1', 'C3'], 'draft không được chen vào giữa accepted canon');
const recent = T.buildRecentBlocks(chapters);
assert(recent.recentFullText.includes('Kết ba.'), 'recent phải nối từ accepted chapter mới nhất');
assert(!recent.recentFullText.includes('Kết nháp.'), 'recent không lấy draft khi đã có accepted canon');

const st = {
  nextChapterHint: 'Gợi ý cũ',
  nextChapterHintMeta: { targetChapter: 3, version: 2, status: 'active' },
  currentStatus: 'Trạng thái chương 3',
  statusState: { currentState: { location: 'X' } },
  lastStatusChapter: 3,
  lastMemorySyncChapter: 4
};
T.invalidateChapterDependentRecords(st, 3);
assert.strictEqual(st.nextChapterHint, '', 'hint phụ thuộc chương bị xóa phải bị xóa');
assert.strictEqual(st.nextChapterHintMeta.status, 'invalidated', 'hint phải mang trạng thái invalidated');
assert.strictEqual(st.currentStatus, '', 'status đúng chương bị xóa không được giữ như canon hiện tại');
assert.strictEqual(st.lastStatusChapter, 2, 'lastStatusChapter phải lùi về mốc hợp lệ');
assert.strictEqual(st.lastMemorySyncChapter, 3, 'lastMemorySyncChapter phải remap sau xóa');

const shifted = { nextChapterHint: 'Gợi ý sau', nextChapterHintMeta: { targetChapter: 5, version: 1, status: 'active' }, lastStatusChapter: 6, lastMemorySyncChapter: 7 };
T.invalidateChapterDependentRecords(shifted, 3);
assert.strictEqual(shifted.nextChapterHintMeta.targetChapter, 4, 'hint sau chương bị xóa phải remap');
assert.strictEqual(shifted.lastStatusChapter, 5, 'status sau chương bị xóa phải remap');
assert.strictEqual(shifted.lastMemorySyncChapter, 6, 'memory sync sau chương bị xóa phải remap');

console.log('PASS V14.0.17 chapter memory: accepted canon precedence, draft exclusion, dependent invalidation');
