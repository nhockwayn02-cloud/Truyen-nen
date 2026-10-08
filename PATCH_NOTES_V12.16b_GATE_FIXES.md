# V12.16b — Sửa lỗi Quality Gate (Bước 1)

Bản vá trên V12.16. Không đổi kiến trúc; chỉ sửa lỗi và bổ sung test cho Quality Gate.

## Lỗi đã sửa
1. **Hậu xử lý dùng bản nháp cũ.** Sau khi Gate viết lại chương, tóm tắt / NV / Thế giới / Status / Memory / rà chính tả vẫn chạy trên bản TRƯỚC khi sửa. Nay `text` và `rawForPolish` được cập nhật theo bản đã qua Gate.
2. **Bản sửa có thể ghi đè chương bằng nội dung rỗng/ngắn.** Bản sửa ngắn hơn 60% bản gốc (hoặc rỗng) bị từ chối, giữ nguyên bản thảo, ghi cảnh báo vào review (client + worker).
3. **Mất bản gốc khi viết lại.** Bản gốc được lưu vào `versions` (tối đa 3) trước khi thay.
4. **Lỗi API khi viết lại làm mất cả bản nháp (client).** Nay bắt lỗi, giữ bản nháp ở REVISION_REQUIRED; bấm Dừng khi đang sửa cũng giữ bản nháp.
5. **Sửa tay chương đã Sync chặn viết chương kế.** `MODIFIED_AFTER_SYNC` nay chỉ hiện ghi chú, không chặn.
6. **Cảnh báo continuity cộng dồn qua các lượt.** Mỗi lượt thay cảnh báo AI cũ bằng cảnh báo mới (giữ cảnh báo trùng câu).
7. **Client bỏ qua kết quả trượt Gate của job nền.** `job-status` trả thêm `qualityGateFailed`; client báo đúng "chưa vượt Quality Gate — chưa ghi Canon" và hợp nhất `canonVersion`.
8. Giới hạn số lần sửa: client và worker cùng tối đa 3.

## Tính năng mới
- Nút **🔍 Duyệt lại** (thanh công cụ chương): chấm lại chương hiện tại, KHÔNG tự viết lại.
  - Đạt → đồng bộ Canon (chương cuối) hoặc đánh dấu đã duyệt (chương cũ, dùng 🔄 Rescan nếu cần).
  - Trượt → hỏi có duyệt thủ công (override) không.
- Công tắc **🛡 Quality Gate** trong Cài đặt (bật/tắt theo từng truyện).
- Hậu xử lý Canon tách thành hàm `runCanonPostProcess()` dùng chung cho viết chương và Duyệt lại.

## Kiểm thử
- Unit worker: 19 → 29 (10 test Gate mới: PASS, hard failure, ngân sách sự kiện/nhân vật, ngưỡng 90/75, viết lại + lưu versions, bản sửa bị từ chối, lỗi API, hết số lần thử, review trả rác, tắt Gate).
- E2E giao diện: 21 → 29 (mock API nay trả review hợp lệ; thêm test PASS/MODIFIED_AFTER_SYNC/không chặn/trượt Gate/bản sửa bị từ chối/chặn chương kế/Duyệt lại/tắt Gate).
- `npm test`: tất cả PASS.

## Chưa làm / chưa kiểm
- Đường merge job nền khi trượt Gate (client) chưa có test tự động; mới kiểm bằng đọc code.
- Chưa chạy với API thật nên chưa biết tỷ lệ trượt Gate và chi phí thực tế; ngưỡng 90/75 chưa được hiệu chỉnh.
- `qualityHardCheck`: hai kiểm tra ngân sách sự kiện/nhân vật vẫn là chỗ giữ chỗ (do AI chấm) — thuộc Bước 2.
- Logic Gate vẫn nằm ở cả client lẫn worker — thuộc Bước 2.
