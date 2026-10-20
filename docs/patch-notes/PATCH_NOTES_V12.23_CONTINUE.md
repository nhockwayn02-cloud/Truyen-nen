# V12.23 – Auto-continue đúng số lượt + báo lý do dừng
- Số lượt viết thêm = đúng số "Auto-continue" đã đặt (client + worker; 18+ không còn bị ép tối thiểu 4).
- Bỏ giới hạn cố định 2 lần chèn diễn biến: số lần chèn tự động, chỉ bị giới hạn bởi số lượt Auto-continue.
- Lượt thất bại (AI trả rỗng, lặp, chèn <120 từ, sai ngôn ngữ, API lỗi) không còn làm vòng lặp dừng hẳn: tính là 1 lượt rồi thử lượt kế.
- Khi chương còn thiếu nhiều (<85% mục tiêu): bỏ câu "không kéo dài để đạt chỉ tiêu", yêu cầu viết tiếp diễn biến mới, không kết chương sớm.
- Lượng từ xin mỗi lần chèn/viết tiếp = phần còn thiếu chia cho số lượt còn lại.
- Chưa đạt mục tiêu: status + chẩn đoán chương ghi rõ lý do dừng (hết lượt, AI trả rỗng, lặp, API lỗi, chạm giới hạn từ...).

# V12.23 – Gợi ý chương sau
- Viết thường: gợi ý chương sau giờ HIỆN ở ô Gợi ý (trước đây chỉ lưu vào biến ẩn autoNextChapterHint nên ô luôn trống).
- Ô trống hoặc vẫn là gợi ý đã dùng cho chương vừa viết -> thay bằng gợi ý mới. Nếu bạn đã tự gõ gợi ý khác trong lúc viết -> giữ nguyên.
- Tạo gợi ý thất bại (API lỗi/AI trả rỗng): xóa gợi ý cũ đã dùng, báo ở status + chẩn đoán chương. Bản nền cũng xóa gợi ý cũ khi thất bại.
- Bản nền: lúc gộp kết quả không ghi đè gợi ý nếu bạn đã gõ gợi ý mới trong lúc job chạy.

# V12.23 – Viết thoải mái hơn để đủ số từ
- Thêm "KẾ HOẠCH ĐỘ DÀI" (shared/core.js: buildLengthPlan, dùng chung client + worker): tách gợi ý thành các nhịp, chia ngân sách từ cho từng nhịp (tổng ≈ 105% mục tiêu, nhịp kết chương ≈ nửa ngân sách), đặt ở cuối prompt.
- Dặn AI: mỗi nhịp phải đủ bối cảnh/hành động/thoại/nội tâm/hệ quả, cấm tóm tắt nhịp thành 1–2 đoạn, chỉ viết nhịp cuối khi đã gần đủ từ, nếu thiếu thì mở rộng phần giữa chứ không kết chương.
- Khi có gợi ý/mệnh lệnh: bỏ ràng buộc "chỉ 1–3 sự kiện chính" (mâu thuẫn với gợi ý nhiều nhịp), thay bằng "đúng các nhịp trong gợi ý, không thêm biến cố lớn ngoài gợi ý".

# V12.23 – MỞ RỘNG CUỐI (khi vẫn thiếu từ)
- Sau khi hết lượt Auto-continue mà chương vẫn dưới mục tiêu (95% khi có gợi ý, 100% khi không): app nhờ AI VIẾT LẠI TOÀN BỘ chương dài hơn, giữ nguyên thứ tự/sự kiện/thoại/điểm kết, mở rộng mỗi cảnh (ưu tiên cảnh ngắn nhất). Tối đa 2 lần, cả viết thường và viết nền.
- Chỉ nhận bản mới khi dài hơn bản cũ ít nhất 120 từ, không ngắn hơn 90% bản cũ, đúng tiếng Việt; vượt giới hạn tối đa thì cắt. Không đạt thì giữ nguyên bản cũ và ghi lý do vào status/chẩn đoán.
- Hàm dùng chung: buildExpandPrompt, acceptExpandedChapter (shared/core.js); test mới tests/v12_23.test.js.

# V12.23 – Lỗi 404 khi viết nền (Netlify)
- Client: nếu /create-job trả 404, app dò thêm /job-status để báo đúng nguyên nhân (chưa deploy netlify/functions, mở app ngoài domain Netlify hoặc file://, hay chỉ create-job lỗi build). Poll job-status trả 404 thì báo ngay thay vì im lặng chờ.
- create-job: kích hoạt write-chapter-background bằng URL env trước; nếu 404 thử tiếp host của chính request (domain tùy chỉnh khác env.URL). Nếu vẫn 404, lỗi nêu rõ URL đã thử.
- Test mới tests/v12_23_netlify.test.js (4 ca). package.json -> 12.23.0.

# V12.23 – "Đang tạo job…" quá lâu
- create-job chỉ chờ lệnh kích hoạt background tối đa 8 giây (biến TRIGGER_TIMEOUT_MS); quá hạn thì vẫn trả thành công kèm cảnh báo để app không treo và có thể tắt máy.
- create-job trả và ghi log `timings` (payloadKB, purgeMs, saveMs, triggerMs, totalMs). App hiện các số này khi tổng > 6 giây.
- App đếm giây khi đang tạo job, hiện dung lượng gửi (KB) và tự hủy sau 45 giây với thông báo rõ.
- Sửa nhãn phiên bản ở đầu app thành v12.23.

# V12.23 – "Lỗi gửi job: HTTP 400" trơn
- Lỗi gửi job giờ kèm thân phản hồi của server (nếu có), dung lượng đã gửi và 3 khóa truyện nặng nhất. Các lỗi 404/401 vẫn giữ thông báo riêng.

# V12.23 – Sửa HTTP 400 "đã gửi 9240 KB" (payload quá nặng)
- Nguyên nhân: mỗi chương mang theo tới 7–10 bản chụp trạng thái (stateSnapshots, mỗi bản là bản sao cả thế giới/nhân vật) + versions cũ; truyện 8 chương => ~8,4 MB chỉ riêng chapters, vượt giới hạn 6 MB/request của Netlify.
- Client không gửi stateSnapshots/stateSnapshot/versions của chương cũ lên server (worker không dùng). Khi hợp nhất kết quả job, client khôi phục các trường này từ bản local (khớp theo vị trí + tiêu đề) nên không mất lịch sử snapshot/phiên bản.
- Nếu payload vẫn > 5 MB: báo lỗi rõ ngay tại client (kèm 3 khóa nặng nhất) thay vì gửi rồi nhận HTTP 400.
- Test mới: tests/e2e_bg_slim.py (7 ca).

# V12.23 – Từ báo cáo job: tiếng Anh lẫn vào truyện + mở rộng cuối bị bỏ
- Xóa câu/đoạn tiếng Anh do model "nghĩ to" lẫn giữa truyện (removeEnglishLeaks trong shared/core.js, gắn vào stripForeign nên client + worker đều dùng). Chỉ xóa khi đoạn/câu gần như không có dấu tiếng Việt và chứa ≥ 3 từ khóa tiếng Anh; không đụng lời thoại ngắn hay từ mượn. Worker ghi "Đã xóa N câu/đoạn tiếng Anh…" vào cảnh báo.
- Worker: vòng viết tiếp dừng sớm (khi chương ≥ 60% mục tiêu) nếu thời gian còn dưới 270s để chừa chỗ cho bước mở rộng cuối; bước mở rộng cuối cần ≥ 150s còn lại (trước đây ngưỡng 90s quá thấp so với thời gian thực của 1 lần viết lại cả chương nên luôn bị bỏ qua). Thông báo bỏ qua nay ghi rõ số giây còn lại.

# V12.23 – Viết nền GIỐNG viết thường
- Prompt viết chương chính được tách thành hàm buildMainWritePrompt (index.html) — viết thường gọi hàm này; viết nền cũng gọi đúng hàm đó (proseOnly: không đòi TIÊU ĐỀ/NỘI DUNG vì tên chương do hệ thống tạo).
- Cơ chế mới: scripts/sync-shared.js sao NGUYÊN VĂN 23 hàm dựng ngữ cảnh/prompt từ index.html vào worker (khối CLIENT-MIRROR, nguồn sự thật = index.html). Sửa các hàm đó ở index.html rồi chạy `node scripts/sync-shared.js` (test sync-check sẽ báo lệch nếu quên).
- Worker nay dùng: buildContextBlock (story bible, style, arc, outline, thẻ nhân vật, địa điểm, vật phẩm, threads, foreshadowing, timeline, kiến thức nhân vật, lịch sử cảnh...), buildRecentBlocks, bước lập KẾ HOẠCH CHƯƠNG bằng AI (buildChapterPlanPrompt; cần còn ≥150s), và các quy tắc của viết thường (ngân sách sự kiện, nhân vật phụ, chống lặp, bố cục đoạn ngắn, miêu tả...).
- Tham số lấy mẫu lượt viết chính = viết thường: temperature 0.85, frequency_penalty 0.25/0.45, presence_penalty 0.25/0.35 (18+/thường).
- Giữ lại 2 điểm chỉ có ở viết nền: "cú chốt" Ending Anchor ở cuối prompt, và rào chắn tuổi khi 18+ mà chưa bật mature.
- Worker tự bổ sung các danh sách còn thiếu của truyện (arcs, outlinePlans, locations...) trước khi dùng code của viết thường.
- Test mới: tests/worker.mirror.test.js. Test cũ cập nhật marker nhận diện lượt viết chính ("Bạn đang viết CHƯƠNG THỨ") và bỏ qua lượt lập kế hoạch.
- CÒN KHÁC: vòng viết tiếp/chèn/mở rộng cuối vẫn là 2 đoạn code riêng (đã chỉnh cùng quy tắc); viết nền có quản lý thời gian 13,5 phút; viết thường có streaming.
