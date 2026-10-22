// V14.1: hệ thống tu luyện — thang cảnh giới 9 tầng, kiểm soát đột phá, hồ sơ khóa, tuổi ngoại hình, vật phẩm phẩm cấp, worker.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(ROOT, 'shared/core.js'), 'utf8');
const C = new Function(core + ';return {parseRealm,realmChangeVerdict,applyCultivationUpdate,cultivationSystemBlock,isCultivationGenre,realmLadderOf,parseAgeNum,profileAgeNum,underageNames,characterLockPrompt,applyMainCharUpdate,mergeCharacterRecords,CULT_DEFAULT_SYSTEM_TEXT,DEFAULT_REALM_LADDER}')();

// 1) parse cảnh giới + chín tiểu tầng
const P = C.parseRealm;
assert.deepStrictEqual([P('Luyện Khí đệ nhất trọng').major, P('Luyện Khí đệ nhất trọng').tier], [0, 1]);
assert.strictEqual(P('Luyện Khí đệ cửu trọng').tier, 9);
assert.strictEqual(P('Trúc Cơ hậu kỳ').tier, 8);
assert.strictEqual(P('Kết Đan đệ cửu (viên mãn)').tier, 9);
assert.strictEqual(P('Trúc Cơ tầng 3').tier, 3);
assert.strictEqual(P('Nguyên Anh').major, 3);
assert.strictEqual(P('Hóa Thần').known, false, 'cảnh giới ngoài thang = không biết');
assert.strictEqual(P('đệ tử ngoại môn').known, false, '"đệ tử" không bị nhầm thành "đệ tứ"');
assert.ok(P('Trúc Cơ đệ tam trọng').rank < P('Trúc Cơ đệ tứ trọng').rank && P('Luyện Khí đệ cửu trọng').rank < P('Trúc Cơ đệ nhất trọng').rank);
assert.strictEqual(C.isCultivationGenre('Tu tiên, huyền huyễn'), true);
assert.strictEqual(C.isCultivationGenre('Đô thị tình cảm'), false);

// 2) kiểm soát đổi cảnh giới
const V = C.realmChangeVerdict;
assert.strictEqual(V('', 'Luyện Khí đệ nhất trọng').ok, true);
assert.strictEqual(V('Luyện Khí đệ cửu trọng', 'Trúc Cơ đệ nhất trọng').kind, 'breakthrough');
assert.strictEqual(V('Trúc Cơ đệ tam trọng', 'Trúc Cơ đệ tứ trọng').kind, 'advance');
assert.strictEqual(V('Luyện Khí đệ cửu trọng', 'Kết Đan đệ nhất trọng').ok, false, 'nhảy 2 đại cảnh giới bị bác');
assert.strictEqual(V('', 'Hóa Thần đệ nhất trọng').ok, false, 'không tự đặt cảnh giới ngoài thang');
assert.strictEqual(V('Trúc Cơ đệ tam trọng', 'Trúc Cơ đệ tam trọng').ok, false);
const ladder = ['Luyện Khí', 'Trúc Cơ', 'Kết Đan', 'Nguyên Anh', 'Hóa Thần'];
assert.strictEqual(V('Nguyên Anh', 'Hóa Thần', ladder).ok, true, 'thang tùy chỉnh');

const st = { characters: [], mainCharProfile: null };
const A = (t, u, o) => C.applyCultivationUpdate(t, u, Object.assign({ state: st }, o));
let c = { name: 'Lâm Phong', realm: 'Luyện Khí đệ cửu trọng' };
A(c, { realm: 'Trúc Cơ đệ nhất trọng' }, { explicit: false });
assert.strictEqual(c.realm, 'Luyện Khí đệ cửu trọng', 'không có sự kiện đột phá => giữ nguyên');
A(c, { realm: 'Trúc Cơ đệ nhất trọng' }, { explicit: true, evidence: 'Lâm Phong cảm nhận đan điền chấn động, hắn đã đột phá Trúc Cơ' });
assert.strictEqual(c.realm, 'Trúc Cơ đệ nhất trọng'); assert.strictEqual(c.peakRealm, 'Trúc Cơ đệ nhất trọng');
A(c, { realm: 'Trúc Cơ đệ nhất trọng' }, { explicit: true, evidence: 'Hắn đột phá Trúc Cơ' });
A(c, { realm: 'Luyện Khí đệ ngũ trọng' }, { explicit: true, evidence: 'Tu vi của hắn bị phế còn Luyện Khí đệ ngũ trọng' });
assert.strictEqual(c.realm, 'Luyện Khí đệ ngũ trọng', 'tụt cảnh có sự kiện thì được ghi'); assert.strictEqual(c.peakRealm, 'Trúc Cơ đệ nhất trọng', 'peakRealm giữ mức cao nhất');
let e = { name: 'Mới' }; A(e, { realm: 'Luyện Khí đệ tam trọng' }, { explicit: false }); assert.strictEqual(e.realm, 'Luyện Khí đệ tam trọng', 'hồ sơ trống được điền');
let f = { name: 'X' }; A(f, { realm: 'Thiên Tiên' }, {}); assert.strictEqual(f.realm, undefined, 'cảnh giới ngoài thang không được điền');

// các nhóm trường khác
let g = { name: 'Y', technique: 'Thanh Mộc Quyết', arts: 'Kiếm khí', combatPower: 'ngang Trúc Cơ sơ kỳ' };
A(g, { technique: 'Công pháp khác', arts: 'Phong Lôi chưởng', combatPower: 'ngang Trúc Cơ hậu kỳ', spiritRoot: 'Tam linh căn', lifespan: '150 năm' }, { explicit: false });
assert.strictEqual(g.technique, 'Thanh Mộc Quyết', 'công pháp chính không tự đổi');
assert.ok(/Kiếm khí/.test(g.arts) && /Phong Lôi chưởng/.test(g.arts), 'thần thông cộng dồn');
assert.strictEqual(g.combatPower, 'ngang Trúc Cơ hậu kỳ', 'sức chiến đấu là trạng thái động');
assert.strictEqual(g.spiritRoot, 'Tam linh căn'); A(g, { spiritRoot: 'Thiên linh căn' }, {}); assert.strictEqual(g.spiritRoot, 'Tam linh căn', 'linh căn chỉ điền khi trống');
A(g, { technique: 'Cửu Dương Công' }, { explicit: true }); assert.strictEqual(g.technique, 'Cửu Dương Công', 'explicit mới được đổi công pháp');

// tên khác / đạo hiệu
const other = { name: 'Trần Nhị', aliases: ['Hắc Y Kiếm'] }, me = { name: 'Lâm Phong' };
const st2 = { characters: [other, me], mainCharProfile: null };
C.applyCultivationUpdate(me, { aliases: ['Huyền Phong Tử', 'Hắc Y Kiếm', 'Lâm Phong'] }, { state: st2 });
assert.deepStrictEqual(me.aliases, ['Huyền Phong Tử'], 'bỏ tên trùng nhân vật khác và tên chính');

// 3) prompt: hệ thống tu luyện + hồ sơ khóa
const blk = C.cultivationSystemBlock({ genre: 'Tu tiên' });
assert.ok(/Luyện Khí → Trúc Cơ → Kết Đan → Nguyên Anh/.test(blk) && /chưa có ai chạm tới/.test(blk) && /cửu trọng/.test(blk));
assert.strictEqual(C.cultivationSystemBlock({ genre: 'Đô thị' }), '', 'truyện khác không bị chèn khối tu luyện');
assert.ok(C.cultivationSystemBlock({ genre: 'x', cultivationSystem: 'Quy tắc riêng ABC' }).includes('Quy tắc riêng ABC'));
assert.ok(C.CULT_DEFAULT_SYSTEM_TEXT.includes('Luyện Khí') && C.CULT_DEFAULT_SYSTEM_TEXT.includes('chín tiểu tầng'));
const lock = C.characterLockPrompt({ name: 'Lâm Phong', realm: 'Trúc Cơ đệ tam trọng', technique: 'Thanh Mộc Quyết', faction: 'Thanh Vân Tông', position: 'đệ tử nội môn', apparentAge: '20', aliases: ['Huyền Phong'] }, [], false);
['cảnh giới: Trúc Cơ đệ tam trọng', 'công pháp: Thanh Mộc Quyết', 'phe/tổ chức: Thanh Vân Tông', 'tuổi ngoại hình: 20', 'tên khác: Huyền Phong', 'CẢNH GIỚI/CÔNG PHÁP'].forEach(x => assert.ok(lock.includes(x), 'hồ sơ khóa thiếu: ' + x));
assert.ok(!C.characterLockPrompt({ name: 'A', age: '30' }, [], false).includes('CẢNH GIỚI/CÔNG PHÁP'), 'không có dữ liệu tu luyện => không thêm luật');

// 4) tuổi thực vs tuổi ngoại hình
assert.strictEqual(C.parseAgeNum('17 tuổi, đã tu luyện 300 năm'), 17);
assert.strictEqual(C.parseAgeNum('Tuổi: 25'), 25); assert.strictEqual(C.parseAgeNum('300'), 300);
assert.deepStrictEqual(C.underageNames({ mainCharProfile: { name: 'Lão Quái', age: '300', apparentAge: 'trông như 16 tuổi' }, characters: [{ name: 'Ổn', age: '300', apparentAge: '25' }] }), ['Lão Quái']);

// 5) nhân vật chính qua applyMainCharUpdate
const mc = { name: 'Lâm Phong', realm: 'Luyện Khí đệ cửu trọng' };
const src = 'Lâm Phong nuốt Trúc Cơ Đan, đan điền chấn động, hắn đã đột phá Trúc Cơ đệ nhất trọng.';
C.applyMainCharUpdate(mc, { realm: 'Trúc Cơ đệ nhất trọng' }, src, st);
assert.strictEqual(mc.realm, 'Luyện Khí đệ cửu trọng');
C.applyMainCharUpdate(mc, { realm: 'Trúc Cơ đệ nhất trọng', explicitCoreChange: true, changeEvidence: 'hắn đã đột phá Trúc Cơ đệ nhất trọng' }, src, st);
assert.strictEqual(mc.realm, 'Trúc Cơ đệ nhất trọng');
C.applyMainCharUpdate(mc, { realm: 'Kết Đan đệ nhất trọng', explicitCoreChange: true, changeEvidence: 'bằng chứng bịa không có trong chương' }, src, st);
assert.strictEqual(mc.realm, 'Trúc Cơ đệ nhất trọng', 'bằng chứng không nằm trong chương => bác');

// 6) gộp nhân vật trùng giữ thần thông
const t1 = { name: 'A', arts: 'Kiếm khí' }, s1 = { name: 'A', arts: 'Phong Lôi chưởng', realm: 'Trúc Cơ' };
C.mergeCharacterRecords(t1, s1); assert.ok(/Kiếm khí/.test(t1.arts) && /Phong Lôi/.test(t1.arts) && t1.realm === 'Trúc Cơ');

// 7) worker: mergeCharacter + applyWorld
const wsrc = fs.readFileSync(path.join(ROOT, 'netlify/functions/write-chapter-background.js'), 'utf8');
const mod = { exports: {} };
const sandbox = { module: mod, exports: mod.exports, console, process, Buffer, setTimeout, clearTimeout, URL, AbortController, TextDecoder, TextEncoder,
  require: (n) => (n === '@netlify/blobs' ? { getStore() {}, connectLambda() {} } : require(n)), fetch: async () => { throw new Error('network disabled'); } };
vm.createContext(sandbox);
vm.runInContext(wsrc + '\n;module.exports.__t={mergeCharacter,applyWorld};', sandbox);
const W = mod.exports.__t;
const chapter = 'Lâm Phong nuốt đan dược, hắn đã đột phá Trúc Cơ đệ nhất trọng. Hắc Phong Kiếm nhận chủ.';
const state = { chapters: [], mainCharProfile: { name: 'Chủ Nhân', realm: 'Luyện Khí đệ nhất trọng' }, characters: [{ id: 'c1', name: 'Lâm Phong', tier: 'major', realm: 'Luyện Khí đệ cửu trọng', technique: 'Thanh Mộc Quyết', coreLocked: true, relationships: [], history: [] }], items: [], locations: [], threads: [] };
W.mergeCharacter(state, { name: 'Lâm Phong', realm: 'Trúc Cơ đệ nhất trọng', technique: 'Công pháp khác', arts: 'Phong Lôi chưởng' }, 5, chapter);
assert.strictEqual(state.characters[0].realm, 'Luyện Khí đệ cửu trọng', 'worker: không explicit => không đổi cảnh giới');
assert.strictEqual(state.characters[0].technique, 'Thanh Mộc Quyết');
assert.strictEqual(state.characters[0].arts, 'Phong Lôi chưởng');
W.mergeCharacter(state, { name: 'Lâm Phong', realm: 'Trúc Cơ đệ nhất trọng', explicitCoreChange: true, changeEvidence: 'hắn đã đột phá Trúc Cơ đệ nhất trọng' }, 5, chapter);
assert.strictEqual(state.characters[0].realm, 'Trúc Cơ đệ nhất trọng', 'worker: có sự kiện + bằng chứng => đổi'); assert.strictEqual(state.characters[0].peakRealm, 'Trúc Cơ đệ nhất trọng');
W.mergeCharacter(state, { name: 'Mới Đến', realm: 'Hóa Thần', arts: 'Tuyệt kỹ' }, 5, chapter);
const nw = state.characters.find(x => x.name === 'Mới Đến'); assert.ok(nw && !nw.realm && nw.arts === 'Tuyệt kỹ', 'worker: NV mới không nhận cảnh giới ngoài thang');
W.mergeCharacter(state, { name: 'Chủ Nhân', realm: 'Trúc Cơ đệ nhất trọng' }, 5, chapter);
assert.strictEqual(state.mainCharProfile.realm, 'Luyện Khí đệ nhất trọng', 'worker: NV chính cũng bị khóa đột phá');
W.applyWorld({ items: [{ name: 'Hắc Phong Kiếm', description: 'Phi kiếm', kind: 'pháp bảo', grade: 'Hạ phẩm pháp khí', effect: 'Tăng tốc độ', bound: true }] }, 5, state);
const it = state.items[0]; assert.ok(it.kind === 'pháp bảo' && it.grade === 'Hạ phẩm pháp khí' && it.effect === 'Tăng tốc độ' && it.bound === true);
W.applyWorld({ items: [{ name: 'Hắc Phong Kiếm', kind: 'khác', grade: 'Thượng phẩm', bound: false }] }, 6, state);
assert.ok(it.kind === 'pháp bảo' && it.grade === 'Hạ phẩm pháp khí' && it.bound === true, 'phẩm cấp ổn định, bound không tự tắt');

// 8) index.html: nhãn/ trường/ nút có mặt; mirror & sync
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
['id="cultivationSystem"', 'id="realmLadder"', 'id="cultSeedBtn"', 'id="mcExtraBox"', 'id="itemGradeInput"', 'id="itemKindInput"', 'id="itemBoundInput"', 'const CULT_UI', 'function genreLabels'].forEach(x => assert.ok(html.includes(x), 'index.html thiếu ' + x));
assert.ok(wsrc.includes('function cultivationSystemBlock') && wsrc.includes('cultivationSystemBlock(state)'), 'worker có khối tu luyện');
console.log('PASS V14.1 hệ thống tu luyện (thang 9 tầng, khóa đột phá, hồ sơ khóa, tuổi ngoại hình, vật phẩm, worker)');
