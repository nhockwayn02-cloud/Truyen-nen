# V12.32.10 — AI tự sửa cục bộ (patch) + nút 🛠 AI tự sửa

## Vấn đề
Chương bị "🟠 Cần sửa" (vd 65/100) vẫn không tự lên điểm: Quality Gate yêu cầu AI **viết lại cả chương** (~5000 từ).
AI thường trả về bản bị cắt/tóm tắt (vd 1159/5309 từ) → app từ chối ("Bản sửa quá ngắn/rỗng") và giữ nguyên bản thảo.
Nút 🔍 Duyệt lại chỉ chấm lại (rewrite:false) nên cũng không sửa gì.

## Thay đổi
1. **Sửa cục bộ (patch)** — `shared/core.js`: `buildPatchPrompt`, `parsePatchResponse`, `applyChapterPatches`, `checkPatchAcceptable`.
   AI chỉ trả JSON các thao tác nhỏ: `replace`, `delete`, `insert_after`, `insert_before`, `insert_start`, `insert_end`.
   Xoá/thay đoạn dài bằng `from`+`to` (đầu/cuối đoạn). Đoạn bị lặp chọn bằng `which` (số thứ tự hoặc `"last"`).
   Phần không nhắc đến giữ nguyên 100%. Tốn ít token hơn nhiều (≈4000 token ra thay vì ≈16000).
2. **An toàn:** find phải khớp nguyên văn (có dung sai khoảng trắng); khớp mơ hồ/không thấy → bỏ qua chỗ đó, không đoán;
   range `from→to` > 40% chương bị chặn; sau vá chương phải dài 60%–135% bản gốc; luôn backup bản cũ vào `versions`.
3. **Gate dùng patch trước**, nếu không vá được mới dự phòng viết lại cả chương (cả client và worker nền).
4. **Nút 🛠 AI tự sửa** (cạnh 🔍 Duyệt lại): chạy chấm → vá → chấm lại tối đa `qualityMaxAttempts` lượt cho chương đang "Cần sửa".
   Đạt thì hỏi Sync Canon như 🔍 Duyệt lại. Không đạt vẫn giữ bản đã vá tốt nhất, xem/khôi phục bản cũ ở lịch sử phiên bản.

## Test
`tests/v12_32_10_patch_rewrite.test.js` (mới) + cập nhật mock `worker.test.js`, `worker.gatefail.js` cho luồng vá-trước.
