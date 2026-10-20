# V12.19 — Không báo nhầm tượng thanh là "từ lạ"
- findStrayWords bỏ qua tiếng cười/hét/thở viết không dấu: Aaaa, hahaha, hihi, hehe, huhuhu, kekeke, hmmm, shhh, psst, ahhh...
- Từ tiếng Anh thật (afternoon, Somewhere, until...) vẫn bị báo như cũ.
- Sửa ở shared/core.js, đã sync sang index.html và write-chapter-background.js. Thêm test.
- Thêm từ mượn thường gặp vào danh sách hợp lệ: vest, sofa, mascara, vecni, Chanel, Lelo, Gucci, Dior... (please, Splat vẫn bị báo vì là tiếng Anh thật).

## Cảnh 18+: dẫn vào / sau cảnh bị ngắn
- EROTIC_STYLE_PROMPT (client + worker) thêm "NHỊP CẢNH 3 PHẦN": dẫn vào (~25%) – diễn biến/cao trào (~50%) – sau cảnh (~25%), mỗi phần đoạn văn riêng.
- Gợi ý chương sau khi là 18+: dài hơn (Chi tiết 600–850 từ, Gọn 230–380) và bắt buộc tách 3 phần dẫn vào / diễn biến / sau cảnh.
- Nhận diện 18+ để chuyển sang model 18+ quét 24.000 ký tự cuối thay vì 6.000.

## Khóa địa điểm mở chương
- Prompt viết chương (client + worker): có khối "ĐOẠN KẾT CHƯƠNG TRƯỚC" + quy tắc KHÓA CỨNG địa điểm/thời điểm/người có mặt ở cảnh mở đầu.
- Gợi ý chương sau (client + worker): nhịp mở chương phải cùng địa điểm với đoạn kết; chuyển địa điểm phải ghi rõ.
- Quality Auditor nhận thêm đoạn kết chương trước; mở chương lệch địa điểm mà không chuyển cảnh = hard failure (kích hoạt viết lại có mục tiêu).
- Worker: gợi ý 18+ cũng có nhịp 3 phần và nhiều token hơn.
- Nhịp 3 phần chỉ là mặc định: gợi ý/mệnh lệnh người dùng chỉ nêu 1–2 phần thì chỉ viết các phần đó.

## Nghề/chức vụ nhân vật không tự đổi (thư ký -> giám đốc)
- Hồ sơ nhân vật gửi cho AI cập nhật nay kèm "nghề/chức vụ GỐC (giữ nguyên)" cho MỌI nhân vật (trước đây NV khóa không được hiện hồ sơ nên AI tự suy).
- Prompt thêm quy tắc: không suy nghề từ cách xưng hô/làm việc với sếp; chỉ đổi khi chương kể rõ thăng chức/bổ nhiệm.
- role/occupation/position/faction đã có giá trị chỉ đổi khi explicitCoreChange=true và changeEvidence trích đúng từ chương (>=70% từ có trong chương). Áp dụng cả NV đã mở khóa; client + worker.

## Hồ sơ nhân vật: trường trống được điền (giới tính, tuổi, nghề...)
- Trước: AI không được hỏi tuổi/giới tính/chức vụ/tóc/mắt... (không có trong schema) và khóa hồ sơ gốc chặn CẢ việc điền trường còn trống (kể cả NV AI mới tạo, vì mặc định coreLocked=true).
- Nay: schema thêm age, gender, position, speech, height, bodyType, hair, eyes, skin; mỗi NV kèm mục "CHƯA CÓ" để AI điền; khóa chỉ chặn GHI ĐÈ giá trị đã có. Đặc điểm thân thể ổn định chỉ điền khi trống.

## Rà soát toàn bộ hồ sơ nhân vật: trường hiển thị nhưng AI không bao giờ cập nhật
- Thêm vào schema + merge (client & worker): speech (cách nói riêng), strength (điểm mạnh), independentPlot (tuyến truyện riêng, cộng dồn), voice/scent/style/scars/tattoos (điền khi trống), schedule, và nhóm 18+ (sexualExperience, boundaries, taboos, preferences, attractionToMC, tensionWithMC, consentNotes — cộng dồn).
- Quan hệ: thêm respect, affection, attraction, suspicion, tension, boundaries cho cả quan hệ với NVC và quan hệ NV-NV. Bản worker trước đây bỏ sót hoàn toàn relationshipWithMain.
- Rào chắn tuổi: NV dưới 18 (hoặc tuổi không rõ -> vẫn ghi như cũ) không ghi trường 18+ và attraction/boundaries.
- Hồ sơ Nhân Vật Chính do người dùng sở hữu: AI chỉ cập nhật vị trí/thể trạng/tinh thần/bí mật (giữ nguyên thiết kế cũ).

## Xóa chương kèm bộ nhớ
- Trước: chỉ khi xóa CHƯƠNG CUỐI (và chương trước có snapshot) thì bộ nhớ mới rollback; xóa chương giữa không đụng tới nhân vật/địa điểm/vật phẩm sinh ra từ chương đó, số chương của địa điểm/vật phẩm cũng không được đánh lại.
- Nay: (khi bật "Xoá kèm bộ nhớ") xóa các NV / địa điểm / vật phẩm xuất hiện lần đầu ở chương bị xóa và không xuất hiện ở chương nào sau; giữ mục được dùng lại ở chương sau; đánh lại số chương; dọn quan hệ/tracker trỏ tới NV đã xóa; dọn khỏi snapshot các chương còn lại (để xóa chương cuối sau này không "sống lại"). NV thêm tay (không có chương xuất hiện đầu) không bị xóa.
- Thêm test tests/e2e_delete.py.

## Viết lại gợi ý theo ý người dùng
- Thêm nút "✍️ Viết lại gợi ý theo ý tôi": gõ ý tưởng (ngắn cũng được) vào ô "Gợi ý chương sau" rồi bấm; AI viết lại thành gợi ý đầy đủ, bám đúng chi tiết/thứ tự/mốc kết chương của bạn, chỉ bổ sung nhịp nối. Có nút "↩ Khôi phục" để quay lại bản bạn gõ.
- Ý tưởng 18+ cũng được tự chuyển sang model 18+; trần độ dài tự nới theo độ dài ý tưởng.
- Nút "Tạo lại gợi ý chương sau" cũ vẫn tạo mới hoàn toàn từ chương vừa viết.
