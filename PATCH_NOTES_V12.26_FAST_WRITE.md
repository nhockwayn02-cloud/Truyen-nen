# V12.26 — Fast Write + Fast Settings

## Mục tiêu
- Chương được lưu và hiển thị ngay sau khi hoàn thành phần viết/Quality Gate.
- Canon/Character/Current Status/Memory/Snapshot/Next Chapter Hint chạy hậu kỳ nền, không giữ trạng thái “Đang viết” trong suốt hậu kỳ.
- Thiết lập được ghi vào IndexedDB store `storyMeta` riêng, nhỏ hơn nhiều so với bản ghi toàn bộ truyện.
- Bản ghi truyện đầy đủ vẫn được lưu debounce 1.75s để giữ tương thích backup/import hiện tại.
- Background Job Netlify hiện có tiếp tục được sử dụng; job được lưu trên Netlify Blobs nên không phụ thuộc tab iPhone đang mở.

## Luồng mới
`Viết → lưu chương → hiển thị → trả UI → hậu kỳ nền`

Thiết lập:
`đổi setting → ghi StoryMetaData nhỏ ngay → full story save debounce`

## An toàn
- Không xóa Character, Current Status, Memory, Snapshot, Knowledge Ledger hay các dữ liệu Canon.
- Chương mới được đánh dấu `SYNCING` trong lúc hậu kỳ; kiểm tra chuyển chương tiếp theo vẫn chặn cho tới khi Canon sync hoàn tất, tránh race condition.
- Export/full backup vẫn dùng record đầy đủ hiện tại.

## Kiểm thử
- Unit/integration: PASS.
- JS syntax: PASS.
- Shared client/worker sync: PASS.
- Browser E2E chưa chạy được trong môi trường build vì Playwright Chromium executable chưa được cài.
