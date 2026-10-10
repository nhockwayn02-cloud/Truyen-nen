// Chạy toàn bộ test:  npm test   (hoặc: node tests/run-all.js)
// Test trình duyệt (e2e*.py) cần: pip install playwright && playwright install chromium — nếu thiếu sẽ được BỎ QUA và báo rõ.
const { spawnSync } = require("child_process"), path = require("path");
const dir = __dirname; const suites = [
  ["Đồng bộ code dùng chung", process.execPath, ["sync-check.js"]],
  ["Unit Quality Gate (core)", process.execPath, ["core.test.js"]],
  ["Nhân vật trùng", process.execPath, ["characters.test.js"]],
  ["Unit worker", process.execPath, ["worker.test.js"]],
  ["V12.20 từ lỗi/câu cụt/bám gợi ý", process.execPath, ["v12_20.test.js"]],
  ["V12.22b chống chương viết lặp (diễn đạt khác)", process.execPath, ["v12_22b.test.js"]],
  ["V12.23 kế hoạch độ dài + mở rộng cuối", process.execPath, ["v12_23.test.js"]],
  ["V12.23 viết nền dùng code của viết thường", process.execPath, ["worker.mirror.test.js"]],
  ["V12.23 create-job kích hoạt/404", process.execPath, ["v12_23_netlify.test.js"]],
  ["V12.28.2 Status/Memory soft hậu kỳ", process.execPath, ["v12_28_2_postprocess_soft.js"]],
  ["V12.28.3 getEndingTarget helper", process.execPath, ["v12_28_3_ending_target.test.js"]],
  ["V12.29 tối ưu chi phí không đổi model", process.execPath, ["v12_29_cost_optimization.test.js"]],
  ["V12.30 hậu kỳ một lần gọi + bảo vệ canon/memory", process.execPath, ["v12_30_unified_postprocess.test.js"]],
  ["V12.30 khôi phục phản hồi streaming rỗng", process.execPath, ["v12_30_streaming_fix.test.js"]],
  ["V12.31 prompt context audit", process.execPath, ["v12_31_prompt_context.test.js"]],
  ["Định tuyến 18+", process.execPath, ["worker.routing.js"]],
  ["Bảo mật server", process.execPath, ["security.test.js"]],
  ["Tích hợp worker", process.execPath, ["worker.integration.js"], { EXTRACT_CONCURRENCY: "3" }],
  ["Tích hợp worker: trượt Gate", process.execPath, ["worker.gatefail.js"]],
  ["E2E giao diện", "python3", ["e2e.py"], {}, true],
  ["E2E job nền", "python3", ["e2e_bg.py"], {}, true],
  ["E2E job nền: payload gọn + khôi phục snapshot", "python3", ["e2e_bg_slim.py"], {}, true],
  ["E2E xóa chương", "python3", ["e2e_delete.py"], {}, true],
];
let failed = 0, skipped = 0;
for (const [name, cmd, args, env, optional] of suites) {
  const r = spawnSync(cmd, args.map(a => path.join(dir, a)), { encoding: "utf8", env: Object.assign({}, process.env, env || {}), cwd: path.join(dir, "..") });
  const out = (r.stdout || "") + (r.stderr || "");
  if (optional && /No module named 'playwright'|Executable doesn't exist|ENOENT/.test(out + (r.error || ""))) { console.log(`SKIP  ${name} (thiếu playwright/python)`); skipped++; continue; }
  const last = out.trim().split("\n").filter(l => /PASS|FAIL|completed/.test(l)).pop() || "";
  console.log(`${r.status === 0 ? "PASS " : "FAIL "} ${name}  ${last.trim().slice(0, 90)}`);
  if (r.status !== 0) { failed++; console.log(out.split("\n").filter(l => /FAIL|Error/.test(l)).slice(0, 8).join("\n")); }
}
console.log(failed ? `\n${failed} bộ test THẤT BẠI` : `\nTẤT CẢ ĐỀU PASS${skipped ? ` (bỏ qua ${skipped} bộ e2e)` : ""}`);
process.exit(failed ? 1 : 0);
