// V14.0.15: Canon Diff, gợi ý nhân vật, sức khỏe truyện, rà mâu thuẫn, telemetry theo bước.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={computeCanonDiff,undoCanonDiffItem,suggestCharacterCandidates,storyHealthReport,deterministicConsistencyCheck,buildConsistencyPrompt,parseConsistencyResponse,classifyStep,recordStepUsage,modelForStep};', ctx);
const T = ctx.__t, clone = x => JSON.parse(JSON.stringify(x));
let pass = 0; const t = (n, f) => { f(); console.log('PASS ' + n); pass++; };

t('canonDiff: thêm mới / cập nhật / hoàn tác từng trường', () => {
  const before = { characters: [{ id: 'c1', name: 'Minh', mentalState: 'bình tĩnh', lastAppearance: 1 }], locations: [], items: [], threads: [] };
  const after = clone(before);
  after.characters[0].mentalState = 'lo lắng'; after.characters[0].lastAppearance = 2;
  after.characters.push({ id: 'c2', name: 'Hà', tier: 'supporting' });
  after.locations.push({ id: 'l1', name: 'Quán cà phê', status: 'active' });
  const d = T.computeCanonDiff(before, after);
  assert.strictEqual(d.counts.charsAdded, 1); assert.strictEqual(d.counts.charsUpdated, 1); assert.strictEqual(d.counts.locations, 1);
  const upd = d.characters.find(x => x.kind === 'updated'); assert.strictEqual(upd.meaningful, 1);
  const st = clone(after);
  assert.ok(T.undoCanonDiffItem(st, upd, 'mentalState').ok); assert.strictEqual(st.characters[0].mentalState, 'bình tĩnh');
  assert.ok(T.undoCanonDiffItem(st, d.characters.find(x => x.kind === 'added')).ok); assert.strictEqual(st.characters.length, 1);
  assert.ok(!T.undoCanonDiffItem(st, upd, 'relationships').ok);
});
t('canonDiff: không đổi gì → rỗng', () => { const s = { characters: [{ id: 'a', name: 'A' }], locations: [], items: [], threads: [] }; const d = T.computeCanonDiff(s, clone(s)); assert.strictEqual(d.characters.length, 0); });

const chapters = [
  { text: 'Lan gặp Trần Thu Hà ở quán. Trần Thu Hà cười. Hà Nội mưa. Ông Bảy bưng cà phê.' },
  { text: 'Trần Thu Hà đến muộn. Ông Bảy chào. Nhưng Minh Anh vẫn ngồi đó. Ông Bảy lặng im.' },
  { text: 'Trần Thu Hà nói nhỏ. Sau Đó họ đi. Minh Anh nhìn quán.' }
];
t('gợi ý nhân vật: lặp lại nhiều chương, bỏ NV/địa điểm đã biết & địa danh', () => {
  const s = T.suggestCharacterCandidates(chapters, ['Nguyễn Minh Anh'], {});
  const names = s.map(x => x.name);
  assert.ok(names.includes('Trần Thu Hà'), names.join('|'));
  assert.ok(names.includes('Ông Bảy'), names.join('|'));
  assert.ok(!names.some(n => /Minh Anh/.test(n)), 'đã có Minh Anh');
  assert.ok(!names.includes('Hà Nội'));
  assert.ok(!T.suggestCharacterCandidates(chapters, ['Trần Thu Hà', 'Ông Bảy'], {}).some(x => x.name === 'Trần Thu Hà'));
});
t('sức khỏe truyện: NV vắng, foreshadowing quá hạn, arc quá kế hoạch', () => {
  const chs = Array.from({ length: 20 }, (_, i) => ({ text: 'Lan nói.', wordCount: 5000, review: { score: i < 15 ? 95 : 70 } }));
  const r = T.storyHealthReport({ chapters: chs, characters: [{ name: 'Minh', tier: 'major', lastAppearance: 3 }, { name: 'Lan', tier: 'major', lastAppearance: 20 }], foreshadowing: [{ description: 'Bí mật', status: 'seeded', plantedChapter: 2 }], threads: [{ desc: 'Tìm kho báu', status: 'seeded', chapterIntroduced: 1 }], arcs: [{ name: 'Arc1', status: 'active', startChapter: 1, endChapterPlanned: 10 }] });
  assert.strictEqual(r.absent.length, 1); assert.strictEqual(r.absent[0].name, 'Minh');
  assert.strictEqual(r.staleForeshadowing.length, 1); assert.ok(r.arc.pct > 100);
  assert.ok(r.alerts.some(a => /Điểm chất lượng đang giảm/.test(a.text)));
  assert.ok(r.alerts.some(a => /thread mở/.test(a.text)));
});
t('rà mâu thuẫn bằng code: người đã chết xuất hiện lại, vợ chồng lệch, trùng tên', () => {
  const st = { chapters: [{ text: 'Minh bước vào.' }, { text: 'Minh chết.' }, { text: 'Minh nói với Lan.' }], characters: [
    { name: 'Minh', dead: true, deathChapter: 2 }, { name: 'Lan', spouseName: 'Hùng' }, { name: 'Hùng', spouseName: 'Mai', maritalStatus: 'độc thân' }, { name: 'Lan' }] };
  const kinds = T.deterministicConsistencyCheck(st).map(i => i.type);
  ['dead_appears', 'spouse', 'duplicate'].forEach(k => assert.ok(kinds.includes(k), k + ' ∉ ' + kinds));
});
t('parse phản hồi rà mâu thuẫn + prompt', () => {
  const r = T.parseConsistencyResponse('```json\n{"issues":[{"severity":"high","type":"age","description":"Tuổi lệch","chapters":[1,5],"evidence":"x"},{"description":""}]}\n```');
  assert.strictEqual(r.length, 1); assert.strictEqual(JSON.stringify(r[0].chapters), '[1,5]');
  assert.strictEqual(T.parseConsistencyResponse('rác').length, 0);
  assert.ok(/RÀ MÂU THUẪN/.test(T.buildConsistencyPrompt({ characters: [], chapters: [{ summary: 'a' }], timeline: [] })));
});
t('telemetry theo bước + model theo bước', () => {
  assert.strictEqual(T.classifyStep('HẬU KỲ TỔNG HỢP CHO CHƯƠNG 3'), 'post');
  assert.strictEqual(T.classifyStep('Bạn đang viết CHƯƠNG THỨ 4'), 'write');
  assert.strictEqual(T.classifyStep('RÀ MÂU THUẪN TOÀN TRUYỆN'), 'check');
  const st = {}; T.recordStepUsage(st, 'post', 'm', 1000, 500, 0.01); T.recordStepUsage(st, 'post', 'm', 1000, 500, 0.01);
  assert.strictEqual(st.costByStep.post.calls, 2); assert.ok(Math.abs(st.costByStep.post.cost - 0.02) < 1e-9);
  assert.strictEqual(T.modelForStep({ stepModels: { post: ' cheap/model ' } }, 'post', 'main'), 'cheap/model');
  assert.strictEqual(T.modelForStep({ stepModels: {} }, 'post', 'main'), 'main'); assert.strictEqual(T.modelForStep(null, 'gate', 'main'), 'main');
});
console.log('PASS V14.0.15 features (' + pass + ')');
