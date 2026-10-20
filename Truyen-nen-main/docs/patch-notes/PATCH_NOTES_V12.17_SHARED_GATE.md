# V12.17 — Gộp client và worker (Bước 2)

Không đổi kiến trúc. Phần Quality Gate / Story Control / Sync được chuyển vào `shared/core.js` để client và worker dùng chung một bản.

## 1. Đã chuyển vào shared/core.js
**Gate thuần (phần 1)**
- `evaluateReview` (chuẩn hoá kết quả Auditor, hard failure, verdict theo ngưỡng 90/75), `rewriteInstructionsText`, `checkRewriteAcceptable` (từ chối bản sửa rỗng / ngắn hơn 60%), `backupBeforeRewrite` (giữ tối đa 3 bản gốc), `mergeAiContinuityWarnings`, `gateMaxAttempts`.

**Dựng prompt + vòng lặp + Sync (phần 2)**
- `normalizeStoryControl`, `storyControlPrompt` — trước đây client và worker viết hai bản khác nhau.
- `buildQualityReviewPrompt`, `buildRewritePrompt` — khung, quy tắc, schema dùng chung; ngữ cảnh (outline hay brief, canon) do mỗi bên truyền vào.
- `runGateLoop(chapter, deps, opts)` — vòng chấm → sửa → chấm lại dùng chung; không gọi AI trực tiếp mà nhận hàm `review/rewrite/selfCheck/onStatus/onChange/shouldStop` từ client hoặc worker.
- `gateHardChecks`, `gateKnownNames`, `knownNameMentions` — kiểm tra cứng xác định (ngôn ngữ, đủ nội dung, continuity mức cao) và đếm tên nhân vật đã biết.
- `nextCanonVersion`, `applyCanonSync`, `mergeCanonVersion`, `isGateFailedResult` — tăng canonVersion, đánh dấu Sync, hợp nhất phiên bản, nhận biết kết quả job nền trượt Gate.

Client giữ `normalizeStoryControlClient()` / `storyControlPromptClient()` / `qualityHardCheck()` làm lớp bọc mỏng để các chỗ gọi cũ không phải đổi.

## 2. Thay đổi hành vi (có chủ đích)
- **Worker nay chạy kiểm tra cứng như client**: bản thảo ≤ 100 từ, có chữ không phải tiếng Việt, hoặc có cảnh báo continuity mức cao → hard failure. Trước đây chỉ client làm.
- **Prompt Auditor của worker** có thêm khối QUY TẮC, kiểm tra cứng và schema giống client; **prompt viết lại của worker** có thêm CANON CONTEXT (cắt 15.000 ký tự).
- **Story Control của client** dùng bản đầy đủ của worker (thêm giới hạn thread mới, danh sách trường khoá, dòng ưu tiên canon khi xung đột). Ảnh hưởng cả prompt lập kế hoạch/viết chương của client.
- `qualityHardCheck`: bỏ hai mục giữ chỗ `events_budget`, `character_budget` (luôn ok, gây hiểu lầm). Ngân sách sự kiện/nhân vật vẫn bị chặn bởi `evaluateReview` dựa trên số Auditor đếm.
- Mới: hệ thống đếm tự động tên nhân vật đã biết xuất hiện trong văn bản, đưa cho Auditor làm bằng chứng tham khảo. Đây chỉ là dữ kiện cho Auditor, không tự gây trượt Gate.
- Worker không cắt/chuẩn hoá mảng warnings/suggestions/rewriteInstructions/dimensions trước đây; nay giống client.
- `chapter.sync` của worker nay giữ các trường có sẵn (như `startedAt`) thay vì ghi đè hoàn toàn; `changes` mặc định `[]`.

## 3. Kiểm thử (`npm test`: 9 bộ, tất cả PASS)
- `tests/core.test.js`: 14 → **33** (prompt, Story Control, kiểm tra cứng, vòng lặp Gate với 9 tình huống, canonVersion/Sync, nhận biết trượt Gate).
- `tests/worker.test.js`: 29 → **31** (kiểm tra cứng dùng chung ở worker, prompt Auditor chứa quy tắc/schema/tên đã biết).
- `tests/worker.integration.js`: thêm kiểm tra Sync/canonVersion/review sau khi PASS. Đã đối chiếu: cùng bài kiểm tra cũng pass trên bản v12.16b, nên hành vi khi PASS không đổi.
- Mới `tests/worker.gatefail.js`: chạy cả handler với Auditor luôn trượt → đúng 3 lần chấm + 2 lần sửa, lưu bản gốc, **không chạy** cập nhật NV/Thế giới/Tóm tắt/Memory, không Sync, canonVersion không tăng, API key bị xoá.
- `tests/e2e_bg.py`: 11 → 15 (job nền trượt Gate ở client).
- E2E giao diện 29/29 không đổi.

## 4. Còn lại / chưa kiểm
- Chưa chạy với API thật: tỷ lệ trượt Gate, chi phí và ngưỡng 90/75 chưa được hiệu chỉnh.
- Số sự kiện chính vẫn do Auditor (AI) đếm; chưa có cách xác định bằng code.
- Hai bên vẫn tự dựng phần ngữ cảnh (client: outline + Story Bible; worker: `buildContext`) và tự gọi API — cố ý để nguyên vì khác nền tảng (state toàn cục vs `job.storyState`).
- Hợp nhất state job nền vào local (`mergeBackgroundChapter`) và các bước trích xuất sau chương vẫn tách đôi; phần trích xuất sẽ gộp ở Bước 3 (v12.18).
