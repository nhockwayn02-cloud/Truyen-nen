# V12.30 — Hậu kỳ một lần gọi, bảo vệ Canon và Memory

- Gộp Tóm tắt, Character Database, World, Current Status, Long-term Memory, Continuity warnings và gợi ý chương sau vào một phản hồi JSON duy nhất.
- Chuyển cả hai đường chạy: hậu kỳ job nền thủ công và hậu kỳ sau khi tạo chương nền.
- Dùng model đã cấu hình (`job.model`), không thay model/provider. Không gọi thêm AI để sửa JSON hoặc retry lần hai trong hậu kỳ tổng hợp.
- JSON thiếu/không hợp lệ hoặc bị cắt: không thực hiện merge; nếu một lỗi xảy ra giữa quá trình merge thì khôi phục trạng thái và chương trước lượt hậu kỳ.
- Chỉ nhận trường Character/Status/World/Memory có evidence xuất hiện trong nội dung chương. Giữ role/occupation/position/faction và tier của nhân vật đã có; nhân vật mới không thể tự lên main/major.
- Memory merge nguyên tử theo schema: cần đủ events, foreshadowing, knowledge. Không xóa lịch sử cũ, không cắt giới hạn số mục và không mở lại foreshadowing đã kết thúc.
- Sửa con trỏ `lastMemorySyncChapter`: việc chỉ quét nhân vật hoặc cập nhật Status không còn tự nhận là đã đồng bộ Long-term Memory. Khi hợp nhất job nền, con trỏ không bị lùi.
- Thêm kiểm thử regression và kiểm tra tích hợp số lượt gọi AI hậu kỳ.

## Các kiểm thử

- `node tests/v12_30_unified_postprocess.test.js`
- `node tests/worker.integration.js`
- `npm test`

Lưu ý: Quality Gate và các thao tác do người dùng gọi riêng (ví dụ: sửa tiếng Việt, quét lại Memory toàn truyện) vẫn là luồng độc lập; V12.30 gộp toàn bộ gói hậu kỳ tự động của chương, không gộp việc viết lại toàn thân chương vào prompt trích xuất dữ liệu.
