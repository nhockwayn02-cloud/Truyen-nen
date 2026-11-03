// V14.5.13: thẻ nhân vật đầy đủ trong Current Status — khởi tạo từ hồ sơ, cộng dồn, thay đổi cần câu trích thật, không bịa.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={seedStatusCard,currentStatusCard,statusCardTargets,buildStatusCardPrompt,parseStatusCards,acceptStatusCards,replaceStatusCharacterBlock,statusCharacterLines,runStatusCardUpdate,sceneProfileBlock};', ctx);
const T = ctx.__t; let pass = 0; const t = async (n, f) => { await f(); console.log('PASS ' + n); pass++; };
const mkSt = () => ({ mainCharProfile: { name: 'Bùi Lạc', occupation: 'Bảo vệ', gender: 'Nam' }, characters: [
  { id: 'c1', name: 'Trần Mỹ Duyên', position: 'Thư ký riêng của chủ tịch', occupation: 'Thư ký', residence: 'Căn hộ cao cấp tầng 20', age: '27', personality: 'Điềm tĩnh' },
  { id: 'c2', name: 'Lâm Tịnh Nhã', position: 'Chủ tịch' }], statusState: {}, currentStatus: 'Current Status Update - Sau Chương 3\n- Địa điểm: Căn hộ\n- Thông tin nhân vật cập nhật:\n  • Trần Mỹ Duyên: Không có thay đổi đáng kể\n- XUNG ĐỘT CẦN GIỮ LẠI: x' });
const TEXT = 'Mỹ Duyên bước vào căn hộ cao cấp tầng 20 của mình, người vẫn mặc bộ váy công sở xám. Bùi Lạc khóa cửa lại sau lưng cô. Mỹ Duyên run rẩy đứng giữa phòng khách.';
(async () => {
await t('thẻ khởi tạo từ hồ sơ gốc (chức vụ, nơi ở, tuổi, tính cách) và nhân vật có mặt được chọn đúng', async () => {
  const st = mkSt(); const card = T.currentStatusCard(st, st.characters[0]);
  assert.strictEqual(card.residence, 'Căn hộ cao cấp tầng 20'); assert.ok(/Thư ký riêng/.test(card.socialStatus)); assert.strictEqual(card.age, '27');
  const names = Array.from(T.statusCardTargets(st, TEXT, 8)).map(c => c.name); assert.deepStrictEqual(names, ['Bùi Lạc', 'Trần Mỹ Duyên']);
});
await t('AI trả đủ thẻ: chép lại giá trị cũ không cần evidence; trường đổi có câu trích thật được nhận; trường bịa không có evidence bị loại; giữ thẻ cũ', async () => {
  const st = mkSt(); let sent = '';
  const reply = JSON.stringify({ cards: [{ characterId: 'c1', name: 'Trần Mỹ Duyên', card: { occupation: 'Thư ký', residence: 'Căn hộ cao cấp tầng 20', clothing: 'Váy công sở xám', emotion: 'Run rẩy, sợ hãi', socialStatus: 'Người giúp việc' },
    changeEvidence: { clothing: 'người vẫn mặc bộ váy công sở xám', emotion: 'Mỹ Duyên run rẩy đứng giữa phòng khách' } }] });
  const r = await T.runStatusCardUpdate({ st, text: TEXT, n: 4, callText: async p => { sent = p; return reply; } });
  assert.ok(r.ok && r.changed === 2 && r.dropped === 1, JSON.stringify(r));
  const c = T.currentStatusCard(st, st.characters[0]);
  assert.strictEqual(c.clothing, 'Váy công sở xám'); assert.ok(/Run rẩy/.test(c.emotion));
  assert.ok(/Thư ký riêng/.test(c.socialStatus), 'địa vị không được bị đổi thành giúp việc khi không có evidence'); assert.strictEqual(c.residence, 'Căn hộ cao cấp tầng 20');
  assert.ok(/THẺ HIỆN HÀNH/.test(sent) && /Căn hộ cao cấp tầng 20/.test(sent));
});
await t('cộng dồn qua chương: chương sau không nhắc tới thì thẻ vẫn giữ; AI trả rỗng/JSON hỏng/lỗi -> không mất gì', async () => {
  const st = mkSt();
  await T.runStatusCardUpdate({ st, text: TEXT, n: 4, callText: async () => JSON.stringify({ cards: [{ name: 'Trần Mỹ Duyên', card: { clothing: 'Váy công sở xám' }, changeEvidence: { clothing: 'người vẫn mặc bộ váy công sở xám' } }] }) });
  const before = JSON.stringify(T.currentStatusCard(st, st.characters[0]));
  const r1 = await T.runStatusCardUpdate({ st, text: TEXT, n: 5, callText: async () => 'không phải json' });
  const r2 = await T.runStatusCardUpdate({ st, text: TEXT, n: 5, callText: async () => { throw new Error('boom'); } });
  const r3 = await T.runStatusCardUpdate({ st, text: TEXT, n: 5, callText: async () => JSON.stringify({ cards: [] }) });
  assert.ok(!r1.ok && !r2.ok && r3.ok); assert.strictEqual(JSON.stringify(T.currentStatusCard(st, st.characters[0])), before);
  assert.ok(/Váy công sở xám/.test(T.currentStatusCard(st, st.characters[0]).clothing));
});
await t('văn bản Current Status: khối nhân vật được thay bằng thẻ đầy đủ, giữ nguyên các phần khác; giá trị lười "giữ nguyên" bị bỏ', async () => {
  const st = mkSt();
  await T.runStatusCardUpdate({ st, text: TEXT, n: 4, callText: async () => JSON.stringify({ cards: [{ name: 'Trần Mỹ Duyên', card: { occupation: 'giữ nguyên', clothing: 'Váy công sở xám' }, changeEvidence: { clothing: 'người vẫn mặc bộ váy công sở xám' } }] }) });
  assert.ok(/- Địa điểm: Căn hộ/.test(st.currentStatus) && /XUNG ĐỘT CẦN GIỮ LẠI/.test(st.currentStatus));
  assert.ok(/Trần Mỹ Duyên: .*nơi ở hiện tại: Căn hộ cao cấp tầng 20/.test(st.currentStatus) && /trang phục hiện tại: Váy công sở xám/.test(st.currentStatus) && /công việc hiện tại: Thư ký/.test(st.currentStatus));
  assert.strictEqual((st.currentStatus.match(/Thông tin nhân vật cập nhật/g) || []).length, 1);
});
await t('thẻ tích lũy tự động vào prompt viết từng cảnh', async () => {
  const st = mkSt();
  await T.runStatusCardUpdate({ st, text: TEXT, n: 4, callText: async () => JSON.stringify({ cards: [{ name: 'Trần Mỹ Duyên', card: { clothing: 'Váy công sở xám' }, changeEvidence: { clothing: 'người vẫn mặc bộ váy công sở xám' } }] }) });
  const b = T.sceneProfileBlock(st, { characters: ['Mỹ Duyên'] }, []);
  assert.ok(/nơi ở hiện tại: Căn hộ cao cấp tầng 20/.test(b) && /Váy công sở xám/.test(b));
});
console.log('OK ' + pass + ' test');
})().catch(e => { console.error('FAIL', e && e.stack || e); process.exit(1); });
