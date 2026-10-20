# V12.16 — Quality Gate / Canon Pipeline

## Thay đổi chính
- Chapter có state: DRAFTED → SELF_CHECKING → REVIEWING → APPROVED → SYNCED.
- Quality Auditor trả JSON, chấm điểm và phát hiện hard-failure.
- Hard rules: tối đa 1–3 sự kiện chính, giới hạn nhân vật có tên, unauthorized important character, knowledge violation, retcon.
- Review fail sẽ rewrite có mục tiêu, tối đa 3 lần.
- Draft không được cập nhật Memory/Canon trước Quality PASS.
- Chương kế tiếp bị chặn nếu chương trước chưa Sync.
- Canon version tăng sau mỗi Sync.
- Manual edit sau Sync đánh dấu MODIFIED_AFTER_SYNC/STALE.
- Background Writer dùng cùng Quality Gate trước khi chạy post-processing.
- Backup JSON giữ review/sync/canonVersion/chapterDrafts.

## Kiểm thử
- npm test: tất cả unit/integration/security/routing PASS; E2E bỏ qua vì môi trường ZIP không có Playwright/Python.
