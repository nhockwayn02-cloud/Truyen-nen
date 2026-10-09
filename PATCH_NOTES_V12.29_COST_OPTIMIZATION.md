# V12.29 — Tối ưu chi phí an toàn

- Không thay đổi model/provider/định tuyến model.
- Không giảm mục tiêu số từ hoặc cắt nội dung chương.
- Summary >450 từ: bỏ lượt gọi AI chỉ để rút gọn; cắt cục bộ ở ranh giới câu quanh 420 từ. Kiểm tra grounded vẫn chạy sau bước này.
- Character extraction: lô 12k ký tự, overlap 400 (trước: 9k/700).
- World extraction: lô 13k ký tự, overlap 400 (trước: 10k/700).
- World extraction prompt chỉ gửi 20 thread gần nhất, mô tả tối đa 140 ký tự; dữ liệu lưu trữ không thay đổi.
- Quality Gate và Auto-continue được giữ nguyên để không làm giảm độ ổn định độ dài/chất lượng.
