# TODO — V14 Contract-First Complete Chapter Pipeline

## V14 — Contract-First
- [x] Chapter Contract bất biến khóa Arc/Outline, required beats, allowed cast, forbidden drift, opening continuity, must-change và ngân sách từ.
- [x] Scene Graph phải được validate trước khi viết; plan drift bị retry một lần rồi dừng an toàn, không fallback âm thầm.
- [x] Mỗi scene và top-up nhận cùng Contract; scene lỗi không được ghép tiếp vào chương.
- [x] Quality Gate ưu tiên Contract/Arc/beat/continuity trước score văn phong thông qua contract plan được lưu cùng chương.
- [x] Chỉ Sync khi Contract barrier, required beat, opening continuity, ending anchor và độ dài đều đạt qua pipeline hiện hành.
- [x] Worker không dùng writer cũ âm thầm khi Contract bị từ chối (V14.0.6).
- [x] Regression test cho plan rejection, allowed cast, missing beat, scene contract và safe failure.

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
- [ ] Cập nhật E2E theo hợp đồng V13.
- [ ] Chạy full test và kiểm tra sync shared core.

## Kế thừa từ V12
- [x] Age Gate, hardened security, wizard và regression nền giữ nguyên.
- [ ] E2E lịch sử cần cập nhật theo hợp đồng mới.
- [ ] Tách dần client runtime khỏi `index.html` sau khi pipeline ổn định.
