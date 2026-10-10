# V12.32.0 — Tối ưu ngữ cảnh chương và nhân vật

- Chỉ gửi tóm tắt ngắn của chương gần nhất (tối đa khoảng 1.100 ký tự) và đoạn cuối chương (tối đa 1.400 ký tự) để nối tiếp.
- Ngừng tự động gửi danh sách tóm tắt chương xa trong prompt viết chương. Dữ liệu gốc vẫn được lưu; Story Bible/Current Status/Memory có liên quan tiếp tục là nguồn canon.
- Xóa phần chèn lặp “TÓM TẮT 3 CHƯƠNG GẦN” trong khối bối cảnh vì recent block đã cung cấp thông tin chương gần nhất.
- Danh sách nhân vật được giới hạn tối đa 8, loại nhân vật đã chết và nhân vật phụ/minor cũ không liên quan; hồ sơ nhân vật chính không bị gửi lặp trong roster.
- Character State Tracker giảm còn tối đa 8 mục và bỏ mục đánh dấu đã chết khỏi danh sách trạng thái hoạt động.
- Đồng bộ logic giữa giao diện viết thường và Netlify Background Worker. Không xóa dữ liệu lịch sử trong IndexedDB.

Lưu ý: bộ lọc ưu tiên sự liên quan và metadata hiện có; cần thử trên truyện thực tế để xác nhận các nhân vật quan trọng lâu không xuất hiện vẫn được chọn nhờ tier/locked/quan hệ.
