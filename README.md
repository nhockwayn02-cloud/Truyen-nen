# Xưởng Truyện — bản viết lại từ đầu (kiểu WriteWithPaige, chỉ để viết truyện)

Một file `index.html` duy nhất, không framework, không backend. Mở trực tiếp
bằng trình duyệt, hoặc host tĩnh trên GitHub Pages / Netlify.

## Vì sao viết lại từ đầu
Bản cũ (v9.4.x) là chuỗi bản vá chồng lên nhau nhiều đời (auto-NSFW routing,
background job Netlify, JSON-repair nhiều lớp...). Bản này bỏ hết, chỉ giữ lại
đúng phần "viết truyện" theo mô hình WriteWithPaige, cấu trúc lại từ đầu cho
gọn và dễ đọc.

## Tính năng
- **Story Bible**: Synopsis, Thế giới, Quy tắc nội dung (tự do), Văn phong
  (ngôi/thì/tông/đoạn mẫu), Nhân vật, Lore/Codex (thẻ tự kích hoạt theo từ khóa).
- **Muses**: 7 muse dựng sẵn theo thể loại + tạo muse riêng (tên + hướng dẫn văn phong).
- **Viết**: streaming trực tiếp từ OpenRouter, viết chương mới / viết tiếp /
  viết lại đoạn cuối, chỉnh sửa tay ngay trong khung soạn thảo.
- **Agentic Bible update**: nút "Quét cập nhật Story Bible" — AI đọc chương vừa
  viết, đề xuất nhân vật/lore mới, bạn **Chấp nhận** hoặc **Bỏ qua** từng đề xuất
  (không tự động ghi đè).
- **Ghi chú** và **Tìm kiếm** toàn bộ chương/nhân vật/lore/ghi chú.
- **Thông báo khi viết xong**: rung + beep + nháy tiêu đề tab + system
  notification (nếu bật quyền trong Cài đặt).
- **Cài đặt**: API endpoint/key/model OpenRouter (dùng key của bạn), Temperature,
  Max tokens, Export/Import truyện dạng JSON, Xóa truyện.

## Cố ý KHÔNG có (theo yêu cầu: đơn giản, chỉ viết truyện)
- Không ảnh minh họa, không audiobook/TTS, không chế độ "Adventure"/game.
- Không tài khoản, không đồng bộ nhiều thiết bị, không thanh toán, không nền
  tảng chia sẻ ("Story Worlds") — những thứ này cần backend/DB/billing thật,
  vượt ngoài phạm vi 1 file tĩnh.
- Không còn background job qua Netlify Functions của bản cũ (giảm độ phức tạp
  rất nhiều). Nếu sau này cần viết chương rất dài chạy nền khi khóa màn hình
  điện thoại, có thể thêm lại 1-2 Netlify Function riêng.

## Cách dùng
1. Mở `index.html`.
2. Vào **Cài đặt** → nhập API Key + Model OpenRouter → Lưu & kiểm tra.
3. Vào **Story Bible** điền Synopsis/Thế giới/Nhân vật/Lore.
4. Vào **Muses** chọn phong cách viết.
5. Vào **Viết**, nhập Chỉ dẫn cảnh tiếp theo → bấm **🚀 Viết tiếp**.
6. Thỉnh thoảng bấm **🧠 Quét cập nhật Story Bible** để AI đề xuất cập nhật
   nhân vật/lore mới từ chương vừa viết.

Dữ liệu lưu trong `localStorage` của trình duyệt — nên dùng **Export** định kỳ
để sao lưu.
