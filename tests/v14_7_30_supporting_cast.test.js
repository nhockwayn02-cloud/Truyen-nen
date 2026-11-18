// V14.7.30: nhân vật phụ thúc đẩy truyện (vừa đủ).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(core + '\n;this.f={castPoolForPlan,castPoolBlock,recentNamedCastCount,supportFunctionFor};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const mkCh = names => ({ text: 'Bùi Lạc đi qua hành lang. ' + names.map(n => n + ' nói một câu.').join(' ') });
const chars = [
  { name: 'Quỳnh Anh', importance: 'important', role: 'thư ký' },
  { name: 'Hoàng Yến Nhi', importance: 'supporting', role: 'không rõ', relevanceToMC: 'cấp trên của Quỳnh Anh' },
  { name: 'Nguyễn Văn Hùng', importance: 'supporting', relevanceToMC: 'đối tượng bị Bùi Lạc theo dõi' },
  { name: 'Tuấn', importance: 'minor', relevanceToMC: 'người cung cấp thông tin' },
  { name: 'Phương Anh', importance: 'minor', role: 'người nhận tin nhắn' },
  { name: 'Lão Ba', importance: 'background' }
];
const chapters = []; for (let i = 0; i < 12; i++) chapters.push(mkCh(i < 2 ? ['Yến Nhi', 'Hùng'] : ['Quỳnh Anh']));
const st = { mainCharProfile: { name: 'Bùi Lạc' }, characters: chars, chapters };
t('chọn tối đa 2 người vắng lâu, ưu tiên tầm quan trọng × độ vắng; bỏ nhân vật nền', () => {
  const p = F.castPoolForPlan(st, 13); assert.ok(p.length >= 1 && p.length <= 2, 'len ' + p.length);
  assert.ok(!p.some(x => x.name === 'Lão Ba') && !p.some(x => x.name === 'Quỳnh Anh'));
  assert.ok(['Hoàng Yến Nhi', 'Nguyễn Văn Hùng'].includes(p[0].name));
});
t('mỗi người có chức năng theo vai trò (cấp trên ≠ đối tượng theo dõi)', () => {
  assert.ok(/quyền hạn chức vụ/.test(F.supportFunctionFor(chars[1]))); assert.ok(/manh mối/.test(F.supportFunctionFor(chars[2])));
});
t('người vừa xuất hiện gần đây không bị gọi lại', () => { const ch2 = chapters.concat([mkCh(['Yến Nhi'])]); const p = F.castPoolForPlan(Object.assign({}, st, { chapters: ch2 }), 14); assert.ok(!p.some(x => x.name === 'Hoàng Yến Nhi')); });
t('khối prompt: bắt buộc ≥1 người tác động trực tiếp, nêu chức năng, không thêm người dư', () => {
  const b = F.castPoolBlock(F.castPoolForPlan(st, 13), { allowNew: false }); assert.ok(b.includes('BẮT BUỘC ít nhất MỘT') && b.includes('chức năng chương này') && b.includes('Không tạo thêm nhân vật có tên ngoài hồ sơ'));
});
t('dàn gần đây mỏng → được phép đúng 1 nhân vật phụ mới', () => {
  assert.ok(F.recentNamedCastCount(st, 13) < 3);
  const b = F.castPoolBlock([], { allowNew: true }); assert.ok(b.includes('TỐI ĐA 1 nhân vật phụ MỚI') && !b.includes('Không tạo thêm nhân vật có tên ngoài hồ sơ'));
});
t('không có gì để thêm → khối rỗng', () => assert.strictEqual(F.castPoolBlock([], { allowNew: false }), ''));
const REAL = '/mnt/user-data/attachments/2715c23c-f06e-5342-ab65-5b57b1080754/34cde3fb-Truye__n-1.json';
if (fs.existsSync(REAL)) t('trên truyện thật: chương 31 gọi lại nhân vật phụ vắng lâu', () => {
  const d = JSON.parse(fs.readFileSync(REAL, 'utf8')); const p = F.castPoolForPlan(d, 31);
  console.log('   chương 31 pool:', JSON.stringify(p.map(x => x.name + ' vắng ' + x.absent))); assert.ok(p.length >= 1);
});
process.exit(bad ? 1 : 0);
