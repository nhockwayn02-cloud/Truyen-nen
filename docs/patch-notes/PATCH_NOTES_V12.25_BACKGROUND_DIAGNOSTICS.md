# V12.25 — Background extraction / deadline safety

## 1. NV bị cắt cụt ở cuối lô
- Khi model trả `finishReason=length` hoặc parser phát hiện JSON bị cắt, hệ thống vẫn salvage các object hoàn chỉnh.
- Sau đó, nếu còn đủ thời gian, worker gọi **một lượt bổ sung riêng** với prompt JSON siêu gọn để lấy các nhân vật còn thiếu.
- Danh sách tên đã lấy được gửi vào lượt bổ sung để tránh lặp.
- Chỉ merge dữ liệu được parse hợp lệ.

## 2. Từ `nilông`
- Bổ sung `nilông`/`nilon` vào whitelist tiếng Việt để không còn báo nhầm `Từ lạ cần kiểm tra: nilông`.

## 3. Status / Memory bị bỏ qua vì hết thời gian
- NV và Thế giới không được bắt đầu lô mới khi còn dưới **4 phút**.
- Status và Memory chỉ bỏ qua khi còn dưới **90 giây**.
- Mục tiêu là giữ một cửa sổ thời gian an toàn cho pha Status + Memory thay vì để extraction chiếm hết deadline.

## 4. Đồng bộ
- Sau sửa đã chạy `node scripts/sync-shared.js`.
- Client và worker dùng cùng `shared/core.js`.

## 5. Kiểm thử
- Tất cả unit/integration hiện có: PASS.
- 4 E2E bị SKIP do môi trường test không có Playwright/Python.
