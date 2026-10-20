# V12.14 — Bugfix sau kiểm thử toàn diện

## Lỗi nghiêm trọng đã sửa
1. **Job nền luôn chết 500** (`ReferenceError: chapter is not defined`, V12.13): dòng gán `chapter.control` nằm trước khi object chương được tạo. Nay `control` được đưa vào object trả về.
2. **Từ khóa 18+ khớp chuỗi con** (`includes`) làm câu thường ngày như "cà phê", "cây bút", "phản kháng", "phê duyệt", "Mông Cổ" bị coi là nội dung 18+ và bị chuyển sang model NSFW + prompt erotic. Nay khớp theo từ nguyên vẹn (Unicode) và bỏ các từ quá chung (bú, phê, thúc, lần đầu, kích thích, ngực, mông; "quan hệ" -> "quan hệ tình dục/xác thịt").
3. **`trimToWordLimit` làm mất toàn bộ xuống dòng/đoạn văn/thoại** khi chương bị cắt do vượt giới hạn. Nay cắt theo vị trí ký tự, giữ nguyên đoạn.
4. **Công tắc "Tự động tạo" không có xử lý** và đổi "Khoảng cách" ném `ReferenceError: scheduleNextAuto`. Đã thêm bộ hẹn giờ (chỉ viết khi nút đang rảnh, không lưu trạng thái bật qua lần mở lại).

## Test
- Cập nhật `tests/worker.integration.js`, `tests/e2e.py` cho khớp V12/V12.10.
- Thêm `tests/worker.routing.js` (7 ca định tuyến 18+/rào chắn tuổi/Story Control).
- Thêm 3 test hồi quy vào `tests/worker.test.js`.

## Nâng cấp bảo mật & bảo trì (V12.14)
- **Mã truy cập** `APP_PASSCODE` (tuỳ chọn) cho `create-job`; ô nhập ở giao diện, lưu riêng trên thiết bị.
- **Kiểm tra endpoint**: chỉ https, chặn địa chỉ nội bộ/metadata cloud, có thể giới hạn bằng `ALLOWED_API_HOSTS`.
- **Cảnh báo cấu hình** (thiếu `JOB_SECRET`/`APP_PASSCODE`) hiển thị trong lúc job chạy.
- **Tự dọn job** quá hạn (`JOB_TTL_HOURS`, mặc định 48h) và **xoá job ngay** khi client đã hợp nhất (`job-status?ack=1`).
- `ALLOWED_ORIGIN` để giới hạn CORS.
- **Gộp code dùng chung** client/worker vào `shared/core.js` + `scripts/sync-shared.js` + `tests/sync-check.js`.
- `normalizeName` của client nay cũng gộp khoảng trắng thừa như worker (tránh trùng nhân vật do dấu cách kép).
- Nhãn độ dài ghi rõ đếm theo âm tiết.
- `npm test` chạy toàn bộ; thêm `tests/security.test.js`, `tests/e2e_bg.py`; xem `SECURITY_SETUP.md`.
