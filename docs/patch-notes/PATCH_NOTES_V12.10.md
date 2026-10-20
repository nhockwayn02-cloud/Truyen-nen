# V12.10
- Tóm tắt chương: 300-400 từ (trước 350-550), 4-5 đoạn, maxTokens 3500 -> 1400.
- Nếu vẫn >450 từ: tự gọi 1 lần để rút gọn, sau đó cắt cứng theo câu (cả client và worker nền).
- Chống lẫn ngoại ngữ: mở rộng dò thêm chữ Thái/Ả Rập/Hindi; thêm stripForeign() dọn chữ ngoại còn sót sau khi viết (client + worker nền), đổi dấu câu full-width sang dấu thường.
- Character Database: (1) prompt chỉ khóa NV có [KHÓA HỒ SƠ GỐC], NV đã mở khóa được bổ sung appearance/personality/goals; (2) AI nhận hồ sơ hiện có của NV mở khóa để chỉ thêm điểm mới; (3) nới độ dài trường 25 -> 30-60 từ (worker); (4) cộng dồn không còn cắt mất phần mới khi đầy (bỏ đoạn cũ nhất, giới hạn 2500), bỏ đoạn trùng ý; (5) mở khóa thì coreIdentity đồng bộ theo bản mới.
- Tóm tắt chống bịa: prompt viết lại (văn bản chương đặt TRƯỚC, luật ngắn, không còn từ mồi kiểu lệnh/quyền lực/hợp đồng); chỉ đưa AI tên NV có thật trong chương; kiểm tra tên và độ trùng từ với chương, sai thì gọi lại 1 lần kèm danh sách tên bị cấm, vẫn sai thì dùng bản trích tự động từ văn bản (client + worker nền).
