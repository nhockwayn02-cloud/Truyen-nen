# Xưởng Truyện AI

Ứng dụng viết truyện tiểu thuyết bằng AI, chạy trên trình duyệt (dùng tốt trên iPhone), kèm worker nền trên Netlify.
**Bản hiện tại: V12.46.1.** Lịch sử thay đổi đầy đủ: [`CHANGELOG.md`](CHANGELOG.md).

V12.34 bổ sung sửa beat mục tiêu: khi thiếu một sự kiện bắt buộc, AI có thể chèn cảnh ngay trước đoạn kết mà không cần viết lại toàn bộ chương dài.

V12.35 bổ sung Beat Ledger: kế hoạch đánh mã từng beat, AI phải viết đủ bằng chứng cho từng beat, sau đó Quality Gate kiểm tra từng beat trước khi chấp nhận chương.

V12.36 bổ sung Best Draft Guard: nếu một vòng tự sửa làm điểm giảm, app tự khôi phục bản có chất lượng tốt hơn thay vì giữ bản sửa cuối.

V12.37 bổ sung Gender Anatomy Lock: truyền giới tính từng nhân vật vào hồ sơ khóa và chặn lỗi gán nhầm đặc điểm sinh học giữa nhân vật nam/nữ.

V12.38 bổ sung Tình trạng hôn nhân và người phối ngẫu/người yêu cho nhân vật chính và NPC; dữ liệu được truyền vào prompt và khóa khỏi thay đổi tùy tiện.

V12.39 bổ sung Canon Barrier: chương SOFT_FAIL không còn tự động trở thành nền sự thật cho chương sau nếu chưa được người dùng duyệt; Beat Ledger cũng phân biệt beat bắt buộc `[R]` với beat hỗ trợ `[S]` do AI đề xuất.

V12.40 giữ tối đa 3 sự kiện trục chính nhưng cho phép biến cố lớn lồng bên trong một sự kiện khi có quan hệ nhân-quả trực tiếp và thật sự cần; AI không được tự thêm biến cố chỉ để kéo dài chương.

V12.41 bổ sung AutoFix Retry cho Required Beat bị thiếu và Patch Trace để hiển thị AI đã sửa ở đâu, bao nhiêu thao tác, hoặc vì sao patch không ghép được.

V12.42 bảo vệ Chapter Plan khỏi phản hồi bị cắt: ô hiển thị có thanh cuộn, còn AI sẽ tự retry nếu kế hoạch bị dừng do giới hạn token.

V12.43 bổ sung Required Beat Barrier. Khi bật, chương còn thiếu `[R]` sẽ không được Manual Override, Sync Canon hoặc xuất bản TXT/MD/DOC. Đây là khóa mặc định để lỗi Outline không trở thành Canon.

V12.44 sửa luồng E2E và Background Postprocess: cảnh báo server được hiển thị đúng, lỗi mã truy cập có thông báo thân thiện, payload slim và snapshot được kiểm tra đúng theo luồng hiện hành.

V12.45 bổ sung **Targeted Segment Repair**: khi bấm **AI tự sửa** trên chương dài, nếu vá câu neo không ghép được thì app tự xác định một vùng nhỏ chứa lỗi và chỉ viết lại vùng đó, thay vì cố viết lại toàn bộ chương vượt giới hạn token.

V12.46 bổ sung **Semantic Prose Check**: rà từng câu để tìm cụm tiếng Việt vô nghĩa theo ngữ cảnh. App chỉ tự thay cụm khi AI xác nhận chắc chắn và trả đúng cụm nguyên văn; trường hợp chưa chắc chỉ hiện cảnh báo để người dùng quyết định.

V12.46.1 sửa luồng **AI tự sửa**: cảnh báo Canon/continuity/Beat có hướng xử lý không còn bị bỏ qua chỉ vì điểm tổng vẫn là `PASS`; app sẽ gửi chúng vào patch hoặc Targeted Segment Repair rồi chấm lại.

V12.33 bổ sung age gate 18+, kiểm tra cấu hình bảo mật deployment, hardened background mode (`REQUIRE_HARDENED_SECURITY=1`), Chế độ đơn giản/Chuyên gia, wizard bắt đầu truyện và thanh tiến trình viết.

## Cấu trúc
| Thành phần | Vai trò |
|---|---|
| `index.html` | Toàn bộ giao diện + logic phía trình duyệt (1 file). Có khối `SHARED-CORE` tự sinh. |
| `netlify/functions/create-job.js`, `job-status.js` | Tạo job viết nền / hỏi trạng thái job. |
| `netlify/functions/write-chapter-background.js` | Worker nền: viết chương, Quality Gate, hậu kỳ. Cũng có khối `SHARED-CORE`. |
| `shared/core.js` | Nguồn duy nhất cho logic dùng chung (Quality Gate, vá cục bộ, chèn đoạn, canon…). |
| `lib/security.js` | Mã truy cập, mã hóa API key, chặn endpoint nội bộ. |
| `tests/` | Test đơn vị/tích hợp (Node) và E2E trình duyệt (Playwright, tùy chọn). |
| `docs/` | `ARCHITECTURE.md` (Memory Engine, lớp dữ liệu, backup, iPhone — README cũ) và `PROMPT_V12.22.md`. |

## Triển khai (GitHub + Netlify)
1. Đưa repo lên GitHub, nối với Netlify (hoặc kéo thả thư mục). `netlify.toml` đã cấu hình sẵn.
2. Đặt biến môi trường theo [`SECURITY_SETUP.md`](SECURITY_SETUP.md): `APP_PASSCODE`, `JOB_SECRET`, `ALLOWED_ORIGIN` (nên có cả ba).
3. Chế độ viết nền cần gói Netlify hỗ trợ Background Functions.
4. `netlify.toml` chặn truy cập công khai vào `tests/`, `netlify/`, `shared/`, `lib/`, `scripts/`, `docs/` và các file cấu hình/tài liệu gốc. Sau khi deploy, thử mở `/tests/core.test.js` — phải ra 404.

## Luồng viết một chương
1. **Viết** theo từng đoạn (thời gian chảy tự nhiên theo mạch kể, không nhãn ngày giờ đầu/cuối chương), tự nối tiếp tới khi đủ số từ và tới điểm kết (Ending Anchor).
2. **Mở rộng cuối** nếu còn thiếu từ: AI chỉ viết các đoạn mới + chỗ chèn, app ghép vào (không viết lại cả chương).
3. **Quality Gate:** chấm → vá cục bộ → chấm lại, tối đa 5 vòng. Chỉ còn cảnh báo nhẹ (không có lỗi nặng) thì duyệt kèm cảnh báo.
4. **Hậu kỳ gộp:** một phản hồi JSON cho tóm tắt, nhân vật, thế giới, status, gợi ý chương sau; rồi **Sync Canon**.

Chương "🟠 Cần sửa": bấm **🛠 AI tự sửa** (tự vá rồi chấm lại), hoặc sửa tay theo khung Quality rồi **🔍 Duyệt lại**. Bản cũ luôn được lưu trong lịch sử phiên bản.

## Giới hạn cần biết
- Mỗi lần gọi AI trả tối đa ~7800 token (`AI_MAX_OUTPUT_TOKENS`). Chương dài không thể "viết lại toàn bộ" trong một lần, nên mọi bước sửa/mở rộng đều làm theo từng đoạn.
- Chất lượng chấm của AI không cố định giữa các lần; lỗi nặng mới làm chương trượt, cảnh báo thì không.

## Phát triển
- `npm run sync` — chép `shared/core.js` vào khối `SHARED-CORE` của `index.html` và worker. **Không sửa tay khối này.**
- `npm test` — chạy toàn bộ test. E2E cần `pip install playwright && playwright install chromium`.
- Thêm tính năng mới: sửa `shared/core.js` (nếu dùng chung) → `npm run sync` → thêm test trong `tests/` → ghi vào `CHANGELOG.md`.
