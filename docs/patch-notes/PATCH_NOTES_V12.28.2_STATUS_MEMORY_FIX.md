# V12.28.2 — Fix ⚠ Status/Memory sau Viết thường

## Lỗi
Sau khi Viết thường đã hoàn tất và lưu chương, hậu kỳ Status/Memory có thể lỗi do thiếu ngân sách thời gian hoặc cạnh tranh gọi API. Hai lỗi này bị đưa vào `autoUpdateIssues`, khiến chương hiển thị `⚠ Status/Memory` dù phần viết đã thành công.

## Đã sửa
- Giữ tối thiểu khoảng 6 phút cho pha Status/Memory bằng cách cho Character/World dừng sớm hơn khi gần hết thời gian nền.
- Status và Memory chạy nối tiếp để giảm khả năng tranh chấp/rate-limit.
- Giảm ngân sách token cho Status/Memory để giảm thời gian và nguy cơ JSON bị cắt.
- Status/Memory trở thành **soft post-process tasks**: thất bại không làm chương đã lưu thành `SYNCED_WITH_WARNINGS`; trạng thái lỗi nằm trong `chapter.postProcess.tasks` và diagnostics để có thể retry.
- Chapter list không còn hiển thị `⚠ Status/Memory`; các cảnh báo cứng khác vẫn giữ nguyên.
- Khôi phục helper `getEndingTarget()` của V12.28.1.

## Không đổi
- Viết thường vẫn là luồng chính/stream bình thường.
- Lưu chương xảy ra trước khi gửi hậu kỳ server.
- Netlify Background Job tiếp tục chạy hậu kỳ server khi người dùng khóa/rời iPhone.
- Ending Anchor được giữ nguyên.

## Kiểm thử
- Client JavaScript syntax: PASS
- Worker JavaScript syntax: PASS
- Test hồi quy V12.28.2 Status/Memory soft post-process: PASS
- Toàn bộ `npm test`: PASS
- 4 bộ E2E: SKIP vì môi trường thiếu Playwright/Chromium.
