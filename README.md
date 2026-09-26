# Muses V8 Professional — Vietnamese Long-form Novel Engine

Muses V8 nâng cấp phần nền tảng và quy trình continuity theo yêu cầu.

## V8 bổ sung (bản này)
- **Lưu trữ đổi sang IndexedDB** (`muses_idb`, các object store `projects`/`meta`/`backups`), thay cho `localStorage` (giới hạn ~5–10MB). Dữ liệu cũ trong `localStorage` (`muses_v5`) được tự động migrate làm dự án đầu tiên khi mở bản V8 lần đầu, sau đó bị xóa khỏi `localStorage`.
- **Đa dự án**: bộ chọn dự án ở sidebar (➕ Tạo mới / 🗑️ Xóa dự án hiện tại), mỗi dự án là một bản ghi riêng trong IndexedDB, chuyển qua lại không mất dữ liệu.
- **Auto-backup định kỳ nội bộ**: mỗi ~10 phút có thay đổi (và ngay sau khi lưu chương), Muses tự chụp snapshot toàn bộ dự án vào IndexedDB (giữ 15 bản gần nhất/dự án), xem & khôi phục ở Dashboard → "📦 Backup nội bộ tự động". Đây không thay thế Backup JSON thủ công.
- **Nhắc Backup JSON**: Dashboard hiển thị cảnh báo nếu chưa từng Backup JSON hoặc đã quá 3 ngày kể từ lần Backup gần nhất.
- **Canon Graph dạng sơ đồ trực quan** (SVG, bố cục hình tròn, node theo màu loại, mũi tên quan hệ) bên cạnh bảng cũ, tự vẽ lại khi thêm/xóa node hay quan hệ.
- **Khóa canon node (🔒)** + **cảnh báo xung đột tự động** (heuristic cục bộ dựa trên cặp từ trái nghĩa thường gặp — còn sống/đã chết, yêu/ghét, tin tưởng/phản bội, tuổi...): kích hoạt khi sửa tay nhân vật (Trang Nhân vật) và khi duyệt đề xuất continuity. Đây là lưới an toàn cục bộ, không thay thế Continuity Checker của AI.
- **Ghi chú chung của dự án được đưa thẳng vào context AI** như một phần cốt truyện/canon (đã có `project.notes` trong context cũ, nay được nêu rõ ràng trong mọi prompt outline/write/continuity/extract-memory).
- **Quy trình duyệt continuity mới (trọng tâm của bản này)**: sau khi lưu/cập nhật một chương, AI tự đọc lại chương đó và đề xuất — chứ KHÔNG tự áp dụng — các thay đổi cho **Character State**, **Canon**, **Timeline** và **Plot Thread** ở trang mới "🔎 Duyệt thay đổi" (có badge đếm số đề xuất đang chờ). Mỗi mục có checkbox (mặc định tick sẵn trừ khi phát hiện mâu thuẫn canon đã khóa — mục đó mặc định bỏ tick để bạn tự cân nhắc), hiển thị giá trị cũ → mới, và chỉ khi bấm "✅ Áp dụng mục đã chọn" các mục được tick mới thật sự ghi vào Bible/Canon/Timeline/Plot Thread. "🗑️ Bỏ qua toàn bộ" hủy đề xuất mà không đổi dữ liệu chương.

## V7 bổ sung
- Continuity & Preflight Engine cục bộ trước khi lưu canon.
- Story Architecture: Book → Arc → Plot Thread → Chapter → Scene.
- Character Arc: Want / Need / Fear-Flaw-Belief / Change-Crisis-Resolution.
- Vietnamese Prose Lab heuristic: độ dài câu, từ lặp, cụm khuôn, dấu ngoặc hội thoại.
- Version History cho chương; cập nhật chương cũ tạo version thay vì nhân bản ngoài ý muốn.
- Foreshadowing Manager: setup → payoff, theo dõi trạng thái và cảnh báo treo lâu.
- API key thống nhất ở `muses_api_key`, vẫn chỉ nằm trong localStorage; hỗ trợ migrate key cũ.
- Backup JSON không chứa API key.
- Giữ Canon Graph, Character State, Context Retrieval và Diff Editor của V6.

## Kiến trúc vận hành
AI chỉ là proposal/editor. Canon thuộc về tác giả. Chỉ chương được tác giả lưu mới trở thành dữ liệu chính thức.

## Chạy
Mở `index.html` hoặc deploy thư mục lên GitHub Pages. Không cần Netlify, KV, database, queue hay backend riêng.

## Kiểm tra build
Bản V7 đã được kiểm tra syntax JavaScript, kiểm tra DOM bằng Chromium headless và kiểm thử các luồng local-first không cần API: khởi động, lưu draft, thêm canon, character state, architecture, prose check, backup/restore và version history.

## Cập nhật (bản Việt hóa + sửa lỗi)
- **Sửa lỗi nghiêm trọng**: 5 nút biên tập trong "Phòng Thí Nghiệm Văn Phong" (Làm mượt văn Việt, Sửa hội thoại, Kiểm tra nhịp, Lọc sáo/lặp, Soát continuity) trước đó luôn báo lỗi và không chạy được, do code tham chiếu nhầm biến `k` thay vì `kind`. Đã sửa.
- **Sửa lỗi**: hàm gọi AI không đọc được API key cũ lưu dưới tên `muses_v6_api_key` (chỉ đọc `muses_v5`/`muses_v3`), khiến một số người dùng nâng cấp từ bản cũ bị báo "Chưa có API key" dù đã nhập. Đã đồng bộ lại danh sách key.
- **Việt hóa toàn bộ giao diện còn sót tiếng Anh**: tiêu đề trang, menu bên trái, các trang Canon Graph / Character State / Context Engine / Diff Editor / Story Architecture / Prose Lab / Version History / Memory Engine, nhãn hồ sơ nhân vật, các lựa chọn loại node/trạng thái (Nhân vật, Địa điểm, Vật phẩm, Sự kiện, Phe phái, Bối cảnh, Bí mật, Canon/Tạm thời/Đã loại bỏ, Đang mở/Đã payoff...), tiêu đề bảng, nhãn loại memory, footer.
- Dữ liệu lưu trong trình duyệt (localStorage) của bạn **không bị ảnh hưởng**: các mã trạng thái nội bộ vẫn được lưu như cũ (CANON, RETIRED, OPEN...), chỉ phần hiển thị trên giao diện được dịch sang tiếng Việt, nên không lo mất hay lệch dữ liệu cũ khi mở bản này.
