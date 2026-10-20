# V12.13 — Story Control / Continuity Hardening

Nâng cấp từ V12.12, giữ nguyên UI và pipeline hiện tại, tập trung vào độ ổn định của prompt/continuity.

## Đã thay đổi

### 1. Story Control Layer
- Thêm lớp kiểm soát trước khi viết ở cả client và background writer.
- Giới hạn mặc định: tối đa 3 sự kiện chính/chương.
- Giới hạn mặc định: tối đa 4 nhân vật có tên xuất hiện trực tiếp.
- Giới hạn thread mới: tối đa 3.

### 2. State Lock / No Retcon
- Thêm danh sách trường canon quan trọng cần giữ ổn định.
- Không tự sửa lịch sử, canon, ký ức, quan hệ, cảnh giới, năng lực, vật phẩm quan trọng, bí mật/lời hứa hoặc luật thế giới chỉ vì chương hiện tại thuận tiện hơn.
- Mâu thuẫn được định hướng để giữ lại và xử lý có chủ đích.

### 3. Character Agency
- Prompt yêu cầu nhân vật quan trọng phải có mục tiêu, động cơ, phản ứng và lựa chọn riêng.
- Hạn chế việc nhân vật trở thành công cụ để đẩy plot.

### 4. Chapter Focus
- Giữ nguyên kiến trúc NONE / SECONDARY / PRIMARY của V12.12.
- Story Control xác định rõ Chapter Focus không phải giấy phép mở tuyến truyện mới.

### 5. Continuation
- Các lượt viết tiếp cũng nhận Story Control Layer để tránh việc phần nối chương tự phá giới hạn và continuity của phần đầu.

### 6. Diagnostics
- Chapter lưu metadata `control` gồm focus và các giới hạn chính để hỗ trợ kiểm tra/debug.

## Kiểm tra
- `node --check netlify/functions/write-chapter-background.js`: PASS
- Inline JavaScript trong `index.html`: PASS
- `node tests/worker.test.js`: 12/12 PASS

## Không thay đổi
- Không thay đổi cấu trúc UI chính.
- Không thay đổi Current Status V2 CHANGE → VALIDATE → MERGE.
- Không thay đổi schema ChapterData hiện có ngoài metadata control.
- Không thay đổi cơ chế API/model routing ngoài việc prompt nhận thêm lớp Story Control.
