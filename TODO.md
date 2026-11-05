# TODO — V14 Contract-First Complete Chapter Pipeline

## Bộ nhớ truyện dài L0–L5 và continuity (đã được duyệt)
- [x] L0–L5: L0 là văn bản gốc; L1 dùng summary chương; L2/L3/L4/L5 gộp theo 4/20/60/toàn truyện; L1–L4 đóng băng, L5 lưu phiên bản trước, phạm vi được lưu theo truyện và có nút xây bù (bằng chứng: `tests/v14_6_layered_memory_flow.test.js`, `tests/v14_6_layered_memory.test.js`; E2E nút xây L1).
- [x] Hồ sơ thực thể: thêm CRUD hồ sơ thế lực, trạng thái và lịch sử; dùng trong prompt client/worker; giữ migration tương thích cho truyện cũ cùng characters/locations/items có sẵn (bằng chứng: `tests/e2e.py` 4e–4f; `tests/v14_6_long_novel_memory.test.js`).
- [x] Theo dõi tình tiết/thời gian: trạng thái thread do tác giả sửa có lịch sử, mục đã đóng không bị AI/worker mở lại; ghi time log theo chương và giữ gộp dữ liệu local khi hậu kỳ (bằng chứng: `tests/e2e.py` 4g, 15e; `tests/v14_6_postwrite_audit.test.js`).
- [x] Hậu kiểm sau viết: lưu và hiển thị báo cáo độ dài, continuity/time stall và số thread/foreshadowing chưa giải quyết, không thay canon khi chỉ có cảnh báo (bằng chứng: `tests/e2e.py` 15d; `tests/v14_6_postwrite_audit.test.js`).
- [x] Giới hạn chữ: min/max theo truyện, từ chối min > max; mở rộng/rút gọn tối đa hai vòng, snapshot bản gốc, đếm lại và giữ bản tốt nhất khi lỗi/vượt ngưỡng; dữ liệu cũ vẫn dùng giới hạn trước đây (bằng chứng: `tests/e2e.py` 4b–4d, 15f; `tests/v14_6_word_bounds.test.js`).
- [x] Rà soát trước bàn giao: tương thích schema/persistence, parity client-worker, UI desktop/iPhone và pipeline đã xác minh; `npm test` PASS, UI E2E 52/52 PASS (7 E2E phụ của runner bị skip do thiếu dependency riêng).

## Chế độ Ưu tiên độ chính xác (được yêu cầu)
- [x] Cài đặt theo từng truyện, mặc định tắt và lưu/khôi phục qua story state/backup; khi bật ép dùng Quality Gate, chặn SOFT_FAIL, bật Required Beat và tối đa 3 lượt review/sửa; truyện cũ giữ hành vi cũ (bằng chứng: `tests/v14_7_accuracy_mode.test.js`, E2E 4h–4j).
- [x] Kiểm tra beat độc lập trên mọi mã [R#] của Outline/Contract; chỉ chấp nhận trích nguyên văn có trong bản thảo; thiếu mã, trích sai hoặc audit lỗi đều fail-closed, audit phải mới theo fingerprint hiện tại; chặn Sync/Publish/Export Canon đến khi đạt (bằng chứng: `tests/v14_7_accuracy_core.test.js`, `tests/v14_7_accuracy_mode.test.js`, `npm test`).
- [x] Quét đoạn dài trùng/gần trùng, tạo lỗi có vị trí/bằng chứng; sửa cục bộ với snapshot và review lại, không fallback viết lại toàn chương; giữ bản tốt nhất; chặn retry hậu kỳ không đạt audit và không tạo MANUAL_OVERRIDE trong Accuracy Mode (bằng chứng: accuracy helper/mode tests, hồi quy retry-postprocess, `npm test`; UI E2E 52/52).

## V14 — Contract-First
- [x] Chapter Contract bất biến khóa Arc/Outline, required beats, allowed cast, forbidden drift, opening continuity, must-change và ngân sách từ.
- [x] Scene Graph phải được validate trước khi viết; plan drift bị retry một lần rồi dừng an toàn, không fallback âm thầm.
- [x] Mỗi scene và top-up nhận cùng Contract; scene lỗi không được ghép tiếp vào chương.
- [x] Quality Gate ưu tiên Contract/Arc/beat/continuity trước score văn phong thông qua contract plan được lưu cùng chương.
- [x] Chỉ Sync khi Contract barrier, required beat, opening continuity, ending anchor và độ dài đều đạt qua pipeline hiện hành.
- [x] Worker không dùng writer cũ âm thầm khi Contract bị từ chối (V14.0.6).
- [x] Regression test cho plan rejection, allowed cast, missing beat, scene contract và safe failure.

## V14.0.x — Scene and prose quality follow-up
- [x] Kiểm tra từng scene (code) + viết lại đúng scene lỗi; rà AI từng scene tùy chọn.
- [x] Tự sửa sau chấm nhanh (nháp nền) với Best Draft Guard.
- [x] Kiểm tra từng scene cho đường client "Tạo chương hoàn chỉnh" bằng E2E giao diện: xác nhận gọi kế hoạch và tối thiểu 3 scene, telemetry riêng từng scene được lưu, trạng thái/số từ/thời lượng hợp lệ và telemetry hiện trong panel kế hoạch (bằng chứng: `tests/e2e.py`, assertions 15a–15c; 38/38 PASS).
- [x] Hiển thị cảnh báo scene: worker (dòng trạng thái, đủ scene bị giữ/đã vá) và đường viết thường (V14.3.0). Còn lại: panel riêng theo scene trong UI thay vì dòng trạng thái.
- [x] Vá cục bộ scene khi rà AI báo MUST_CHANGE/LOCATION_TIME (V14.3.0).

## P0 — Độ dài và liên kết chương
- [x] Chương mặc định đạt khoảng 4.500–5.500 từ; hard cap 5.600 từ.
- [x] Scene Graph linh hoạt, không gán vai trò cố định cho Scene 1/2/3.
- [x] Scene sau nhận Scene Contract, đoạn cuối scene trước và state delta compact; không gửi lại toàn bộ chương.
- [x] Adaptive client không auto-continue toàn chương; fallback cũ vẫn giữ khi scene plan lỗi.

## P1 — Chi phí và chất lượng
- [x] Pipeline mặc định giảm request bằng một Scene Graph + các scene tuần tự.
- [x] Semantic Prose Check không tự chạy nếu chưa bật `semanticProseAuto`.
- [x] Quality Gate mặc định còn tối đa 2 vòng ở client; Best Draft Guard giữ attempt cuối.
- [x] AI spell-check mặc định tắt.
- [x] Telemetry chi tiết theo step/scene/input/output/retry; lưu trong `chapter.adaptiveStats.sceneTelemetry` và hiển thị cùng kế hoạch chương.

## P2 — Nền và kiểm chứng
- [x] Worker nền parity với adaptive scene pipeline (V14.0.6: dùng chung runAdaptiveChapterPipeline; có chế độ viết nháp nền).
- [x] Regression test Scene Graph/Scene Contract/word limits.
- [x] Cập nhật E2E theo hợp đồng V13: đường client scene pipeline được kiểm tra qua giao diện và mock API; xác nhận scene graph, nhiều scene được chấp nhận, telemetry lưu/hiển thị (bằng chứng: `tests/e2e.py`, assertions 15a–15c; 38/38 PASS).
- [x] Chạy full test và kiểm tra sync shared core (V14.0.20 audit: logic PASS và 5 bộ E2E PASS — `e2e.py`, `e2e_v14_0_15.py`, `e2e_bg.py`, `e2e_bg_slim.py`, `e2e_delete.py`).

## Kế thừa từ V12
- [x] Age Gate, hardened security, wizard và regression nền giữ nguyên.
- [ ] E2E lịch sử cần cập nhật theo hợp đồng mới. (các bộ E2E đều đang PASS; mục này chỉ còn là rà soát độ phủ theo Contract-First.)
- [x] Tách client runtime khỏi `index.html` sang `app/client.js` (V14.7.1; bằng chứng: `npm test` PASS, `tests/_read_index.js`). Còn lại: chia nhỏ `app/client.js` thành module theo chức năng (UI, storage, pipeline) khi cần.
