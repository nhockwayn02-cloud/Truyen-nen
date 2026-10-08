# V12.20 — Sửa 3 lỗi viết chương (từ lỗi ghép, câu cuối cụt, bịa thêm sau gợi ý)

## 1. Từ lỗi kiểu "mươititude", "bọcampo", "bănnton"
- Nguyên nhân: model sinh nhầm token (nhiệt độ 0.82, không top_p). Bộ dò cũ chỉ bắt từ KHÔNG dấu nên các từ lỗi CÓ DẤU lọt hoàn toàn.
- findStrayWords nay kiểm tra cấu trúc âm tiết tiếng Việt (onset + nguyên âm + vần cuối) cho cả từ có dấu.
- Worker: tự sửa — gửi các CÂU chứa từ lỗi cho model, chỉ nhận câu sửa nếu bỏ được từ lỗi, độ dài gần câu gốc và giữ >=70% các từ còn lại (acceptWordFix). Tối đa 2 vòng, lỗi thì giữ nguyên văn bản.
- Viết văn: temperature 0.82 -> 0.7, thêm top_p 0.88 (và top_k 40 với OpenRouter).

## 2. Chương cụt giữa câu ("... Rồi cô")
- trimToWordLimit: cắt ở câu hoàn chỉnh gần nhất (ngưỡng 70% giới hạn, trước đây chỉ 180 từ cuối nên đoạn dài bị cắt cứng giữa câu).
- Cuối pipeline viết chương: nếu câu cuối chưa có dấu kết thúc -> nhờ model viết nốt 1–3 câu (closeDanglingEnding, biết "cú chốt" của bạn); thất bại -> lùi về câu hoàn chỉnh gần nhất.
- Bản Quality Gate viết lại cũng không được để cụt.

## 3. Viết thêm cái khác sau khi đã hết gợi ý / không bám gợi ý
- Nguyên nhân: bản nền thấy chưa đủ số từ mục tiêu (mặc định 5000) nên tự gọi "Viết TIẾP"; lệnh đó không chứa gợi ý và còn bảo "viết tiếp sang diễn biến kế tiếp" -> model hết ý nên bịa.
- Nay: có gợi ý/mệnh lệnh thì KHÔNG viết nối thêm ở cuối nữa (chỉ nối khi model bị cắt giữa chừng).
- Chương còn ngắn (<90% mục tiêu) -> MỞ RỘNG TẠI CHỖ THEO TỪNG ĐOẠN (expandChapterInPlace). Model không viết nổi ~4500 từ trong một lần (thường dừng ~3000; bản đầu viết cả chương một lần chỉ tăng 2867 -> 3121 từ nên bị loại), nên chương được chia thành các khối ~550 từ, mỗi khối có chỉ tiêu từ riêng (gốc x hệ số, tối đa x2.2), viết lại song song 3 khối/lượt. Giữ nguyên sự kiện/thứ tự/cú chốt, chỉ làm dày miêu tả, nội tâm, thoại.
- Khối nào không dài hơn >=12%, bị cắt, lạc đề hoặc (khối cuối) đổi đoạn kết thì giữ bản gốc của khối đó; khối làm vượt giới hạn từ cũng giữ bản gốc. Tối đa 2 lượt.
- Thêm 'alô, hello, okay, bye' vào từ mượn hợp lệ.
- Lệnh viết tiếp (khi cần) mang theo kế hoạch + "cú chốt" và dặn dừng ngay khi viết xong ý cuối.
- Prompt viết chương: thêm khối "KẾ HOẠCH CHƯƠNG — NGUỒN SỰ THẬT DUY NHẤT" đặt CUỐI prompt, luật: đúng thứ tự, không thêm sự kiện/nhân vật, ý cuối là điểm kết, câu cuối phải hoàn chỉnh. Dòng có "Cú chốt / Kết thúc chương / Kết chương..." được trích ra nhắc riêng.
- Dòng độ dài khi có gợi ý: mục tiêu chỉ mang tính tham khảo, không bịa thêm để đủ từ.

## Test
- tests/v12_20.test.js (14 test), đã đăng ký trong tests/run-all.js.
