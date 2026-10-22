# Hướng dẫn deploy Xưởng Truyện AI (GitHub + Netlify)

## 0. Trước khi làm
- Cần tài khoản GitHub, Netlify và API key OpenRouter.
- **Background Functions cần gói Netlify trả phí.** Gói free vẫn dùng được app, nhưng nút "viết nền" có thể không chạy. Khi đó viết trực tiếp trên trình duyệt (giữ màn hình sáng).
- Gốc repo phải chứa `index.html`, `netlify.toml`, thư mục `netlify/`. Zip tải từ GitHub có thêm thư mục bọc ngoài `Truyen-nen-main/`: hãy upload **nội dung bên trong**, đừng upload thư mục bọc.

## 1. Đưa code lên GitHub
1. Tạo repo mới (nên để **Private**, vì truyện 18+).
2. Upload toàn bộ nội dung đã giải nén vào gốc repo.
3. Gói zip này **không kèm** thư mục `.github`. Nếu repo của bạn đã có workflow `.github/workflows/unzip.yml` (tự giải nén file `.zip` ở gốc repo, chỉ cần khi upload zip qua iPhone) thì cứ giữ nguyên, đừng xóa. Nếu chưa có, hãy giải nén zip trên máy rồi upload nội dung bên trong.

## 2. Nối Netlify
1. Netlify → Add new site → Import from Git → chọn repo.
2. Build command để trống, Publish directory là `.` (đã có trong `netlify.toml`).
3. Bấm Deploy.

## 3. Đặt biến môi trường (bắt buộc cho bảo mật)
Site configuration → Environment variables, thêm:

| Biến | Giá trị |
|---|---|
| `JOB_SECRET` | chuỗi ngẫu nhiên ≥ 32 ký tự (tạo bằng `openssl rand -hex 32`) |
| `APP_PASSCODE` | mật khẩu riêng của bạn |
| `ALLOWED_ORIGIN` | địa chỉ site, ví dụ `https://ten-site.netlify.app` (không dấu `/` cuối) |
| `ALLOWED_API_HOSTS` | `openrouter.ai` |
| `REQUIRE_HARDENED_SECURITY` | `1` |

Sau đó bấm **Trigger deploy → Deploy site** để biến có hiệu lực.

## 4. Kiểm tra sau deploy
1. Mở `https://ten-site.netlify.app/tests/core.test.js`: phải ra **404**.
2. Trong app, thẻ Bảo mật deployment → **Kiểm tra cấu hình**: cả 4 mục phải xanh.
3. Nhập mã truy cập vào ô "Mã truy cập server", nhập API key OpenRouter và chọn model.
4. Viết thử một chương ngắn trước khi dùng thật.

## 5. Chọn model cho truyện 18+
- Nhiều model từ chối hoặc viết rất nhạt khi gặp nội dung người lớn. Hãy thử vài model trên OpenRouter bằng một cảnh ngắn rồi chọn model phù hợp.
- Đọc điều khoản của model/nhà cung cấp về nội dung người lớn trước khi dùng.
- Luôn giữ nhân vật từ đủ 18 tuổi. App có rào chắn, đừng tắt.

## 6. Sao lưu
- Truyện lưu trong trình duyệt (IndexedDB). Hãy dùng chức năng Backup/xuất file định kỳ, nhất là trước khi xóa dữ liệu trình duyệt hoặc đổi máy.
