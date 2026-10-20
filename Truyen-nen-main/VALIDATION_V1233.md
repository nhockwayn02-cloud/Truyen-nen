# Báo cáo nghiệm thu V12.33.0 — P0/P1/P2

## Kết quả chính

Bản làm việc đã tích hợp các thay đổi P0/P1/P2 mà không thay đổi schema truyện cũ. Các bài test tập trung cho phần mới, test bảo mật hiện có, kiểm tra đồng bộ shared core và kiểm tra cú pháp Node đều đạt.

| Nhóm kiểm tra | Kết quả |
|---|---|
| Regression test P0/P1/P2 mới | PASS |
| Security unit test hiện có | 12/12 PASS |
| Shared core sync check | PASS |
| JavaScript syntax: security-status, create-job, lib/security | PASS |
| E2E tải app / storage / age guard / không lỗi JS | PASS |
| E2E tạo chương giả lập | Tạo được chương, stream hoạt động; một số assertion cũ không còn phù hợp |

## Tính năng đã hoàn thành

**P0 — An toàn:** age gate 18+; endpoint `security-status` chỉ trả trạng thái cấu hình, không trả secret; `REQUIRE_HARDENED_SECURITY=1` chặn background job khi thiếu `JOB_SECRET` hoặc `APP_PASSCODE`; audit hiển thị trực tiếp trong giao diện; vẫn giữ rào chắn endpoint HTTPS/SSRF hiện có.

**P1 — Dễ dùng:** Chế độ Đơn giản/Chuyên gia, lưu lựa chọn trên thiết bị; wizard khởi tạo truyện với tên, thể loại, nhân vật, tuổi và ý tưởng chương đầu; wizard tự điền Story Bible, nhân vật chính và brief; không đổi dữ liệu truyện đang có.

**P2 — Khả năng quan sát và mở rộng:** thanh tiến trình các bước Kế hoạch → Viết → Quality Gate; tài liệu hóa trách nhiệm module và kế hoạch chuyển tiếp; script nâng cấp có thể chạy lại; thêm regression test riêng.

## Ghi chú về E2E cũ

Một số E2E lịch sử đang kiểm thử hợp đồng cũ: nút `bgWriteBtn` được giả định là “viết chương nền”, trong khi code hiện tại từ V12.28 đã đổi thành “chạy hậu kỳ server” (`retryBackgroundPostProcess`) và chỉ hoạt động khi đã có chương. Các assertion còn lại cũng giả định mock trả văn bản dài hơn thực tế (mock hiện tạo 80 ký tự nhưng test yêu cầu trên 100) và giả định Quality Gate PASS từ mock ngắn, nên đây là lệch test fixture/hợp đồng cũ, không phải lỗi do age gate, UI mode, security audit hay hardened mode.

Không tự đổi hành vi sản phẩm để làm pass các test cũ này vì sẽ khôi phục nhầm luồng background write đã bị loại bỏ. Khi cần nâng chất lượng CI, nên cập nhật riêng `tests/e2e.py`, `tests/e2e_bg.py` và `tests/e2e_bg_slim.py` theo hợp đồng V12.33 hiện tại.

## Cách kiểm tra nhanh

```bash
node tests/v12_33_hardening.test.js
node tests/security.test.js
node tests/sync-check.js
npm test
```

`npm test` vẫn có thể báo đỏ ở các E2E lịch sử nêu trên; nhóm kiểm tra tập trung cho thay đổi V12.33 đã đạt.
