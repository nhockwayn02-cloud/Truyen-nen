# V12.28.3 — Fix `getEndingTarget` thực tế trong ZIP

## Lỗi
Safari/iOS báo runtime: `Can't find variable: getEndingTarget`.

## Nguyên nhân
V12.28.2 có các chỗ gọi `getEndingTarget()` trong `index.html` nhưng bản ZIP thực tế lại thiếu **khai báo hàm**. Ghi chú V12.28.1 nói đã khôi phục helper nhưng helper không nằm trong nguồn `shared/core.js`, vì vậy lỗi có thể quay lại khi đồng bộ code.

## Cách sửa
Đưa `getEndingTarget()` trở lại nguồn sự thật `shared/core.js`, sau đó chạy `node scripts/sync-shared.js` để đồng bộ tự động sang:
- `index.html`
- `netlify/functions/write-chapter-background.js`

Logic:
- ưu tiên Ending Anchor lấy từ `hint`
- nếu không có thì lấy từ `directive`
- dùng lại `extractEndingAnchor()` hiện có

## Kiểm tra
- `getEndingTarget` helper: 3/3 PASS
- JavaScript syntax `index.html`: PASS
- Shared sync check: PASS
- Unit Quality Gate: 33/33 PASS
- Characters: 11/11 PASS
- Worker: 37/37 PASS
- V12.20: 16/16 PASS
- V12.22b: 8/8 PASS
- V12.23: 9/9 PASS
- Status/Memory soft hậu kỳ: PASS
- Routing 18+: 7/7 PASS
- Security: 12/12 PASS
- Worker integration: PASS
- Gate-fail integration: PASS
- E2E: bỏ qua vì môi trường thiếu Playwright/Chromium
