# Kế hoạch V14 — Contract-First Complete Chapter Pipeline

> **Trạng thái:** Kế hoạch đã triển khai đến V14.0.20. Các mục bên dưới mô tả kiến trúc hiện hành; phần còn lại là backlog cần ghi rõ trong `TODO.md`.

## Mục tiêu

Tạo chương tiểu thuyết tiếng Việt dài khoảng 4.500–5.500 từ, đặc biệt phù hợp với chương 18+, nhưng khóa cứng Arc/Outline, nhân vật được phép, continuity mở chương, required beat và thay đổi bắt buộc. AI được linh hoạt về số scene và chức năng scene nhưng không được tự đổi hướng truyện.

## Quyết định triển khai

- Một lần gọi AI lập Scene Graph/Scene Contract ngắn.
- Viết scene tuần tự; mỗi scene chỉ nhận contract, 600–900 từ cuối scene trước và state delta compact.
- Ghép scene bằng code, không gọi AI để viết lại toàn chương.
- Mục tiêu chương 5.000 từ; chấp nhận 4.500–5.500; hard cap khoảng 5.600 để bảo vệ ending.
- Khi các scene ban đầu thiếu độ dài, chạy Adaptive Scene Top-up tối đa 6 lượt; mỗi lượt chỉ gửi đoạn đuôi và state delta compact, không gửi lại toàn chương.
- Quality Gate giữ ở mức review cuối, có patch/targeted repair và Best Draft Guard; các cảnh báo mềm không tự gọi rewrite nếu không có hướng xử lý.
- Semantic Prose Check và AI spell-check không chạy mặc định trong pipeline nhanh/cân bằng.
- Hậu kỳ unified cập nhật summary, Character/World/Status/Memory/Continuity và next hint theo evidence; Canon Sync chỉ chạy sau barrier phù hợp.

## Cấu trúc chính

- `shared/core.js`: giới hạn từ và các helper prompt/parse cho Scene Graph, Scene Contract, state delta.
- `index.html`: pipeline client adaptive scene, ghi telemetry theo step và xử lý safe failure khi scene plan lỗi.
- `write-chapter-background.js`: worker dùng cùng `runAdaptiveChapterPipeline`, có draft mode, quick-fix và postprocess server-side.
- `tests/`: regression cho giới hạn từ, scene plan parse, prompt không gửi toàn bộ chương và ngân sách scene.

## Trạng thái

- V12.47.1: baseline lịch sử.
- V13.0: đợt đầu giới hạn từ + helper Scene Graph + client scene writer + regression.
- V13.1: system prompt compact riêng cho Scene Graph/scene writer; contract/state/tail được rút gọn, loại bỏ `lastTail` trùng và chỉ gửi ending anchor ở scene cuối.
- V13.2: Adaptive Scene Top-up và Hard Fail bắt buộc cho chương dưới 4.500 từ.
- V13.6: gom rào chắn Arc/Outline, allowed cast và forbidden drift vào Scene Graph, từng scene và top-up; không để nhân vật mới tự mở tuyến chính ngoài Arc.
- V14: Chapter Contract bất biến; validate plan trước khi viết; reject plan drift thay vì fallback âm thầm; kiểm tra scene theo contract; top-up chỉ mở rộng scene hợp lệ; Sync chỉ sau khi contract barrier đạt.
- V14.0.17–V14.0.20: hint provenance và active-record filtering; accepted-canon/Character Canon barrier; Vietnamese-native prose contract dùng chung cho client, worker và adaptive scene.

## Kiến trúc V14

- `Chapter Contract`: nguồn sự thật duy nhất cho Arc, Outline, cast, forbidden drift, opening continuity, required beats, ending anchor, must-change và ngân sách từ.
- `Plan Validator`: từ chối Scene Graph có nhân vật quan trọng ngoài cast, thiếu beat/must-change, hoặc mục tiêu lệch Arc; retry kế hoạch một lần rồi dừng an toàn.
- `Scene Contract Gate`: mỗi scene phải nhận cùng Chapter Contract; scene lỗi không được ghép tiếp vào chương.
- `Contract-first Gate`: Arc/beat/continuity/character barrier có thứ tự ưu tiên cao hơn score văn phong.
- `Safe failure`: plan không hợp lệ tạo `PLAN_REJECTED`, không gọi fallback writer và không ghi bản nháp sai vào Canon.
