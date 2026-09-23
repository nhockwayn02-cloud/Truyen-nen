# Xưởng Truyện AI v10 — GitHub + Cloudflare Queue

Bản này thay toàn bộ phần background Netlify bằng:

**GitHub Pages + Cloudflare Worker + Cloudflare Queues + Workers KV + OpenRouter**.

## Điểm chính

- Không còn Netlify Functions/Blobs.
- iPhone chỉ cần gửi job; Queue tiếp tục chạy khi iPhone tắt.
- Pipeline có checkpoint:
  `write → summary → characters → world → status → memory → scene`.
- Retry theo từng stage.
- Job status hiển thị stage và lỗi cụ thể.
- API key không được trả về từ endpoint status.
- Merge background không ghi đè các chương local mới hơn lúc job bắt đầu.
- Giữ nguyên hệ thống truyện v9.1 ở frontend.

## Cài đặt

Xem `cloudflare/SETUP.md`.
