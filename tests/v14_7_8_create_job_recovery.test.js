// V14.7.8: create-job im lặng -> app khôi phục bằng jobId/token do app sinh; server nhận id hợp lệ, từ chối id lạ.
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'app/client.js'), 'utf8'), cj = fs.readFileSync(path.join(root, 'netlify/functions/create-job.js'), 'utf8');
let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
t('server dùng clientJobId/clientAccessToken chỉ khi đúng định dạng', () => {
  assert.match(cj, /clientJobId/); assert.match(cj, /\^job_\[a-z0-9_\]\{10,64\}\$/); assert.match(cj, /\[A-Za-z0-9_-\]\{32,128\}/);
});
t('ngân sách thời gian đồng bộ < 10s (purge 0.8 + ghi 5 + trigger 3)', () => { assert.match(cj, /setTimeout\(r, 800\)/); assert.match(cj, /5000, "Ghi Netlify Blobs"/); assert.match(cj, /\|\| 3000/); });
t('cả hai nơi gọi create-job đều gửi creds và dùng bản có khôi phục', () => {
  assert.equal((client.match(/payload\.clientJobId=_cr\.jobId/g) || []).length, 2);
  assert.equal((client.match(/bgPostCreateJobRecover\(BG_FUNCTIONS_BASE/g) || []).length, 2);
  assert.ok(!/res=await bgPostCreateJob\(BG_FUNCTIONS_BASE/.test(client));
});
t('khôi phục chỉ khi đã tải lên xong và hết giờ; tạo phản hồi giả có jobId + accessToken', () => {
  assert.match(client, /e\.name==="AbortError" && cr && e\.bgInfo && e\.bgInfo\.uploadDone/); assert.match(client, /jobId:cr\.jobId, accessToken:cr\.token/);
});
// chạy thật hàm khôi phục với fetch giả
const vm = require('vm');
const src = client.slice(client.indexOf('function bgNewJobCreds'), client.indexOf('function bgUploadNote'));
(async () => {
  let calls = 0; const ctx = { console, setTimeout: (f) => setTimeout(f, 0), Date, Math, JSON, encodeURIComponent, Uint8Array, crypto: { getRandomValues: a => a.fill(7) }, BG_FUNCTIONS_BASE: '/f', setBgStatus() {}, fetch: async () => ({ status: ++calls >= 3 ? 200 : 404 }), bgPostCreateJob: async () => { const e = new Error('timeout'); e.name = 'AbortError'; e.bgInfo = { uploadDone: true }; throw e; } };
  vm.createContext(ctx); vm.runInContext(src + ';this.f={bgNewJobCreds,bgPostCreateJobRecover}', ctx);
  const cr = ctx.f.bgNewJobCreds(); t('creds hợp lệ với định dạng server', () => { assert.match(cr.jobId, /^job_[a-z0-9_]{10,64}$/); assert.match(cr.token, /^[A-Za-z0-9_-]{32,128}$/); });
  try { const r = await ctx.f.bgPostCreateJobRecover('/f/create-job', {}, '{}', 1, cr); const d = JSON.parse(await r.text()); t('job thấy sau vài lần hỏi -> thành công với đúng id', () => { assert.equal(d.jobId, cr.jobId); assert.equal(d.accessToken, cr.token); assert.equal(calls, 3); }); } catch (e) { t('khôi phục', () => { throw e; }); }
  ctx.fetch = async () => ({ status: 404 }); ctx.bgRecoverJob.length; 
  try { await ctx.f.bgPostCreateJobRecover('/f/create-job', {}, '{}', 1, cr); t('không thấy job -> vẫn ném lỗi cũ', () => assert.fail('phải ném lỗi')); } catch (e) { t('không thấy job -> vẫn ném lỗi cũ', () => assert.equal(e.name, 'AbortError')); }
  process.exit(bad ? 1 : 0);
})();
