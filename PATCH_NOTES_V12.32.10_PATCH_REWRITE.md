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

## V12.32.11 (sửa tiếp)
- **Lỗi:** bộ chấm được xem ĐOẠN KẾT CHƯƠNG TRƯỚC để đối chiếu cảnh mở đầu, nhưng AI sửa (cả vá cục bộ lẫn viết lại cả chương) thì KHÔNG → vá mù, tự đoán địa điểm
  (vd chương trước kết ở hành lang nhưng AI nối vào "văn phòng"/"bãi xe") nên lần chấm sau lại báo lỗi continuity mới.
- **Sửa:** truyền `prevEnding` (1500 ký tự cuối chương trước) vào prompt vá và prompt viết lại, ở cả client lẫn worker nền;
  thêm quy tắc "câu chuyển cảnh phải nối đúng từ đoạn kết chương trước, không dời sang địa điểm khác; chi tiết thêm vào phải khớp canon".

## V12.32.12 (AI tự làm hết trước khi giao chương)
- **Tối đa 5 vòng** chấm → vá (trước là 3). Mặc định 5; giá trị lưu cũ = 3 (mặc định cũ, không có ô chỉnh trên giao diện) cũng được hiểu là 5.
- **Nhớ lỗi đã sửa:** lỗi nặng của các vòng trước mà vòng này không còn bị truyền vào prompt vá/viết lại ("giữ nguyên chỗ đã sửa, đừng hoàn tác"), tránh sửa chỗ này làm hỏng chỗ khác.
- **Duyệt kèm cảnh báo:** nếu chỉ còn SOFT_FAIL (điểm ≥ ngưỡng mềm 75) và KHÔNG có hard failure thì duyệt luôn, ghi cảnh báo, không chạy thêm vòng.
  Tắt bằng `qualityAcceptSoft:false` trong state nếu muốn giữ chuẩn PASS ≥ 90 nghiêm ngặt.
- Tốn thêm: tối đa 2 vòng chấm+vá so với trước, chỉ khi chương vẫn còn lỗi nặng.
