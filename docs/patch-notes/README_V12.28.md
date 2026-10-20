# Truyen335 V12.28 — Normal Write + Server Post-Process

## Luồng chính
1. Bấm **Viết chương** bình thường.
2. AI stream nội dung trên app.
3. Quality Gate xử lý như trước.
4. Chương được `persist()` ngay sau PASS.
5. App báo **Đã viết xong**.
6. App tạo một Netlify Background Job với `mode=postprocess`.
7. Netlify Background Function chỉ chạy hậu kỳ: Summary, Character, World, Current Status, Memory, Scene, Next Chapter Hint và Canon Sync.
8. Khi mở app lại, job-status trả kết quả và app merge dữ liệu vào story.

## Không còn
- Background Job sinh chương.
- `runCanonPostProcess()` chạy trong browser sau khi viết.
- Hậu kỳ làm trình viết phải chờ hoàn thành.

## Nút thủ công
`☁ Chạy hậu kỳ server (tắt máy được)` chỉ dùng để retry hậu kỳ của chương hiện tại; không sinh chương mới.

## Kiểm thử
- Unit/worker/security: PASS.
- JavaScript syntax: PASS.
- E2E giao diện/background: chưa chạy do môi trường kiểm thử thiếu Playwright/Chromium.
