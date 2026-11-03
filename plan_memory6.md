# Kế hoạch — Bộ nhớ sáu tầng và kiểm soát liên tục truyện dài

## Mục tiêu

Tiếp tục phát triển app Xưởng Truyện AI hiện tại (V14.5.15 + kiểm thử E2E pipeline scene vừa bổ sung), giữ tương thích dữ liệu truyện cũ và ưu tiên trải nghiệm trình duyệt/iPhone. Thêm bộ nhớ dài hạn L0–L5, hồ sơ thế lực, theo dõi thời gian/tình tiết mở, kiểm tra sau khi viết và mở rộng/rút gọn chương trong giới hạn chữ do tác giả đặt.

## Hiện trạng đã xác nhận

- `index.html` chứa phần lớn UI, IndexedDB persistence, luồng viết, hậu kỳ, kiểm tra chất lượng, time log, timeline, threads, foreshadowing, knowledge ledger và kiểm soát độ dài.
- `shared/core.js` là nguồn dùng chung cho prompt, kiểm tra/chỉnh sửa và adaptive scene pipeline; `scripts/sync-shared.js` đồng bộ khối dùng chung vào client/worker.
- `app/features.js` là module thường cho UI tính năng bổ sung (canon diff, gợi ý hồ sơ, health/consistency report).
- App đã có hồ sơ nhân vật, địa điểm và vật phẩm; chưa có bộ sưu tập/hồ sơ thế lực tương đương. `chapter.summary` là tóm tắt chương hiện tại nhưng chưa hình thành chuỗi phân cấp L2–L5 có ranh giới và quy tắc đóng băng.
- Backup/restore lưu story state; các trường mới phải đi qua cùng cơ chế persistence, export/import và merge job nền.

## Thiết kế dữ liệu và hành vi

1. **Bộ nhớ L0–L5**
   - L0: nội dung chương đã lưu (`chapters[].text`), không nhân bản thành một bản tóm tắt thay thế.
   - L1: summary của từng chương (tóm tắt hiện có; bổ sung metadata chương và chính sách không tự ghi đè khi đã đóng băng).
   - L2: tóm tắt chunk mặc định 4 chương, chỉ sinh từ các L1 thuộc chunk.
   - L3: tóm tắt arc mặc định 5 chunk/20 chương, chỉ sinh từ các L2 thuộc arc.
   - L4: tóm tắt volume mặc định 3 arc/60 chương, chỉ sinh từ các L3 thuộc volume.
   - L5: tóm tắt toàn truyện sinh từ các L4; khi tái tạo phải lưu phiên bản trước vào lịch sử.
   - Lưu trong story state có version/schema, phạm vi chương, nguồn, thời điểm, trạng thái (pending/ready/failed/frozen); mặc định không tự sửa L1–L4 đã đóng băng. Cho phép xây bù/backfill các tầng còn thiếu cho truyện cũ bằng hành động rõ ràng, không làm mất dữ liệu.
   - Quy tắc ranh giới 4/20/60 là mặc định; các cấu hình sẽ được lưu cùng truyện và phân tầng ổn định theo chỉ số chương, tránh phân nhóm thay đổi âm thầm khi user chỉnh cấu hình.

2. **Hồ sơ thực thể**
   - Giữ mô hình hiện hữu cho characters, locations, items; bổ sung organizations/factions theo cùng pattern ID, tên, mô tả, trạng thái, lần đầu/cuối xuất hiện và lịch sử thay đổi.
   - Thêm CRUD, tìm/lọc và tham chiếu thế lực trong hồ sơ nhân vật, context prompt, hậu kỳ và backup/restore.
   - Không chuyển đổi hay xóa các bản ghi truyện cũ; trường mới mặc định là mảng rỗng.

3. **Tình tiết, thời gian và việc chưa giải quyết**
   - Tiếp tục dùng `timeline`, `threads`, `foreshadowing`, `storyClock`/`timeLog`; chuẩn hóa ngày truyện/số ngày (nếu có), chương nguồn, liên quan thực thể, nguyên nhân/hệ quả và trạng thái.
   - Làm rõ trạng thái việc mở: seeded/developing/blocked/resolved/paid_off/abandoned; ghi `lastUpdated`, `nextExpectedPayoff` tùy chọn và bằng chứng/chương khởi tạo.
   - Đưa phần còn mở, mốc thời gian gần và sự kiện liên quan vào context có giới hạn token; bảo đảm chỉ là bối cảnh liên tục, không bắt buộc phải đẩy mọi thread trong từng chương.
   - Cho phép tác giả sửa trạng thái thủ công và xem lịch sử thay đổi; kết quả AI chỉ được áp dụng khi có dữ liệu hợp lệ, không được đóng các mục đã kết thúc trở lại.

4. **Kiểm tra sau khi viết**
   - Giữ Quality Gate hiện có; bổ sung báo cáo hậu kiểm gọn, chia lỗi cứng/cảnh báo, gồm: giới hạn chữ, mâu thuẫn timeline, trạng thái/thread/foreshadowing, thực thể/cast và continuity theo dữ liệu đã lưu.
   - Dùng kiểm tra code cho các điều kiện xác định; phần diễn giải phức tạp dùng AI theo cơ chế hậu kỳ hiện có. Lưu kết quả cùng chapter để tác giả xem lại, không biến lỗi mềm hoặc lỗi API thành mất chương.
   - Hiển thị cảnh báo có liên kết đến chương/thực thể liên quan; không tự đổi canon khi không có bằng chứng.

5. **Giới hạn chữ và mở rộng/rút gọn**
   - Bổ sung cấu hình min/max chữ mỗi chương, kiểm tra `min <= max`, lưu theo truyện; giữ giá trị tương thích cho truyện cũ bằng cách kế thừa cấu hình hiện hành (mục tiêu + dung sai/hard cap) cho tới khi tác giả chỉnh rõ min/max.
   - Sau khi viết: nằm trong khoảng thì qua cổng độ dài; thiếu thì gọi luồng mở rộng hiện có theo đoạn/scene, giữ Outline, canon, thứ tự và ending anchor; thừa thì gọi luồng rút gọn cục bộ theo scene/đoạn, giữ sự kiện bắt buộc và ending anchor.
   - Mỗi lần chỉnh tạo version snapshot; giới hạn tối đa 2 vòng mở rộng/rút gọn tự động, đếm lại bằng cùng một hàm. Nếu vẫn ngoài khoảng hoặc API lỗi, giữ bản tốt nhất, báo rõ trạng thái và không lặng lẽ cắt nội dung bắt buộc. Hard cap hiện tại chỉ là an toàn cuối cùng và phải được báo trong review.

## Cấu trúc dự kiến

- `index.html`: state migration/defaults, UI thiết lập min/max, panel bộ nhớ L0–L5, danh sách hồ sơ thế lực, timeline/thread viewer, lời gọi orchestration sau viết.
- `shared/core.js`: hàm thuần chuẩn hóa dữ liệu tầng nhớ, nhóm chương theo chunk/arc/volume, chọn context theo tầng, kiểm tra giới hạn, và tạo prompt rút gọn có bảo toàn scene/contract; sau sửa chạy `npm run sync`.
- `app/features.js` + `app/app.css`: panel quản lý bộ nhớ/thế lực và báo cáo continuity; dùng style/interaction hiện hành, ưu tiên bố cục mobile.
- `tests/`: unit tests cho grouping/freeze/migration/validation/length; E2E Playwright cho tạo chương → mở rộng hoặc rút gọn → kiểm tra dữ liệu lưu, đồng bộ và backup.
- `TODO.md`, `CHANGELOG.md`, README: phản ánh hành vi mới và ranh giới hỗ trợ. Giữ kiến trúc Netlify/client hiện có, không chuyển stack hay dịch vụ lưu trữ.

## Trình tự triển khai

1. Viết test trước cho hàm nhóm L0–L5, freeze/versioning và ranh giới min/max; sau đó triển khai logic thuần trong shared core và đồng bộ.
2. Thêm schema có version/migration không phá dữ liệu cũ, export/restore/merge và entity organizations.
3. Nối tầng nhớ vào context viết, hậu kỳ và retrieval; thêm quản lý timeline/threads/foreshadowing.
4. Nối cổng độ dài sau viết với mở rộng hiện có và rút gọn theo scene/đoạn có snapshot/rollback.
5. Bổ sung UI mobile, cập nhật tài liệu, chạy toàn bộ unit/integration/E2E hiện có.

## Phạm vi ngoài kế hoạch

Không đổi nhà cung cấp AI, không yêu cầu backend/RAG/vector database mới, không thay đổi các chương đã lưu hay tự viết nội dung truyện người dùng. Dữ liệu mới tiếp tục thuộc story state hiện có và backup do người dùng kiểm soát.
