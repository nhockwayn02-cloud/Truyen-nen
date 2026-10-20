# V12.21 — Sửa chương bị ngắn (2500–3800 từ so với mục tiêu 4500)

## Nguyên nhân
- Prompt có gợi ý ghi "chấp nhận ngắn hơn" / "không phải chỉ tiêu bắt buộc" -> model dừng ngay khi hết ý.
- Bước mở rộng tại chỗ (V12.20) chia khối quá nhỏ (~550 từ), loại khối nếu không dài hơn 12%, prompt chỉ có 1 câu chung chung -> thường thất bại âm thầm.

## Thay đổi (giữ nguyên nguyên tắc: KHÔNG bịa thêm sự kiện/cảnh/nhân vật ngoài gợi ý)
- Prompt viết chương (worker + index.html): độ dài tối thiểu 95% mục tiêu, đạt bằng cách sống chậm từng ý với 5 kỹ thuật (giác quan, nội tâm giằng co, lặp có biến tấu, thoại/khoảng lặng, môi trường), mỗi khối có chuyển biến nhỏ, đổi nhịp câu, không tóm tắt/nhảy cóc.
- expandChapterInPlace: khối ~900 từ (trước ~550), tối đa 6 khối; prompt chứa 5 kỹ thuật; ngưỡng giữ khối 12% -> 8%; khối thất bại được thử lại 1 lần với nhắc nhở mạnh hơn.
- Ngưỡng kích hoạt mở rộng và cảnh báo "Thiếu từ": 90% -> 95% mục tiêu.

## Chưa làm (cần quyết định)
- index.html (chế độ viết thường) vẫn chưa có bước mở rộng tại chỗ; chỉ đổi prompt. Bước mở rộng chỉ chạy ở worker nền.

## V12.21.1 — Sửa lỗi model thinking nhúng kế hoạch tiếng Anh vào chương
- Thêm stripThinkingOutput(): xóa <think>/<thinking> tags và khối lập kế hoạch tiếng Anh ở đầu output trước câu chuyện tiếng Việt.
- Hàm được gọi bên trong stripForeign() nên tự động áp dụng ở mọi điểm xử lý output trong cả worker lẫn client.
