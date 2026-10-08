# V12.24 — Ending Anchor Gate

## Fix chính
- Không còn coi “đủ số từ” là điều kiện duy nhất để kết chương.
- Nếu Gợi ý/Mệnh lệnh có `Ending Anchor` / `Cú chốt` / `Kết chương` hoặc mốc kết tương đương, engine phải đi tới mốc đó trước khi dừng.
- Nếu chương đã đạt mục tiêu từ nhưng chưa tới Ending Anchor, Auto-continue tiếp tục trong giới hạn hardMax.
- Khi đã đủ từ nhưng brief đã kết quá nhanh, engine vẫn ưu tiên chèn diễn biến **trước đoạn kết**, giữ nguyên Ending Anchor.
- Viết nền dùng cùng helper Ending Anchor và cùng logic với viết thường.
- Nút “Viết Tiếp” thủ công được bổ sung một lượt nối tự động nếu lượt đầu vẫn chưa tới Ending Anchor, tránh phải bấm lại.

## An toàn
- Không mở arc mới chỉ để đủ từ.
- Không thêm biến cố lớn/nhân vật quan trọng mới chỉ để kéo dài.
- Khi đã thực hiện Ending Anchor thì dừng, không kéo hậu cảnh sau điểm kết.
- HardMax vẫn được giữ nguyên.

## Kiểm thử
- `node --check netlify/functions/write-chapter-background.js`: PASS
- Toàn bộ unit/integration tests: PASS
- 4 bộ E2E bị SKIP vì môi trường test hiện không có Playwright/Python.
