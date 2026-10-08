// V12.23 — create-job: kích hoạt background thử host của request khi URL env trả 404; báo rõ URL khi 404
const assert = require("assert");
const db = new Map();
let calls = [], mode = "ok";
global.fetch = async (url, opts) => { if (mode === "hang") return new Promise((_, rej) => { opts.signal.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; rej(e); }); }); calls.push(url); if (mode === "env404" && url.startsWith("https://env.example")) return { ok:false, status:404, text: async()=>"" };
  if (mode === "all404") return { ok:false, status:404, text: async()=>"Not Found" }; return { ok:true, status:202, text: async()=>"" }; };
const Module = require("module"); const orig = Module._load;
Module._load = function (req, ...a) { if (req === "@netlify/blobs") return { connectLambda(){}, getStore(){ return { async setJSON(k,v){ db.set(k,v); }, async get(k){ return db.get(k)||null; }, async delete(k){ db.delete(k); } }; } }; return orig.call(this, req, ...a); };
const create = require("../netlify/functions/create-job").handler;
const body = JSON.stringify({ storyState:{ chapters:[], title:"t" }, apiKey:"k", apiEndpoint:"https://openrouter.ai/api/v1/chat/completions", model:"m" });
let pass = 0, fail = 0;
async function T(n, f){ try{ calls=[]; db.clear(); await f(); console.log("PASS "+n); pass++; }catch(e){ console.log("FAIL "+n+" — "+e.message); fail++; } }
(async()=>{
  process.env.URL = "https://env.example";
  await T("URL env OK -> 1 lần kích hoạt", async()=>{ mode="ok"; const r=await create({httpMethod:"POST",headers:{host:"app.example"},body}); assert.strictEqual(r.statusCode,200); assert.strictEqual(calls.length,1); });
  await T("URL env 404 -> thử host của request", async()=>{ mode="env404"; const r=await create({httpMethod:"POST",headers:{host:"app.example"},body}); assert.strictEqual(r.statusCode,200); assert.strictEqual(calls.length,2); assert(calls[1].startsWith("https://app.example/")); });
  await T("Tất cả 404 -> 502 và nêu URL đã thử", async()=>{ mode="all404"; const r=await create({httpMethod:"POST",headers:{host:"app.example"},body}); assert.strictEqual(r.statusCode,502); assert(/write-chapter-background ở https:\/\/app\.example/.test(JSON.parse(r.body).error)); });
  await T("Không có env URL -> dùng host của request", async()=>{ delete process.env.URL; mode="ok"; const r=await create({httpMethod:"POST",headers:{host:"app.example"},body}); assert.strictEqual(r.statusCode,200); assert(calls[0].startsWith("https://app.example/")); });
  await T("Kích hoạt treo -> sau timeout vẫn trả 200 + cảnh báo + timings", async()=>{ mode="hang"; process.env.TRIGGER_TIMEOUT_MS="150"; const r=await create({httpMethod:"POST",headers:{host:"app.example"},body}); delete process.env.TRIGGER_TIMEOUT_MS; assert.strictEqual(r.statusCode,200); const j=JSON.parse(r.body); assert(j.warnings.some(w=>/chưa phản hồi sau 8 giây/.test(w))); assert(j.timings && j.timings.totalMs>=100 && typeof j.timings.saveMs==="number"); });
  console.log(pass+"/"+(pass+fail)+" PASS"); process.exit(fail?1:0);
})();
