// V14.7.47 QA phía trình duyệt (mock, không gọi model thật): hàng 3-8 và 10 của bảng kiểm tra.
const { chromium, devices } = require('playwright'); const assert = require('assert'); const path = require('path');
const results = []; const ok = (n, c, d) => { results.push({ n, pass: !!c, d }); if (!c) console.error('FAIL', n, d || ''); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext(); await ctx.addInitScript('window.__XTA_TEST__=true'); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  let mode = 'ok', calls = 0, bodyText = '';
  await p.route('**/mock/chat/completions', async r => { calls++; const m = mode;
    if (/^http/.test(m)) return r.fulfill({ status: 200, body: '{}' });
    const st = { e403: 403, e404: 404, e429: 429, e402: 402, e401: 401 }[m];
    if (st) return r.fulfill({ status: st, contentType: 'application/json', headers: st === 429 ? { 'retry-after': '0' } : {}, body: JSON.stringify({ error: { message: 'lỗi ' + st + ' key k-test-123456' } }) });
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: mode === 'world' ? '{"locations":[{"name":"Quán Mưa","status":"destroyed"},{"name":"Bến Xe","status":"active","description":"mới"}]}' : mode === 'garbage' ? 'Xin lỗi, tôi không thể.' : mode === 'trunc' ? '[{"name":"Mai","appearance":"tóc dài' : '[]' }, finish_reason: 'stop' }] }) }); });
  await p.goto('file://' + path.join(__dirname, '../index.html')); await p.waitForTimeout(1200);
  await p.evaluate(() => { const s = __xta.state; s.apiEndpoint = 'http://mock/chat/completions'; s.apiKey = 'k-test-123456'; s.model = 'MAIN'; });
  // Hàng 6: JSON
  const js = await p.evaluate(() => { const f = __xta.safeJsonParse; return {
    fenced: f('```json\n{"a":1}\n```'), trailing: f('{"a":[1,2,],"b":2}'), trunc: f('[{"name":"A","x":"1"},{"name":"B","x":"tóc d'), junk: f('không phải json'), empty: f(''), prefixed: f('Đây là kết quả: {"a":1} hết.') }; });
  ok('R6 JSON fenced', js.fenced && js.fenced.a === 1); ok('R6 JSON dấu phẩy thừa không nổ', js.trailing === null || typeof js.trailing === 'object');
  ok('R6 JSON cụt: cứu được phần đủ, không bịa', Array.isArray(js.trunc) && js.trunc[0] && js.trunc[0].name === 'A'); ok('R6 rác/rỗng → null', js.junk === null && js.empty === null); ok('R6 có lời dẫn', js.prefixed && js.prefixed.a === 1);
  // Hàng 3: cập nhật nhân vật không mất dữ liệu khi AI trả rác / cụt
  const seed = () => p.evaluate(() => { const s = __xta.state; s.chapters = [{ number: 1, title: 'c1', text: 'Mai bước vào quán cà phê. Mai nhìn Lan.', wordCount: 9 }];
    s.characters = [{ id: 'c_mai', name: 'Mai', tier: 'supporting', age: '27', gender: 'nữ', appearance: 'tóc dài đen, mắt nâu', relationships: [{ withName: 'Lan', type: 'bạn', status: 'thân' }], history: [{ chapter: 1, event: 'gặp Lan' }] }]; });
  for (const m of ['garbage', 'trunc', 'e429']) { await seed(); mode = m; calls = 0;
    const r = await p.evaluate(async () => { const out = await __xta.updateCharactersIncremental('Mai bước vào quán cà phê. Mai nhìn Lan.', 1, true).catch(e => ({ threw: e.message })); const c = __xta.state.characters.find(x => x.name === 'Mai'); return { out, c: JSON.parse(JSON.stringify(c || null)), n: __xta.state.characters.length }; });
    ok('R3 [' + m + '] không mất nhân vật/tuổi/ngoại hình/quan hệ', r.c && r.c.age === '27' && /tóc dài đen/.test(r.c.appearance) && r.c.relationships.length === 1 && r.c.history.length >= 1 && r.n === 1, JSON.stringify(r.out)); }
  mode = 'ok'; await seed();
  const lock = await p.evaluate(() => { const s = __xta.state; const c = s.characters[0]; const before = c.age;
    __xta.mergeCharacterUpdate({ name: 'Mai', age: '45', gender: 'nam', appearance: 'đeo kính', relationships: [{ withName: 'Lan', status: 'xa cách' }, { withName: 'Hà', type: 'đồng nghiệp' }] }, 2, null);
    return { age: c.age, gender: c.gender, app: c.appearance, nd: c.newDetails || '', rels: c.relationships.map(r => r.withName + ':' + (r.status || '')) }; });
  ok('R3 tuổi/giới tính đã có không bị ghi đè', lock.age === '27' && lock.gender === 'nữ', JSON.stringify(lock)); ok('R3 hồ sơ gốc khóa: ngoại hình cũ giữ nguyên, chi tiết mới không mất mà vào newDetails', /tóc dài đen/.test(lock.app) && !/kính/.test(lock.app) && /kính/.test(lock.nd), JSON.stringify(lock)); ok('R3 quan hệ: cập nhật Lan, thêm Hà, không mất', lock.rels.includes('Lan:xa cách') && lock.rels.some(x => /^Hà/.test(x)), JSON.stringify(lock.rels));
  // Hàng 4: World Bible
  for (const m of ['garbage', 'trunc']) { mode = m; const w = await p.evaluate(async () => { const s = __xta.state; s.locations = [{ id: 'l1', name: 'Quán Mưa', status: 'mở', description: 'quán cũ' }]; s.items = [{ id: 'i1', name: 'Nhẫn', status: 'giữ' }];
      const r = await __xta.updateWorldIncremental('Chương có địa điểm mới.', 1, true).catch(e => ({ threw: e.message })); return { r, l: s.locations.length, i: s.items.length, d: s.locations[0].description }; });
    ok('R4 [' + m + '] world cũ còn nguyên khi AI trả rác', w.l >= 1 && w.i >= 1 && w.d === 'quán cũ', JSON.stringify(w)); }
  mode = 'ok';
  mode = 'world'; const wo = await p.evaluate(async () => { const s = __xta.state; s.locations = [{ id: 'l1', name: 'Quán Mưa', status: 'active', description: 'quán cũ' }]; await __xta.updateWorldIncremental('Quán Mưa bị cháy. Họ tới Bến Xe.', 3, true); return s.locations.map(l => l.name + ':' + l.status + ':' + (l.description || '')); }); mode = 'ok';
  ok('R4 thế giới cập nhật: địa điểm cũ đổi trạng thái (giữ mô tả), địa điểm mới được thêm', wo.length === 2 && wo.some(x => /^Quán Mưa:destroyed:quán cũ/.test(x)) && wo.some(x => /^Bến Xe/.test(x)), JSON.stringify(wo));
  // Hàng 5: Timeline — mốc mới hơn không bị mốc cũ đè
  const tl = await p.evaluate(async () => { const s = __xta.state; s.chapters = [{ number: 1, title: 'c1', text: 'x', wordCount: 1 }];
    s.statusState = { timeLog: [{ chapter: 1, time: 'CŨ 2020', updatedAt: 1000 }, { chapter: 2, time: 'CHỈ-LOCAL', updatedAt: 1500 }] };
    await __xta.mergeBackgroundChapter({ storyState: { chapters: [{ number: 1, title: 'c1', text: 'x', wordCount: 1 }, { number: 2, title: 'c2', text: 'y', wordCount: 1 }], statusState: { timeLog: [{ chapter: 1, time: 'MỚI 2021', updatedAt: 9000 }, { chapter: 3, time: 'REMOTE-3', updatedAt: 9100 }] }, characters: [] } }, { briefAtStart: '' }).catch(e => { window.__tlerr = e.message; });
    return (s.statusState.timeLog || []).map(x => x.chapter + ':' + x.time); });
  ok('R5 timeline: mốc job nền MỚI hơn thắng mốc local cũ; mốc chỉ-local giữ; mốc chỉ-remote thêm', tl.includes('1:MỚI 2021') && tl.includes('2:CHỈ-LOCAL') && tl.includes('3:REMOTE-3'), JSON.stringify(tl));
  // Hàng 7: API
  for (const [m, st] of [['e401', 401], ['e402', 402], ['e403', 403], ['e404', 404]]) { mode = m; calls = 0; const r = await p.evaluate(async () => { try { await __xta.callAI('KIỂM TRA', { maxTokens: 50 }); return { ok: true }; } catch (e) { return { msg: e.message, status: e.status }; } });
    ok('R7 ' + st + ' phân loại đúng, không retry vô ích, không lộ key', r.status === st && calls === 1 && !/k-test-123456/.test(r.msg || ''), JSON.stringify(r) + ' calls=' + calls); }
  mode = 'e429'; calls = 0; const t0 = Date.now(); const r429 = await p.evaluate(async () => { try { await __xta.callAI('KIỂM TRA', { maxTokens: 50 }); return { ok: true }; } catch (e) { return { msg: e.message, status: e.status }; } });
  ok('R7 429: retry CÓ GIỚI HẠN (≤5 lượt), kết thúc có thông báo, không treo', r429.status === 429 && calls >= 2 && calls <= 5 && !/k-test-123456/.test(r429.msg || ''), JSON.stringify(r429) + ' calls=' + calls + ' ' + (Date.now() - t0) + 'ms');
  mode = 'ok';
  // Hàng 8: lưu chương khi bộ nhớ đầy + tải lại
  const sv = await p.evaluate(async () => { const s = __xta.state; s.chapters = [{ number: 1, title: 'Chương 1', text: 'Nội dung chương một rất quan trọng. '.repeat(50), wordCount: 300 }];
    const orig = Storage.prototype.setItem; Storage.prototype.setItem = function () { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
    let threw = null; try { __xta.persistNow ? __xta.persistNow({}) : null; } catch (e) { threw = e.message; } await new Promise(r => setTimeout(r, 1500)); Storage.prototype.setItem = orig; return { threw, still: __xta.state.chapters.length, len: __xta.state.chapters[0].text.length }; });
  ok('R8 localStorage đầy: không ném lỗi, chương còn trong bộ nhớ', sv.threw === null && sv.still === 1 && sv.len > 1000, JSON.stringify(sv));
  await p.evaluate(async () => { __xta.persistNow && __xta.persistNow({}); await new Promise(r => setTimeout(r, 1500)); }); await p.reload(); await p.waitForTimeout(1500);
  const rl = await p.evaluate(() => ({ n: (window.__xta.state.chapters || []).length, t: ((window.__xta.state.chapters || [])[0] || {}).title }));
  ok('R8 tải lại trang: chương vẫn còn', rl.n === 1 && rl.t === 'Chương 1', JSON.stringify(rl));
  ok('R3-8 không có lỗi JS không bắt (pageerror)', errs.length === 0, errs.join(' | '));
  // Hàng 10: iPhone (giả lập Chromium — KHÔNG phải Safari thật)
  const ip = await b.newContext({ ...devices['iPhone 13'] }); const ipg = await ip.newPage(); await ipg.goto('file://' + path.join(__dirname, '../index.html')); await ipg.waitForTimeout(1500);
  const lay = await ipg.evaluate(() => { const w = innerWidth; const over = document.documentElement.scrollWidth - w; const small = [...document.querySelectorAll('button:not([hidden]),input[type=checkbox]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 28) && getComputedStyle(e).visibility !== 'hidden'; }).length; const fs = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]),textarea,select')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && parseFloat(getComputedStyle(e).fontSize) < 16; }).length; return { w, over, small, fs }; });
  ok('R10 iPhone(emul): không tràn ngang trang', lay.over <= 2, JSON.stringify(lay)); ok('R10 iPhone(emul): ô nhập ≥16px (tránh Safari tự zoom)', lay.fs === 0, JSON.stringify(lay)); console.log('INFO nút cao <28px (emul):', lay.small);
  const pass = results.filter(r => r.pass).length; results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.n + (r.pass ? '' : ' :: ' + r.d))); console.log(pass + '/' + results.length); await b.close(); process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
