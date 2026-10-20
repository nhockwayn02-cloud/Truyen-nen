# V12.15 — Tự ngắt đoạn (hết "khối văn đặc")

**Nguyên nhân:** prompt viết chương không có quy tắc bố cục và không có bước hậu xử lý ngắt đoạn, nên model viết chương dài thành một khối liền.

## Thay đổi
- `shared/core.js`: thêm `formatParagraphs()` — chia khối văn > 500 ký tự thành đoạn 2–3 câu, mỗi lượt thoại (“…”, —) một đoạn riêng, đoạn cách nhau 1 dòng trống. Không đổi/mất chữ, chạy nhiều lần vẫn ổn định.
- Prompt client (mục 9 "BỐ CỤC") và SYSTEM_PROMPT của worker: yêu cầu đoạn ngắn + thoại riêng dòng.
- Áp dụng `formatParagraphs` sau khi AI viết chương / viết tiếp (client + worker nền).
- Nút **¶ Ngắt đoạn** trên thanh công cụ chương: sửa ngay các chương cũ đã có.
- Thêm test hồi quy trong `tests/worker.test.js`.

## Bổ sung V12.15: chống lặp cảnh + từ lạ
**Triệu chứng:** chương chứa 2 bản của cùng một cảnh (bản 2 viết lại từ đầu, dính liền bản 1) và có từ lạ chen giữa câu ("HttpServletResponse", "czerwony"…).

- Prompt viết tiếp (client + worker): bỏ khối "đoạn đầu chương / STYLE LOCK" (nguyên nhân model chép lại từ đầu), thêm lệnh cấm viết lại từ đầu.
- `dropRestartedContinuation()`: bỏ các đoạn viết tiếp trùng nội dung đã có; nếu trùng toàn bộ thì bỏ lượt đó và dừng.
- `dedupeRepeatedScene()`: nếu chương có bản viết lại phần đầu (kể cả dính liền không dòng trống) thì cắt từ chỗ lặp. Áp dụng khi tạo chương và trong nút ¶ (có hỏi xác nhận).
- `findStrayWords()`: cảnh báo từ Latinh lạ (worker ghi vào issues, nút ¶ hiện ở thanh trạng thái).
- Lượt viết tiếp phía client: temperature 0.9→0.82, frequency_penalty 0.55→0.15, presence_penalty 0.4→0.1 (penalty cao ép model chọn token hiếm nên sinh từ lạ).
- Test hồi quy mới trong `tests/worker.test.js`.

## Bổ sung V12.15b: sửa từ lạ bằng AI + bớt báo nhầm
- Mở rộng danh sách từ mượn hợp lệ (silicon, latex, temp, remote, camera…) để `findStrayWords` không báo nhầm.
- `fixStrayWordsInText()` (client): chỉ gửi các đoạn có từ lạ cho AI, thay bằng tiếng Việt hợp ngữ cảnh, kiểm tra độ dài/ngôn ngữ trước khi nhận.
- Nút ¶ Ngắt đoạn: nếu phát hiện từ lạ sẽ hỏi "Sửa từ lạ" rồi gọi hàm trên (dùng model chính đang chọn).
- Prompt "Sửa chính tả" (polishVietnamese) nêu rõ danh sách từ lạ cần thay.

## V12.15c: rà soát cuối
- `formatParagraphs`: đoạn ngắn (<500 ký tự) có thoại xen kẽ (kể cả ngoặc kép thẳng ") giờ cũng được tách thoại.
- `dedupeRepeatedScene`: chỉ cắt khi bản lặp trùng với các đoạn MỞ ĐẦU chương (tránh cắt nhầm câu lặp có chủ ý giữa chương).
- `dropRestartedContinuation`: chặt hơn (đoạn ≥15 từ, độ trùng ≥70%) để không bỏ nhầm phần viết tiếp thật.
- `findStrayWords(text, tên_nhân_vật)`: tên nhân vật đã khai báo không bị báo là từ lạ (client + worker).
