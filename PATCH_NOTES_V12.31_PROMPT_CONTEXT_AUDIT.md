# V12.31 — Prompt Context Audit

## Thay đổi
- Brief của chương (Chỉ đạo + Gợi ý) không còn bị chèn lặp trong context khi lập kế hoạch/viết chương; hai mục này được chèn một lần tại vị trí chuyên biệt trong prompt.
- Không tự động gửi `autoNextChapterHint` cũ vì trường này không có ID chương xác nhận tính còn hiệu lực. Gợi ý chính thức đang áp dụng là nội dung `nextChapterHint`.
- Quy Tắc Nâng Cao và Quy Tắc Khác được đưa qua một bộ lọc chung; bỏ dòng trùng sau chuẩn hóa khoảng trắng/dấu câu và các dòng được đánh dấu `[TẮT]`, `[OFF]` hoặc `[DISABLED]`. Không dùng gọi AI bổ sung và không gộp các câu khác nghĩa chỉ vì có vài từ giống nhau.
- Current Status hiển thị rõ chương đã xác nhận và tổng chương đã lưu. Nếu status cũ, prompt đánh dấu stale và yêu cầu ưu tiên bằng chứng ở các chương mới hơn thay vì coi status cũ là sự thật hiện tại. Nếu chưa có status, prompt nói rõ không được bịa.
- Thêm kiểm tra xung đột heuristic cho mâu thuẫn rõ ràng về tạo nhân vật mới/sự kiện hoặc tuyến truyện mới; cảnh báo được đưa vào prompt trước khi gọi model. Đây là phát hiện xác suất thấp-rủi-ro, không phải bộ phân tích ngữ nghĩa hoàn hảo.
- Viết tiếp/hoàn tất một chương không còn kéo nhầm Gợi ý chương sau vào ngữ cảnh của chương cũ.
- Đồng bộ code mirrored giữa giao diện và background worker.

## Giới hạn có chủ đích
- Các quy tắc chung và ngoại lệ được bảo toàn; chỉ loại bỏ trùng văn bản đã chuẩn hóa. Các dòng được ghi tự nhiên là "đã tắt" nhưng không dùng tiền tố `[TẮT]`/`[OFF]` vẫn được giữ để tránh hiểu sai nội dung.
- Không có API/model thật trong unit test; chi phí, độ chính xác đầu ra và Current Status sau phản hồi thật vẫn cần xác minh trên cấu hình người dùng.
