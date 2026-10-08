# V12.12 — Chapter Mature Focus: NONE / SECONDARY / PRIMARY

## Mục tiêu
Tách rõ **quyền cho phép nội dung trưởng thành** (`mature`) khỏi **ý định của từng chương** (`chapterMatureFocus`).

## Ba chế độ
- `NONE`: chương không có trọng tâm trưởng thành. Không tự chèn hoặc kéo dài nội dung trưởng thành, kể cả khi chương trước có nội dung tương tự.
- `SECONDARY`: nội dung trưởng thành chỉ được dùng khi brief/mệnh lệnh hoặc diễn biến hiện tại yêu cầu rõ; không tự biến thành tuyến chính.
- `PRIMARY`: chủ đề trưởng thành là một trọng tâm của chương; hệ thống vẫn phải bám brief, không tự mở tuyến mới.

## Thay đổi
### `index.html`
- Thêm selector `Trọng tâm trưởng thành của chương` với `NONE / SECONDARY / PRIMARY`.
- Thêm `chapterMatureFocus` vào state mặc định, hydrate, persist và backup/background story state.
- Thêm các helper chuẩn hóa/đọc trọng tâm.
- `NONE` chặn force-routing NSFW và auto-routing.
- Cập nhật phần hướng dẫn routing để hiển thị rõ trọng tâm hiện tại.
- Prompt chương nhận chỉ thị trọng tâm để tránh tự chèn nội dung trưởng thành ngoài ý định.

### `netlify/functions/write-chapter-background.js`
- Đồng bộ `chapterMatureFocus` với background worker.
- `NONE` thắng mọi auto-detection.
- `SECONDARY` chỉ routing khi có tín hiệu rõ từ brief/mệnh lệnh.
- `PRIMARY` có thể dùng thêm heat detection trong chế độ auto.
- Background prompt nhận cùng chỉ thị trọng tâm với luồng local.

## Tương thích
State cũ không có `chapterMatureFocus` sẽ tự dùng `NONE`.

## Kiểm tra
- `node --check` cho script trong `index.html`: PASS
- `node --check` cho `write-chapter-background.js`: PASS
- `node tests/worker.test.js`: **12/12 PASS**
