# CHANGELOG — Xưởng Truyện AI

## [V14.0.0] — Contract-First Complete Chapter Pipeline

- Chapter Contract bất biến khóa Arc/Outline, Required Beat, Allowed Cast, Forbidden Drift, continuity mở chương và thay đổi bắt buộc.
- Scene Graph bị validate trước khi viết; plan drift bị retry một lần rồi dừng an toàn, không fallback âm thầm sang writer cũ.
- Mỗi scene và Top-up giữ cùng Contract; Sync Canon chỉ được thực hiện sau khi Contract barrier đạt.
- Dọn tài liệu patch cũ vào `docs/patch-notes/`; client và worker dùng chung helper V14.

## [V14.0.1] — Scene Graph Response Parser

- Cứu phản hồi Scene Graph hợp lệ khi model bọc JSON trong markdown, thêm lời dẫn hoặc có phần văn bản sau JSON.
- Lần retry hiển thị đúng lỗi parse thay vì báo sai đồng thời “không có scene/chapterGoal/endingAnchor”.
- Bổ sung regression parser và đồng bộ client/worker.

## [V14.0.2] — Allowed Cast Context

- Allowed Cast nay quét toàn bộ Arc/Outline, không chỉ dòng Outline của chương hiện tại.
- Tránh loại nhầm nhân vật canon hợp lệ như nhân vật được khai báo ở phần setup/consequence của Arc.
- Nhân vật không có trong Story Bible/Outline vẫn bị chặn khi tự xuất hiện trong scene.

## [V14.0.3] — Canon Cast / Active Cast Separation

- Tách `canonicalCharacters` (toàn bộ nhân vật đã có trong Story Bible) khỏi `allowedCharacters` (nhân vật đang hoạt động trong Arc/chương).
- Nhân vật canon như Trần Mỹ Duyên hoặc Lâm Tịnh Nhã không còn bị từ chối chỉ vì không nằm trong 12/24 nhân vật Active Cast được ưu tiên.
- Nhân vật không tồn tại trong Canon vẫn bị validator chặn; bổ sung regression cho cả hai trường hợp.

## [V13.6] — Arc Lock và chống Plot Drift

- Scene Graph nhận Arc/Outline lock, allowed cast và danh sách hướng drift bị cấm; các scene và top-up đều giữ cùng ràng buộc.
- Không cho AI tự biến nhân vật phụ/nhân vật mới thành tuyến chính hoặc tự đổi nghề, tài nguyên, địa vị và mục tiêu sinh tồn của nhân vật chính.
- Segment Repair được hướng dẫn thay toàn bộ vùng tuyến phụ sai bằng đoạn cầu nối đúng Outline thay vì cố giữ tuyến drift.
- Thêm regression cho Arc lock, allowed cast và forbidden drift; toàn bộ client/worker parity đã PASS.

## [V13.5] — Hard Minimum không phụ thuộc cờ cũ

- Hard minimum 4.500 từ nay luôn được áp dụng, kể cả Story Record cũ đang lưu `adaptiveScenePipeline=false`.
- Mọi fallback ngắn đều phải chạy Top-up trước khi tạo chapter object và Quality Gate.

## [V13.4] — Fallback Short-Draft Guard

- Thêm hàng rào Top-up cuối cho mọi bản nháp dưới 4.500 từ, kể cả khi Scene Graph lỗi và app phải dùng fallback prompt cũ.
- Không còn đường tạo chương nào được lưu trực tiếp ở khoảng 1.000–2.000 từ khi Adaptive Scene đang bật.

## [V13.3] — Viết lại dùng chung Adaptive Scene

- Sửa lỗi nút **Viết lại** bỏ qua Adaptive Scene/Top-up vì nhánh cũ chỉ áp dụng cho chương mới.
- Cả tạo chương mới và viết lại nay đều phải đi qua Scene Graph, scene nối tiếp và Top-up tối thiểu 4.500 từ.

## [V13.2] — Adaptive Scene Top-up và Hard Minimum

- Khi Adaptive Scene ghép xong dưới 4.500 từ, app tự viết bổ sung tối đa 6 lượt bằng prompt compact chỉ truyền đoạn đuôi, state delta và Required Beat; prompt yêu cầu tối thiểu phần từ còn thiếu.
- Chương dưới 4.500 từ bị Quality Gate đánh dấu `HARD_FAIL`, không thể được coi là đạt chỉ vì điểm văn phong/continuity cao.
- Bổ sung regression cho prompt top-up, giới hạn token và hard minimum 4.500 từ.

## [V12.47.1] — Background Worker Parity

- Background Worker nay dùng cùng chế độ `autoRepairOnCreate` với client.
- Cảnh báo Canon/continuity/Beat có thể hành động sẽ buộc chạy rewrite/Targeted Repair và chấm lại trước khi Sync Canon.
- Worker tôn trọng cả `qualityAcceptSoft`, tránh duyệt mềm ngoài cấu hình người dùng.
- Bổ sung regression assertion cho parity client/worker.

## [V12.47.0] — Tạo Chương Hoàn Chỉnh

- Đổi nút chính thành **✦ Tạo Chương Hoàn Chỉnh**.
- Thêm công tắc bật mặc định để tự động chạy Semantic Prose Check, Quality Gate, patch/Targeted Segment Repair và chấm lại trước khi Sync Canon.
- Khi tạo chương mới, cảnh báo Canon/continuity/Beat có thể hành động không còn bị bỏ qua chỉ vì điểm tổng là `PASS`.
- Lưu cấu hình tự sửa vào Story Record; người dùng vẫn có thể tắt trong phần Công Cụ Sáng Tác.
- Thêm regression test cho pipeline tự hoàn thiện.

## [V12.46.1] — Canon Warning AutoFix

- Sửa lỗi nút **AI tự sửa** dừng ngay khi Quality Gate trả `PASS` dù vẫn có cảnh báo Canon/continuity/Beat có hướng xử lý.
- Khi bật AI tự sửa, các cảnh báo có thể hành động được sẽ được chuyển vào luồng patch/Targeted Segment Repair; cảnh báo phong cách nhẹ không bị ép sửa.
- Thêm regression test bảo đảm cảnh báo Canon được gửi cho AI sửa và phải chấm lại sau đó.

## [V12.46.0] — Semantic Prose Check

- Rà văn xuôi theo từng câu để phát hiện cụm tiếng Việt có thể vô nghĩa hoặc sai chính tả theo ngữ cảnh, kể cả khi từng từ riêng lẻ đều hợp lệ.
- Gửi riêng từng nhóm câu cho AI; chỉ tự sửa khi AI trả đúng cụm nguyên văn, cụm thay thế và độ tin cậy từ 85% trở lên.
- Trường hợp `uncertain`, không tự thay; lưu cảnh báo để người dùng xem và quyết định.
- Áp dụng cho client và Background Worker, có regression test cho lỗi kiểu “tớn tiền”.

## [V12.45.0] — Targeted Segment Repair

- Nút **AI tự sửa** tự chuyển sang sửa theo vùng khi patch câu neo thất bại và chương quá dài để viết lại toàn bộ.
- AI trả mốc đầu/cuối nguyên văn và chỉ viết lại vùng lỗi; phần còn lại của chương được giữ nguyên.
- Áp dụng cho cả client và Background Worker, có backup trước khi thay và kiểm tra giới hạn thay đổi độ dài.
- Giữ Best Draft Guard: bản sửa vẫn được Quality Gate chấm lại; nếu kém hơn, bản tốt hơn được khôi phục.

## [V12.44.0] — E2E Stable Patch

- Sửa hiển thị cảnh báo `JOB_SECRET` và lỗi mã truy cập trong Background Postprocess.
- Poll Background Job nhanh hơn trong môi trường test, giữ Canon version và trạng thái rà khi hợp nhất.
- Bổ sung mock Netlify Job cho E2E giao diện; cập nhật payload/snapshot E2E theo luồng Postprocess hiện hành.
- Unit/Core 39/39 và các E2E giao diện, job nền, payload slim được chuẩn hóa để kiểm tra đúng hành vi hiện tại.

## [V12.43.0] — Required Beat Barrier

- Thêm công tắc mặc định bật: `Chặn thiếu Required Beat [R]`.
- Khi còn `[R]` thiếu, không cho Manual Override, không Sync Canon và không xuất bản TXT/MD/DOC.
- Xuất bản kiểm tra toàn bộ chương trong truyện, không chỉ chương đang mở.
- Có thể tắt khóa trong phần Quality Gate nếu người dùng chủ động muốn xuất bản bản nháp.

## [V12.42.0] — Plan Completion Guard

- Ô kế hoạch vẫn có thanh cuộn; nội dung không bị mất chỉ vì vượt 220px chiều cao hiển thị.
- Tăng ngân sách lập Chapter Plan và tự retry khi model trả `finishReason: length`.
- Lượt retry yêu cầu trả đủ `[R]`, `[S]`, `REQUIRED_DONE`, `STOP_AFTER` và `CONFLICT`, tránh viết chương dựa trên kế hoạch bị cắt.

## [V12.41.0] — AutoFix Retry + Patch Trace

- Khi thiếu `[R]` nhưng lượt vá đầu không ghép được, AI được retry với `insert_before_end` thay vì neo vào mã beat không có trong bản thảo.
- Quality Review hiển thị số patch đã ghép, thao tác và đoạn neo; không còn báo mơ hồ rằng AI đã sửa nếu thực tế không ghép được.
- Giữ Best Draft Guard: bản sửa làm điểm tụt vẫn bị khôi phục.

## [V12.40.0] — Nested Main Events

- Giữ giới hạn tối đa 3 sự kiện trục chính mỗi chương.
- Cho phép biến cố lớn lồng bên trong một sự kiện trục khi có quan hệ nhân-quả trực tiếp và thật sự cần.
- Không ép chương nào cũng phải thêm biến cố lồng; không tính biến cố lồng thành sự kiện chính thứ 4.
- Đồng bộ luật này vào planner, writer prompt và Story Control.

## [V12.39.0] — Canon Barrier + Required Beat Contract

- Mặc định không cho bản SOFT_FAIL trở thành Canon; thêm công tắc **Chặn điểm thấp vào Canon**.
- Tách `[R]` (beat bắt buộc từ brief/Outline/canon) khỏi `[S]` (beat hỗ trợ do AI đề xuất), tránh chấm thấp vì ý AI tự phát sinh.
- Thêm thứ tự ưu tiên Canon → mệnh lệnh mới → Outline → gợi ý → đề xuất AI và buộc ghi nhận xung đột thay vì tự chọn im lặng.

## [V12.38.0] — Marital Status Lock

- Thêm ô **Tình trạng hôn nhân** và **Vợ/chồng/người yêu** cho nhân vật chính.
- Thêm các trường tương ứng vào từng hồ sơ NPC, Story Bible, character summary và worker prompt.
- Xem tình trạng hôn nhân là dữ liệu lõi; AI không tự đổi nếu không có sự kiện và bằng chứng rõ ràng.

## [V12.37.0] — Gender Anatomy Lock

- Truyền giới tính từng nhân vật vào HỒ SƠ KHÓA thay vì chỉ truyền tên và tuổi.
- Prompt viết yêu cầu xác định chủ thể trước mỗi đoạn tả thân thể, không trộn đặc điểm sinh học giữa các nhân vật.
- Quality Gate có cờ `genderAnatomyMismatch` và chuyển lỗi này thành Hard Failure.

## [V12.36.0] — Best Draft Guard

- Không còn mặc định giữ bản tự sửa cuối cùng nếu điểm Quality Gate bị tụt.
- Xếp hạng bản chấm theo `PASS > SOFT_FAIL > HARD_FAIL`, sau đó so điểm và số hard failure.
- Khi vòng sửa sau kém hơn, tự khôi phục bản tốt nhất đã chấm và hiển thị cảnh báo `Best Draft Guard`.

## [V12.35.0] — Beat Ledger

- Kế hoạch chương đánh mã `[B1]`, `[B2]`... và ghi rõ mục tiêu, hành động bắt buộc, bằng chứng hoàn thành, hậu quả.
- Prompt viết buộc hoàn thành từng beat theo thứ tự trước khi đi tới Ending Anchor.
- Quality Gate audit từng beat bằng bằng chứng trong bản thảo, không tính việc chỉ nhắc lại kế hoạch.

## [V12.34.0] — Targeted beat repair

- Khi Quality Gate phát hiện thiếu beat/sự kiện bắt buộc, AI có thể dùng `insert_before_end` để chèn cảnh ngay trước đoạn kết mà không cần đoán câu neo nguyên văn.
- Client và worker dùng chung thao tác vá; giữ nguyên đoạn kết, không viết lại chương dài.
- Thêm regression test cho trường hợp “phát hiện kẻ theo dõi” bị bỏ sót.

## [V12.33.1] — Responsive iPhone topbar

- Ẩn đúng label trợ năng `sr-only` khỏi layout nhưng vẫn giữ cho trình đọc màn hình.
- Thu gọn topbar trên màn hình ≤600px: mô tả dài ẩn, tiêu đề không bị xuống từng chữ, nút điều khiển vừa chiều ngang iPhone.

## [V12.33.0] — P0/P1/P2 hardening

- P0: thêm age gate 18+, bảng kiểm tra cấu hình bảo mật deployment và endpoint `security-status` không tiết lộ secret.
- P0: thêm `REQUIRE_HARDENED_SECURITY=1` để từ chối background job khi thiếu `JOB_SECRET` hoặc `APP_PASSCODE`.
- P1: thêm Chế độ đơn giản/Chuyên gia, tự lưu lựa chọn trên thiết bị và wizard khởi tạo truyện.
- P2: thêm progress strip cho luồng lập kế hoạch, viết và Quality Gate; cập nhật tài liệu kế hoạch/module.

Gộp từ toàn bộ file `PATCH_NOTES_*.md` và `README_V*.md` cũ (mới nhất ở trên). Nội dung các bản được giữ nguyên, chỉ hạ cấp tiêu đề.
Bản mới nhất: **V12.47.1** (xem mục đầu tiên). Hướng dẫn tổng quan: `README.md`; kiến trúc/Memory Engine/Backup: `docs/ARCHITECTURE.md`; bảo mật: `SECURITY_SETUP.md`.


---

## [V12.33.0] — Tiến độ Arc + Outline theo từng chương (chống truyện đi quá chậm)

- **Vấn đề:** prompt chỉ nhận tên + mục tiêu Arc (cắt 200 ký tự) mà không biết đang ở đâu trong Arc; chương bắt đầu/kết thúc dự kiến của Arc bị bỏ phí; Outline là một khối chung cắt 800 ký tự nên AI không biết chương này phải làm bước nào.
- **`arcProgressPrompt`:** khối TIẾN ĐỘ ARC (chương x/y, % đã đi, còn bao nhiêu chương, nửa chặng/chương cuối/quá hạn phải thu Arc) và khối Outline (VIỆC BẮT BUỘC của chương lấy từ dòng `Ch12: …`, kèm dòng chương kế để nối mạch, giới hạn 1500 ký tự khi không có dòng theo chương).
- **Outline 🤖 AI đề xuất** nay tạo từng chương (JSON `chapters[{chapter, beat}]` + mốc kết giai đoạn), lưu thành các dòng `ChN: …`; cảnh báo trên giao diện khi Outline sắp hết/đã hết.
- **Kế hoạch chương** có mục 7a "TIẾN ĐỘ ARC/OUTLINE"; ngân sách sự kiện yêu cầu mỗi sự kiện là một BƯỚC TIẾN thật.
- **Quality Gate:** cờ cứng `arcStall` (chỉ khi có Arc/Outline và chương không làm bước nào) → HARD_FAIL → viết lại.

## [V12.32.17] — Nhân vật phụ có đời riêng (ngôi 3 giới hạn không còn dồn hết vào nhân vật chính)

- **Vấn đề:** prompt ghi nhân vật chính "BẮT BUỘC là trung tâm mọi chương" và "Ngôi 3 giới hạn" không được giải thích, nên AI hiểu là chỉ viết xoay quanh nhân vật chính; nhân vật phụ chỉ phản ứng.
- **Ngôi 3 giới hạn** nay được mô tả đúng: mỗi cảnh/đoạn bám sát MỘT nhân vật (thường là nhân vật chính, được chuyển sang nhân vật phụ ở cảnh khác có chuyển cảnh rõ), không nhảy vào đầu nhiều người trong cùng đoạn.
- Nhân vật chính là **trục** và phải có mặt trong chương, nhưng không cần có mặt ở mọi cảnh; kế hoạch chương ghi nhịp nào theo góc nhìn nhân vật nào.
- Story Control thêm "NHÂN VẬT PHỤ CÓ ĐỜI RIÊNG": việc riêng, mong muốn riêng, hành động chủ động kể cả khi nhân vật chính vắng mặt.

## [V12.32.16] — Thử lại bền hơn khi nhà cung cấp model trả 502/5xx

- **Vấn đề:** lỗi "502: The server had an error while processing your request" là lỗi từ phía nhà cung cấp model/endpoint (quá tải, model sập tạm); app chỉ thử lại tổng ~7 giây (client) hoặc ~3 giây (worker) nên dễ bỏ cuộc.
- **Client:** tối đa 4 lần thử lại; lỗi 5xx chờ 2s/5s/10s/20s (tôn trọng Retry-After, tối đa 30s); thông báo lỗi cuối nêu rõ lỗi phía nhà cung cấp.
- **Worker nền:** lỗi 5xx được thêm 1 lần thử và chờ 2s/6s/12s, nhưng dừng nếu không còn đủ thời gian an toàn của hàm.

## [V12.32.15] — Thời gian chảy theo mạch truyện (văn xuôi thuần túy)

- **Vấn đề:** luật thời gian cũ ép AI "nêu mốc ngay đầu chương, mỗi lần chuyển cảnh, và cuối chương để thời điểm rõ ràng"; kế hoạch chương bắt ghi "mốc mở chương + mốc kết chương"; Quality Gate cảnh báo "thiếu mốc thời gian" nên các lần tự sửa lại chèn nhãn kiểu "Chiều thứ Sáu, …". Kết quả đọc như báo cáo, không giống văn xuôi.
- **Prompt viết (`timePrompt`):** thời gian là một phần câu chuyện, không phải nhãn. Cấm mở chương bằng câu báo ngày giờ, cấm kết chương bằng câu tổng kết thời điểm, cấm nhãn "Thời gian:". Chỉ nêu giờ/ngày cụ thể khi nhân vật nhìn đồng hồ/lịch hoặc tình tiết cần (hạn chót, hẹn giờ). Thời điểm thể hiện qua chi tiết trong cảnh (ánh sáng, thời tiết, bữa ăn, độ mệt, việc đang làm). Thời gian trôi/nhảy được lồng thành một mệnh đề trong mạch kể. Vẫn giữ luật nhất quán: chỉ tiến về phía trước, hồi phục/quan hệ/kế hoạch tiến triển theo thời gian, nhịp thời gian do tác giả chọn, cảnh báo khi nhiều chương liền đứng yên.
- **Kế hoạch chương:** mục 5 thành "DÒNG THỜI GIAN (ghi chú nội bộ, không in thành nhãn)", bỏ yêu cầu mốc mở/kết chương.
- **Quality Gate:** `timeStagnation` chỉ báo khi có bằng chứng thời gian sai (đi lùi/mâu thuẫn ngày, vết thương, hạn chót…) hoặc đứng yên thật; **không** báo chỉ vì chương thiếu ngày/giờ. Cảnh báo đổi thành "Thời gian truyện bất nhất hoặc đứng yên". Vẫn là cảnh báo mềm, không chặn.
- **AI tự sửa/vá:** cấm chèn câu/dòng báo ngày giờ làm nhãn ở đầu hoặc cuối chương; sửa lỗi thời gian phải lồng vào mạch kể. Chuyển cảnh/địa điểm cũng dùng "câu chuyển tự nhiên", không "di chuyển + mốc thời gian".
- **Hậu kỳ (Current Status):** `changes.time` được suy từ cả mốc nói thẳng lẫn dấu hiệu ngầm, ghi dạng tương đối được ("sáng hôm sau", "đêm cùng ngày…"); không có dấu hiệu đáng tin thì giữ mốc cũ, không bịa. Nhật ký `timeLog` và phát hiện đứng yên vẫn hoạt động.
- **Giao diện:** ô Story Clock ghi rõ là không bắt buộc, chỉ để AI giữ nhất quán, không in ra văn.

## [V12.32.14] — Dọn dẹp an toàn

- **Tài liệu:** gộp 41 file `PATCH_NOTES_*.md` / `README_V*.md` thành `CHANGELOG.md` (không mất dòng nào); README cũ lưu ở `docs/ARCHITECTURE.md`, prompt ở `docs/PROMPT_V12.22.md`; `README.md` viết lại gọn, đúng hiện trạng.
- **Code chết (phân tích cú pháp bằng acorn, không chỉ đoán theo tên):** gỡ 21 hàm ở giao diện (~230 dòng): extractBalancedJson, idbGetAll, loadStoryStateFromDisk, syncMainCharCoreFromProfile, buildFemaleDefinitionBlock, matureFocusLabel, timingSummary, runFastPostTasks, normalizeStoryControlClient, qualityHardCheck, applyNextChapterHint, previewNextChapterHint, beginCanonSync, completeCanonSync, checkCheckpoint, startBackgroundWrite, _fmtDur, enqueueTask, showCheckpointBanner, runQueue, hideCheckpointBanner; và 16 hàm ở worker (~430 dòng): genSecret, encryptText, recentContext, generateSummary, generateNextChapterHint, updateCharacters, updateWorld, formatStatus, updateCurrentStatus, updateLongMemory, scanScenes, parseArrayWithRepair, parseObjectWithRepair, extractModelFor, compactCharacterList, repairJsonWithAI. Phần lớn là luồng cũ đã bị thay: viết nền từ giao diện (`startBackgroundWrite`) và các bước trích xuất riêng lẻ ở worker (đã gộp thành hậu kỳ một lệnh gọi từ V12.30). Chỉ gỡ hàm không còn được nhắc ở bất kỳ đâu (kể cả HTML, chuỗi, test) và không nằm trong khối `SHARED-CORE`. Hành vi không đổi.
- **Bảo mật xuất bản:** `netlify.toml` thêm redirect 404 (force) cho `tests/`, `netlify/`, `shared/`, `lib/`, `scripts/`, `docs/` và file cấu hình/tài liệu gốc, để chúng không tải công khai được từ site (`publish = "."` giữ nguyên, không đổi cấu trúc thư mục).

---

## [PATCH_NOTES_V12.32.10_PATCH_REWRITE] — Ghi chú bản vá

### V12.32.10 — AI tự sửa cục bộ (patch) + nút 🛠 AI tự sửa

#### Vấn đề
Chương bị "🟠 Cần sửa" (vd 65/100) vẫn không tự lên điểm: Quality Gate yêu cầu AI **viết lại cả chương** (~5000 từ).
AI thường trả về bản bị cắt/tóm tắt (vd 1159/5309 từ) → app từ chối ("Bản sửa quá ngắn/rỗng") và giữ nguyên bản thảo.
Nút 🔍 Duyệt lại chỉ chấm lại (rewrite:false) nên cũng không sửa gì.

#### Thay đổi
1. **Sửa cục bộ (patch)** — `shared/core.js`: `buildPatchPrompt`, `parsePatchResponse`, `applyChapterPatches`, `checkPatchAcceptable`.
   AI chỉ trả JSON các thao tác nhỏ: `replace`, `delete`, `insert_after`, `insert_before`, `insert_start`, `insert_end`.
   Xoá/thay đoạn dài bằng `from`+`to` (đầu/cuối đoạn). Đoạn bị lặp chọn bằng `which` (số thứ tự hoặc `"last"`).
   Phần không nhắc đến giữ nguyên 100%. Tốn ít token hơn nhiều (≈4000 token ra thay vì ≈16000).
2. **An toàn:** find phải khớp nguyên văn (có dung sai khoảng trắng); khớp mơ hồ/không thấy → bỏ qua chỗ đó, không đoán;
   range `from→to` > 40% chương bị chặn; sau vá chương phải dài 60%–135% bản gốc; luôn backup bản cũ vào `versions`.
3. **Gate dùng patch trước**, nếu không vá được mới dự phòng viết lại cả chương (cả client và worker nền).
4. **Nút 🛠 AI tự sửa** (cạnh 🔍 Duyệt lại): chạy chấm → vá → chấm lại tối đa `qualityMaxAttempts` lượt cho chương đang "Cần sửa".
   Đạt thì hỏi Sync Canon như 🔍 Duyệt lại. Không đạt vẫn giữ bản đã vá tốt nhất, xem/khôi phục bản cũ ở lịch sử phiên bản.

#### Test
`tests/v12_32_10_patch_rewrite.test.js` (mới) + cập nhật mock `worker.test.js`, `worker.gatefail.js` cho luồng vá-trước.

#### V12.32.11 (sửa tiếp)
- **Lỗi:** bộ chấm được xem ĐOẠN KẾT CHƯƠNG TRƯỚC để đối chiếu cảnh mở đầu, nhưng AI sửa (cả vá cục bộ lẫn viết lại cả chương) thì KHÔNG → vá mù, tự đoán địa điểm
  (vd chương trước kết ở hành lang nhưng AI nối vào "văn phòng"/"bãi xe") nên lần chấm sau lại báo lỗi continuity mới.
- **Sửa:** truyền `prevEnding` (1500 ký tự cuối chương trước) vào prompt vá và prompt viết lại, ở cả client lẫn worker nền;
  thêm quy tắc "câu chuyển cảnh phải nối đúng từ đoạn kết chương trước, không dời sang địa điểm khác; chi tiết thêm vào phải khớp canon".

#### V12.32.12 (AI tự làm hết trước khi giao chương)
- **Tối đa 5 vòng** chấm → vá (trước là 3). Mặc định 5; giá trị lưu cũ = 3 (mặc định cũ, không có ô chỉnh trên giao diện) cũng được hiểu là 5.
- **Nhớ lỗi đã sửa:** lỗi nặng của các vòng trước mà vòng này không còn bị truyền vào prompt vá/viết lại ("giữ nguyên chỗ đã sửa, đừng hoàn tác"), tránh sửa chỗ này làm hỏng chỗ khác.
- **Duyệt kèm cảnh báo:** nếu chỉ còn SOFT_FAIL (điểm ≥ ngưỡng mềm 75) và KHÔNG có hard failure thì duyệt luôn, ghi cảnh báo, không chạy thêm vòng.
  Tắt bằng `qualityAcceptSoft:false` trong state nếu muốn giữ chuẩn PASS ≥ 90 nghiêm ngặt.
- Tốn thêm: tối đa 2 vòng chấm+vá so với trước, chỉ khi chương vẫn còn lỗi nặng.

#### V12.32.13 (trần output ~7800 token: hết "viết lại cả chương" vô ích)
- **Vấn đề gốc:** mọi lệnh gọi AI bị chặn ở 7800 token output (`AI_MAX_OUTPUT_TOKENS`, provider ~8192) dù code xin 12000–24000.
  Chương ~5000 từ tiếng Việt ≈ 9–11k token nên KHÔNG thể được "viết lại toàn bộ" trong một lệnh gọi → bị cắt/tóm tắt, bản sửa bị từ chối, tốn token vô ích.
- **Mở rộng cuối (V12.23) đổi sang chèn đoạn** (client + worker): AI chỉ trả các khối `>>> SAU: <neo>` / `>>> TRƯỚC: <neo>` + đoạn mới
  (không dùng JSON để khỏi vỡ vì dấu ngoặc kép trong lời thoại). App ghép vào, giữ nguyên 100% văn bản gốc. Khối nào đổi đoạn kết chương, vượt `maxWords`,
  neo không khớp hoặc không phải thao tác chèn đều bị bỏ. `maxTokens` xin vừa đủ theo số từ cần thêm (`expandMaxTokens`).
- **Gate: viết lại cả chương chỉ còn là dự phòng và bị chặn** khi chương quá dài so với trần (`wholeRewriteFits`) — khỏi tốn một lệnh gọi chắc chắn thất bại.
- Hằng số `AI_MAX_OUTPUT_TOKENS` dùng chung (client `callAI`, worker `callOpenRouter`/retry).
- Chèn/vá nhận biết cuối đoạn/đầu đoạn tốt hơn: neo thiếu dấu chấm/ngoặc đóng cuối đoạn, hoặc thiếu ngoặc mở/gạch thoại đầu đoạn, vẫn chèn thành đoạn mới thay vì xé câu.
- Viết chương chính và các lượt "viết tiếp" vẫn theo từng đoạn như cũ (đã thiết kế nối nhiều lượt), không đổi.
- Test: `tests/v12_32_13_expand_inserts.test.js` (mới); harness `v12_30_streaming_fix` khai báo thêm hằng mới.

---

## [PATCH_NOTES_V12.32.2_POSTPROCESS_TRUNCATION] — Ghi chú bản vá

### V12.32.2 — Hậu kỳ nền không cập nhật nhưng vẫn báo "Đã đồng bộ"

#### Nguyên nhân
- Hậu kỳ gộp bắt AI trả MỘT JSON chứa summary + toàn bộ nhân vật (~70 trường/người) + world + status + memory + continuity + gợi ý, với trần 7800 token. Chương dài (~5500 từ) gần như luôn vượt → `finish=length` → code hoàn tác TOÀN BỘ dữ liệu hậu kỳ.
- Dù hoàn tác, job vẫn ghi `postProcess.status="DONE"` / `completed`, và client luôn hiện "☁ Đã đồng bộ ... NV/World/Status/Scene đã hợp nhất" → báo thành công giả.

#### Sửa
- Schema yêu cầu AI BỎ trường rỗng/không đổi, tối đa 12 nhân vật → phản hồi ngắn hơn nhiều.
- Nếu JSON gộp bị cắt/hỏng: tự chạy 3 nhóm nhỏ (summary+memory+continuity+hint / nhân vật / world+status). Nhóm nào lỗi chỉ nhóm đó giữ dữ liệu cũ. Lỗi API vẫn chỉ gọi 1 lần (không tốn thêm).
- Server ghi trạng thái thật: DONE / PARTIAL / FAILED (+ lý do, danh sách task chưa cập nhật); `job-status` trả `postProcessStatus/Error/Failed`.
- Client hiện cảnh báo ⚠ nêu rõ task nào chưa cập nhật thay vì "Đã đồng bộ".
- Test cập nhật + thêm test fallback theo nhóm.

#### Bổ sung (cùng bản)
- Tiết kiệm token: prompt hậu kỳ chỉ gửi hồ sơ đầy đủ của nhân vật xuất hiện trong chương (tối đa 40) + danh sách tên các nhân vật khác; Current Status cũ 14000 → 8000 ký tự (4000 cho nhóm không cần). Mỗi nhóm fallback chỉ gửi phần nó cần (roster rút gọn, bỏ World/Status/đoạn cuối chương trước khi không dùng).
- Evidence: ngưỡng Status 0.55 → 0.35 (giá trị thường là diễn giải), characterChanges 0.4; ghi số mục bị loại do evidence không khớp vào ghi chú NV/Status.
- Client: khi người dùng viết thêm chương trong lúc hậu kỳ chạy, kết quả hậu kỳ (summary, continuityWarnings, postProcess, review...) vẫn được chép vào đúng chương N.

#### V12.32.3 (tiết kiệm token Quality Gate)
- Kiểm tra continuity bằng AI (gửi cả chương) chỉ chạy ở vòng 1 của Gate; vòng 2+ chỉ chạy kiểm tra cứng.
- Ngữ cảnh Review 18000 → 9000 ký tự, Rewrite 15000 → 8000, nhưng bỏ trước các khối không liên quan (văn phong, mức miêu tả, độ khó, từ cấm/STYLE chỉ bỏ ở Review) và giữ phần cuối (Current Status) thay vì cắt cứng phần cuối như trước.

#### V12.32.4 (Hồ sơ khóa — AI bám đúng thiết lập nhân vật)
- Prompt viết chương: thêm khối "HỒ SƠ KHÓA" (NVC + tối đa 8 nhân vật liên quan): nghề, vai trò, chức vụ/địa vị, phe, tuổi, năng lực, cách nói, tính, kiến thức, kèm luật chung: không tự nâng/hạ cấp quyền lực-tài sản-năng lực, lời thoại phải hợp địa vị, chỉ vượt hồ sơ khi có sự kiện rõ trong chương + brief cho phép, mục hồ sơ trống thì không bịa chi tiết quan trọng. Các lượt auto-continue/chèn diễn biến/chốt kết dùng bản rút gọn.
- Siết câu "ĐƯỢC TỰ DO": không áp dụng cho địa vị/nghề/quyền hạn/tài sản/năng lực/tuổi/kiến thức/cách nói.
- Quality Review: thêm `profileViolation` + `profileViolations`; vi phạm = HARD_FAIL (kích hoạt viết lại). Chỉ báo khi có câu cụ thể trái hồ sơ. Review/Rewrite nhận hồ sơ của nhân vật có mặt trong bản thảo.

#### V12.32.5 (chống dậm chân + liền lạc)
- Luật TIẾN TRIỂN BẮT BUỘC trong prompt viết (và lượt viết tiếp/chèn diễn biến): cuối chương phải đổi ít nhất một điều; cấm lặp hành động/miêu tả để kéo dài; PRIMARY: cảnh trưởng thành chỉ ~1/2–2/3 chương, phải làm đổi quan hệ/quyền lực/bí mật/hậu quả và mở bước kế tiếp. storyControl và matureFocus PRIMARY cũng được bổ sung.
- Kế hoạch chương: thêm mục 7b "THAY ĐỔI/TIẾN TRIỂN" và mục 8 yêu cầu nêu cảnh nóng làm đổi điều gì.
- Quality Gate: cờ `stagnation` (+`stagnationNotes`) = lỗi nặng → viết lại; chỉ báo khi cuối chương gần như không đổi hoặc cảnh lặp để kéo dài.
- Trí nhớ truyện: khối "TRUYỆN ĐẾN NAY" (1–2 câu mỗi chương cũ, ≤~2800 ký tự, chỉ lấy chương trước chương đang viết khi viết lại) + "ĐANG DANG DỞ" (unresolved/conflict/nextGoal/nextHooks từ Current Status).

#### V12.32.6b/c (văn xuôi thuần tiếng Việt)
- `cleanProseArtifacts` (chạy trong mọi đường viết qua `stripForeign`): Unicode NFC, Ð→Đ, bỏ HTML/markdown/emoji, bỏ nhãn rò rỉ "(tiếng Anh/Trung/Việt…)" (đoạn có ≥2 nhãn bị bỏ), bỏ dòng meta của AI (Ghi chú/Lưu ý/(Còn tiếp)… ở đầu dòng, không đụng lời thoại), chuẩn dấu câu bất thường, chặn lặp ký tự/từ thoái hóa, bỏ dòng trùng liền kề.
- `formatParagraphs`: nối dòng bị ngắt cứng giữa câu, không tách ở viết tắt (TP. TS. Mr. N.V.A…), bỏ đoạn rác/trùng, nối mảnh vụn chưa kết thúc.
- Nút "¶ Chuẩn hóa" (trước là "Ngắt đoạn"): làm sạch → bỏ cảnh viết lặp → ngắt đoạn → báo số ký tự đã dọn → kiểm tra từ lạ (AI sửa, rồi hỏi xóa hẳn các từ còn lại, khớp nguyên từ).

#### V12.32.7 — Thời gian truyện (chống "10 chương vẫn một ngày")
- Mốc thời gian tự cập nhật: hậu kỳ ghi `statusState.currentState.time` + `timeLog` theo chương; nếu ô Story Clock trống, prompt dùng mốc này ("THỜI ĐIỂM").
- Story Control có mục THỜI GIAN TRUYỆN: chương phải nêu mốc thời gian, cho phép nhảy thời gian khi sự kiện trước đã khép trọn, tiến triển theo thời gian.
- Ô chọn "Nhịp thời gian giữa các chương" (Tự do / cùng ngày / 1 ngày / vài ngày / 1 tuần) — mặc định Tự do.
- Phát hiện ≥3 chương liên tiếp cùng mốc thời gian → prompt ép chương sau chuyển sang mốc sau.
- Kế hoạch chương có mốc thời gian từng beat; prompt viết bỏ ràng buộc "nối từng giây"; gợi ý chương sau cho phép nhảy thời gian.
- Gate: cờ mềm `timeStagnation` (chỉ cảnh báo, không chặn).

#### V12.32.8 — Neo ngoại hình + số đo cụ thể
- Trường mới `measurements` (Số đo / kích thước cơ thể) cho nhân vật chính (ô nhập) và NV phụ (bảng hồ sơ); hậu kỳ trích/điền khi trống, không ghi đè khi đã có.
- Prompt viết chương: NEO NGOẠI HÌNH — tả 2–4 câu khi xuất hiện lần đầu, cấm tính từ trống ("to", "đầy đặn") nếu không kèm kích thước/so sánh; hồ sơ trống thì tự đặt và giữ nhất quán. Cảnh 18+: nêu kích thước cụ thể cho nhân vật đủ 18 tuổi; dưới 18/không rõ tuổi thì không tả số đo.
- Hồ sơ khóa: ngoại lệ cho ngoại hình trống (được tự đặt).
- Gate: cờ mềm `appearanceVague` (chỉ cảnh báo).

#### V12.32.9 — Chuyển cảnh & người có mặt
- Story Control có mục CẢNH & NGƯỜI CÓ MẶT: người vào/rời cảnh phải có câu chuyển; người đã rời không được nói tiếp; chuyển địa điểm/thời điểm phải có câu chuyển cảnh.
- Kế hoạch chương: mỗi beat ghi địa điểm | ai có mặt | ai vào | ai rời.
- Gate: cờ cứng `sceneViolation` (nhân vật nói/hành động khi không có mặt, lẫn cảnh) -> HARD_FAIL -> viết lại.
- Làm sạch: `{phương án tài chính}` -> giữ chữ, bỏ ngoặc nhọn.

---

## [PATCH_NOTES_V12.32.1_BACKGROUND_POSTPROCESS_TOKEN_CAP] — Ghi chú bản vá

### V12.32.1 — Fix background post-process not updating

- Root cause found: the unified background post-process (`runUnifiedPostProcess`) still requested `maxTokens: 16000`, despite V12.31.2's cap on other API call paths. Models advertising an 8192-token output maximum can reject the call before returning JSON; the fail-safe then preserves old data, making background post-processing appear not to update.
- Fix: cap the unified post-process call at 7800 output tokens, below 8192.
- This addresses the known request-limit rejection. It does not guarantee every task updates if the model truncates the large JSON response; check per-task status/problems when diagnosing other failures.

---

## [PATCH_NOTES_V12.32.0_PROMPT_COMPACTION] — Ghi chú bản vá

### V12.32.0 — Tối ưu ngữ cảnh chương và nhân vật

- Chỉ gửi tóm tắt ngắn của chương gần nhất (tối đa khoảng 1.100 ký tự) và đoạn cuối chương (tối đa 1.400 ký tự) để nối tiếp.
- Ngừng tự động gửi danh sách tóm tắt chương xa trong prompt viết chương. Dữ liệu gốc vẫn được lưu; Story Bible/Current Status/Memory có liên quan tiếp tục là nguồn canon.
- Xóa phần chèn lặp “TÓM TẮT 3 CHƯƠNG GẦN” trong khối bối cảnh vì recent block đã cung cấp thông tin chương gần nhất.
- Danh sách nhân vật được giới hạn tối đa 8, loại nhân vật đã chết và nhân vật phụ/minor cũ không liên quan; hồ sơ nhân vật chính không bị gửi lặp trong roster.
- Character State Tracker giảm còn tối đa 8 mục và bỏ mục đánh dấu đã chết khỏi danh sách trạng thái hoạt động.
- Đồng bộ logic giữa giao diện viết thường và Netlify Background Worker. Không xóa dữ liệu lịch sử trong IndexedDB.

Lưu ý: bộ lọc ưu tiên sự liên quan và metadata hiện có; cần thử trên truyện thực tế để xác nhận các nhân vật quan trọng lâu không xuất hiện vẫn được chọn nhờ tier/locked/quan hệ.

---

## [PATCH_NOTES_V12.31.2_OUTPUT_TOKEN_CAP] — Ghi chú bản vá

### V12.31.2 — Output token cap compatibility fix

- Capped every foreground `callAI` request to max 7,800 output tokens, regardless of a larger task-specific requested limit.
- Capped background worker OpenAI-compatible streaming requests to 7,800 output tokens.
- Capped background retry-doubling logic to 7,800 so retries cannot exceed the same model/provider limit.
- Kept chapter target length and auto-continue logic unchanged; this is a per-request output cap, not a total chapter word cap.
- Added `tests/v12.31.2-output-token-cap.test.js`.

Validation:
- Focused output-token cap test: PASS.
- `npm test`: all runnable tests PASS; four browser E2E suites SKIP because Playwright is unavailable in the environment.
- Not live-tested against the user's AnonRouter key/model.

---

## [PATCH_NOTES_V12.31_PROMPT_CONTEXT_AUDIT] — Ghi chú bản vá

### V12.31 — Prompt Context Audit

#### Thay đổi
- Brief của chương (Chỉ đạo + Gợi ý) không còn bị chèn lặp trong context khi lập kế hoạch/viết chương; hai mục này được chèn một lần tại vị trí chuyên biệt trong prompt.
- Không tự động gửi `autoNextChapterHint` cũ vì trường này không có ID chương xác nhận tính còn hiệu lực. Gợi ý chính thức đang áp dụng là nội dung `nextChapterHint`.
- Quy Tắc Nâng Cao và Quy Tắc Khác được đưa qua một bộ lọc chung; bỏ dòng trùng sau chuẩn hóa khoảng trắng/dấu câu và các dòng được đánh dấu `[TẮT]`, `[OFF]` hoặc `[DISABLED]`. Không dùng gọi AI bổ sung và không gộp các câu khác nghĩa chỉ vì có vài từ giống nhau.
- Current Status hiển thị rõ chương đã xác nhận và tổng chương đã lưu. Nếu status cũ, prompt đánh dấu stale và yêu cầu ưu tiên bằng chứng ở các chương mới hơn thay vì coi status cũ là sự thật hiện tại. Nếu chưa có status, prompt nói rõ không được bịa.
- Thêm kiểm tra xung đột heuristic cho mâu thuẫn rõ ràng về tạo nhân vật mới/sự kiện hoặc tuyến truyện mới; cảnh báo được đưa vào prompt trước khi gọi model. Đây là phát hiện xác suất thấp-rủi-ro, không phải bộ phân tích ngữ nghĩa hoàn hảo.
- Viết tiếp/hoàn tất một chương không còn kéo nhầm Gợi ý chương sau vào ngữ cảnh của chương cũ.
- Đồng bộ code mirrored giữa giao diện và background worker.

#### Giới hạn có chủ đích
- Các quy tắc chung và ngoại lệ được bảo toàn; chỉ loại bỏ trùng văn bản đã chuẩn hóa. Các dòng được ghi tự nhiên là "đã tắt" nhưng không dùng tiền tố `[TẮT]`/`[OFF]` vẫn được giữ để tránh hiểu sai nội dung.
- Không có API/model thật trong unit test; chi phí, độ chính xác đầu ra và Current Status sau phản hồi thật vẫn cần xác minh trên cấu hình người dùng.


##### V12.31.1 — giảm cảnh báo xung đột giả
- Sửa lỗi bộ audit tạo tổ hợp nhiều-mọi-nhiều khiến cảnh báo phình thành hàng chục mục khi có nhiều quy tắc cùng chủ đề.
- Chỉ giữ một cảnh báo cho mỗi cặp nguồn/chủ đề; tối đa 3 cảnh báo chi tiết trong prompt, phần còn lại được gộp thành một dòng tóm tắt.
- Đồng bộ sửa ở giao diện và background worker; thêm regression test với tập quy tắc lớn.

---

## [PATCH_NOTES_V12.30.1_STREAMING_FIX] — Ghi chú bản vá

### V12.30.1 — Fix empty streaming response

#### Root causes addressed
- SSE parser only accepted `data: ` and could drop a final event if no trailing newline.
- Response parsing assumed every `stream=true` response had SSE content type.
- An empty stream failed immediately instead of trying a non-streaming request.

#### Changes
- Accept `data:` with or without a space, CRLF, heartbeat lines, and final unterminated event.
- Check response content type; JSON responses are parsed as normal final responses.
- When SSE ends with no content, retry with `stream` disabled, using the same configured model and prompt. The normal retry limit applies. No empty content is accepted as a successful result.
- No model routing, chapter prompt, postprocessing, Character Database, or Memory merge changes.

#### Tests
- New test simulates final SSE event without newline.
- New test simulates empty SSE then a valid non-streaming JSON response.
- Full `npm test` suite run before packaging. Browser E2E tests are skipped if Playwright/Chromium are unavailable.

---

## [README_V12.30] — Hướng dẫn phát hành

### Xưởng Truyện AI — V12.30

#### Điểm chính

V12.30 gộp **hậu kỳ tự động sau chương** thành một phản hồi AI JSON duy nhất: tóm tắt, cập nhật Character Database, world (địa điểm/vật phẩm/threads), Current Status, long-term memory (Timeline/Foreshadowing/Knowledge Ledger), cảnh báo continuity và gợi ý chương kế tiếp.

- Không đổi model, endpoint, provider hay cơ chế chọn model đã cấu hình trong ứng dụng. Hậu kỳ dùng `job.model` như trước.
- Không chạy extractor AI riêng cho nhân vật/thế giới/status/memory sau khi đã chạy gói tổng hợp.
- Một yêu cầu hậu kỳ chỉ thử một lần. Nếu lỗi mạng/API, JSON không hợp lệ hoặc bị cắt token, hệ thống không gọi AI lần hai để sửa JSON; dữ liệu hậu kỳ cũ được giữ nguyên.
- Dữ liệu nhân vật phải có trích dẫn từ chương; role/occupation/position/faction đã khóa không bị thay chỉ vì AI suy diễn. Nhân vật mới không thể tự nhận tier main/major qua lượt trích xuất này.
- Các trường Current Status chỉ cập nhật khi bằng chứng nằm trong chương và có nội dung hỗ trợ giá trị được đề xuất.
- Bộ nhớ chỉ merge khi đủ ba mảng events/foreshadowing/knowledge. Thiếu schema sẽ bỏ qua toàn bộ phần memory, không tăng con trỏ đồng bộ và không xóa dữ liệu cũ.
- Mục timeline/foreshadowing/knowledge và status lịch sử không bị cắt theo giới hạn số lượng tự động. Foreshadowing/thread đã kết thúc không bị mở lại bởi cập nhật mới thiếu căn cứ.
- `lastMemorySyncChapter` chỉ tăng khi Long-term Memory thực sự được đồng bộ; quét nhân vật hoặc cập nhật Current Status riêng không còn giả báo đã đồng bộ Memory.

#### Những bước vẫn độc lập

Quality Gate vẫn là cổng kiểm tra riêng trước khi ghi Canon; nó không phải extractor hậu kỳ. Các thao tác người dùng bấm riêng như sửa tiếng Việt, quét lại scene, quét lại Character Database/Memory toàn truyện cũng vẫn là thao tác độc lập. Scene Tracker đang tắt theo cấu hình hiện tại và không được tự bật lại.

#### Kiểm thử

Chạy `npm test`. Bộ test V12.30 bao gồm: cập nhật có bằng chứng nhưng giữ hồ sơ cốt lõi, không thêm nhân vật major, giữ status và memory cũ, rollback khi JSON bị cắt, và không merge memory nếu schema thiếu.


#### V12.30.1 — Sửa lỗi phản hồi trống (streaming)
- Đọc đúng SSE có CRLF, `data:` không có dấu cách và event cuối không có newline.
- Nếu endpoint không trả `text/event-stream`, xử lý response JSON bình thường.
- Nếu stream không có nội dung, tự thử lại một lần theo non-streaming trong cùng lượt gọi; không trả/ghi nội dung rỗng.
- Không thay đổi model, prompt viết chương, Quality Gate hoặc pipeline bảo vệ Character/Memory.
- Có test mô phỏng SSE thiếu newline và fallback khi stream rỗng.

---

## [PATCH_NOTES_V12.30_UNIFIED_POSTPROCESS] — Ghi chú bản vá

### V12.30 — Hậu kỳ một lần gọi, bảo vệ Canon và Memory

- Gộp Tóm tắt, Character Database, World, Current Status, Long-term Memory, Continuity warnings và gợi ý chương sau vào một phản hồi JSON duy nhất.
- Chuyển cả hai đường chạy: hậu kỳ job nền thủ công và hậu kỳ sau khi tạo chương nền.
- Dùng model đã cấu hình (`job.model`), không thay model/provider. Không gọi thêm AI để sửa JSON hoặc retry lần hai trong hậu kỳ tổng hợp.
- JSON thiếu/không hợp lệ hoặc bị cắt: không thực hiện merge; nếu một lỗi xảy ra giữa quá trình merge thì khôi phục trạng thái và chương trước lượt hậu kỳ.
- Chỉ nhận trường Character/Status/World/Memory có evidence xuất hiện trong nội dung chương. Giữ role/occupation/position/faction và tier của nhân vật đã có; nhân vật mới không thể tự lên main/major.
- Memory merge nguyên tử theo schema: cần đủ events, foreshadowing, knowledge. Không xóa lịch sử cũ, không cắt giới hạn số mục và không mở lại foreshadowing đã kết thúc.
- Sửa con trỏ `lastMemorySyncChapter`: việc chỉ quét nhân vật hoặc cập nhật Status không còn tự nhận là đã đồng bộ Long-term Memory. Khi hợp nhất job nền, con trỏ không bị lùi.
- Thêm kiểm thử regression và kiểm tra tích hợp số lượt gọi AI hậu kỳ.

#### Các kiểm thử

- `node tests/v12_30_unified_postprocess.test.js`
- `node tests/worker.integration.js`
- `npm test`

Lưu ý: Quality Gate và các thao tác do người dùng gọi riêng (ví dụ: sửa tiếng Việt, quét lại Memory toàn truyện) vẫn là luồng độc lập; V12.30 gộp toàn bộ gói hậu kỳ tự động của chương, không gộp việc viết lại toàn thân chương vào prompt trích xuất dữ liệu.

---

## [README_V12.29] — Hướng dẫn phát hành

### Truyen335 V12.29 — Cost-safe optimization

#### Mục tiêu
Giảm một số lần gọi AI hậu kỳ và token ngữ cảnh lặp lại mà không đổi model, không giảm mục tiêu số từ chương, không bỏ Quality Gate, không đổi Ending Anchor/Auto-continue.

#### Thay đổi
- Summary quá dài được rút gọn cục bộ tại ranh giới câu thay vì gọi AI thêm một lần chỉ để rút gọn. Lượt retry đầu tiên vẫn được giữ nếu bản tóm tắt thiếu tiêu đề/không bám nguồn.
- Trích xuất Character Database tăng kích thước lô từ 9.000 lên 12.000 ký tự và giảm phần chồng lấn từ 700 xuống 400 ký tự để giảm việc gửi lại cùng một đoạn. Không bỏ phần văn bản chương nào.
- Trích xuất World State tăng kích thước lô từ 10.000 lên 13.000 ký tự và giảm phần chồng lấn từ 700 xuống 400 ký tự.
- Danh sách thread trong prompt trích xuất World State giới hạn 20 thread gần nhất và 140 ký tự mô tả mỗi thread. Dữ liệu lưu trong truyện không bị cắt; chỉ ngữ cảnh gửi cho lượt trích xuất được rút gọn.
- Giữ nguyên định tuyến model, prompt viết chương, mục tiêu số từ, giới hạn Auto-continue, Quality Gate, Ending Anchor và thứ tự lưu chương.

#### Lưu ý
Các thay đổi tối ưu hậu kỳ có thể làm AI ít nhìn thấy mô tả rất cũ của thread trong một lượt trích xuất World State; dữ liệu gốc vẫn được bảo toàn. Nếu truyện có rất nhiều thread đang mở, cần theo dõi nhật ký hậu kỳ vài chương đầu.

#### Kiểm thử
Chạy `npm test`. Bốn bài E2E được đánh dấu bỏ qua nếu môi trường không có Playwright/Chromium.

---

## [PATCH_NOTES_V12.29_COST_OPTIMIZATION] — Ghi chú bản vá

### V12.29 — Tối ưu chi phí an toàn

- Không thay đổi model/provider/định tuyến model.
- Không giảm mục tiêu số từ hoặc cắt nội dung chương.
- Summary >450 từ: bỏ lượt gọi AI chỉ để rút gọn; cắt cục bộ ở ranh giới câu quanh 420 từ. Kiểm tra grounded vẫn chạy sau bước này.
- Character extraction: lô 12k ký tự, overlap 400 (trước: 9k/700).
- World extraction: lô 13k ký tự, overlap 400 (trước: 10k/700).
- World extraction prompt chỉ gửi 20 thread gần nhất, mô tả tối đa 140 ký tự; dữ liệu lưu trữ không thay đổi.
- Quality Gate và Auto-continue được giữ nguyên để không làm giảm độ ổn định độ dài/chất lượng.

---

## [PATCH_NOTES_V12.28.3_ENDING_TARGET] — Ghi chú bản vá

### V12.28.3 — Fix `getEndingTarget` thực tế trong ZIP

#### Lỗi
Safari/iOS báo runtime: `Can't find variable: getEndingTarget`.

#### Nguyên nhân
V12.28.2 có các chỗ gọi `getEndingTarget()` trong `index.html` nhưng bản ZIP thực tế lại thiếu **khai báo hàm**. Ghi chú V12.28.1 nói đã khôi phục helper nhưng helper không nằm trong nguồn `shared/core.js`, vì vậy lỗi có thể quay lại khi đồng bộ code.

#### Cách sửa
Đưa `getEndingTarget()` trở lại nguồn sự thật `shared/core.js`, sau đó chạy `node scripts/sync-shared.js` để đồng bộ tự động sang:
- `index.html`
- `netlify/functions/write-chapter-background.js`

Logic:
- ưu tiên Ending Anchor lấy từ `hint`
- nếu không có thì lấy từ `directive`
- dùng lại `extractEndingAnchor()` hiện có

#### Kiểm tra
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

---

## [PATCH_NOTES_V12.28.2_STATUS_MEMORY_FIX] — Ghi chú bản vá

### V12.28.2 — Fix ⚠ Status/Memory sau Viết thường

#### Lỗi
Sau khi Viết thường đã hoàn tất và lưu chương, hậu kỳ Status/Memory có thể lỗi do thiếu ngân sách thời gian hoặc cạnh tranh gọi API. Hai lỗi này bị đưa vào `autoUpdateIssues`, khiến chương hiển thị `⚠ Status/Memory` dù phần viết đã thành công.

#### Đã sửa
- Giữ tối thiểu khoảng 6 phút cho pha Status/Memory bằng cách cho Character/World dừng sớm hơn khi gần hết thời gian nền.
- Status và Memory chạy nối tiếp để giảm khả năng tranh chấp/rate-limit.
- Giảm ngân sách token cho Status/Memory để giảm thời gian và nguy cơ JSON bị cắt.
- Status/Memory trở thành **soft post-process tasks**: thất bại không làm chương đã lưu thành `SYNCED_WITH_WARNINGS`; trạng thái lỗi nằm trong `chapter.postProcess.tasks` và diagnostics để có thể retry.
- Chapter list không còn hiển thị `⚠ Status/Memory`; các cảnh báo cứng khác vẫn giữ nguyên.
- Khôi phục helper `getEndingTarget()` của V12.28.1.

#### Không đổi
- Viết thường vẫn là luồng chính/stream bình thường.
- Lưu chương xảy ra trước khi gửi hậu kỳ server.
- Netlify Background Job tiếp tục chạy hậu kỳ server khi người dùng khóa/rời iPhone.
- Ending Anchor được giữ nguyên.

#### Kiểm thử
- Client JavaScript syntax: PASS
- Worker JavaScript syntax: PASS
- Test hồi quy V12.28.2 Status/Memory soft post-process: PASS
- Toàn bộ `npm test`: PASS
- 4 bộ E2E: SKIP vì môi trường thiếu Playwright/Chromium.

---

## [PATCH_NOTES_V12.28.1_FIX] — Ghi chú bản vá

### V12.28.1 — Fix getEndingTarget

#### Bug
Runtime error: `Can't find variable: getEndingTarget`.

#### Cause
V12.28's client code referenced `getEndingTarget()` from the V12.24 Ending Anchor flow, but the helper was missing after merging the Fast Write + Server Post-Process architecture.

#### Fix
Restored the helper:
- Prefer Ending Anchor extracted from the chapter hint.
- Fall back to the directive.
- Reuses existing `extractEndingAnchor()` logic.

#### Verification
- JavaScript syntax: PASS
- Shared client/worker sync: PASS
- Quality Gate: 33/33
- Characters: 11/11
- Worker: 37/37
- V12.20: 16/16
- V12.22b: 8/8
- V12.23: 9/9
- Background create-job: 5/5
- Routing: 7/7
- Security: 12/12
- Worker integration: PASS
- Gate-fail integration: PASS
- E2E: skipped because Playwright/Python is unavailable in the test environment.

---

## [README_V12.28] — Hướng dẫn phát hành

### Truyen335 V12.28 — Normal Write + Server Post-Process

#### Luồng chính
1. Bấm **Viết chương** bình thường.
2. AI stream nội dung trên app.
3. Quality Gate xử lý như trước.
4. Chương được `persist()` ngay sau PASS.
5. App báo **Đã viết xong**.
6. App tạo một Netlify Background Job với `mode=postprocess`.
7. Netlify Background Function chỉ chạy hậu kỳ: Summary, Character, World, Current Status, Memory, Scene, Next Chapter Hint và Canon Sync.
8. Khi mở app lại, job-status trả kết quả và app merge dữ liệu vào story.

#### Không còn
- Background Job sinh chương.
- `runCanonPostProcess()` chạy trong browser sau khi viết.
- Hậu kỳ làm trình viết phải chờ hoàn thành.

#### Nút thủ công
`☁ Chạy hậu kỳ server (tắt máy được)` chỉ dùng để retry hậu kỳ của chương hiện tại; không sinh chương mới.

#### Kiểm thử
- Unit/worker/security: PASS.
- JavaScript syntax: PASS.
- E2E giao diện/background: chưa chạy do môi trường kiểm thử thiếu Playwright/Chromium.

---

## [PATCH_NOTES_V12.28_POSTPROCESS] — Ghi chú bản vá

### V12.28 — Server-side Post-Process Only

- Normal chapter writing remains client-side: stream -> Quality Gate -> persist chapter -> report completion.
- Removed browser-side `runCanonPostProcess()` from the normal generation path.
- After chapter persistence, the app creates a Netlify Background Job with `mode=postprocess`.
- Netlify Background Function runs summary, character/world updates, Current Status, Memory, Scene, next-chapter hint, and Canon sync.
- Job state is stored in Netlify Blobs and can continue after the iPhone is locked/left, subject to Netlify Background Function limits.
- Existing manual background-write button is converted to a manual post-process retry button; it no longer writes a chapter.
- Existing job polling/merge/security mechanisms are retained.

---

## [PATCH_NOTES_V12.26_FAST_WRITE] — Ghi chú bản vá

### V12.26 — Fast Write + Fast Settings

#### Mục tiêu
- Chương được lưu và hiển thị ngay sau khi hoàn thành phần viết/Quality Gate.
- Canon/Character/Current Status/Memory/Snapshot/Next Chapter Hint chạy hậu kỳ nền, không giữ trạng thái “Đang viết” trong suốt hậu kỳ.
- Thiết lập được ghi vào IndexedDB store `storyMeta` riêng, nhỏ hơn nhiều so với bản ghi toàn bộ truyện.
- Bản ghi truyện đầy đủ vẫn được lưu debounce 1.75s để giữ tương thích backup/import hiện tại.
- Background Job Netlify hiện có tiếp tục được sử dụng; job được lưu trên Netlify Blobs nên không phụ thuộc tab iPhone đang mở.

#### Luồng mới
`Viết → lưu chương → hiển thị → trả UI → hậu kỳ nền`

Thiết lập:
`đổi setting → ghi StoryMetaData nhỏ ngay → full story save debounce`

#### An toàn
- Không xóa Character, Current Status, Memory, Snapshot, Knowledge Ledger hay các dữ liệu Canon.
- Chương mới được đánh dấu `SYNCING` trong lúc hậu kỳ; kiểm tra chuyển chương tiếp theo vẫn chặn cho tới khi Canon sync hoàn tất, tránh race condition.
- Export/full backup vẫn dùng record đầy đủ hiện tại.

#### Kiểm thử
- Unit/integration: PASS.
- JS syntax: PASS.
- Shared client/worker sync: PASS.
- Browser E2E chưa chạy được trong môi trường build vì Playwright Chromium executable chưa được cài.

---

## [PATCH_NOTES_V12.25_BACKGROUND_DIAGNOSTICS] — Ghi chú bản vá

### V12.25 — Background extraction / deadline safety

#### 1. NV bị cắt cụt ở cuối lô
- Khi model trả `finishReason=length` hoặc parser phát hiện JSON bị cắt, hệ thống vẫn salvage các object hoàn chỉnh.
- Sau đó, nếu còn đủ thời gian, worker gọi **một lượt bổ sung riêng** với prompt JSON siêu gọn để lấy các nhân vật còn thiếu.
- Danh sách tên đã lấy được gửi vào lượt bổ sung để tránh lặp.
- Chỉ merge dữ liệu được parse hợp lệ.

#### 2. Từ `nilông`
- Bổ sung `nilông`/`nilon` vào whitelist tiếng Việt để không còn báo nhầm `Từ lạ cần kiểm tra: nilông`.

#### 3. Status / Memory bị bỏ qua vì hết thời gian
- NV và Thế giới không được bắt đầu lô mới khi còn dưới **4 phút**.
- Status và Memory chỉ bỏ qua khi còn dưới **90 giây**.
- Mục tiêu là giữ một cửa sổ thời gian an toàn cho pha Status + Memory thay vì để extraction chiếm hết deadline.

#### 4. Đồng bộ
- Sau sửa đã chạy `node scripts/sync-shared.js`.
- Client và worker dùng cùng `shared/core.js`.

#### 5. Kiểm thử
- Tất cả unit/integration hiện có: PASS.
- 4 E2E bị SKIP do môi trường test không có Playwright/Python.

---

## [PATCH_NOTES_V12.24_ENDING_ANCHOR_GATE] — Ghi chú bản vá

### V12.24 — Ending Anchor Gate

#### Fix chính
- Không còn coi “đủ số từ” là điều kiện duy nhất để kết chương.
- Nếu Gợi ý/Mệnh lệnh có `Ending Anchor` / `Cú chốt` / `Kết chương` hoặc mốc kết tương đương, engine phải đi tới mốc đó trước khi dừng.
- Nếu chương đã đạt mục tiêu từ nhưng chưa tới Ending Anchor, Auto-continue tiếp tục trong giới hạn hardMax.
- Khi đã đủ từ nhưng brief đã kết quá nhanh, engine vẫn ưu tiên chèn diễn biến **trước đoạn kết**, giữ nguyên Ending Anchor.
- Viết nền dùng cùng helper Ending Anchor và cùng logic với viết thường.
- Nút “Viết Tiếp” thủ công được bổ sung một lượt nối tự động nếu lượt đầu vẫn chưa tới Ending Anchor, tránh phải bấm lại.

#### An toàn
- Không mở arc mới chỉ để đủ từ.
- Không thêm biến cố lớn/nhân vật quan trọng mới chỉ để kéo dài.
- Khi đã thực hiện Ending Anchor thì dừng, không kéo hậu cảnh sau điểm kết.
- HardMax vẫn được giữ nguyên.

#### Kiểm thử
- `node --check netlify/functions/write-chapter-background.js`: PASS
- Toàn bộ unit/integration tests: PASS
- 4 bộ E2E bị SKIP vì môi trường test hiện không có Playwright/Python.

---

## [PATCH_NOTES_V12.23_CONTINUE] — Ghi chú bản vá

### V12.23 – Auto-continue đúng số lượt + báo lý do dừng
- Số lượt viết thêm = đúng số "Auto-continue" đã đặt (client + worker; 18+ không còn bị ép tối thiểu 4).
- Bỏ giới hạn cố định 2 lần chèn diễn biến: số lần chèn tự động, chỉ bị giới hạn bởi số lượt Auto-continue.
- Lượt thất bại (AI trả rỗng, lặp, chèn <120 từ, sai ngôn ngữ, API lỗi) không còn làm vòng lặp dừng hẳn: tính là 1 lượt rồi thử lượt kế.
- Khi chương còn thiếu nhiều (<85% mục tiêu): bỏ câu "không kéo dài để đạt chỉ tiêu", yêu cầu viết tiếp diễn biến mới, không kết chương sớm.
- Lượng từ xin mỗi lần chèn/viết tiếp = phần còn thiếu chia cho số lượt còn lại.
- Chưa đạt mục tiêu: status + chẩn đoán chương ghi rõ lý do dừng (hết lượt, AI trả rỗng, lặp, API lỗi, chạm giới hạn từ...).

### V12.23 – Gợi ý chương sau
- Viết thường: gợi ý chương sau giờ HIỆN ở ô Gợi ý (trước đây chỉ lưu vào biến ẩn autoNextChapterHint nên ô luôn trống).
- Ô trống hoặc vẫn là gợi ý đã dùng cho chương vừa viết -> thay bằng gợi ý mới. Nếu bạn đã tự gõ gợi ý khác trong lúc viết -> giữ nguyên.
- Tạo gợi ý thất bại (API lỗi/AI trả rỗng): xóa gợi ý cũ đã dùng, báo ở status + chẩn đoán chương. Bản nền cũng xóa gợi ý cũ khi thất bại.
- Bản nền: lúc gộp kết quả không ghi đè gợi ý nếu bạn đã gõ gợi ý mới trong lúc job chạy.

### V12.23 – Viết thoải mái hơn để đủ số từ
- Thêm "KẾ HOẠCH ĐỘ DÀI" (shared/core.js: buildLengthPlan, dùng chung client + worker): tách gợi ý thành các nhịp, chia ngân sách từ cho từng nhịp (tổng ≈ 105% mục tiêu, nhịp kết chương ≈ nửa ngân sách), đặt ở cuối prompt.
- Dặn AI: mỗi nhịp phải đủ bối cảnh/hành động/thoại/nội tâm/hệ quả, cấm tóm tắt nhịp thành 1–2 đoạn, chỉ viết nhịp cuối khi đã gần đủ từ, nếu thiếu thì mở rộng phần giữa chứ không kết chương.
- Khi có gợi ý/mệnh lệnh: bỏ ràng buộc "chỉ 1–3 sự kiện chính" (mâu thuẫn với gợi ý nhiều nhịp), thay bằng "đúng các nhịp trong gợi ý, không thêm biến cố lớn ngoài gợi ý".

### V12.23 – MỞ RỘNG CUỐI (khi vẫn thiếu từ)
- Sau khi hết lượt Auto-continue mà chương vẫn dưới mục tiêu (95% khi có gợi ý, 100% khi không): app nhờ AI VIẾT LẠI TOÀN BỘ chương dài hơn, giữ nguyên thứ tự/sự kiện/thoại/điểm kết, mở rộng mỗi cảnh (ưu tiên cảnh ngắn nhất). Tối đa 2 lần, cả viết thường và viết nền.
- Chỉ nhận bản mới khi dài hơn bản cũ ít nhất 120 từ, không ngắn hơn 90% bản cũ, đúng tiếng Việt; vượt giới hạn tối đa thì cắt. Không đạt thì giữ nguyên bản cũ và ghi lý do vào status/chẩn đoán.
- Hàm dùng chung: buildExpandPrompt, acceptExpandedChapter (shared/core.js); test mới tests/v12_23.test.js.

### V12.23 – Lỗi 404 khi viết nền (Netlify)
- Client: nếu /create-job trả 404, app dò thêm /job-status để báo đúng nguyên nhân (chưa deploy netlify/functions, mở app ngoài domain Netlify hoặc file://, hay chỉ create-job lỗi build). Poll job-status trả 404 thì báo ngay thay vì im lặng chờ.
- create-job: kích hoạt write-chapter-background bằng URL env trước; nếu 404 thử tiếp host của chính request (domain tùy chỉnh khác env.URL). Nếu vẫn 404, lỗi nêu rõ URL đã thử.
- Test mới tests/v12_23_netlify.test.js (4 ca). package.json -> 12.23.0.

### V12.23 – "Đang tạo job…" quá lâu
- create-job chỉ chờ lệnh kích hoạt background tối đa 8 giây (biến TRIGGER_TIMEOUT_MS); quá hạn thì vẫn trả thành công kèm cảnh báo để app không treo và có thể tắt máy.
- create-job trả và ghi log `timings` (payloadKB, purgeMs, saveMs, triggerMs, totalMs). App hiện các số này khi tổng > 6 giây.
- App đếm giây khi đang tạo job, hiện dung lượng gửi (KB) và tự hủy sau 45 giây với thông báo rõ.
- Sửa nhãn phiên bản ở đầu app thành v12.23.

### V12.23 – "Lỗi gửi job: HTTP 400" trơn
- Lỗi gửi job giờ kèm thân phản hồi của server (nếu có), dung lượng đã gửi và 3 khóa truyện nặng nhất. Các lỗi 404/401 vẫn giữ thông báo riêng.

### V12.23 – Sửa HTTP 400 "đã gửi 9240 KB" (payload quá nặng)
- Nguyên nhân: mỗi chương mang theo tới 7–10 bản chụp trạng thái (stateSnapshots, mỗi bản là bản sao cả thế giới/nhân vật) + versions cũ; truyện 8 chương => ~8,4 MB chỉ riêng chapters, vượt giới hạn 6 MB/request của Netlify.
- Client không gửi stateSnapshots/stateSnapshot/versions của chương cũ lên server (worker không dùng). Khi hợp nhất kết quả job, client khôi phục các trường này từ bản local (khớp theo vị trí + tiêu đề) nên không mất lịch sử snapshot/phiên bản.
- Nếu payload vẫn > 5 MB: báo lỗi rõ ngay tại client (kèm 3 khóa nặng nhất) thay vì gửi rồi nhận HTTP 400.
- Test mới: tests/e2e_bg_slim.py (7 ca).

### V12.23 – Từ báo cáo job: tiếng Anh lẫn vào truyện + mở rộng cuối bị bỏ
- Xóa câu/đoạn tiếng Anh do model "nghĩ to" lẫn giữa truyện (removeEnglishLeaks trong shared/core.js, gắn vào stripForeign nên client + worker đều dùng). Chỉ xóa khi đoạn/câu gần như không có dấu tiếng Việt và chứa ≥ 3 từ khóa tiếng Anh; không đụng lời thoại ngắn hay từ mượn. Worker ghi "Đã xóa N câu/đoạn tiếng Anh…" vào cảnh báo.
- Worker: vòng viết tiếp dừng sớm (khi chương ≥ 60% mục tiêu) nếu thời gian còn dưới 270s để chừa chỗ cho bước mở rộng cuối; bước mở rộng cuối cần ≥ 150s còn lại (trước đây ngưỡng 90s quá thấp so với thời gian thực của 1 lần viết lại cả chương nên luôn bị bỏ qua). Thông báo bỏ qua nay ghi rõ số giây còn lại.

### V12.23 – Viết nền GIỐNG viết thường
- Prompt viết chương chính được tách thành hàm buildMainWritePrompt (index.html) — viết thường gọi hàm này; viết nền cũng gọi đúng hàm đó (proseOnly: không đòi TIÊU ĐỀ/NỘI DUNG vì tên chương do hệ thống tạo).
- Cơ chế mới: scripts/sync-shared.js sao NGUYÊN VĂN 23 hàm dựng ngữ cảnh/prompt từ index.html vào worker (khối CLIENT-MIRROR, nguồn sự thật = index.html). Sửa các hàm đó ở index.html rồi chạy `node scripts/sync-shared.js` (test sync-check sẽ báo lệch nếu quên).
- Worker nay dùng: buildContextBlock (story bible, style, arc, outline, thẻ nhân vật, địa điểm, vật phẩm, threads, foreshadowing, timeline, kiến thức nhân vật, lịch sử cảnh...), buildRecentBlocks, bước lập KẾ HOẠCH CHƯƠNG bằng AI (buildChapterPlanPrompt; cần còn ≥150s), và các quy tắc của viết thường (ngân sách sự kiện, nhân vật phụ, chống lặp, bố cục đoạn ngắn, miêu tả...).
- Tham số lấy mẫu lượt viết chính = viết thường: temperature 0.85, frequency_penalty 0.25/0.45, presence_penalty 0.25/0.35 (18+/thường).
- Giữ lại 2 điểm chỉ có ở viết nền: "cú chốt" Ending Anchor ở cuối prompt, và rào chắn tuổi khi 18+ mà chưa bật mature.
- Worker tự bổ sung các danh sách còn thiếu của truyện (arcs, outlinePlans, locations...) trước khi dùng code của viết thường.
- Test mới: tests/worker.mirror.test.js. Test cũ cập nhật marker nhận diện lượt viết chính ("Bạn đang viết CHƯƠNG THỨ") và bỏ qua lượt lập kế hoạch.
- CÒN KHÁC: vòng viết tiếp/chèn/mở rộng cuối vẫn là 2 đoạn code riêng (đã chỉnh cùng quy tắc); viết nền có quản lý thời gian 13,5 phút; viết thường có streaming.

---

## [PATCH_NOTES_V12.22_FREE_WRITING] — Ghi chú bản vá

### V12.22 — Bỏ "chia đoạn làm dày", AI tự do sáng tác thân chương, chỉ khóa Ending Anchor

#### Ý tưởng
Gợi ý chương là xương sống. AI được thêm cảnh phụ/thoại/nội tâm/giác quan để chương tự nhiên và dài hơn,
nhưng không phá canon, không mở arc lớn, không đổi hướng truyện. Chỉ Ending Anchor là điểm bắt buộc ở cuối chương.

#### Thay đổi
##### Bỏ
- `expandChapterInPlace` (worker) và `expandChapterInPlaceClient` (index.html): bước chia chương thành khối ~900 từ, gọi AI viết lại từng khối. Nhanh hơn (ít lượt gọi AI), không còn rủi ro khối viết lại làm lệch đoạn kết.

##### Prompt (worker + client)
- Bỏ các câu cấm "không thêm cảnh/biến cố", "không tự tạo ... chỉ để kéo dài".
- Thay bằng quyền tự do rõ ràng + giới hạn: 1–3 sự kiện chính, không phá canon, không arc lớn, không nhân vật quan trọng mới, không lộ thông tin chương sau.
- Mỗi nhịp trong gợi ý = một cảnh đầy đủ; cảnh phụ phải có chuyển biến mới, không lặp, không độn chữ.
- Ending Anchor: chỉ chạm ở đoạn cuối, đủ dài mới kết, viết xong thì dừng hẳn. Câu "KẾT THÚC" không còn khuyến khích kết sớm khi có gợi ý.
- `storyControlPrompt` (dùng chung): thêm dòng "ĐƯỢC TỰ DO ... BÊN TRONG sự kiện chính".

##### Cơ chế đạt độ dài mới: "chèn diễn biến trước đoạn kết"
- Trước đây có gợi ý mà chương ngắn thì không viết tiếp (sợ bịa sau cú chốt) → phải dùng bước làm dày.
- Nay: nếu có gợi ý, model đã kết (không bị cắt) mà chương < 95% mục tiêu, hệ thống tách 1–4 đoạn cuối (~150 từ) làm "đoạn kết", nhờ AI viết PHẦN NỐI ở giữa (thêm cảnh phụ, thoại, nội tâm) rồi ghép lại: thân + phần nối + đoạn kết. Ending Anchor luôn nằm cuối, không bị viết đè.
- Tối đa 2 lượt chèn; phần chèn < 120 từ hoặc lặp thì bị bỏ; câu cuối phần chèn cụt thì lùi về câu hoàn chỉnh.
- Nếu model bị cắt giữa chừng (hết token) thì vẫn viết nối như cũ (anchor chưa tới).
- Không có gợi ý: giữ nguyên cách viết tiếp cũ.

##### Nhận diện Ending Anchor
- `extractClosingBeat` nhận thêm "Ending Anchor", "anchor kết", "điểm neo kết".

##### Giới hạn độ dài
- `chapterWordLimits().hardMax`: 1,15× → 1,4× mục tiêu. Chương tự do dài hơn không bị `trimToWordLimit` cắt mất anchor.

#### Không đổi
- Auditor/Quality Gate, Story Control (tối đa 3 sự kiện/4 NV có tên), Knowledge Ledger, No Retcon, rào chắn tuổi 18+, định tuyến model 18+.
- Auditor đã dặn "không đếm scene beat/hành động nhỏ" vào mainEventCount nên cảnh phụ không bị tính là sự kiện chính.

#### Test
- `tests/v12_20.test.js`: viết lại 3 test "mở rộng tại chỗ" thành test chèn diễn biến (anchor ở cuối, chèn ≤2 lượt, ≥95% mục tiêu, không vượt hardMax, phần chèn lặp bị bỏ); thêm test nhận diện "Ending Anchor" và hardMax 1,4×.

#### Lưu ý khi dùng
- Độ dài mục tiêu nên đặt thực tế cho model của bạn; chương tự do có thể dài/ngắn lệch nhau hơn trước.
- Vì AI tự thêm chi tiết, hãy giữ bước cập nhật Character/World/Timeline sau mỗi chương để bắt chi tiết lệch canon sớm.
- Đây là bản kiểm thử bằng test tự động với model giả lập; chất lượng văn thực tế phụ thuộc model bạn dùng. Nên chạy thử 2–3 chương rồi xem anchor có nằm đúng cuối và có bị độn chữ không.

---

### V12.22.1 — Sửa lỗi chương bị viết LẶP 2 LẦN (bản 2 chỉ diễn đạt khác)

#### Triệu chứng
Chương gồm 2 bản cùng diễn biến, khác câu chữ; bản 2 bắt đầu bằng `TIÊU ĐỀ: ... / NỘI DUNG:` dính liền ngay sau câu cuối bản 1 (không xuống dòng).

#### Nguyên nhân
Model viết lại cả chương từ đầu trong lượt viết tiếp (hoặc xuất 2 lần trong một lượt), kèm nhãn tiêu đề. Các bộ lọc cũ chỉ bắt được trường hợp **trùng gần nguyên văn với 3 đoạn mở đầu**; bản 2 diễn đạt lại ngay từ đoạn đầu nên lọt.

#### Sửa (shared/core.js → đồng bộ cho cả app và worker nền)
- `splitByInnerLabels`: nhận diện nhãn `TIÊU ĐỀ:`/`NỘI DUNG:` nằm GIỮA văn bản, kể cả dính liền câu trước. Nếu phần sau lặp phần trước thì bỏ; nếu không lặp (nhãn thừa) thì chỉ bỏ nhãn, giữ cả hai phần.
- `_findRestartIndex`: dò "bản viết lại" theo **đường chéo thứ tự** — các đoạn lần lượt khớp (dù diễn đạt khác) với các đoạn phía trước, cùng trình tự. So khớp theo từ đặc trưng (bỏ từ quá phổ biến như cô/hắn/váy) nên bắt được cả khi viết lại bằng câu chữ khác. Có lùi ngược vài đoạn để cắt đúng điểm bắt đầu bản 2.
- `dedupeRepeatedScene`: chạy 3 tầng — nhãn → trùng nguyên văn → diễn đạt lại. Mặc định giữ **bản 1**; chỉ giữ bản 2 khi bản 1 bị cụt còn bản 2 kết gọn và không ngắn hơn đáng kể.
- `dropRestartedContinuation`: bỏ nhãn đầu lượt viết tiếp; cắt phần viết tiếp nếu nó chỉ kể lại nội dung đã có.
- Lệnh viết tiếp (app + worker): thêm câu cấm xuất `TIÊU ĐỀ:`/`NỘI DUNG:` và cấm viết lại chương từ đầu.

#### Sửa chương CŨ đã bị lặp
Mở chương đó → nhấn nút **¶ Ngắt đoạn** → đồng ý khi app hỏi có cắt phần lặp (dùng cùng `dedupeRepeatedScene`).

#### Test
`tests/v12_22b.test.js` (8 test, dựng từ chính chương bị lỗi): có nhãn dính liền; không nhãn; chương bình thường không bị cắt nhầm; bản 1 cụt thì giữ bản 2; nhãn thừa nhưng nội dung khác; viết tiếp diễn đạt lại; viết tiếp có nhãn; viết tiếp bình thường.

#### Giới hạn
- Ngưỡng nhận diện đã chọn thận trọng (cần ≥3 đoạn khớp liên tiếp đúng thứ tự). Nếu bản 2 chỉ lặp 1–2 đoạn thì không bị cắt.
- Cách chữa tận gốc vẫn là prompt/model: model hay "quên" đã viết rồi viết lại khi chương dài; hạ độ dài mục tiêu hoặc đổi model sẽ giảm tần suất.

---

## [PATCH_NOTES_V12.21_LENGTH] — Ghi chú bản vá

### V12.21 — Sửa chương bị ngắn (2500–3800 từ so với mục tiêu 4500)

#### Nguyên nhân
- Prompt có gợi ý ghi "chấp nhận ngắn hơn" / "không phải chỉ tiêu bắt buộc" -> model dừng ngay khi hết ý.
- Bước mở rộng tại chỗ (V12.20) chia khối quá nhỏ (~550 từ), loại khối nếu không dài hơn 12%, prompt chỉ có 1 câu chung chung -> thường thất bại âm thầm.

#### Thay đổi (giữ nguyên nguyên tắc: KHÔNG bịa thêm sự kiện/cảnh/nhân vật ngoài gợi ý)
- Prompt viết chương (worker + index.html): độ dài tối thiểu 95% mục tiêu, đạt bằng cách sống chậm từng ý với 5 kỹ thuật (giác quan, nội tâm giằng co, lặp có biến tấu, thoại/khoảng lặng, môi trường), mỗi khối có chuyển biến nhỏ, đổi nhịp câu, không tóm tắt/nhảy cóc.
- expandChapterInPlace: khối ~900 từ (trước ~550), tối đa 6 khối; prompt chứa 5 kỹ thuật; ngưỡng giữ khối 12% -> 8%; khối thất bại được thử lại 1 lần với nhắc nhở mạnh hơn.
- Ngưỡng kích hoạt mở rộng và cảnh báo "Thiếu từ": 90% -> 95% mục tiêu.

#### Chưa làm (cần quyết định)
- index.html (chế độ viết thường) vẫn chưa có bước mở rộng tại chỗ; chỉ đổi prompt. Bước mở rộng chỉ chạy ở worker nền.

#### V12.21.1 — Sửa lỗi model thinking nhúng kế hoạch tiếng Anh vào chương
- Thêm stripThinkingOutput(): xóa <think>/<thinking> tags và khối lập kế hoạch tiếng Anh ở đầu output trước câu chuyện tiếng Việt.
- Hàm được gọi bên trong stripForeign() nên tự động áp dụng ở mọi điểm xử lý output trong cả worker lẫn client.

---

## [PATCH_NOTES_V12.20_WRITING_FIXES] — Ghi chú bản vá

### V12.20 — Sửa 3 lỗi viết chương (từ lỗi ghép, câu cuối cụt, bịa thêm sau gợi ý)

#### 1. Từ lỗi kiểu "mươititude", "bọcampo", "bănnton"
- Nguyên nhân: model sinh nhầm token (nhiệt độ 0.82, không top_p). Bộ dò cũ chỉ bắt từ KHÔNG dấu nên các từ lỗi CÓ DẤU lọt hoàn toàn.
- findStrayWords nay kiểm tra cấu trúc âm tiết tiếng Việt (onset + nguyên âm + vần cuối) cho cả từ có dấu.
- Worker: tự sửa — gửi các CÂU chứa từ lỗi cho model, chỉ nhận câu sửa nếu bỏ được từ lỗi, độ dài gần câu gốc và giữ >=70% các từ còn lại (acceptWordFix). Tối đa 2 vòng, lỗi thì giữ nguyên văn bản.
- Viết văn: temperature 0.82 -> 0.7, thêm top_p 0.88 (và top_k 40 với OpenRouter).

#### 2. Chương cụt giữa câu ("... Rồi cô")
- trimToWordLimit: cắt ở câu hoàn chỉnh gần nhất (ngưỡng 70% giới hạn, trước đây chỉ 180 từ cuối nên đoạn dài bị cắt cứng giữa câu).
- Cuối pipeline viết chương: nếu câu cuối chưa có dấu kết thúc -> nhờ model viết nốt 1–3 câu (closeDanglingEnding, biết "cú chốt" của bạn); thất bại -> lùi về câu hoàn chỉnh gần nhất.
- Bản Quality Gate viết lại cũng không được để cụt.

#### 3. Viết thêm cái khác sau khi đã hết gợi ý / không bám gợi ý
- Nguyên nhân: bản nền thấy chưa đủ số từ mục tiêu (mặc định 5000) nên tự gọi "Viết TIẾP"; lệnh đó không chứa gợi ý và còn bảo "viết tiếp sang diễn biến kế tiếp" -> model hết ý nên bịa.
- Nay: có gợi ý/mệnh lệnh thì KHÔNG viết nối thêm ở cuối nữa (chỉ nối khi model bị cắt giữa chừng).
- Chương còn ngắn (<90% mục tiêu) -> MỞ RỘNG TẠI CHỖ THEO TỪNG ĐOẠN (expandChapterInPlace). Model không viết nổi ~4500 từ trong một lần (thường dừng ~3000; bản đầu viết cả chương một lần chỉ tăng 2867 -> 3121 từ nên bị loại), nên chương được chia thành các khối ~550 từ, mỗi khối có chỉ tiêu từ riêng (gốc x hệ số, tối đa x2.2), viết lại song song 3 khối/lượt. Giữ nguyên sự kiện/thứ tự/cú chốt, chỉ làm dày miêu tả, nội tâm, thoại.
- Khối nào không dài hơn >=12%, bị cắt, lạc đề hoặc (khối cuối) đổi đoạn kết thì giữ bản gốc của khối đó; khối làm vượt giới hạn từ cũng giữ bản gốc. Tối đa 2 lượt.
- Thêm 'alô, hello, okay, bye' vào từ mượn hợp lệ.
- Lệnh viết tiếp (khi cần) mang theo kế hoạch + "cú chốt" và dặn dừng ngay khi viết xong ý cuối.
- Prompt viết chương: thêm khối "KẾ HOẠCH CHƯƠNG — NGUỒN SỰ THẬT DUY NHẤT" đặt CUỐI prompt, luật: đúng thứ tự, không thêm sự kiện/nhân vật, ý cuối là điểm kết, câu cuối phải hoàn chỉnh. Dòng có "Cú chốt / Kết thúc chương / Kết chương..." được trích ra nhắc riêng.
- Dòng độ dài khi có gợi ý: mục tiêu chỉ mang tính tham khảo, không bịa thêm để đủ từ.

#### Test
- tests/v12_20.test.js (14 test), đã đăng ký trong tests/run-all.js.

---

## [PATCH_NOTES_V12.19_SFX] — Ghi chú bản vá

### V12.19 — Không báo nhầm tượng thanh là "từ lạ"
- findStrayWords bỏ qua tiếng cười/hét/thở viết không dấu: Aaaa, hahaha, hihi, hehe, huhuhu, kekeke, hmmm, shhh, psst, ahhh...
- Từ tiếng Anh thật (afternoon, Somewhere, until...) vẫn bị báo như cũ.
- Sửa ở shared/core.js, đã sync sang index.html và write-chapter-background.js. Thêm test.
- Thêm từ mượn thường gặp vào danh sách hợp lệ: vest, sofa, mascara, vecni, Chanel, Lelo, Gucci, Dior... (please, Splat vẫn bị báo vì là tiếng Anh thật).

#### Cảnh 18+: dẫn vào / sau cảnh bị ngắn
- EROTIC_STYLE_PROMPT (client + worker) thêm "NHỊP CẢNH 3 PHẦN": dẫn vào (~25%) – diễn biến/cao trào (~50%) – sau cảnh (~25%), mỗi phần đoạn văn riêng.
- Gợi ý chương sau khi là 18+: dài hơn (Chi tiết 600–850 từ, Gọn 230–380) và bắt buộc tách 3 phần dẫn vào / diễn biến / sau cảnh.
- Nhận diện 18+ để chuyển sang model 18+ quét 24.000 ký tự cuối thay vì 6.000.

#### Khóa địa điểm mở chương
- Prompt viết chương (client + worker): có khối "ĐOẠN KẾT CHƯƠNG TRƯỚC" + quy tắc KHÓA CỨNG địa điểm/thời điểm/người có mặt ở cảnh mở đầu.
- Gợi ý chương sau (client + worker): nhịp mở chương phải cùng địa điểm với đoạn kết; chuyển địa điểm phải ghi rõ.
- Quality Auditor nhận thêm đoạn kết chương trước; mở chương lệch địa điểm mà không chuyển cảnh = hard failure (kích hoạt viết lại có mục tiêu).
- Worker: gợi ý 18+ cũng có nhịp 3 phần và nhiều token hơn.
- Nhịp 3 phần chỉ là mặc định: gợi ý/mệnh lệnh người dùng chỉ nêu 1–2 phần thì chỉ viết các phần đó.

#### Nghề/chức vụ nhân vật không tự đổi (thư ký -> giám đốc)
- Hồ sơ nhân vật gửi cho AI cập nhật nay kèm "nghề/chức vụ GỐC (giữ nguyên)" cho MỌI nhân vật (trước đây NV khóa không được hiện hồ sơ nên AI tự suy).
- Prompt thêm quy tắc: không suy nghề từ cách xưng hô/làm việc với sếp; chỉ đổi khi chương kể rõ thăng chức/bổ nhiệm.
- role/occupation/position/faction đã có giá trị chỉ đổi khi explicitCoreChange=true và changeEvidence trích đúng từ chương (>=70% từ có trong chương). Áp dụng cả NV đã mở khóa; client + worker.

#### Hồ sơ nhân vật: trường trống được điền (giới tính, tuổi, nghề...)
- Trước: AI không được hỏi tuổi/giới tính/chức vụ/tóc/mắt... (không có trong schema) và khóa hồ sơ gốc chặn CẢ việc điền trường còn trống (kể cả NV AI mới tạo, vì mặc định coreLocked=true).
- Nay: schema thêm age, gender, position, speech, height, bodyType, hair, eyes, skin; mỗi NV kèm mục "CHƯA CÓ" để AI điền; khóa chỉ chặn GHI ĐÈ giá trị đã có. Đặc điểm thân thể ổn định chỉ điền khi trống.

#### Rà soát toàn bộ hồ sơ nhân vật: trường hiển thị nhưng AI không bao giờ cập nhật
- Thêm vào schema + merge (client & worker): speech (cách nói riêng), strength (điểm mạnh), independentPlot (tuyến truyện riêng, cộng dồn), voice/scent/style/scars/tattoos (điền khi trống), schedule, và nhóm 18+ (sexualExperience, boundaries, taboos, preferences, attractionToMC, tensionWithMC, consentNotes — cộng dồn).
- Quan hệ: thêm respect, affection, attraction, suspicion, tension, boundaries cho cả quan hệ với NVC và quan hệ NV-NV. Bản worker trước đây bỏ sót hoàn toàn relationshipWithMain.
- Rào chắn tuổi: NV dưới 18 (hoặc tuổi không rõ -> vẫn ghi như cũ) không ghi trường 18+ và attraction/boundaries.
- Hồ sơ Nhân Vật Chính do người dùng sở hữu: AI chỉ cập nhật vị trí/thể trạng/tinh thần/bí mật (giữ nguyên thiết kế cũ).

#### Xóa chương kèm bộ nhớ
- Trước: chỉ khi xóa CHƯƠNG CUỐI (và chương trước có snapshot) thì bộ nhớ mới rollback; xóa chương giữa không đụng tới nhân vật/địa điểm/vật phẩm sinh ra từ chương đó, số chương của địa điểm/vật phẩm cũng không được đánh lại.
- Nay: (khi bật "Xoá kèm bộ nhớ") xóa các NV / địa điểm / vật phẩm xuất hiện lần đầu ở chương bị xóa và không xuất hiện ở chương nào sau; giữ mục được dùng lại ở chương sau; đánh lại số chương; dọn quan hệ/tracker trỏ tới NV đã xóa; dọn khỏi snapshot các chương còn lại (để xóa chương cuối sau này không "sống lại"). NV thêm tay (không có chương xuất hiện đầu) không bị xóa.
- Thêm test tests/e2e_delete.py.

#### Viết lại gợi ý theo ý người dùng
- Thêm nút "✍️ Viết lại gợi ý theo ý tôi": gõ ý tưởng (ngắn cũng được) vào ô "Gợi ý chương sau" rồi bấm; AI viết lại thành gợi ý đầy đủ, bám đúng chi tiết/thứ tự/mốc kết chương của bạn, chỉ bổ sung nhịp nối. Có nút "↩ Khôi phục" để quay lại bản bạn gõ.
- Ý tưởng 18+ cũng được tự chuyển sang model 18+; trần độ dài tự nới theo độ dài ý tưởng.
- Nút "Tạo lại gợi ý chương sau" cũ vẫn tạo mới hoàn toàn từ chương vừa viết.

---

## [PATCH_NOTES_V12.18_DUP_CHARACTERS] — Ghi chú bản vá

### V12.18 — Sửa nhân vật bị nhân đôi + công cụ 🧹 Dọn nhân vật trùng

#### Triệu chứng (từ ảnh chụp)
Character Database có thêm mục **"nhân vật chính"** (nhãn chung) và **"Bùi Lạc"** (cùng là nhân vật chính) bên cạnh hồ sơ Nhân Vật Chính đã khai báo.

#### Nguyên nhân (đã tái hiện bằng test)
1. **Worker nền không biết `mainCharProfile`.** `mergeCharacter` chỉ so tên với danh sách `characters` nên mỗi lần AI trả tên nhân vật chính (hoặc nhãn "nhân vật chính") là tạo mục MỚI. Client có xử lý, worker thì không.
2. Prompt trích xuất của worker không nói tên nhân vật chính → AI tự đặt nhãn "nhân vật chính".
3. Client chỉ nhận ra nhân vật chính khi trùng tên tuyệt đối, không nhận nhãn chung hay tên ngắn/bí danh.

#### Đã sửa (client + worker dùng chung trong `shared/core.js`)
- `resolveCharacterTarget`: tên MC, nhãn chung ("nhân vật chính", "main character", "protagonist"...), bí danh của MC → cập nhật hồ sơ có sẵn, KHÔNG tạo mục mới. Bí danh của NV thường cũng được nhận.
- Prompt NV (client + worker) nay nêu tên nhân vật chính và cấm tạo mục "nhân vật chính".
- `saveMainCharFromForm` giữ lại `aliases` khi lưu hồ sơ.

#### Công cụ mới: 🧹 Dọn nhân vật trùng (Cài đặt → Character Database)
- Banner + số lượng khi có mục nghi trùng; mở modal xem từng gợi ý.
- Gợi ý chỉ khi có căn cứ: trùng tên MC, nhãn chung, tên ngắn trùng một phần với đúng 1 ứng viên. Có từ chối: **Giữ riêng**.
- **Gộp** không mất dữ liệu: điền ô trống, nối ý mới, tier cao hơn, khoảng xuất hiện rộng nhất, gộp quan hệ, đổi tên tham chiếu ở NV khác, lưu bí danh để lần sau AI không tạo lại.
- Gộp vào Nhân Vật Chính chỉ điền ô còn trống, không ghi đè nội dung bạn đã nhập.
- ↶ **Hoàn tác** 1 lần gộp gần nhất (trong bộ nhớ, mất khi tải lại trang).
- Không tự xóa/gộp gì nếu bạn không bấm.

#### Kiểm thử
- Mới: `tests/characters.test.js` (11 test, gồm đúng ca trong ảnh: MC=Bùi Lạc, "nhân vật chính", "Ân" → "Ân" không bị đụng).
- E2E giao diện 29 → 33 (banner, modal, gộp, hoàn tác).
- Sửa `worker.integration.js`: test cũ mong NV "Lan" (chính là MC) được tạo thành mục DB — đó chính là lỗi trên.
- `npm test`: tất cả PASS.

#### Lưu ý
- Mục **"Ân"** KHÔNG được gợi ý vì không có căn cứ cho thấy trùng ai. Nếu thực ra "Ân" là tên khác của một nhân vật, hãy tự xóa/sửa tên trong Character Database.
- Sửa này ngăn trùng MỚI; dữ liệu đã có cần bấm 🧹 một lần để dọn.
- Chưa chạy với API thật.

---

## [PATCH_NOTES_V12.17b_HINT_ADULT] — Ghi chú bản vá

### V12.17b — Gợi ý chương sau kiểu "Gọn theo nhịp" + tóm tắt/gợi ý 18+ không né tránh

Mang hai bản vá từ nhánh V12.15 sang V12.17 (bản V12.17 chưa có hai phần này).

#### 1. Kiểu gợi ý "Gọn theo nhịp + điểm kết chương"
- Ô chọn mới **Độ dài & cách viết gợi ý** (dưới "Kiểu gợi ý chương sau"): *Chi tiết (400–600 từ)* (mặc định, như cũ) hoặc *Gọn theo nhịp + điểm kết chương (150–260 từ)*.
- Kiểu Gọn: 1–3 đoạn kể lần lượt các nhịp chính (ai làm gì, ở đâu, đạo cụ/thiết lập nào, hệ quả); dòng cuối "→ Kết chương ở: …".
- `hintFormat` được lưu cùng truyện, gửi kèm job nền (`create-job.js` đã thêm vào danh sách trường cho phép) và dùng cho cả gợi ý tự động sau chương.

#### 2. Tóm tắt/gợi ý chương 18+ dùng model 18+, bớt nói giảm nói tránh
- Chương 18+ → tóm tắt và gợi ý chạy bằng model 18+ (`adultModelFor` ở client, `extractModelFor` ở worker).
- `buildSummaryPrompt(text, n, names, adult)` (shared/core.js): chương 18+ thì thuật lại cụ thể, đúng từ ngữ của chương.
- Prompt gợi ý thêm quy tắc "ĐỘ TRỰC DIỆN" cho chương 18+ (mọi nhân vật là người trưởng thành).

---

## [PATCH_NOTES_V12.17_SHARED_GATE] — Ghi chú bản vá

### V12.17 — Gộp client và worker (Bước 2)

Không đổi kiến trúc. Phần Quality Gate / Story Control / Sync được chuyển vào `shared/core.js` để client và worker dùng chung một bản.

#### 1. Đã chuyển vào shared/core.js
**Gate thuần (phần 1)**
- `evaluateReview` (chuẩn hoá kết quả Auditor, hard failure, verdict theo ngưỡng 90/75), `rewriteInstructionsText`, `checkRewriteAcceptable` (từ chối bản sửa rỗng / ngắn hơn 60%), `backupBeforeRewrite` (giữ tối đa 3 bản gốc), `mergeAiContinuityWarnings`, `gateMaxAttempts`.

**Dựng prompt + vòng lặp + Sync (phần 2)**
- `normalizeStoryControl`, `storyControlPrompt` — trước đây client và worker viết hai bản khác nhau.
- `buildQualityReviewPrompt`, `buildRewritePrompt` — khung, quy tắc, schema dùng chung; ngữ cảnh (outline hay brief, canon) do mỗi bên truyền vào.
- `runGateLoop(chapter, deps, opts)` — vòng chấm → sửa → chấm lại dùng chung; không gọi AI trực tiếp mà nhận hàm `review/rewrite/selfCheck/onStatus/onChange/shouldStop` từ client hoặc worker.
- `gateHardChecks`, `gateKnownNames`, `knownNameMentions` — kiểm tra cứng xác định (ngôn ngữ, đủ nội dung, continuity mức cao) và đếm tên nhân vật đã biết.
- `nextCanonVersion`, `applyCanonSync`, `mergeCanonVersion`, `isGateFailedResult` — tăng canonVersion, đánh dấu Sync, hợp nhất phiên bản, nhận biết kết quả job nền trượt Gate.

Client giữ `normalizeStoryControlClient()` / `storyControlPromptClient()` / `qualityHardCheck()` làm lớp bọc mỏng để các chỗ gọi cũ không phải đổi.

#### 2. Thay đổi hành vi (có chủ đích)
- **Worker nay chạy kiểm tra cứng như client**: bản thảo ≤ 100 từ, có chữ không phải tiếng Việt, hoặc có cảnh báo continuity mức cao → hard failure. Trước đây chỉ client làm.
- **Prompt Auditor của worker** có thêm khối QUY TẮC, kiểm tra cứng và schema giống client; **prompt viết lại của worker** có thêm CANON CONTEXT (cắt 15.000 ký tự).
- **Story Control của client** dùng bản đầy đủ của worker (thêm giới hạn thread mới, danh sách trường khoá, dòng ưu tiên canon khi xung đột). Ảnh hưởng cả prompt lập kế hoạch/viết chương của client.
- `qualityHardCheck`: bỏ hai mục giữ chỗ `events_budget`, `character_budget` (luôn ok, gây hiểu lầm). Ngân sách sự kiện/nhân vật vẫn bị chặn bởi `evaluateReview` dựa trên số Auditor đếm.
- Mới: hệ thống đếm tự động tên nhân vật đã biết xuất hiện trong văn bản, đưa cho Auditor làm bằng chứng tham khảo. Đây chỉ là dữ kiện cho Auditor, không tự gây trượt Gate.
- Worker không cắt/chuẩn hoá mảng warnings/suggestions/rewriteInstructions/dimensions trước đây; nay giống client.
- `chapter.sync` của worker nay giữ các trường có sẵn (như `startedAt`) thay vì ghi đè hoàn toàn; `changes` mặc định `[]`.

#### 3. Kiểm thử (`npm test`: 9 bộ, tất cả PASS)
- `tests/core.test.js`: 14 → **33** (prompt, Story Control, kiểm tra cứng, vòng lặp Gate với 9 tình huống, canonVersion/Sync, nhận biết trượt Gate).
- `tests/worker.test.js`: 29 → **31** (kiểm tra cứng dùng chung ở worker, prompt Auditor chứa quy tắc/schema/tên đã biết).
- `tests/worker.integration.js`: thêm kiểm tra Sync/canonVersion/review sau khi PASS. Đã đối chiếu: cùng bài kiểm tra cũng pass trên bản v12.16b, nên hành vi khi PASS không đổi.
- Mới `tests/worker.gatefail.js`: chạy cả handler với Auditor luôn trượt → đúng 3 lần chấm + 2 lần sửa, lưu bản gốc, **không chạy** cập nhật NV/Thế giới/Tóm tắt/Memory, không Sync, canonVersion không tăng, API key bị xoá.
- `tests/e2e_bg.py`: 11 → 15 (job nền trượt Gate ở client).
- E2E giao diện 29/29 không đổi.

#### 4. Còn lại / chưa kiểm
- Chưa chạy với API thật: tỷ lệ trượt Gate, chi phí và ngưỡng 90/75 chưa được hiệu chỉnh.
- Số sự kiện chính vẫn do Auditor (AI) đếm; chưa có cách xác định bằng code.
- Hai bên vẫn tự dựng phần ngữ cảnh (client: outline + Story Bible; worker: `buildContext`) và tự gọi API — cố ý để nguyên vì khác nền tảng (state toàn cục vs `job.storyState`).
- Hợp nhất state job nền vào local (`mergeBackgroundChapter`) và các bước trích xuất sau chương vẫn tách đôi; phần trích xuất sẽ gộp ở Bước 3 (v12.18).

---

## [PATCH_NOTES_V12.16b_GATE_FIXES] — Ghi chú bản vá

### V12.16b — Sửa lỗi Quality Gate (Bước 1)

Bản vá trên V12.16. Không đổi kiến trúc; chỉ sửa lỗi và bổ sung test cho Quality Gate.

#### Lỗi đã sửa
1. **Hậu xử lý dùng bản nháp cũ.** Sau khi Gate viết lại chương, tóm tắt / NV / Thế giới / Status / Memory / rà chính tả vẫn chạy trên bản TRƯỚC khi sửa. Nay `text` và `rawForPolish` được cập nhật theo bản đã qua Gate.
2. **Bản sửa có thể ghi đè chương bằng nội dung rỗng/ngắn.** Bản sửa ngắn hơn 60% bản gốc (hoặc rỗng) bị từ chối, giữ nguyên bản thảo, ghi cảnh báo vào review (client + worker).
3. **Mất bản gốc khi viết lại.** Bản gốc được lưu vào `versions` (tối đa 3) trước khi thay.
4. **Lỗi API khi viết lại làm mất cả bản nháp (client).** Nay bắt lỗi, giữ bản nháp ở REVISION_REQUIRED; bấm Dừng khi đang sửa cũng giữ bản nháp.
5. **Sửa tay chương đã Sync chặn viết chương kế.** `MODIFIED_AFTER_SYNC` nay chỉ hiện ghi chú, không chặn.
6. **Cảnh báo continuity cộng dồn qua các lượt.** Mỗi lượt thay cảnh báo AI cũ bằng cảnh báo mới (giữ cảnh báo trùng câu).
7. **Client bỏ qua kết quả trượt Gate của job nền.** `job-status` trả thêm `qualityGateFailed`; client báo đúng "chưa vượt Quality Gate — chưa ghi Canon" và hợp nhất `canonVersion`.
8. Giới hạn số lần sửa: client và worker cùng tối đa 3.

#### Tính năng mới
- Nút **🔍 Duyệt lại** (thanh công cụ chương): chấm lại chương hiện tại, KHÔNG tự viết lại.
  - Đạt → đồng bộ Canon (chương cuối) hoặc đánh dấu đã duyệt (chương cũ, dùng 🔄 Rescan nếu cần).
  - Trượt → hỏi có duyệt thủ công (override) không.
- Công tắc **🛡 Quality Gate** trong Cài đặt (bật/tắt theo từng truyện).
- Hậu xử lý Canon tách thành hàm `runCanonPostProcess()` dùng chung cho viết chương và Duyệt lại.

#### Kiểm thử
- Unit worker: 19 → 29 (10 test Gate mới: PASS, hard failure, ngân sách sự kiện/nhân vật, ngưỡng 90/75, viết lại + lưu versions, bản sửa bị từ chối, lỗi API, hết số lần thử, review trả rác, tắt Gate).
- E2E giao diện: 21 → 29 (mock API nay trả review hợp lệ; thêm test PASS/MODIFIED_AFTER_SYNC/không chặn/trượt Gate/bản sửa bị từ chối/chặn chương kế/Duyệt lại/tắt Gate).
- `npm test`: tất cả PASS.

#### Chưa làm / chưa kiểm
- Đường merge job nền khi trượt Gate (client) chưa có test tự động; mới kiểm bằng đọc code.
- Chưa chạy với API thật nên chưa biết tỷ lệ trượt Gate và chi phí thực tế; ngưỡng 90/75 chưa được hiệu chỉnh.
- `qualityHardCheck`: hai kiểm tra ngân sách sự kiện/nhân vật vẫn là chỗ giữ chỗ (do AI chấm) — thuộc Bước 2.
- Logic Gate vẫn nằm ở cả client lẫn worker — thuộc Bước 2.

---

## [PATCH_NOTES_V12.16_QUALITY_GATE] — Ghi chú bản vá

### V12.16 — Quality Gate / Canon Pipeline

#### Thay đổi chính
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

#### Kiểm thử
- npm test: tất cả unit/integration/security/routing PASS; E2E bỏ qua vì môi trường ZIP không có Playwright/Python.

---

## [PATCH_NOTES_V12.15_PARAGRAPHS] — Ghi chú bản vá

### V12.15 — Tự ngắt đoạn (hết "khối văn đặc")

**Nguyên nhân:** prompt viết chương không có quy tắc bố cục và không có bước hậu xử lý ngắt đoạn, nên model viết chương dài thành một khối liền.

#### Thay đổi
- `shared/core.js`: thêm `formatParagraphs()` — chia khối văn > 500 ký tự thành đoạn 2–3 câu, mỗi lượt thoại (“…”, —) một đoạn riêng, đoạn cách nhau 1 dòng trống. Không đổi/mất chữ, chạy nhiều lần vẫn ổn định.
- Prompt client (mục 9 "BỐ CỤC") và SYSTEM_PROMPT của worker: yêu cầu đoạn ngắn + thoại riêng dòng.
- Áp dụng `formatParagraphs` sau khi AI viết chương / viết tiếp (client + worker nền).
- Nút **¶ Ngắt đoạn** trên thanh công cụ chương: sửa ngay các chương cũ đã có.
- Thêm test hồi quy trong `tests/worker.test.js`.

#### Bổ sung V12.15: chống lặp cảnh + từ lạ
**Triệu chứng:** chương chứa 2 bản của cùng một cảnh (bản 2 viết lại từ đầu, dính liền bản 1) và có từ lạ chen giữa câu ("HttpServletResponse", "czerwony"…).

- Prompt viết tiếp (client + worker): bỏ khối "đoạn đầu chương / STYLE LOCK" (nguyên nhân model chép lại từ đầu), thêm lệnh cấm viết lại từ đầu.
- `dropRestartedContinuation()`: bỏ các đoạn viết tiếp trùng nội dung đã có; nếu trùng toàn bộ thì bỏ lượt đó và dừng.
- `dedupeRepeatedScene()`: nếu chương có bản viết lại phần đầu (kể cả dính liền không dòng trống) thì cắt từ chỗ lặp. Áp dụng khi tạo chương và trong nút ¶ (có hỏi xác nhận).
- `findStrayWords()`: cảnh báo từ Latinh lạ (worker ghi vào issues, nút ¶ hiện ở thanh trạng thái).
- Lượt viết tiếp phía client: temperature 0.9→0.82, frequency_penalty 0.55→0.15, presence_penalty 0.4→0.1 (penalty cao ép model chọn token hiếm nên sinh từ lạ).
- Test hồi quy mới trong `tests/worker.test.js`.

#### Bổ sung V12.15b: sửa từ lạ bằng AI + bớt báo nhầm
- Mở rộng danh sách từ mượn hợp lệ (silicon, latex, temp, remote, camera…) để `findStrayWords` không báo nhầm.
- `fixStrayWordsInText()` (client): chỉ gửi các đoạn có từ lạ cho AI, thay bằng tiếng Việt hợp ngữ cảnh, kiểm tra độ dài/ngôn ngữ trước khi nhận.
- Nút ¶ Ngắt đoạn: nếu phát hiện từ lạ sẽ hỏi "Sửa từ lạ" rồi gọi hàm trên (dùng model chính đang chọn).
- Prompt "Sửa chính tả" (polishVietnamese) nêu rõ danh sách từ lạ cần thay.

#### V12.15c: rà soát cuối
- `formatParagraphs`: đoạn ngắn (<500 ký tự) có thoại xen kẽ (kể cả ngoặc kép thẳng ") giờ cũng được tách thoại.
- `dedupeRepeatedScene`: chỉ cắt khi bản lặp trùng với các đoạn MỞ ĐẦU chương (tránh cắt nhầm câu lặp có chủ ý giữa chương).
- `dropRestartedContinuation`: chặt hơn (đoạn ≥15 từ, độ trùng ≥70%) để không bỏ nhầm phần viết tiếp thật.
- `findStrayWords(text, tên_nhân_vật)`: tên nhân vật đã khai báo không bị báo là từ lạ (client + worker).

---

## [PATCH_NOTES_V12.14_BUGFIX] — Ghi chú bản vá

### V12.14 — Bugfix sau kiểm thử toàn diện

#### Lỗi nghiêm trọng đã sửa
1. **Job nền luôn chết 500** (`ReferenceError: chapter is not defined`, V12.13): dòng gán `chapter.control` nằm trước khi object chương được tạo. Nay `control` được đưa vào object trả về.
2. **Từ khóa 18+ khớp chuỗi con** (`includes`) làm câu thường ngày như "cà phê", "cây bút", "phản kháng", "phê duyệt", "Mông Cổ" bị coi là nội dung 18+ và bị chuyển sang model NSFW + prompt erotic. Nay khớp theo từ nguyên vẹn (Unicode) và bỏ các từ quá chung (bú, phê, thúc, lần đầu, kích thích, ngực, mông; "quan hệ" -> "quan hệ tình dục/xác thịt").
3. **`trimToWordLimit` làm mất toàn bộ xuống dòng/đoạn văn/thoại** khi chương bị cắt do vượt giới hạn. Nay cắt theo vị trí ký tự, giữ nguyên đoạn.
4. **Công tắc "Tự động tạo" không có xử lý** và đổi "Khoảng cách" ném `ReferenceError: scheduleNextAuto`. Đã thêm bộ hẹn giờ (chỉ viết khi nút đang rảnh, không lưu trạng thái bật qua lần mở lại).

#### Test
- Cập nhật `tests/worker.integration.js`, `tests/e2e.py` cho khớp V12/V12.10.
- Thêm `tests/worker.routing.js` (7 ca định tuyến 18+/rào chắn tuổi/Story Control).
- Thêm 3 test hồi quy vào `tests/worker.test.js`.

#### Nâng cấp bảo mật & bảo trì (V12.14)
- **Mã truy cập** `APP_PASSCODE` (tuỳ chọn) cho `create-job`; ô nhập ở giao diện, lưu riêng trên thiết bị.
- **Kiểm tra endpoint**: chỉ https, chặn địa chỉ nội bộ/metadata cloud, có thể giới hạn bằng `ALLOWED_API_HOSTS`.
- **Cảnh báo cấu hình** (thiếu `JOB_SECRET`/`APP_PASSCODE`) hiển thị trong lúc job chạy.
- **Tự dọn job** quá hạn (`JOB_TTL_HOURS`, mặc định 48h) và **xoá job ngay** khi client đã hợp nhất (`job-status?ack=1`).
- `ALLOWED_ORIGIN` để giới hạn CORS.
- **Gộp code dùng chung** client/worker vào `shared/core.js` + `scripts/sync-shared.js` + `tests/sync-check.js`.
- `normalizeName` của client nay cũng gộp khoảng trắng thừa như worker (tránh trùng nhân vật do dấu cách kép).
- Nhãn độ dài ghi rõ đếm theo âm tiết.
- `npm test` chạy toàn bộ; thêm `tests/security.test.js`, `tests/e2e_bg.py`; xem `SECURITY_SETUP.md`.

---

## [PATCH_NOTES_V12.13_STORY_CONTROL] — Ghi chú bản vá

### V12.13 — Story Control / Continuity Hardening

Nâng cấp từ V12.12, giữ nguyên UI và pipeline hiện tại, tập trung vào độ ổn định của prompt/continuity.

#### Đã thay đổi

##### 1. Story Control Layer
- Thêm lớp kiểm soát trước khi viết ở cả client và background writer.
- Giới hạn mặc định: tối đa 3 sự kiện chính/chương.
- Giới hạn mặc định: tối đa 4 nhân vật có tên xuất hiện trực tiếp.
- Giới hạn thread mới: tối đa 3.

##### 2. State Lock / No Retcon
- Thêm danh sách trường canon quan trọng cần giữ ổn định.
- Không tự sửa lịch sử, canon, ký ức, quan hệ, cảnh giới, năng lực, vật phẩm quan trọng, bí mật/lời hứa hoặc luật thế giới chỉ vì chương hiện tại thuận tiện hơn.
- Mâu thuẫn được định hướng để giữ lại và xử lý có chủ đích.

##### 3. Character Agency
- Prompt yêu cầu nhân vật quan trọng phải có mục tiêu, động cơ, phản ứng và lựa chọn riêng.
- Hạn chế việc nhân vật trở thành công cụ để đẩy plot.

##### 4. Chapter Focus
- Giữ nguyên kiến trúc NONE / SECONDARY / PRIMARY của V12.12.
- Story Control xác định rõ Chapter Focus không phải giấy phép mở tuyến truyện mới.

##### 5. Continuation
- Các lượt viết tiếp cũng nhận Story Control Layer để tránh việc phần nối chương tự phá giới hạn và continuity của phần đầu.

##### 6. Diagnostics
- Chapter lưu metadata `control` gồm focus và các giới hạn chính để hỗ trợ kiểm tra/debug.

#### Kiểm tra
- `node --check netlify/functions/write-chapter-background.js`: PASS
- Inline JavaScript trong `index.html`: PASS
- `node tests/worker.test.js`: 12/12 PASS

#### Không thay đổi
- Không thay đổi cấu trúc UI chính.
- Không thay đổi Current Status V2 CHANGE → VALIDATE → MERGE.
- Không thay đổi schema ChapterData hiện có ngoài metadata control.
- Không thay đổi cơ chế API/model routing ngoài việc prompt nhận thêm lớp Story Control.

---

## [PATCH_NOTES_V12.12_CHAPTER_FOCUS] — Ghi chú bản vá

### V12.12 — Chapter Mature Focus: NONE / SECONDARY / PRIMARY

#### Mục tiêu
Tách rõ **quyền cho phép nội dung trưởng thành** (`mature`) khỏi **ý định của từng chương** (`chapterMatureFocus`).

#### Ba chế độ
- `NONE`: chương không có trọng tâm trưởng thành. Không tự chèn hoặc kéo dài nội dung trưởng thành, kể cả khi chương trước có nội dung tương tự.
- `SECONDARY`: nội dung trưởng thành chỉ được dùng khi brief/mệnh lệnh hoặc diễn biến hiện tại yêu cầu rõ; không tự biến thành tuyến chính.
- `PRIMARY`: chủ đề trưởng thành là một trọng tâm của chương; hệ thống vẫn phải bám brief, không tự mở tuyến mới.

#### Thay đổi
##### `index.html`
- Thêm selector `Trọng tâm trưởng thành của chương` với `NONE / SECONDARY / PRIMARY`.
- Thêm `chapterMatureFocus` vào state mặc định, hydrate, persist và backup/background story state.
- Thêm các helper chuẩn hóa/đọc trọng tâm.
- `NONE` chặn force-routing NSFW và auto-routing.
- Cập nhật phần hướng dẫn routing để hiển thị rõ trọng tâm hiện tại.
- Prompt chương nhận chỉ thị trọng tâm để tránh tự chèn nội dung trưởng thành ngoài ý định.

##### `netlify/functions/write-chapter-background.js`
- Đồng bộ `chapterMatureFocus` với background worker.
- `NONE` thắng mọi auto-detection.
- `SECONDARY` chỉ routing khi có tín hiệu rõ từ brief/mệnh lệnh.
- `PRIMARY` có thể dùng thêm heat detection trong chế độ auto.
- Background prompt nhận cùng chỉ thị trọng tâm với luồng local.

#### Tương thích
State cũ không có `chapterMatureFocus` sẽ tự dùng `NONE`.

#### Kiểm tra
- `node --check` cho script trong `index.html`: PASS
- `node --check` cho `write-chapter-background.js`: PASS
- `node tests/worker.test.js`: **12/12 PASS**

---

## [PATCH_NOTES_V12.11] — Ghi chú bản vá

### V12.11 — Current Status V2: CHANGE → VALIDATE → MERGE + Evidence

#### Phạm vi
Chỉ nâng cấp module **Current Status**. Không thay đổi Character Database, Memory Engine, Summary, Snapshot hay các module khác.

#### Thay đổi chính

- Không còn cho AI viết lại/ghi đè toàn bộ `statusState` sau mỗi chương.
- Current Status được xử lý theo pipeline:
  `Chapter → Change Extraction → Validation → Merge → Current Status`.
- AI chỉ trả về các trường thực sự thay đổi.
- Mỗi thay đổi hợp lệ phải có `evidence`.
- Không có bằng chứng thì không merge.
- Thông tin cũ không bị xóa chỉ vì chương mới không nhắc lại.
- Xung đột được giữ trong `statusState.conflicts` thay vì tự ý ghi đè.
- `statusState.changeLog` lưu lịch sử các lần merge gần nhất.
- `statusState.schemaVersion = 2`.
- Danh sách nhân vật hiện có được kiểm kê sau mỗi lần cập nhật; nhân vật không thay đổi hiển thị `Không có thay đổi đáng kể`.
- Current Status không cho AI tự tạo nhân vật mới.
- Các trường nhân vật được hỗ trợ gồm tuổi, ngoại hình, cơ thể, quần áo, dấu vết, tu vi, trạng thái tu vi, cảm xúc, phục tùng, tuân thủ quy tắc, quan hệ xã hội, nghề nghiệp, nơi ở, quan hệ tình cảm, điểm yếu, mục tiêu, vật phẩm, tính cách bên ngoài/bên trong, tâm lý, quan hệ và trạng thái thể chất/tinh thần.

#### Tương thích dữ liệu cũ

`normalizeStatusState()` chuyển dữ liệu `statusState` cũ sang cấu trúc V2 khi Current Status được cập nhật lần đầu. Dữ liệu legacy vẫn được đọc và format nếu chưa được nâng cấp.

#### Kiểm tra an toàn

- JSON lỗi → giữ Current Status cũ.
- Change không có evidence → không merge.
- Character ID/tên không tồn tại → bỏ qua thay đổi nhân vật đó.
- Conflict có evidence → lưu lại, không ghi đè giá trị cũ.

---

## [PATCH_NOTES_V12.11_HINT_FOCUS] — Ghi chú bản vá

### v12.11 — Gợi ý chương sau: Focus tuyến chính

- Giảm dữ liệu Threads/Foreshadowing đưa vào prompt từ tối đa 8+8 xuống 3+3.
- Ưu tiên tuyệt đối: mạch chính hiện tại → brief người dùng → nhân vật chính/quan hệ trung tâm → tuyến trưởng thành đang là trọng tâm (nếu có) → hậu quả trực tiếp → thread/foreshadowing liên quan.
- Tối đa chỉ chọn 1 thread và 1 foreshadowing có liên quan trực tiếp.
- Cấm tự mở tuyến, mục tiêu, nhân vật quan trọng, địa điểm lớn hoặc bí mật mới chỉ để mở rộng truyện.
- Nếu chương hiện tại đang tập trung một tuyến chính, chương sau phải tiếp tục/xử lý hậu quả của tuyến đó trước.
- Nếu bật 18+ nhưng tuyến trưởng thành không phải trọng tâm của chương hiện tại, không tự ép thêm tuyến mới; nếu tuyến trưởng thành đã là trọng tâm thì ưu tiên tiếp nối tuyến đó.
- Giữ giới hạn gợi ý khoảng 400–600 từ, tối đa 600 từ.

---

## [PATCH_NOTES_V12.11_HINT_LENGTH] — Ghi chú bản vá

### V12.11 — Next Chapter Hint length fix

- Giới hạn Gợi ý chương sau ở khoảng **400–600 từ**.
- Prompt yêu cầu rõ không vượt 600 từ.
- Giảm `maxTokens` của lần tạo chính xuống 2800 để tránh sinh quá dài nhưng vẫn đủ chỗ cho reasoning của Aion 3.5 Mini.
- Nếu kết quả vượt 600 từ, app yêu cầu AI nén lại về 400–600 từ.
- Có hard cap cuối cùng ở 600 từ trước khi lưu vào `state.nextChapterHint`.
- Kiểm tra tiếng Việt vẫn được giữ nguyên.

---

## [PATCH_NOTES_V12.10] — Ghi chú bản vá

### V12.10
- Tóm tắt chương: 300-400 từ (trước 350-550), 4-5 đoạn, maxTokens 3500 -> 1400.
- Nếu vẫn >450 từ: tự gọi 1 lần để rút gọn, sau đó cắt cứng theo câu (cả client và worker nền).
- Chống lẫn ngoại ngữ: mở rộng dò thêm chữ Thái/Ả Rập/Hindi; thêm stripForeign() dọn chữ ngoại còn sót sau khi viết (client + worker nền), đổi dấu câu full-width sang dấu thường.
- Character Database: (1) prompt chỉ khóa NV có [KHÓA HỒ SƠ GỐC], NV đã mở khóa được bổ sung appearance/personality/goals; (2) AI nhận hồ sơ hiện có của NV mở khóa để chỉ thêm điểm mới; (3) nới độ dài trường 25 -> 30-60 từ (worker); (4) cộng dồn không còn cắt mất phần mới khi đầy (bỏ đoạn cũ nhất, giới hạn 2500), bỏ đoạn trùng ý; (5) mở khóa thì coreIdentity đồng bộ theo bản mới.
- Tóm tắt chống bịa: prompt viết lại (văn bản chương đặt TRƯỚC, luật ngắn, không còn từ mồi kiểu lệnh/quyền lực/hợp đồng); chỉ đưa AI tên NV có thật trong chương; kiểm tra tên và độ trùng từ với chương, sai thì gọi lại 1 lần kèm danh sách tên bị cấm, vẫn sai thì dùng bản trích tự động từ văn bản (client + worker nền).

---

## [PATCH_NOTES_V12.9] — Ghi chú bản vá

### V12.9
- Gợi ý chương sau: chi tiết theo cảnh, nối từ đoạn kết chương trước, có chọn kiểu (bình thường / chống cự / đảo chiều / leo thang / chậm) + nút tạo lại gợi ý.
- Tóm tắt chương: theo trình tự thời gian, đúng tên nhân vật, giữ chi tiết (giờ, số phòng, lệnh, lời thoại), 350-550 từ.
- Bộ nhớ chương cũ: 3 chương gần nhất giữ 900 ký tự tóm tắt, cũ hơn 350 (trước đây 200-240).

---

## [PATCH_NOTES_V12.7] — Ghi chú bản vá

### V12.7 — Continuity / Canon / Brief Fix
- One shared female-character definition block for all female characters.
- AI builds individual female characters from story evidence; no per-character female form required.
- Full user directive and next-chapter hint are preserved (no 400-character truncation).
- Automatic next-chapter hint is advisory only.
- Main-character core profile is protected from automatic rescans; dynamic state remains updateable.
- Character Database passes canonical fields separately from current state.
- Tier auto-ranking changes only tier.
- Confirmed character identity/role data cannot be overwritten by inference.
- 1–3 main events and limited new-character rules remain active.
- Chapter hard cap remains target x 1.15 (5,000 => 5,750 words).
- Vietnamese-script guard remains active.
- Last-chapter deletion restores prior snapshot including core state and female-definition rules.
- Existing writer/settings two-column arrangement retained.

---

## [PATCH_NOTES_V12.6] — Ghi chú bản vá

### V12.6 — Character Core Identity Lock

#### Problem fixed
Character Database entries such as a character's original personality/identity could be overwritten by automatic character rescans after several chapters. The automatic tier-ranking button only changes `tier`, but the chapter character updater could overwrite core fields when AI returned a new paraphrase.

#### Changes
- Added `coreIdentity` snapshot for `name`, `age`, `gender`, `appearance`, `personality`, and `goals`.
- `coreLocked` defaults to true.
- Automatic chapter character extraction can no longer overwrite core identity fields unless the AI explicitly returns `explicitCoreChange=true` plus concrete `changeEvidence`.
- Manual Save in Character Database is treated as user intent and refreshes the core snapshot.
- Existing characters without a core snapshot are initialized from their current profile once; this prevents future automatic overwrites. If an already-corrupted profile must be restored to an earlier value, restore it manually once and press Save.
- Automatic tier ranking remains limited to `tier`; it does not modify personality, appearance, role, goals, etc.

---

## [PATCH_NOTES] — Ghi chú bản vá

### V12.5 — Xóa chương hoàn nguyên toàn bộ bộ nhớ

- Khi bật **Xóa kèm bộ nhớ**, xóa chương cuối sẽ rollback **Current Status, Status State, Story Clock, Nhân vật, Địa điểm, Vật phẩm, Threads, Timeline, Foreshadowing, Knowledge Ledger, Memory Events và Character State Tracker** về snapshot của chương ngay trước đó.
- Xóa chương cũng loại bỏ dữ liệu Memory/Scene/History thuộc đúng chương bị xóa và đánh lại số chương của dữ liệu phía sau.
- Sau khi xóa chương cuối, giao diện tự chọn lại chương trước; không còn giữ `currentChapterIndex` trỏ vào chương vừa xóa.
- Snapshot mới từ V12.5 lưu thêm trạng thái Memory/Status để các lần rollback sau chính xác hơn.
- Thao tác xóa ghi ngay vào IndexedDB + emergency copy, không chờ debounce 1,75 giây, tránh iOS/Safari giữ lại bản state cũ.
- Nếu xóa chương giữa truyện, dữ liệu của các chương phía sau vẫn được giữ và đánh lại số; chỉ rollback toàn bộ live state khi chương cuối bị xóa vì đó là trường hợp có thể xác định chính xác mốc trạng thái trước đó.

### V12.3 — Khóa độ dài + khóa ngôn ngữ

- Độ dài mục tiêu được chuẩn hóa 500–6.000 từ; mỗi chương không vượt quá 115% mục tiêu. Với mặc định 5.000 từ, hard cap là 5.750 từ.
- Cả local writer và background writer đều dừng continuation khi đạt mục tiêu/hard cap và cắt ở câu gần hoàn chỉnh nếu model trả quá dài.
- Thêm phát hiện chữ Hán/Nhật/Hàn/Cyrillic lẫn vào văn Việt; nếu phát hiện, model được yêu cầu viết lại 100% tiếng Việt có dấu thay vì giữ nguyên đoạn lỗi.
- Sửa auto-continue local: trước đây phát hiện ngôn ngữ khác thì dừng ngay, giờ retry trước.

### V12 — Writing Engine Upgrade

V12 keeps the V11.1 story-state pipeline and upgrades prose generation using the smoother V8-style path: temperature 0.82, no repetition penalties, prose-only output, and continuation style-lock.

### v11.1.0 — Tăng tốc

| Hạng mục | File | Nội dung |
|---|---|---|
| Rà chính tả không chặn lưu | `index.html` | `polishPromise` chạy song song hậu xử lý; chỉ thay văn bản khi `chapterObj.text` chưa đổi và không đang gõ |
| Hậu xử lý theo pha | `index.html` | `runFastPostTasks()`; nhánh tuần tự cũ giữ nguyên khi tắt "Song song" |
| Streaming throttle | `index.html` | `renderStream` giới hạn 120ms |
| Nghỉ hàng đợi | `index.html` | `sleep(600)` → `sleep(250)` |
| Lô trích xuất song song | `write-chapter-background.js` | `runPool()` + `EXTRACT_CONCURRENCY` cho NV/Thế giới |
| Tóm tắt song song | `write-chapter-background.js` | `summaryP` chạy cùng NV/Thế giới; "Gợi ý chương sau" đợi ở pha 2 |
| Test | `tests/` | e2e 21, unit 12, integration worker |

**Đánh đổi cần biết:** Status/Memory vẫn đọc state sau NV/Thế giới (pha 2). Tóm tắt/NV/Thế giới giờ chạy khi bản rà chính tả chưa xong nên dùng văn bản gốc (lỗi chính tả không ảnh hưởng nội dung trích xuất). Chưa kiểm thử với model/Netlify/iOS thật.

---

### v11.0.0 — Tóm tắt thay đổi

| Hạng mục | File | Nội dung |
|---|---|---|
| Lưu ngay khi rời trang | `index.html` | `flushPersist()` gắn vào `visibilitychange`, `pagehide`, `beforeunload` |
| Bản lưu khẩn cấp | `index.html` | `writeEmergencyCopy / clearEmergencyCopy / readEmergencyRecord`; khôi phục ở `initIndexedDBStorage` và `loadStoryStateFromDiskAsync` |
| Dự phòng khi IndexedDB lỗi | `index.html` | `saveStoryStateToDisk` ghi localStorage khi `idbPut` reject (trước đây chỉ hiện toast) |
| Lưu trữ bền | `index.html` | `navigator.storage.persist()` lúc khởi động |
| Rào chắn tuổi 18+ | `index.html`, `write-chapter-background.js` | `underageNames()`, `ageGuardPrompt()` chèn vào prompt khi bật 18+; cảnh báo khi mở truyện |
| Đồng bộ phiên bản | `package.json`, `index.html` | 11.0.0 (trước đó package.json còn ghi 10.2.0, giao diện ghi 10.2.1) |
| Bộ test | `tests/` | `e2e.py` (17), `worker.test.js` (11) |

**Chưa kiểm thử được trong môi trường này:** chạy thật trên Netlify (Background Functions, Blobs), gọi model thật (OpenRouter), và iOS Safari thật. Test dùng API giả và Chromium.

---

### Patch v10.2.3 — Sửa gốc: "Viết chương nền" không tự chuyển NSFW + hết giờ hàng loạt

**Vấn đề báo cáo:** khi bấm "☁ Viết chương nền", (1) chương có cảnh nóng vẫn dùng model
thường thay vì model NSFW dù `nsfwMode = "auto"`; (2) log trả về
`NV: 7/7 lô không đọc được / Thế giới: 7/7 lô không đọc được / Status: bỏ qua vì hết thời
gian / Memory: bỏ qua vì hết thời gian`.

**Nguyên nhân gốc (trong `write-chapter-background.js`):**

1. `generateOneChapter()` chỉ ép NSFW khi bắt được **từ khóa cứng** trong 3 nguồn hạn hẹp
   (Mệnh lệnh, Định hướng chương sau, tiêu đề chương trước) — không có bước **chấm nhiệt độ
   0–10** như bản viết trực tiếp trên client (`detectHeatLevel` trong `index.html`). Cảnh nóng
   phát sinh tự nhiên từ mạch truyện (không có từ khóa tường minh) sẽ bị bỏ qua, job lặng lẽ
   dùng model chính (đây là lý do bạn thấy nó "dùng mode thường" thay vì NSFW).
2. Bước viết chương + "viết tiếp" (`generateOneChapter`) không giới hạn ngân sách thời gian
   riêng — với chương dài (`minChapterWords` lớn) hoặc model trả lời chậm, bước này có thể ăn
   gần hết 13.5 phút của Netlify Background Function, khiến các bước sau (NV, Thế giới,
   Status, Memory) chạy dồn dập trong thời gian rất ngắn còn lại: các lệnh gọi trích xuất JSON
   bị cắt ngang do hết giờ → JSON hỏng → "không đọc được"; Status/Memory thậm chí không kịp
   bắt đầu → "bỏ qua vì hết thời gian".

**Đã sửa:**

- Thêm `detectHeatLevel()` trong worker, đồng bộ với client: nếu không bắt được từ khóa nhưng
  `nsfwMode = "auto"`, chấm nhiệt độ cảnh sắp viết và so với `nsfwAutoThreshold` đã cấu hình.
- Mở rộng nguồn quét từ khóa: thêm đoạn cuối chương trước (giống `tail` ở client), không chỉ
  Mệnh lệnh/Định hướng/tiêu đề.
- Dành riêng **5 phút dự trữ** (`POST_PROCESS_RESERVE_MS`) cho NV/Thế giới/Status/Memory: bước
  viết chương + viết tiếp giờ tự giới hạn `totalMs` và dừng sớm nếu sắp lấn vào phần dự trữ này.
- Nâng ngưỡng "bỏ qua vì hết thời gian" ở từng lô NV/Thế giới từ 60s lên 150s còn lại, để
  Status/Memory (chạy sau) chắc chắn còn cơ hội thay vì luôn bị hết giờ.
- Bỏ qua bước "sửa JSON bằng AI" (tốn thêm 1 lượt gọi model) khi còn dưới 90 giây, tránh vừa
  tốn thời gian vừa vẫn thất bại.

**Lưu ý còn lại:** nếu sau khi cập nhật vẫn thấy NV/Thế giới báo "không đọc được JSON" ngay cả
khi còn nhiều thời gian (không phải do hết giờ), rất có thể do model bạn chọn cho trường
"Model chính" trả lời bằng văn xuôi thay vì JSON thuần (thường gặp ở các model "reasoning" khi
endpoint không phải OpenRouter nên worker không tắt được chế độ suy luận). Trường hợp đó cần
xem đúng đoạn model trả về (mục "Chi tiết cập nhật nền" trong app) để xác định model có tuân
thủ yêu cầu "chỉ trả JSON" hay không.

### Patch v10.2.2 — Sửa lỗi mất dữ liệu IndexedDB

#### Lỗi đã sửa
`index.html`, hàm `openStoryDB()` (dòng ~1142):

```js
// Trước (lỗi):
req.onsuccess = e => { idb = e.target.result; resolve(db); };   // `db` không tồn tại → ReferenceError

// Sau (đã sửa):
req.onsuccess = e => { idb = e.target.result; resolve(idb); };
```

#### Ảnh hưởng của lỗi
- Biến `db` chưa từng được khai báo trong toàn bộ file, nên mỗi lần mở IndexedDB
  đều ném `ReferenceError: db is not defined`.
- Promise `openStoryDB()` bị cache (`idbReady`) nên **reject vĩnh viễn cho cả phiên làm việc**
  ngay từ lần gọi đầu tiên.
- Mọi thao tác `idbPut/idbGet/idbDelete/idbGetAll` — tức toàn bộ việc lưu/tải truyện,
  snapshot chương, draft khi streaming — đều thất bại âm thầm (bị `.catch(()=>{})` nuốt lỗi).
- Vì `saveStoryStateToDisk()` không có phương án dự phòng ghi vào `localStorage`,
  dữ liệu chỉ tồn tại trong bộ nhớ RAM của tab đang mở. Đóng tab / tắt màn hình iPhone
  (đúng kịch bản chính mà README v10.2 mô tả) sẽ **mất toàn bộ truyện chưa export**.

#### Đã kiểm tra lại sau khi vá
- `node --check` cho cả 3 Netlify Functions và toàn bộ script trong `index.html`: hợp lệ.
- Chạy thử bằng trình duyệt headless (Playwright): tạo truyện mới → không còn lỗi console,
  và bản ghi truyện xuất hiện thật trong object store `stories` của IndexedDB (trước đó luôn là 0).

---

### Patch v10.2.3 — Sửa lỗi job nền bị "treo" vĩnh viễn

#### Lỗi đã sửa
Hàm `checkPendingBackgroundJob()` (dùng để tự động kiểm tra lại job nền còn dang dở
mỗi khi mở lại trang) được định nghĩa nhưng **không bao giờ được gọi** trong `bootV102()`.

#### Ảnh hưởng của lỗi
- Nếu đóng tab / mất mạng / tắt máy trong lúc job nền đang chạy, việc polling
  (kiểm tra tiến độ mỗi 12 giây) dừng hẳn.
- Mở lại trang: cờ "đang có job" vẫn còn trong `localStorage`, nhưng không có gì
  chạy lại để xác nhận job đã xong/lỗi → **job bị coi là đang chạy vĩnh viễn**,
  chặn mọi job mới ("Đã có job nền đang theo dõi..."), dù job thật trên server
  có thể đã xong hoặc lỗi từ lâu.

#### Cách sửa
Thêm 1 dòng gọi hàm vào cuối `bootV102()`:
```js
checkForRecoverableDraft();
checkPendingBackgroundJob();   // ← dòng mới
```

#### Đã kiểm tra lại sau khi vá
Giả lập 1 job cũ còn sót trong `localStorage` rồi tải lại trang bằng trình duyệt headless:
app tự hiện "☁ Phát hiện job nền đang chờ đồng bộ..." và tiếp tục polling ngay khi boot,
thay vì im lặng bỏ qua như trước.

#### Khuyến nghị tiếp theo (chưa phải lỗi, nhưng nên làm trước khi phát hành)
1. Test thủ công đầy đủ luồng: viết chương → tắt/mở lại trình duyệt → kiểm tra truyện còn nguyên.
2. Cân nhắc thêm fallback ghi `localStorage` ngay trong `saveStoryStateToDisk()` phòng khi
   IndexedDB lỗi ở môi trường khác (Safari riêng tư, dung lượng đầy, trình duyệt cũ...),
   thay vì chỉ hiện toast cảnh báo.
3. Xác nhận gói Netlify đang dùng hỗ trợ Background Functions (cần gói Pro trở lên) nếu
   muốn dùng tính năng "☁ Viết chương nền".
4. Đặt biến môi trường `JOB_SECRET` trên Netlify để mã hóa API key khi lưu job Blobs.


#### V12.4 — Background continuation length fix
- Mature/NSFW writing branch gets a larger initial output budget (24k tokens) and continuation budget (12k).
- Mature branch can use up to 8 continuation passes (minimum 4 when auto-continuation is enabled).
- Mature branch reserves 90s instead of 5 minutes for post-processing, reducing premature truncation.
- Every continuation reuses the exact routed model selected for the chapter; it does not fall back to the primary model.
- Mature continuation prompt explicitly continues the same scene/momentum instead of ending early.
- Normal writing behavior remains unchanged.

## [V14.0.4] — Age guard trong pipeline cảnh, prompt văn phong, sửa E2E

- **Bảo mật nội dung:** rào chắn tuổi 18+ trước đây chỉ có ở bước lập kế hoạch; nay được đặt ĐẦU Style Lock của mọi lượt viết scene và top-up. System prompt không còn cho chỉ dẫn 18+ của người dùng đè lên rào chắn tuổi.
- Prompt hệ thống/scene bổ sung quy tắc chống sáo ngữ lặp, lời thoại đúng giọng, nhịp truyện và yêu cầu có đồng thuận/động lực rõ cho cảnh người lớn.
- Sửa E2E: mock API theo pipeline Scene Graph (plan → scene → top-up → vá cục bộ); nhãn phiên bản kiểm tra v13/v14. 34/34 PASS.
- Thêm `tests/v14_age_guard_scene.test.js` và `DEPLOY.md`.

## [V14.0.5] — Định tuyến model 18+ theo từng scene

- Sửa lỗi: model NSFW chỉ được chọn một lần cho cả chương (dựa vào đoạn cuối chương trước + mệnh lệnh), nên cảnh sex nằm trong Scene Graph/Outline của chương mới vẫn bị viết bằng model chính. Nay mỗi scene tự chọn model theo beat/purpose/mustChange/handoff của nó và đoạn cuối scene trước (cảnh nóng kéo dài không bị tụt về model chính giữa chừng). Top-up dùng model của scene cuối.
- Chương có scene 18+ được đánh dấu `isNsfw` để hậu kỳ (tóm tắt chế độ người lớn) chạy đúng.
- Pre-flight từ khóa tính thêm `nextChapterHint`.
- Mức 18+ người dùng chọn (`explicitLevel`) nay thực sự tới prompt scene (trước đây chỉ có tên mức). Mức `wild` dùng chỉ dẫn của mức `strong`.
- E2E #36 kiểm tra định tuyến theo scene.

## [V14.0.6] — Viết nháp nền + sửa PLAN_REJECTED nhầm

- **Sửa lỗi "V14 từ chối kế hoạch… vệ sĩ, khách sạn, shop váy cưới":** validator forbidden-drift trước đây tách luật thành từng âm tiết (`vệ`, `sĩ`, `khách`…) và chặn plan khi khớp ≥ 2 âm tiết, nên "bảo vệ", "bác sĩ", "khách" làm chương nào cũng bị từ chối. Nay so khớp theo cụm chủ đề nguyên vẹn (vệ sĩ / khách sạn / váy cưới / Kim Chi) và cho phép khi Outline/Arc/Required Beat của chương đã ghi rõ.
- **Viết nháp nền (nút ☁ Viết nháp nền):** worker chạy ĐÚNG pipeline "Tạo Chương Hoàn Chỉnh" (`runAdaptiveChapterPipeline` trong `shared/core.js`, dùng chung client + worker): Chapter Contract → Scene Graph → từng scene → top-up. Lưu chương ở trạng thái "Bản nháp"; KHÔNG chạy Quality Gate/hậu kỳ. Người dùng đọc, ổn thì bấm ☁ Chạy hậu kỳ server (hoặc 🔍 Duyệt lại).
- Chương nháp chưa hậu kỳ chặn viết chương kế tiếp (nháp hoặc thường) để không mất continuity.
- Worker không còn lặng lẽ lùi về writer cũ: plan bị từ chối → job lỗi `PLAN_REJECTED`; lỗi API ở scene → `SCENE_FAILED`. Worker dùng `DEADLINE` để dừng top-up khi hết giờ.
- Job viết thường (không draftOnly) cũng đi qua adaptive; tắt bằng `adaptiveScenePipeline:false` để quay lại writer cũ.
- Test mới: `tests/v14_worker_draft.test.js`, `tests/e2e_bg.py` (mục 15–21).
- **Chấm nhanh sau khi nháp** (ô tick mặc định bật): đúng MỘT lần Quality Review, không tự sửa, không hậu kỳ. Kết quả hiện dạng 🟢 ĐẠT / 🟡 CÓ CẢNH BÁO / 🔴 LỖI NẶNG kèm điểm và số lỗi; chi tiết nằm trong khung Quality. Review lỗi/hết giờ không làm fail nháp, chỉ báo "chưa chấm được".

## [V14.0.7–V14.0.8] — Forbidden drift tôn trọng Brief/chương trước; contract gọn; chống scene viết lặp

- V14.0.7: chủ đề bị cấm (vệ sĩ/khách sạn/váy cưới/Kim Chi) được phép nếu đã có trong Outline, Arc, Mệnh lệnh, Gợi ý hoặc đoạn kết chương trước. Thông báo lỗi nêu rõ cụm bị chạm và cách xử lý.
- V14.0.8: **sửa lỗi V14.0.7** — `userBrief` (Mệnh lệnh/Gợi ý, tới 2.000 ký tự) bị đưa vào JSON contract của MỌI prompt plan/scene/top-up và khung "Kế hoạch". Nay contract đưa vào prompt/hiển thị dùng `promptChapterContract` (không có `userBrief`); `userBrief` chỉ dùng để validator đối chiếu.
- Scene/top-up mở đầu lại cảnh đã viết: các đoạn gần trùng nguyên văn (≥ 70% trigram) bị bỏ, giữ phần mới (`dropRepeatedParagraphs`); scene chỉ còn < 80 từ thì bỏ qua và để top-up bù.
- Telemetry trong cảnh báo chương nháp: "Adaptive: x/y scene, n lượt bù từ, [cắt k đoạn lặp,] t giây" (kèm "DỪNG SỚM" nếu hết giờ job) để biết vì sao chương thiếu từ.

## [V14.0.9] — Chương Adaptive không còn tụt xuống ~4.100 từ

- **Nguyên nhân:** `dedupeRepeatedScene` (viết cho trường hợp model xuất lại cả chương, cắt từ chỗ lặp trở đi) bị áp lên chương do code tự ghép scene. Chỉ cần vài đoạn lặp lẻ là nó cắt cụt hàng nghìn từ SAU khi bước bù từ đã coi chương "đủ 4.500" (tái hiện: 5.034 từ thô → 1.660 từ).
- Thêm `safeDedupeRepeatedScene`: nếu cắt mất > 20% số từ thì giữ nguyên; dùng cho chương Adaptive ở client và worker. Đoạn lặp lẻ được xử lý ở từng scene bằng `dropRepeatedParagraphs` (ngưỡng đoạn ≥ 8 từ).
- Vòng bù từ: đếm từ SAU khi dọn (`deps.clean`), nhắm 4.500 + đệm ≤ 200 từ (bước khép câu cuối/khóa độ dài có thể bớt vài chục từ), tối đa 8 lượt; lượt hỏng (quá ngắn/lặp/không tăng) không làm dừng ngay, chỉ dừng sau 2 lượt hỏng liên tiếp.
- Telemetry: "Adaptive: x/y scene (a từ thô → b sau dọn), n lượt bù từ…".
