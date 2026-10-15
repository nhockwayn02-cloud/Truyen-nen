# Kế hoạch hoàn thiện Xưởng Truyện AI

## Mục tiêu
Nâng bản V12.32.18 thành bản dễ dùng hơn, an toàn hơn khi triển khai Netlify và có nền tảng mở rộng mà không phá dữ liệu truyện cũ.

## P0 — An toàn và kiểm chứng
- Age Gate 18+ khi mở ứng dụng, có thể ghi nhớ xác nhận trên thiết bị.
- Bảng kiểm tra cấu hình bảo mật deployment: JOB_SECRET, APP_PASSCODE, ALLOWED_ORIGIN, ALLOWED_API_HOSTS.
- Chế độ bảo mật nghiêm ngặt cho background job qua `REQUIRE_HARDENED_SECURITY=1`; khi bật sẽ từ chối thiếu JOB_SECRET/APP_PASSCODE.
- Thông báo lỗi rõ ràng khi cấu hình chưa đủ.
- Chạy unit test và E2E nếu môi trường có Chromium.

## P1 — UX cho người dùng phổ thông
- Chuyển đổi Chế độ đơn giản / Chuyên gia.
- Chế độ đơn giản ẩn các nhóm nâng cao nhưng giữ các trường cốt lõi.
- Wizard khởi tạo truyện: tên, thể loại, nhân vật chính, tuổi và ý tưởng chương đầu.
- Wizard tự điền vào Story Bible, nhân vật chính và mệnh lệnh chương.

## P2 — Nền tảng mở rộng
- Tiến trình viết có các bước rõ ràng: kế hoạch, viết, mở rộng, Quality Gate, hậu kỳ, Sync Canon.
- Tài liệu hóa ranh giới module và quy ước đồng bộ `shared/core.js`.
- Tách dần mã nguồn theo module ở mức tài liệu và adapter, chưa di chuyển hàng loạt để tránh rủi ro.
- Bổ sung kiểm thử hồi quy cho các tính năng mới.

## Cấu trúc hiện tại và trách nhiệm
- `index.html`: giao diện và client runtime hiện tại; sẽ tiếp tục là artifact deploy trong giai đoạn chuyển tiếp.
- `shared/core.js`: nguồn logic dùng chung Quality Gate, patch, insert, canon.
- `netlify/functions/`: API tạo job, trạng thái job và worker nền.
- `lib/security.js`: kiểm tra endpoint, passcode, cảnh báo cấu hình.
- `tests/`: test lõi, bảo mật, worker, E2E.

## Quyết định thiết kế
Phong cách giữ nguyên: dark workshop — giao diện xưởng sáng tác chuyên sâu, ưu tiên mật độ thông tin và thao tác nhanh. Chế độ đơn giản sẽ giảm mật độ này cho người mới, không thay đổi dữ liệu hay prompt engine.
