# V12.17b — Gợi ý chương sau kiểu "Gọn theo nhịp" + tóm tắt/gợi ý 18+ không né tránh

Mang hai bản vá từ nhánh V12.15 sang V12.17 (bản V12.17 chưa có hai phần này).

## 1. Kiểu gợi ý "Gọn theo nhịp + điểm kết chương"
- Ô chọn mới **Độ dài & cách viết gợi ý** (dưới "Kiểu gợi ý chương sau"): *Chi tiết (400–600 từ)* (mặc định, như cũ) hoặc *Gọn theo nhịp + điểm kết chương (150–260 từ)*.
- Kiểu Gọn: 1–3 đoạn kể lần lượt các nhịp chính (ai làm gì, ở đâu, đạo cụ/thiết lập nào, hệ quả); dòng cuối "→ Kết chương ở: …".
- `hintFormat` được lưu cùng truyện, gửi kèm job nền (`create-job.js` đã thêm vào danh sách trường cho phép) và dùng cho cả gợi ý tự động sau chương.

## 2. Tóm tắt/gợi ý chương 18+ dùng model 18+, bớt nói giảm nói tránh
- Chương 18+ → tóm tắt và gợi ý chạy bằng model 18+ (`adultModelFor` ở client, `extractModelFor` ở worker).
- `buildSummaryPrompt(text, n, names, adult)` (shared/core.js): chương 18+ thì thuật lại cụ thể, đúng từ ngữ của chương.
- Prompt gợi ý thêm quy tắc "ĐỘ TRỰC DIỆN" cho chương 18+ (mọi nhân vật là người trưởng thành).
