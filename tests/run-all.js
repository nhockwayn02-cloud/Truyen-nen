// Chạy toàn bộ test:  npm test   (hoặc: node tests/run-all.js)
// Test trình duyệt (e2e*.py) cần: pip install playwright && playwright install chromium — nếu thiếu sẽ được BỎ QUA và báo rõ.
const { spawnSync } = require("child_process"), path = require("path");
const dir = __dirname; const suites = [
  ["Đồng bộ code dùng chung", process.execPath, ["sync-check.js"]],
  ["Unit Quality Gate (core)", process.execPath, ["core.test.js"]],
  ["Nhân vật trùng", process.execPath, ["characters.test.js"]],
  ["V14.1.1 nút hậu kỳ tự duyệt nháp", process.execPath, ["v14_1_1_postprocess_approve.test.js"]],
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
  ["V12.32.3 ngữ cảnh Gate gọn + continuity vòng 1", process.execPath, ["v12_32_3_gate_context.test.js"]],
  ["V12.32.4 hồ sơ khóa nhân vật", process.execPath, ["v12_32_4_character_lock.test.js"]],
  ["V12.32.5 tiến triển + trí nhớ truyện", process.execPath, ["v12_32_5_progress_memory.test.js"]],
  ["V12.32.6 lọc ký tự rác", process.execPath, ["v12_32_6_junk_symbols.test.js"]],
  ["V12.32.6b văn xuôi thuần Việt", process.execPath, ["v12_32_6b_pure_prose.test.js"]],
  ["V12.32.7 thời gian truyện", process.execPath, ["v12_32_7_story_time.test.js"]],
  ["V12.32.8 neo ngoại hình + số đo", process.execPath, ["v12_32_8_appearance.test.js"]],
  ["V12.32.9 cảnh & người có mặt", process.execPath, ["v12_32_9_scene_presence.test.js"]],
  ["V14.0.4 rào chắn tuổi trong pipeline cảnh", process.execPath, ["v14_age_guard_scene.test.js"]],
  ["V14.0.14 hậu kỳ cập nhật Character Database", process.execPath, ["v14_0_14_character_update.test.js"]],
  ["V14.0.15 tính năng mới (logic)", process.execPath, ["v14_0_15_features.test.js"]],
  ["V14.0.16 kiểm tra từng scene + tự sửa sau chấm nhanh (logic)", process.execPath, ["v14_0_16_scene_check_quickfix.test.js"]],
  ["V14.0.16 worker: tự sửa sau chấm nhanh", process.execPath, ["v14_0_16_worker_quickfix.test.js"]],
  ["V14.0.6 viết nháp nền (adaptive worker, không Gate/hậu kỳ)", process.execPath, ["v14_worker_draft.test.js"]],
  ["V14.0.20 gợi ý nhân vật loại công pháp/cảnh giới", process.execPath, ["v14_0_20_name_suggest.test.js"]],
  ["V14.1 hệ thống tu luyện (thang 9 tầng, khóa đột phá, vật phẩm, worker)", process.execPath, ["v14_1_cultivation.test.js"]],
  ["V14.0.20 Outline AI theo cài đặt 18+ + rào chắn tuổi", process.execPath, ["v14_0_20_outline_mature.test.js"]],
  ["V12.32.18 tiến độ Arc + Outline", process.execPath, ["v12_32_18_arc_outline.test.js"]],
  ["V12.32.14 dọn dẹp: tài liệu, hàm chết, chặn file nội bộ", process.execPath, ["v12_32_14_repo_hygiene.test.js"]],
  ["V12.32.13 mở rộng bằng chèn đoạn + trần output", process.execPath, ["v12_32_13_expand_inserts.test.js"]],
  ["V12.32.10 AI tự sửa cục bộ (patch)", process.execPath, ["v12_32_10_patch_rewrite.test.js"]],
  ["V12.30 khôi phục phản hồi streaming rỗng", process.execPath, ["v12_30_streaming_fix.test.js"]],
  ["V12.31 prompt context audit", process.execPath, ["v12_31_prompt_context.test.js"]],
  ["V14.0.17 chapter memory", process.execPath, ["v14_0_17_chapter_memory.test.js"]],
  ["V12.33 P0/P1/P2 hardening", process.execPath, ["v12_33_hardening.test.js"]],
  ["V12.34 sửa beat mục tiêu trước đoạn kết", process.execPath, ["v12_34_targeted_beat_repair.test.js"]],
  ["V12.35 Beat Ledger", process.execPath, ["v12_35_beat_ledger.test.js"]],
  ["V12.36 Best Draft Guard", process.execPath, ["v12_36_best_draft_guard.test.js"]],
  ["V12.37 Gender Anatomy Lock", process.execPath, ["v12_37_gender_anatomy_lock.test.js"]],
  ["V12.38 Marital Status Lock", process.execPath, ["v12_38_marital_status.test.js"]],
  ["V12.39 Canon Barrier", process.execPath, ["v12_39_canon_barrier.test.js"]],
  ["V12.40 Nested Events", process.execPath, ["v12_40_nested_events.test.js"]],
  ["V12.41 AutoFix Retry", process.execPath, ["v12_41_autofix_retry.test.js"]],
  ["V12.42 Plan Completion Guard", process.execPath, ["v12_42_plan_completion.test.js"]],
  ["V12.43 Required Beat Barrier", process.execPath, ["v12_43_required_beat_barrier.test.js"]],
  ["V12.46 Semantic Prose Check", process.execPath, ["v12_46_semantic_prose.test.js"]],
  ["V12.46 Canon warning AutoFix", process.execPath, ["v12_46_canon_warning_autofix.test.js"]],
  ["V12.47 Tạo chương hoàn chỉnh", process.execPath, ["v12_47_autonomous_write.test.js"]],
  ["V13 Adaptive Scene Pipeline", process.execPath, ["v13_adaptive_scene.test.js"]],
  ["Định tuyến 18+", process.execPath, ["worker.routing.js"]],
  ["Bảo mật server", process.execPath, ["security.test.js"]],
  ["Tích hợp worker", process.execPath, ["worker.integration.js"], { EXTRACT_CONCURRENCY: "3" }],
  ["Tích hợp worker: trượt Gate", process.execPath, ["worker.gatefail.js"]],
  ["E2E giao diện", "python3", ["e2e.py"], {}, true],
  ["E2E V14.0.15 tính năng mới", "python3", ["e2e_v14_0_15.py"], {}, true],
  ["E2E job nền", "python3", ["e2e_bg.py"], {}, true],
  ["E2E job nền: payload gọn + khôi phục snapshot", "python3", ["e2e_bg_slim.py"], {}, true],
  ["E2E xóa chương", "python3", ["e2e_delete.py"], {}, true],
  ["E2E gợi ý nhân vật (tu luyện) + nút Vật phẩm", "python3", ["e2e_name_suggest.py"], {}, true],
  ["E2E V14.1 form tu luyện + Story Bible + vật phẩm", "python3", ["e2e_v14_1_cultivation.py"], {}, true],
  ["E2E Outline AI theo cài đặt 18+", "python3", ["e2e_outline_mature.py"], {}, true],
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
