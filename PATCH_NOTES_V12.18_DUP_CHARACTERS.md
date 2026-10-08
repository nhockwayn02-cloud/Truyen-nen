# V12.18 — Sửa nhân vật bị nhân đôi + công cụ 🧹 Dọn nhân vật trùng

## Triệu chứng (từ ảnh chụp)
Character Database có thêm mục **"nhân vật chính"** (nhãn chung) và **"Bùi Lạc"** (cùng là nhân vật chính) bên cạnh hồ sơ Nhân Vật Chính đã khai báo.

## Nguyên nhân (đã tái hiện bằng test)
1. **Worker nền không biết `mainCharProfile`.** `mergeCharacter` chỉ so tên với danh sách `characters` nên mỗi lần AI trả tên nhân vật chính (hoặc nhãn "nhân vật chính") là tạo mục MỚI. Client có xử lý, worker thì không.
2. Prompt trích xuất của worker không nói tên nhân vật chính → AI tự đặt nhãn "nhân vật chính".
3. Client chỉ nhận ra nhân vật chính khi trùng tên tuyệt đối, không nhận nhãn chung hay tên ngắn/bí danh.

## Đã sửa (client + worker dùng chung trong `shared/core.js`)
- `resolveCharacterTarget`: tên MC, nhãn chung ("nhân vật chính", "main character", "protagonist"...), bí danh của MC → cập nhật hồ sơ có sẵn, KHÔNG tạo mục mới. Bí danh của NV thường cũng được nhận.
- Prompt NV (client + worker) nay nêu tên nhân vật chính và cấm tạo mục "nhân vật chính".
- `saveMainCharFromForm` giữ lại `aliases` khi lưu hồ sơ.

## Công cụ mới: 🧹 Dọn nhân vật trùng (Cài đặt → Character Database)
- Banner + số lượng khi có mục nghi trùng; mở modal xem từng gợi ý.
- Gợi ý chỉ khi có căn cứ: trùng tên MC, nhãn chung, tên ngắn trùng một phần với đúng 1 ứng viên. Có từ chối: **Giữ riêng**.
- **Gộp** không mất dữ liệu: điền ô trống, nối ý mới, tier cao hơn, khoảng xuất hiện rộng nhất, gộp quan hệ, đổi tên tham chiếu ở NV khác, lưu bí danh để lần sau AI không tạo lại.
- Gộp vào Nhân Vật Chính chỉ điền ô còn trống, không ghi đè nội dung bạn đã nhập.
- ↶ **Hoàn tác** 1 lần gộp gần nhất (trong bộ nhớ, mất khi tải lại trang).
- Không tự xóa/gộp gì nếu bạn không bấm.

## Kiểm thử
- Mới: `tests/characters.test.js` (11 test, gồm đúng ca trong ảnh: MC=Bùi Lạc, "nhân vật chính", "Ân" → "Ân" không bị đụng).
- E2E giao diện 29 → 33 (banner, modal, gộp, hoàn tác).
- Sửa `worker.integration.js`: test cũ mong NV "Lan" (chính là MC) được tạo thành mục DB — đó chính là lỗi trên.
- `npm test`: tất cả PASS.

## Lưu ý
- Mục **"Ân"** KHÔNG được gợi ý vì không có căn cứ cho thấy trùng ai. Nếu thực ra "Ân" là tên khác của một nhân vật, hãy tự xóa/sửa tên trong Character Database.
- Sửa này ngăn trùng MỚI; dữ liệu đã có cần bấm 🧹 một lần để dọn.
- Chưa chạy với API thật.
