# Prompt Optimizer Audit — Xưởng Truyện AI V14.0.16

**Nguồn kiểm tra:** `Truyen-nen-up-V14.0.16(1).zip`  
**Phạm vi:** prompt lập kế hoạch chương, context selection, rule filtering, conflict detection, recent continuity, status/canon provenance.  
**Ngày kiểm tra:** 2026-10-22

## 1. Kết luận điều hành

Ứng dụng đã có nền tảng prompt-compaction tốt và hiện có các hàng rào quan trọng: loại quy tắc trùng, bỏ quy tắc `[TẮT]/[OFF]/[DISABLED]`, không tự đưa `autoNextChapterHint` cũ vào prompt, đánh dấu Current Status cũ, giới hạn roster/lore/recent context, Beat Ledger `[R]`/`[S]`, Arc/Outline và Ending Anchor.

`npm test` chạy thành công: tất cả test logic PASS; 5 nhóm E2E bị SKIP vì môi trường thiếu Playwright/Python. Tuy nhiên, theo chuẩn `novel-prompt-optimizer`, bản hiện tại chưa thể tạo một context pack canon-safe hoàn chỉnh từ file ZIP alone vì dữ liệu truyện thực tế nằm trong state/IndexedDB của trình duyệt, không nằm trong mã nguồn.

Có 4 điểm cần xử lý trước khi gọi bản là “optimizer đầy đủ”:

1. `nextChapterHint` chưa có `chapterId/version/status`; app vẫn đưa thẳng vào prompt như hint đang hoạt động.
2. Prompt planner có mâu thuẫn thật về thứ tự ưu tiên giữa canon đã xác nhận và yêu cầu người dùng mới.
3. Giới hạn nhân vật có tên bị hard-code `4` trong planner, có thể mâu thuẫn với `storyControl.maxNamedCharacters` cho phép 1–6.
4. Chưa có cơ chế tổng quát để loại chương đã xóa hoặc dependent records đã invalidated khỏi context; logic hiện chủ yếu dựa vào mảng `state.chapters` hiện tại.

## 2. Trạng thái đã xác minh

- Phiên bản ứng dụng: **V14.0.16 Contract-First Complete Chapter Pipeline**.
- Luồng hiện có: lập kế hoạch → adaptive scene → viết → Semantic Prose Check/Quality Gate → sửa cục bộ hoặc scene → hậu kỳ → Sync Canon.
- Test suite: PASS toàn bộ test logic hiện có.
- E2E: chưa chạy do thiếu Playwright/Python; vì vậy chưa xác minh state thực tế trong IndexedDB, thao tác xóa chương, stale hint trên giao diện và prompt sau nhiều lần sửa/xóa.
- Active chapter cụ thể, chapter ID, hint ID và Current Status thực tế: **chưa xác minh được từ ZIP**.

## 3. Những phần đang làm đúng

### Rule filtering

`buildEffectiveRuleBlock()` đã:

- chuẩn hóa chữ/khoảng trắng/dấu câu để loại dòng trùng chính xác;
- bỏ các dòng có tiền tố hoặc nhãn tắt rõ ràng như `[TẮT]`, `[OFF]`, `[DISABLED]`;
- giữ lại nguồn của từng quy tắc (`Quy Tắc Nâng Cao`, `Quy Tắc Khác`);
- không cố gộp các câu chỉ giống nhau một phần.

### Context compaction

`buildContextBlock()` đã ưu tiên tương đối hợp lý:

- Story Bible ngắn;
- rule block đã lọc;
- lore/style/vocabulary;
- Arc/Outline đúng chương;
- tóm tắt các chương trước bị giới hạn;
- open loops, roster nhân vật liên quan, location/item/thread/foreshadowing/timeline/knowledge ledger;
- recent scene block;
- Current Status kèm nhãn chương xác nhận và cảnh báo stale;
- directive/hint chèn một lần ở vùng riêng.

`buildRecentBlocks()` chỉ lấy summary ngắn và đoạn cuối chương gần nhất, phù hợp nguyên tắc không gửi toàn bộ chương xa mặc định.

### Canon/continuity safeguards

- Không tự dùng `autoNextChapterHint` cũ vì trường này không có định danh chương.
- Current Status cũ được đánh dấu khi `lastStatusChapter < state.chapters.length`.
- Beat Ledger phân biệt beat bắt buộc `[R]` với beat cầu nối `[S]`.
- Có Ending Anchor và kiểm tra điểm kết.
- Có character lock, knowledge consistency, scene presence, story time, gender/anatomy lock và marital lock.

## 4. Phát hiện và phân loại vấn đề

### P1 — POSSIBLE CONFLICT: thứ tự ưu tiên canon và yêu cầu người dùng

**Vị trí:** `shared/core.js`, `buildChapterPlanPrompt()`, khoảng dòng 433–435.

Hai yêu cầu hiện cùng tồn tại:

- “Nếu yêu cầu người dùng xung đột với bối cảnh cũ, ưu tiên yêu cầu người dùng mới nhất...”
- “THỨ TỰ ƯU TIÊN: (1) canon đã xác nhận trong chương đã Sync và hồ sơ khóa; (2) mệnh lệnh người dùng hiện tại...”

Nếu “bối cảnh cũ” bao gồm canon đã xác nhận, hai câu không thể đồng thời đúng. Đây là xung đột phạm vi/định nghĩa, không chỉ là diễn đạt trùng.

**Tác động:** model có thể retcon canon hoặc ngược lại bỏ qua chỉ đạo người dùng mà không biết phải làm gì.

**Độ phân loại:** `POSSIBLE CONFLICT`; trở thành `HARD CONFLICT` khi directive yêu cầu thay đổi một fact đã khóa.

**Độ phân giải tối thiểu đề xuất:** thay bằng một policy duy nhất:

> Canon đã xác nhận và hồ sơ khóa không được tự sửa. Nếu directive mới yêu cầu retcon/thay đổi canon, đánh dấu `CONFLICT`, giữ canon cũ làm trạng thái hiện tại, và chỉ áp dụng thay đổi nếu người dùng xác nhận rõ đây là retcon có chủ đích.

Không nên dùng cụm “ưu tiên yêu cầu người dùng mới nhất” cho canon đã Sync.

### P1 — HARD GAP: active hint không có provenance

**Vị trí:** `index.html`, `buildContextBlock()` và state `nextChapterHint`.

App loại `autoNextChapterHint` vì thiếu ID, nhưng `nextChapterHint` vẫn được đưa vào prompt trực tiếp. Chưa thấy metadata bắt buộc như:

- `hintChapterId` hoặc số chương mục tiêu;
- `hintVersion`/timestamp;
- trạng thái `active`, `superseded`, `deleted`;
- nguồn hint: user/AI/import;
- liên kết với snapshot/chapter contract.

**Tác động:** sau khi viết, xóa hoặc đổi chương, hint cũ có thể tiếp tục được coi là hint của chương hiện tại. Điều này vi phạm nguyên tắc không dùng hint trước đó khi identity không xác minh được.

**Độ phân loại:** `HARD GAP` về provenance; chưa chứng minh được bug runtime từ ZIP alone.

**Độ phân giải tối thiểu đề xuất:** chỉ chèn hint khi thỏa điều kiện:

```text
hint.status == "active"
hint.targetChapter == activeChapterNumber
hint.version == latest accepted hint version
```

Nếu thiếu metadata, không đoán; đưa vào audit report là `UNVERIFIED_HINT` và không dùng làm nguồn bắt buộc. Tương thích ngược có thể cho phép migration một lần bằng cách gắn `targetChapter = currentChapter` chỉ khi người dùng đang ở đúng màn hình tạo chương và xác nhận.

### P1 — POSSIBLE CONFLICT: giới hạn named characters không đồng nhất

**Vị trí:** `buildChapterPlanPrompt()` dòng khoảng 442.

Planner ghi cứng “TỐI ĐA 4 NHÂN VẬT CÓ TÊN”, trong khi `normalizeStoryControl()` cho phép `maxNamedCharacters` từ 1 đến 6 và Quality Gate đọc giá trị cấu hình.

**Tác động:** người dùng đặt 5–6 nhưng planner vẫn tự giới hạn 4; hoặc Gate đánh giá theo ngưỡng khác với kế hoạch.

**Độ phân loại:** `POSSIBLE CONFLICT`.

**Độ phân giải tối thiểu đề xuất:** truyền `maxNamedCharacters` vào `buildChapterPlanPrompt()` và dựng dòng động. Chỉ giữ fallback 4 nếu state không có cấu hình.

### P1 — HARD GAP: deleted chapter/dependent record chưa có lớp lọc tổng quát

**Vị trí:** các đoạn dùng `state.chapters`, `storySoFarPrompt()`, `buildRecentBlocks()`, timeline/scene/status.

Skill yêu cầu loại chương đã xóa và dependent records đã invalidated. Mã hiện tại chủ yếu slice các mảng hiện có và dùng các record còn tồn tại. Chưa có bước chuẩn hóa kiểu:

```text
activeChapters = chapters.filter(c => c.status !== "deleted" && c.invalidated !== true)
```

cùng với cascade loại summary, scene, timeline, status snapshot và hint phụ thuộc chương đã xóa.

**Tác động:** nếu UI chỉ đánh dấu deleted thay vì xóa vật lý, dữ liệu stale vẫn có thể lọt vào recent/history/context.

**Độ phân loại:** `HARD GAP` về data filtering; cần E2E/state fixture để xác nhận có xảy ra trong runtime.

**Độ phân giải tối thiểu đề xuất:** tạo một `getActiveStoryRecords(state)` dùng chung cho client/worker, trả về active chapters và record IDs hợp lệ; mọi prompt builder dùng output này thay vì đọc thẳng `state.chapters`.

### P2 — POSSIBLE LOSS: relevance selection còn dựa nhiều vào heuristic

Roster dùng `relevantCharacters(8)` và tracker lấy tối đa 8 record. Đây là hợp lý về token nhưng cần kiểm tra bằng fixture: nhân vật quan trọng lâu không xuất hiện, nhân vật có quan hệ/locked fields, hoặc nhân vật đang giữ vật phẩm/secret có được chọn không.

**Độ phân loại:** `POSSIBLE LOSS`, không phải conflict.

**Độ phân giải:** thêm test fixture cho các khóa relevance: active thread, location, item owner, unresolved secret, relationship với main character, locked/canonical tier và current knowledge dependency.

### NOT A CONFLICT — các điểm không nên báo nhầm

- `nextChapterHint` được chèn riêng một lần trong `buildContextBlock()` và lại truyền riêng vào planner: đây là hai scope khác nhau, không tự động là duplicate; cần kiểm tra prompt cuối mỗi caller.
- `storySoFarPrompt()` và recent block khác nhau về mục đích: một là causal history nén, một là nối cảnh gần nhất.
- `Current Status` cũ và chapter ending mới không phải xung đột mặc định; status chỉ là snapshot cần đánh dấu stale và ưu tiên bằng chứng mới hơn.
- `[R]` và `[S]` không mâu thuẫn; chúng là hai loại beat có quyền hạn khác nhau.

## 5. Context pack tối thiểu đề xuất cho mỗi lần viết chương

Khi runtime có đủ metadata, context pack nên có đúng thứ tự sau:

1. **Active chapter:** số chương, chapter ID, draft/accepted status.
2. **Scene goal + required end state:** directive hiện tại, ending anchor và required beats.
3. **Verified hint:** chỉ hint có target chapter/version/status hợp lệ; nếu không có, ghi `UNVERIFIED_HINT` và không coi là bắt buộc.
4. **Latest accepted ending:** summary ngắn + đoạn cuối của chương accepted gần nhất; không dùng draft/soft-fail làm canon.
5. **Current status:** chỉ status snapshot mới nhất còn hợp lệ; ghi rõ `confirmedThroughChapter`.
6. **Relevant canon:** main character, nhân vật liên quan, location, object, world rules và style rules được scene chạm tới.
7. **Relevant knowledge:** nhân vật nào biết/không biết thông tin cần cho scene.
8. **Open loops:** chỉ thread/foreshadowing/goal được scene chạm tới hoặc cần để giữ causal continuity.
9. **Recent scene log:** tối đa vài cảnh gần nhất nếu được bật.
10. **Distant history:** chỉ thêm khi có causal dependency cụ thể.

Mỗi block nên có provenance ngắn, ví dụ `[CANON Ch12 SYNCED]`, `[STATUS Ch12 CONFIRMED]`, `[HINT Ch13 v2 ACTIVE]`, `[INFERENCE — không phải canon]`.

## 6. Final compact prompt template

```text
BẠN VIẾT CHƯƠNG [N] BẰNG TIẾNG VIỆT.

[ACTIVE CHAPTER]
- chapterId: ...
- status: drafting | continuing
- hint: [ACTIVE target=N version=...] ...
  hoặc: UNVERIFIED_HINT — không dùng làm yêu cầu bắt buộc.

[SCENE GOAL / REQUIRED END STATE]
- Mục tiêu: ...
- Ending Anchor bắt buộc: ...
- Required beats: [R1] ...; [R2] ...
- Beat [S] chỉ là cầu nối, không phải canon.

[LATEST ACCEPTED CONTINUITY]
- Chương đã xác nhận gần nhất: Ch...
- Tóm tắt: ...
- Đoạn kết cần nối tiếp: ...
- Current Status: ...

[CANON RELEVANT TO THIS SCENE]
- Nhân vật: ...
- Knowledge/relationships: ...
- Địa điểm/thời gian: ...
- World/style rules: ...

[OPEN THREADS]
- ...

[CONFLICT POLICY]
Canon đã xác nhận và hồ sơ khóa không được tự sửa. Nếu directive mới yêu cầu thay đổi canon, ghi CONFLICT và giữ canon cũ; không retcon nếu chưa có xác nhận rõ. Không thêm nhân vật quan trọng, tuyến truyện hoặc biến cố lớn ngoài brief/Outline. Không biến suy luận thành canon.

[OUTPUT]
Viết đúng cảnh và causal order. Giữ đúng nhân vật, kiến thức, địa điểm và thời gian. Đạt Ending Anchor. Không in metadata, beat code, audit hoặc giải thích ngoài văn xuôi.
```

## 7. Việc nên làm tiếp theo

### Bắt buộc trước khi gọi optimizer hoàn chỉnh

- Xuất một snapshot JSON từ IndexedDB/runtime state của truyện cần tối ưu.
- Xác định active chapter number/ID, accepted status, current hint metadata và `lastStatusChapter`.
- Kiểm tra các chapter có cờ deleted/invalidated hay không.

### Sửa code ưu tiên

1. Thêm provenance/target/version/status cho `nextChapterHint`.
2. Chuẩn hóa một policy duy nhất cho canon-vs-directive.
3. Dùng `storyControl.maxNamedCharacters` trong planner thay vì số 4 cố định.
4. Tạo active-record filter dùng chung client/worker.
5. Thêm fixture/test cho hint stale, deleted chapter, maxNamedCharacters 6 và nhân vật quan trọng lâu không xuất hiện.

## 8. Bằng chứng kiểm thử

Lệnh đã chạy:

```bash
npm test
```

Kết quả: tất cả test logic hiện có PASS. Các nhóm E2E bị bỏ qua do thiếu Playwright/Python trong môi trường kiểm tra; do đó không xem kết quả hiện tại là bằng chứng đầy đủ cho IndexedDB/cache/deletion behavior.
