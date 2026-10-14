# Xưởng Truyện AI

Ứng dụng viết truyện tiểu thuyết bằng AI, chạy trên trình duyệt (dùng tốt trên iPhone), kèm worker nền trên Netlify.
**Bản hiện tại: V12.32.18.** Lịch sử thay đổi đầy đủ: [`CHANGELOG.md`](CHANGELOG.md).

## Cấu trúc
| Thành phần | Vai trò |
|---|---|
| `index.html` | Toàn bộ giao diện + logic phía trình duyệt (1 file). Có khối `SHARED-CORE` tự sinh. |
| `netlify/functions/create-job.js`, `job-status.js` | Tạo job viết nền / hỏi trạng thái job. |
| `netlify/functions/write-chapter-background.js` | Worker nền: viết chương, Quality Gate, hậu kỳ. Cũng có khối `SHARED-CORE`. |
| `shared/core.js` | Nguồn duy nhất cho logic dùng chung (Quality Gate, vá cục bộ, chèn đoạn, canon…). |
| `lib/security.js` | Mã truy cập, mã hóa API key, chặn endpoint nội bộ. |
| `tests/` | Test đơn vị/tích hợp (Node) và E2E trình duyệt (Playwright, tùy chọn). |
| `docs/` | `ARCHITECTURE.md` (Memory Engine, lớp dữ liệu, backup, iPhone — README cũ) và `PROMPT_V12.22.md`. |

## Triển khai (GitHub + Netlify)
1. Đưa repo lên GitHub, nối với Netlify (hoặc kéo thả thư mục). `netlify.toml` đã cấu hình sẵn.
2. Đặt biến môi trường theo [`SECURITY_SETUP.md`](SECURITY_SETUP.md): `APP_PASSCODE`, `JOB_SECRET`, `ALLOWED_ORIGIN` (nên có cả ba).
3. Chế độ viết nền cần gói Netlify hỗ trợ Background Functions.
4. `netlify.toml` chặn truy cập công khai vào `tests/`, `netlify/`, `shared/`, `lib/`, `scripts/`, `docs/` và các file cấu hình/tài liệu gốc. Sau khi deploy, thử mở `/tests/core.test.js` — phải ra 404.

## Luồng viết một chương
1. **Viết** theo từng đoạn (thời gian chảy tự nhiên theo mạch kể, không nhãn ngày giờ đầu/cuối chương), tự nối tiếp tới khi đủ số từ và tới điểm kết (Ending Anchor).
2. **Mở rộng cuối** nếu còn thiếu từ: AI chỉ viết các đoạn mới + chỗ chèn, app ghép vào (không viết lại cả chương).
3. **Quality Gate:** chấm → vá cục bộ → chấm lại, tối đa 5 vòng. Chỉ còn cảnh báo nhẹ (không có lỗi nặng) thì duyệt kèm cảnh báo.
4. **Hậu kỳ gộp:** một phản hồi JSON cho tóm tắt, nhân vật, thế giới, status, gợi ý chương sau; rồi **Sync Canon**.

Chương "🟠 Cần sửa": bấm **🛠 AI tự sửa** (tự vá rồi chấm lại), hoặc sửa tay theo khung Quality rồi **🔍 Duyệt lại**. Bản cũ luôn được lưu trong lịch sử phiên bản.

## Giới hạn cần biết
- Mỗi lần gọi AI trả tối đa ~7800 token (`AI_MAX_OUTPUT_TOKENS`). Chương dài không thể "viết lại toàn bộ" trong một lần, nên mọi bước sửa/mở rộng đều làm theo từng đoạn.
- Chất lượng chấm của AI không cố định giữa các lần; lỗi nặng mới làm chương trượt, cảnh báo thì không.

## Phát triển
- `npm run sync` — chép `shared/core.js` vào khối `SHARED-CORE` của `index.html` và worker. **Không sửa tay khối này.**
- `npm test` — chạy toàn bộ test. E2E cần `pip install playwright && playwright install chromium`.
- Thêm tính năng mới: sửa `shared/core.js` (nếu dùng chung) → `npm run sync` → thêm test trong `tests/` → ghi vào `CHANGELOG.md`.
