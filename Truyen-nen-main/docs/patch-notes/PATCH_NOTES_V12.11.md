# V12.11 — Current Status V2: CHANGE → VALIDATE → MERGE + Evidence

## Phạm vi
Chỉ nâng cấp module **Current Status**. Không thay đổi Character Database, Memory Engine, Summary, Snapshot hay các module khác.

## Thay đổi chính

- Không còn cho AI viết lại/ghi đè toàn bộ `statusState` sau mỗi chương.
- Current Status được xử lý theo pipeline:
  `Chapter → Change Extraction → Validation → Merge → Current Status`.
- AI chỉ trả về các trường thực sự thay đổi.
- Mỗi thay đổi hợp lệ phải có `evidence`.
- Không có bằng chứng thì không merge.
- Thông tin cũ không bị xóa chỉ vì chương mới không nhắc lại.
- Xung đột được giữ trong `statusState.conflicts` thay vì tự ý ghi đè.
- `statusState.changeLog` lưu lịch sử các lần merge gần nhất.
- `statusState.schemaVersion = 2`.
- Danh sách nhân vật hiện có được kiểm kê sau mỗi lần cập nhật; nhân vật không thay đổi hiển thị `Không có thay đổi đáng kể`.
- Current Status không cho AI tự tạo nhân vật mới.
- Các trường nhân vật được hỗ trợ gồm tuổi, ngoại hình, cơ thể, quần áo, dấu vết, tu vi, trạng thái tu vi, cảm xúc, phục tùng, tuân thủ quy tắc, quan hệ xã hội, nghề nghiệp, nơi ở, quan hệ tình cảm, điểm yếu, mục tiêu, vật phẩm, tính cách bên ngoài/bên trong, tâm lý, quan hệ và trạng thái thể chất/tinh thần.

## Tương thích dữ liệu cũ

`normalizeStatusState()` chuyển dữ liệu `statusState` cũ sang cấu trúc V2 khi Current Status được cập nhật lần đầu. Dữ liệu legacy vẫn được đọc và format nếu chưa được nâng cấp.

## Kiểm tra an toàn

- JSON lỗi → giữ Current Status cũ.
- Change không có evidence → không merge.
- Character ID/tên không tồn tại → bỏ qua thay đổi nhân vật đó.
- Conflict có evidence → lưu lại, không ghi đè giá trị cũ.
