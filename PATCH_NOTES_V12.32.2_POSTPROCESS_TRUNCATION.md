# V12.32.2 — Hậu kỳ nền không cập nhật nhưng vẫn báo "Đã đồng bộ"

## Nguyên nhân
- Hậu kỳ gộp bắt AI trả MỘT JSON chứa summary + toàn bộ nhân vật (~70 trường/người) + world + status + memory + continuity + gợi ý, với trần 7800 token. Chương dài (~5500 từ) gần như luôn vượt → `finish=length` → code hoàn tác TOÀN BỘ dữ liệu hậu kỳ.
- Dù hoàn tác, job vẫn ghi `postProcess.status="DONE"` / `completed`, và client luôn hiện "☁ Đã đồng bộ ... NV/World/Status/Scene đã hợp nhất" → báo thành công giả.

## Sửa
- Schema yêu cầu AI BỎ trường rỗng/không đổi, tối đa 12 nhân vật → phản hồi ngắn hơn nhiều.
- Nếu JSON gộp bị cắt/hỏng: tự chạy 3 nhóm nhỏ (summary+memory+continuity+hint / nhân vật / world+status). Nhóm nào lỗi chỉ nhóm đó giữ dữ liệu cũ. Lỗi API vẫn chỉ gọi 1 lần (không tốn thêm).
- Server ghi trạng thái thật: DONE / PARTIAL / FAILED (+ lý do, danh sách task chưa cập nhật); `job-status` trả `postProcessStatus/Error/Failed`.
- Client hiện cảnh báo ⚠ nêu rõ task nào chưa cập nhật thay vì "Đã đồng bộ".
- Test cập nhật + thêm test fallback theo nhóm.

## Bổ sung (cùng bản)
- Tiết kiệm token: prompt hậu kỳ chỉ gửi hồ sơ đầy đủ của nhân vật xuất hiện trong chương (tối đa 40) + danh sách tên các nhân vật khác; Current Status cũ 14000 → 8000 ký tự (4000 cho nhóm không cần). Mỗi nhóm fallback chỉ gửi phần nó cần (roster rút gọn, bỏ World/Status/đoạn cuối chương trước khi không dùng).
- Evidence: ngưỡng Status 0.55 → 0.35 (giá trị thường là diễn giải), characterChanges 0.4; ghi số mục bị loại do evidence không khớp vào ghi chú NV/Status.
- Client: khi người dùng viết thêm chương trong lúc hậu kỳ chạy, kết quả hậu kỳ (summary, continuityWarnings, postProcess, review...) vẫn được chép vào đúng chương N.

## V12.32.3 (tiết kiệm token Quality Gate)
- Kiểm tra continuity bằng AI (gửi cả chương) chỉ chạy ở vòng 1 của Gate; vòng 2+ chỉ chạy kiểm tra cứng.
- Ngữ cảnh Review 18000 → 9000 ký tự, Rewrite 15000 → 8000, nhưng bỏ trước các khối không liên quan (văn phong, mức miêu tả, độ khó, từ cấm/STYLE chỉ bỏ ở Review) và giữ phần cuối (Current Status) thay vì cắt cứng phần cuối như trước.

## V12.32.4 (Hồ sơ khóa — AI bám đúng thiết lập nhân vật)
- Prompt viết chương: thêm khối "HỒ SƠ KHÓA" (NVC + tối đa 8 nhân vật liên quan): nghề, vai trò, chức vụ/địa vị, phe, tuổi, năng lực, cách nói, tính, kiến thức, kèm luật chung: không tự nâng/hạ cấp quyền lực-tài sản-năng lực, lời thoại phải hợp địa vị, chỉ vượt hồ sơ khi có sự kiện rõ trong chương + brief cho phép, mục hồ sơ trống thì không bịa chi tiết quan trọng. Các lượt auto-continue/chèn diễn biến/chốt kết dùng bản rút gọn.
- Siết câu "ĐƯỢC TỰ DO": không áp dụng cho địa vị/nghề/quyền hạn/tài sản/năng lực/tuổi/kiến thức/cách nói.
- Quality Review: thêm `profileViolation` + `profileViolations`; vi phạm = HARD_FAIL (kích hoạt viết lại). Chỉ báo khi có câu cụ thể trái hồ sơ. Review/Rewrite nhận hồ sơ của nhân vật có mặt trong bản thảo.

## V12.32.5 (chống dậm chân + liền lạc)
- Luật TIẾN TRIỂN BẮT BUỘC trong prompt viết (và lượt viết tiếp/chèn diễn biến): cuối chương phải đổi ít nhất một điều; cấm lặp hành động/miêu tả để kéo dài; PRIMARY: cảnh trưởng thành chỉ ~1/2–2/3 chương, phải làm đổi quan hệ/quyền lực/bí mật/hậu quả và mở bước kế tiếp. storyControl và matureFocus PRIMARY cũng được bổ sung.
- Kế hoạch chương: thêm mục 7b "THAY ĐỔI/TIẾN TRIỂN" và mục 8 yêu cầu nêu cảnh nóng làm đổi điều gì.
- Quality Gate: cờ `stagnation` (+`stagnationNotes`) = lỗi nặng → viết lại; chỉ báo khi cuối chương gần như không đổi hoặc cảnh lặp để kéo dài.
- Trí nhớ truyện: khối "TRUYỆN ĐẾN NAY" (1–2 câu mỗi chương cũ, ≤~2800 ký tự, chỉ lấy chương trước chương đang viết khi viết lại) + "ĐANG DANG DỞ" (unresolved/conflict/nextGoal/nextHooks từ Current Status).

## V12.32.6b/c (văn xuôi thuần tiếng Việt)
- `cleanProseArtifacts` (chạy trong mọi đường viết qua `stripForeign`): Unicode NFC, Ð→Đ, bỏ HTML/markdown/emoji, bỏ nhãn rò rỉ "(tiếng Anh/Trung/Việt…)" (đoạn có ≥2 nhãn bị bỏ), bỏ dòng meta của AI (Ghi chú/Lưu ý/(Còn tiếp)… ở đầu dòng, không đụng lời thoại), chuẩn dấu câu bất thường, chặn lặp ký tự/từ thoái hóa, bỏ dòng trùng liền kề.
- `formatParagraphs`: nối dòng bị ngắt cứng giữa câu, không tách ở viết tắt (TP. TS. Mr. N.V.A…), bỏ đoạn rác/trùng, nối mảnh vụn chưa kết thúc.
- Nút "¶ Chuẩn hóa" (trước là "Ngắt đoạn"): làm sạch → bỏ cảnh viết lặp → ngắt đoạn → báo số ký tự đã dọn → kiểm tra từ lạ (AI sửa, rồi hỏi xóa hẳn các từ còn lại, khớp nguyên từ).

## V12.32.7 — Thời gian truyện (chống "10 chương vẫn một ngày")
- Mốc thời gian tự cập nhật: hậu kỳ ghi `statusState.currentState.time` + `timeLog` theo chương; nếu ô Story Clock trống, prompt dùng mốc này ("THỜI ĐIỂM").
- Story Control có mục THỜI GIAN TRUYỆN: chương phải nêu mốc thời gian, cho phép nhảy thời gian khi sự kiện trước đã khép trọn, tiến triển theo thời gian.
- Ô chọn "Nhịp thời gian giữa các chương" (Tự do / cùng ngày / 1 ngày / vài ngày / 1 tuần) — mặc định Tự do.
- Phát hiện ≥3 chương liên tiếp cùng mốc thời gian → prompt ép chương sau chuyển sang mốc sau.
- Kế hoạch chương có mốc thời gian từng beat; prompt viết bỏ ràng buộc "nối từng giây"; gợi ý chương sau cho phép nhảy thời gian.
- Gate: cờ mềm `timeStagnation` (chỉ cảnh báo, không chặn).

## V12.32.8 — Neo ngoại hình + số đo cụ thể
- Trường mới `measurements` (Số đo / kích thước cơ thể) cho nhân vật chính (ô nhập) và NV phụ (bảng hồ sơ); hậu kỳ trích/điền khi trống, không ghi đè khi đã có.
- Prompt viết chương: NEO NGOẠI HÌNH — tả 2–4 câu khi xuất hiện lần đầu, cấm tính từ trống ("to", "đầy đặn") nếu không kèm kích thước/so sánh; hồ sơ trống thì tự đặt và giữ nhất quán. Cảnh 18+: nêu kích thước cụ thể cho nhân vật đủ 18 tuổi; dưới 18/không rõ tuổi thì không tả số đo.
- Hồ sơ khóa: ngoại lệ cho ngoại hình trống (được tự đặt).
- Gate: cờ mềm `appearanceVague` (chỉ cảnh báo).

## V12.32.9 — Chuyển cảnh & người có mặt
- Story Control có mục CẢNH & NGƯỜI CÓ MẶT: người vào/rời cảnh phải có câu chuyển; người đã rời không được nói tiếp; chuyển địa điểm/thời điểm phải có câu chuyển cảnh.
- Kế hoạch chương: mỗi beat ghi địa điểm | ai có mặt | ai vào | ai rời.
- Gate: cờ cứng `sceneViolation` (nhân vật nói/hành động khi không có mặt, lẫn cảnh) -> HARD_FAIL -> viết lại.
- Làm sạch: `{phương án tài chính}` -> giữ chữ, bỏ ngoặc nhọn.
