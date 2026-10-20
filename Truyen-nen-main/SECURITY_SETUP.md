# Cấu hình bảo mật trên Netlify (V12.33)

Vào **Site configuration → Environment variables** rồi thêm các biến sau, sau đó **Deploy lại**.

| Biến | Bắt buộc? | Ý nghĩa |
|---|---|---|
| `JOB_SECRET` | **Nên có** | Chuỗi bí mật dài (≥ 32 ký tự ngẫu nhiên). Dùng để mã hóa API key khi lưu tạm trong Blobs. Thiếu biến này, key lưu dạng chữ thường cho tới khi job xong. |
| `APP_PASSCODE` | **Nên có** | Mật khẩu của riêng bạn. Khi đặt, `create-job` từ chối mọi yêu cầu không có mã. Nhập mã ở ô **🔒 Mã truy cập server** (cột thiết lập); mã chỉ lưu trên thiết bị, không nằm trong truyện/backup. |
| `ALLOWED_API_HOSTS` | Tuỳ chọn | Danh sách tên miền API được phép, cách nhau bằng dấu phẩy. Ví dụ: `openrouter.ai,api.deepseek.com`. Bỏ trống = chấp nhận mọi https công khai. |
| `ALLOWED_ORIGIN` | Tuỳ chọn | Địa chỉ site của bạn (vd `https://truyen-cua-toi.netlify.app`) để trình duyệt của trang lạ không gọi được API. |
| `JOB_TTL_HOURS` | Tuỳ chọn | Số giờ giữ job trong Blobs trước khi tự xoá (mặc định 48). |
| `REQUIRE_HARDENED_SECURITY` | **Khuyến nghị đặt `1`** | Khi bật, background job bị từ chối nếu thiếu `JOB_SECRET` hoặc `APP_PASSCODE`. |

Sau khi đặt các biến, bấm **Kiểm tra cấu hình** trong thẻ Bảo mật deployment của ứng dụng. Mức khuyến nghị là có đủ cả bốn biến: `JOB_SECRET`, `APP_PASSCODE`, `ALLOWED_ORIGIN` và `ALLOWED_API_HOSTS`. Endpoint `/.netlify/functions/security-status` chỉ trả trạng thái thiếu/đủ, không trả giá trị bí mật.

Luôn được áp dụng (không cần cấu hình):
- Endpoint API phải là **https** và bị chặn nếu trỏ tới địa chỉ nội bộ (localhost, 10.x, 192.168.x, 169.254.x...).
- Sau khi app đã hợp nhất chương nền thành công, job (gồm cả nội dung truyện) được **xoá ngay** khỏi server.
- Job quá hạn được dọn tự động mỗi lần tạo job mới.
- API key bị xoá khỏi job ngay khi job kết thúc và không bao giờ được trả về qua `job-status`.
- Khi `REQUIRE_HARDENED_SECURITY=1`, API key không được lưu dạng rõ và endpoint background không mở cho người không có passcode.

## Phát triển
- `npm test` — chạy toàn bộ test (e2e cần `pip install playwright && playwright install chromium`).
- Các hàm dùng chung giữa giao diện và worker nằm ở `shared/core.js`. Sửa ở đó rồi chạy `npm run sync`; **không sửa tay** khối `SHARED-CORE` trong `index.html` hoặc `write-chapter-background.js` (test sẽ báo lệch).
