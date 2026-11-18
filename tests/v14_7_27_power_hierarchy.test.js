const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={sceneProfileBlock};', ctx);
let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const st = { femaleCharacterDefinition: 'Nữ chính có địa vị cao, không hạ mình ở nơi công cộng.', mainCharProfile: { name: 'Bùi Lạc', position: 'Bảo vệ' }, characters: [{ name: 'Quỳnh Anh', position: 'Thư ký CEO' }, { name: 'Trần Minh Châu', position: 'Tổ trưởng bảo vệ' }],
  statusState: { characterStates: [{ name: 'Quỳnh Anh', changes: { submission: 'sợ hãi, run rẩy trước tổ trưởng' } }] } };
t('cảnh 2 người: có khối thứ bậc quyền lực với chức vụ từng người', () => { const b = ctx.f.sceneProfileBlock(st, { characters: ['Quỳnh Anh', 'Trần Minh Châu'] }); assert.ok(b.includes('THỨ BẬC QUYỀN LỰC') && b.includes('Quỳnh Anh = Thư ký CEO') && b.includes('Tổ trưởng bảo vệ') && b.includes('Nguyên tắc nhân vật nữ')); });
t('thứ bậc đứng sau Current Status để không bị ghi đè', () => { const b = ctx.f.sceneProfileBlock(st, { characters: ['Quỳnh Anh', 'Trần Minh Châu'] }); assert.ok(b.indexOf('THỨ BẬC') > b.indexOf('mức phục tùng')); });
t('cảnh 1 người: không thêm khối', () => { assert.ok(!ctx.f.sceneProfileBlock(st, { characters: ['Quỳnh Anh'] }).includes('THỨ BẬC')); });
process.exit(bad ? 1 : 0);
