# TODO — V13 Adaptive Scene Pipeline

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
- [ ] Worker nền parity đầy đủ với adaptive scene pipeline (hiện đã đồng bộ helper và vẫn fallback pipeline cũ).
- [x] Regression test Scene Graph/Scene Contract/word limits.
- [ ] Cập nhật E2E theo hợp đồng V13.
- [ ] Chạy full test và kiểm tra sync shared core.

## Kế thừa từ V12
- [x] Age Gate, hardened security, wizard và regression nền giữ nguyên.
- [ ] E2E lịch sử cần cập nhật theo hợp đồng mới.
- [ ] Tách dần client runtime khỏi `index.html` sau khi pipeline ổn định.
