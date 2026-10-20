# Truyen335 V12.29 — Cost-safe optimization

## Mục tiêu
Giảm một số lần gọi AI hậu kỳ và token ngữ cảnh lặp lại mà không đổi model, không giảm mục tiêu số từ chương, không bỏ Quality Gate, không đổi Ending Anchor/Auto-continue.

## Thay đổi
- Summary quá dài được rút gọn cục bộ tại ranh giới câu thay vì gọi AI thêm một lần chỉ để rút gọn. Lượt retry đầu tiên vẫn được giữ nếu bản tóm tắt thiếu tiêu đề/không bám nguồn.
- Trích xuất Character Database tăng kích thước lô từ 9.000 lên 12.000 ký tự và giảm phần chồng lấn từ 700 xuống 400 ký tự để giảm việc gửi lại cùng một đoạn. Không bỏ phần văn bản chương nào.
- Trích xuất World State tăng kích thước lô từ 10.000 lên 13.000 ký tự và giảm phần chồng lấn từ 700 xuống 400 ký tự.
- Danh sách thread trong prompt trích xuất World State giới hạn 20 thread gần nhất và 140 ký tự mô tả mỗi thread. Dữ liệu lưu trong truyện không bị cắt; chỉ ngữ cảnh gửi cho lượt trích xuất được rút gọn.
- Giữ nguyên định tuyến model, prompt viết chương, mục tiêu số từ, giới hạn Auto-continue, Quality Gate, Ending Anchor và thứ tự lưu chương.

## Lưu ý
Các thay đổi tối ưu hậu kỳ có thể làm AI ít nhìn thấy mô tả rất cũ của thread trong một lượt trích xuất World State; dữ liệu gốc vẫn được bảo toàn. Nếu truyện có rất nhiều thread đang mở, cần theo dõi nhật ký hậu kỳ vài chương đầu.

## Kiểm thử
Chạy `npm test`. Bốn bài E2E được đánh dấu bỏ qua nếu môi trường không có Playwright/Chromium.
