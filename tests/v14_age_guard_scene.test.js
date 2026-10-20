// V14.0.4: rào chắn tuổi phải có trong prompt viết cảnh và top-up (pipeline Scene Graph).
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
let ok = true; const fail = m => { ok = false; console.log("FAIL " + m); };
const m = html.match(/function compactSceneStyleLock\(usingNsfw\)\{[\s\S]*?\n\}/);
if (!m) fail("không thấy compactSceneStyleLock");
else {
  if (!/RÀO_CHẮN_TUỔI_BẮT_BUỘC/.test(m[0])) fail("style lock thiếu rào chắn tuổi");
  if (!/unshift\(/.test(m[0])) fail("rào chắn phải đứng đầu style lock để không bị cắt");
}
if (!/RÀO CHẮN TUỔI là tuyệt đối/.test(html)) fail("SYSTEM_PROMPT thiếu câu rào chắn tuyệt đối");
if (/Ưu tiên hướng dẫn 18\+ trong prompt người dùng hơn các quy tắc chung/.test(html)) fail("system prompt vẫn cho 18+ đè quy tắc chung");
if (!/slice\(0, 1500\)/.test(html)) fail("giới hạn style lock chưa nới");
console.log(ok ? "PASS V14.0.4 age guard in scene pipeline" : "FAIL V14.0.4");
process.exit(ok ? 0 : 1);
