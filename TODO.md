# TODO — V14 Contract-First Complete Chapter Pipeline

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
- [ ] Kiểm tra từng scene cho đường client "Tạo chương hoàn chỉnh" bằng E2E giao diện (hiện chỉ test logic dùng chung).
- [ ] Hiển thị `sceneWarnings` riêng trong UI thay vì chỉ nằm trong ghi chú chương.

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
- [ ] Telemetry chi tiết theo step/scene/input/output/retry.

## P2 — Nền và kiểm chứng
- [x] Worker nền parity với adaptive scene pipeline (V14.0.6: dùng chung runAdaptiveChapterPipeline; có chế độ viết nháp nền).
- [x] Regression test Scene Graph/Scene Contract/word limits.
- [ ] Cập nhật E2E theo hợp đồng V13. (5 bộ E2E hiện PASS; chỉ `e2e.py` có phủ một phần scene/contract. Phần còn thiếu: đường client scene pipeline, xem mục V14.0.x ở trên.)
- [x] Chạy full test và kiểm tra sync shared core (V14.0.20 audit: logic PASS và 5 bộ E2E PASS — `e2e.py`, `e2e_v14_0_15.py`, `e2e_bg.py`, `e2e_bg_slim.py`, `e2e_delete.py`).

## Kế thừa từ V12
- [x] Age Gate, hardened security, wizard và regression nền giữ nguyên.
- [ ] E2E lịch sử cần cập nhật theo hợp đồng mới. (các bộ E2E đều đang PASS; mục này chỉ còn là rà soát độ phủ theo Contract-First.)
- [ ] Tách dần client runtime khỏi `index.html` sau khi pipeline ổn định.
