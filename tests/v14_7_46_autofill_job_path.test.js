// Kiểm tra trên trình duyệt thật: nhân vật mới đến từ job nền (mergeBackgroundChapter) được tự dựng hồ sơ trống; công tắc tắt thì không gọi AI; nút bấm tay chỉ điền ô trống.
const { chromium } = require('playwright'); const assert = require('assert'); const path = require('path');
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext(); await ctx.addInitScript('window.__XTA_TEST__=true'); const p = await ctx.newPage(); let calls = 0, errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route('**/mock/chat/completions', async r => { calls++; await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{"appearance":"Thấp, đậm người, tóc húi cua.","personality":"Lầm lì","hair":"đen","age":"99","gender":"nữ"}' }, finish_reason: 'stop' }] }) }); });
  await p.goto('file://' + path.join(__dirname, '../index.html')); await p.waitForTimeout(1200);
  const run = (off, nm) => p.evaluate(async ([off, nm]) => { const s = __xta.state; s.apiEndpoint = 'http://mock/chat/completions'; s.apiKey = 'k-test-123456'; s.model = 'MAIN'; s.autoFillNewChars = !off; s.characters = []; s.chapters = [{ text: 'x' }];
    await __xta.mergeBackgroundChapter({ storyState: { chapters: [{ text: 'x' }, { text: nm + ' bước vào.' }], characters: [{ id: 'id_' + nm, name: nm, tier: 'minor', age: '31', gender: 'nam' }] } }, { storyId: s.storyId });
    await new Promise(r => setTimeout(r, 1200)); const c = s.characters.find(x => x.name === nm); return { appearance: c.appearance, age: c.age, gender: c.gender, filled: c.aiFilledFields || [] }; }, [off, nm]);
  const on = await run(false, 'Tuấn'); const c1 = calls; const off = await run(true, 'Nam');
  assert.ok(/húi cua/.test(on.appearance), 'ON: phải điền ngoại hình'); assert.strictEqual(on.age, '31', 'không ghi đè tuổi đã có'); assert.strictEqual(on.gender, 'nam', 'không ghi đè giới tính đã có'); assert.ok(!on.filled.includes('age') && !on.filled.includes('gender'));
  assert.strictEqual(c1, 1, 'ON: đúng 1 lượt gọi AI'); assert.ok(!off.appearance, 'OFF: không điền'); assert.strictEqual(calls - c1, 0, 'OFF: 0 lượt gọi AI'); assert.deepStrictEqual(errs, []);
  console.log('PASS job nền: nhân vật mới tự dựng hồ sơ trống; công tắc tắt thì không gọi AI; không ghi đè ô đã có'); await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
