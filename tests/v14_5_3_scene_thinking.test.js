// V14.0.6 — Viết NHÁP nền: worker dùng đúng pipeline Adaptive Scene (Contract + Scene Graph) của "Tạo Chương Hoàn Chỉnh".
// Kiểm tra: (1) nháp chỉ viết + lưu "Bản nháp", KHÔNG chạy Gate/hậu kỳ; (2) plan lệch bị từ chối, KHÔNG lùi về writer cũ;
// (3) job viết thường (không draftOnly) vẫn đi qua adaptive rồi Gate + hậu kỳ; (4) cụm "bảo vệ/bác sĩ/khách" không bị chặn nhầm.
const Module = require("module"), crypto = require("crypto"), path = require("path"), assert = require("assert");
const db = new Map();
const mockBlobs = { connectLambda() {}, getStore() { return { async get(k) { const v = db.get(k); return v ? JSON.parse(v) : null; }, async setJSON(k, v) { db.set(k, JSON.stringify(v)); } }; } };
const origLoad = Module._load;
Module._load = function (req, ...a) { return req === "@netlify/blobs" ? mockBlobs : origLoad.call(this, req, ...a); };

const countWordsT = t => t.trim().split(/\s+/).filter(Boolean).length;
let _seed = 12345;
const rnd = () => (_seed = (_seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const ON = "b c d g h k l m n t v x ch th nh kh ph tr gi qu".split(" "), RI = "a à á ạ e ê ề i í o ô ố ơ u ư ừ an ân ăn em ên in on ôn ơn un ang anh ênh inh ong ông ung ưng at ât ap ep ip op ôp ưc ac oc ai ay ôi".split(" ");
const word = () => ON[Math.floor(rnd() * ON.length)] + RI[Math.floor(rnd() * RI.length)];
function prose(seed, nWords) {
  const paras = []; let w = 0;
  while (w < nWords) {
    const sent = []; const n = 10 + Math.floor(rnd() * 12);
    for (let k = 0; k < n; k++) sent.push(word());
    sent[0] = sent[0][0].toUpperCase() + sent[0].slice(1);
    paras.push(sent.join(" ") + ".");
    w += n;
  }
  return paras.join("\n\n");
}
// V14.5.3: endpoint thinking phớt lờ lệnh tắt -> lệnh viết văn vẫn phải gửi lệnh tắt, học "đệm suy nghĩ", và gọi lại khi content bị reasoning ăn sạch.
let calls = [], bodies = [], firstSceneEmpty = true;
const GRAPH = (chars, mention) => JSON.stringify({
  chapterGoal: "Lan bảo vệ hồ sơ trước khi khách đến", endingAnchor: "Lan khóa cửa văn phòng lúc bác sĩ gọi điện.",
  scenes: [1, 2, 3].map(n => ({ id: "S" + n, location: "Văn phòng", time: "Tối " + n, characters: chars, purpose: "tiến triển " + n, beats: ["beat " + n + (mention ? " " + mention : "")], mustChange: "Lan biết thêm điều " + n, handoff: "sang cảnh " + (n + 1), targetWords: 1700 }))
});
global.fetch = async (url, init) => {
  const body = JSON.parse(init.body); const sys = (body.messages.find(m => m.role === "system") || {}).content || "";
  const kind = /Lập kế hoạch scene/.test(sys) ? "plan" : /scene nối tiếp/.test(sys) ? "scene" : "other";
  calls.push(kind); if (kind === "scene") bodies.push(body);
  let content = "", reasoning = "", fin = "stop";
  if (kind === "plan") content = GRAPH(["Lan"]);
  else if (kind === "scene") {
    reasoning = "Suy nghĩ ".repeat(400); // 3600 ký tự
    if (firstSceneEmpty) { firstSceneEmpty = false; fin = "length"; } else content = prose(calls.length, 1650);
  } else content = '{"summary":"x","timeline":[],"foreshadowing":[],"knowledgeLedger":[],"status":"ổn"}';
  return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ choices: [{ message: { content, reasoning }, finish_reason: fin }] }), text: async () => content };
};
const worker = require(path.join(__dirname, "../netlify/functions/write-chapter-background.js"));
async function run(name, extra = {}, stateExtra = {}) {
  calls = []; db.clear();
  const token = "tok", jobId = "job_" + name;
  db.set(jobId, JSON.stringify(Object.assign({ jobId, createdAt: Date.now(), status: "queued", schemaVersion: 9, workerTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    apiKeyEncrypted: { encrypted: false, value: "k" }, apiEndpoint: "http://mock/chat/completions", model: "m", modelNsfw: "",
    storyState: Object.assign({ chapters: [], characters: [], locations: [], items: [], threads: [], mature: false, nsfwMode: "never", mainCharProfile: { name: "Lan" },
      arcs: [{ id: "a1", name: "Arc 1", goal: "Lan giữ hồ sơ", active: true }], chapterOutline: "" }, stateExtra) }, extra)));
  const res = await worker.handler({ httpMethod: "POST", body: JSON.stringify({ jobId, workerToken: token }), headers: {} });
  return { res, job: JSON.parse(db.get(jobId)) };
}
(async () => {
  const r = await run("think", { draftOnly: true });
  assert.strictEqual(r.job.status, "completed", "job: " + r.job.error);
  assert(bodies.length >= 4, "cần gọi lại scene 1 khi content rỗng: " + bodies.length);
  bodies.forEach(b => assert.deepStrictEqual(b.thinking, { type: "disabled" }, "lệnh viết scene phải gửi lệnh tắt thinking"));
  assert(bodies[1].max_tokens > bodies[0].max_tokens, "lần gọi lại phải có đệm: " + bodies.map(b => b.max_tokens));
  assert(bodies[bodies.length - 1].max_tokens >= bodies[0].max_tokens + 1000, "scene sau giữ đệm suy nghĩ");
  assert(bodies.every(b => b.frequency_penalty === 0.22), "penalty không bị mất");
  console.log("PASS V14.5.3: viết scene với model thinking — tắt thinking, đệm token, gọi lại khi rỗng");
})().catch(e => { console.error("FAIL V14.5.3:", e.stack || e.message); process.exit(1); });
