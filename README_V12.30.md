# Xưởng Truyện AI — V12.30

## Điểm chính

V12.30 gộp **hậu kỳ tự động sau chương** thành một phản hồi AI JSON duy nhất: tóm tắt, cập nhật Character Database, world (địa điểm/vật phẩm/threads), Current Status, long-term memory (Timeline/Foreshadowing/Knowledge Ledger), cảnh báo continuity và gợi ý chương kế tiếp.

- Không đổi model, endpoint, provider hay cơ chế chọn model đã cấu hình trong ứng dụng. Hậu kỳ dùng `job.model` như trước.
- Không chạy extractor AI riêng cho nhân vật/thế giới/status/memory sau khi đã chạy gói tổng hợp.
- Một yêu cầu hậu kỳ chỉ thử một lần. Nếu lỗi mạng/API, JSON không hợp lệ hoặc bị cắt token, hệ thống không gọi AI lần hai để sửa JSON; dữ liệu hậu kỳ cũ được giữ nguyên.
- Dữ liệu nhân vật phải có trích dẫn từ chương; role/occupation/position/faction đã khóa không bị thay chỉ vì AI suy diễn. Nhân vật mới không thể tự nhận tier main/major qua lượt trích xuất này.
- Các trường Current Status chỉ cập nhật khi bằng chứng nằm trong chương và có nội dung hỗ trợ giá trị được đề xuất.
- Bộ nhớ chỉ merge khi đủ ba mảng events/foreshadowing/knowledge. Thiếu schema sẽ bỏ qua toàn bộ phần memory, không tăng con trỏ đồng bộ và không xóa dữ liệu cũ.
- Mục timeline/foreshadowing/knowledge và status lịch sử không bị cắt theo giới hạn số lượng tự động. Foreshadowing/thread đã kết thúc không bị mở lại bởi cập nhật mới thiếu căn cứ.
- `lastMemorySyncChapter` chỉ tăng khi Long-term Memory thực sự được đồng bộ; quét nhân vật hoặc cập nhật Current Status riêng không còn giả báo đã đồng bộ Memory.

## Những bước vẫn độc lập

Quality Gate vẫn là cổng kiểm tra riêng trước khi ghi Canon; nó không phải extractor hậu kỳ. Các thao tác người dùng bấm riêng như sửa tiếng Việt, quét lại scene, quét lại Character Database/Memory toàn truyện cũng vẫn là thao tác độc lập. Scene Tracker đang tắt theo cấu hình hiện tại và không được tự bật lại.

## Kiểm thử

Chạy `npm test`. Bộ test V12.30 bao gồm: cập nhật có bằng chứng nhưng giữ hồ sơ cốt lõi, không thêm nhân vật major, giữ status và memory cũ, rollback khi JSON bị cắt, và không merge memory nếu schema thiếu.
