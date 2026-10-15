# TODO — Hoàn thiện Xưởng Truyện AI

## P0 — An toàn và kiểm chứng
- [x] Age Gate 18+ hiển thị khi mở ứng dụng và không làm mất dữ liệu.
- [x] Bảng kiểm tra cấu hình bảo mật deployment.
- [x] Hardened mode từ chối background job nếu thiếu JOB_SECRET hoặc APP_PASSCODE.
- [x] Test unit/security cho hardened mode và age gate helper.
- [x] Chạy E2E Chromium; ghi rõ phần còn thiếu nếu môi trường chưa có browser.

## P1 — UX
- [x] Chế độ đơn giản / chuyên gia, lưu lựa chọn trên thiết bị.
- [x] Wizard tạo truyện lần đầu và tự điền dữ liệu.
- [x] Bảo đảm nút tạo chương đầu hoạt động sau wizard.

## P2 — Nền tảng
- [ ] Tiến trình các bước viết rõ ràng.
- [ ] Tài liệu hóa module boundaries và đường chuyển tiếp khỏi một file HTML.
- [x] Regression test và kiểm tra đồng bộ client/worker.

## Việc còn lại sau V12.33

- [ ] Cập nhật ba E2E lịch sử theo hợp đồng mới: `bgWriteBtn` là hậu kỳ server, không phải viết chương nền.
- [ ] Khi bắt đầu module hóa lớn, tách client runtime khỏi `index.html` theo từng adapter nhỏ; không di chuyển hàng loạt trong một release.
