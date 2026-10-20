# Kế hoạch V13 — Adaptive Scene Pipeline

## Mục tiêu

Tạo chương tiểu thuyết tiếng Việt dài khoảng 4.500–5.500 từ, đặc biệt phù hợp với chương 18+, nhưng không ép scene theo vai trò cố định. Beat bắt buộc, canon, ending anchor và tính liên kết được giữ; số scene, chức năng và độ dài scene do AI quyết định theo diễn biến.

## Quyết định triển khai

- Một lần gọi AI lập Scene Graph/Scene Contract ngắn.
- Viết scene tuần tự; mỗi scene chỉ nhận contract, 600–900 từ cuối scene trước và state delta compact.
- Ghép scene bằng code, không gọi AI để viết lại toàn chương.
- Mục tiêu chương 5.000 từ; chấp nhận 4.500–5.500; hard cap khoảng 5.600 để bảo vệ ending.
- Khi các scene ban đầu thiếu độ dài, chạy Adaptive Scene Top-up tối đa 6 lượt; mỗi lượt chỉ gửi đoạn đuôi và state delta compact, không gửi lại toàn chương.
- Quality Gate giữ ở mức review cuối và tối đa một lần sửa vùng; các cảnh báo mềm không tự gọi rewrite.
- Semantic Prose Check và AI spell-check không chạy mặc định trong pipeline nhanh/cân bằng.
- Hậu kỳ mặc định ưu tiên summary + next hint; cập nhật canon chi tiết chạy riêng.

## Cấu trúc chính

- `shared/core.js`: giới hạn từ và các helper prompt/parse cho Scene Graph, Scene Contract, state delta.
- `index.html`: pipeline client adaptive scene, ghi telemetry theo step và fallback về pipeline cũ khi scene plan lỗi.
- `write-chapter-background.js`: đồng bộ helper và giữ compatibility với job cũ; sau khi client ổn định sẽ thêm nhánh scene worker.
- `tests/`: regression cho giới hạn từ, scene plan parse, prompt không gửi toàn bộ chương và ngân sách scene.

## Trạng thái

- V12.47.1: baseline.
- V13.0: đợt đầu giới hạn từ + helper Scene Graph + client scene writer + regression.
- V13.1: system prompt compact riêng cho Scene Graph/scene writer; contract/state/tail được rút gọn, loại bỏ `lastTail` trùng và chỉ gửi ending anchor ở scene cuối.
- V13.2: Adaptive Scene Top-up và Hard Fail bắt buộc cho chương dưới 4.500 từ.
- V13.6: gom rào chắn Arc/Outline, allowed cast và forbidden drift vào Scene Graph, từng scene và top-up; không để nhân vật mới tự mở tuyến chính ngoài Arc.
