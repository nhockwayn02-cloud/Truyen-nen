# V12.11 — Next Chapter Hint length fix

- Giới hạn Gợi ý chương sau ở khoảng **400–600 từ**.
- Prompt yêu cầu rõ không vượt 600 từ.
- Giảm `maxTokens` của lần tạo chính xuống 2800 để tránh sinh quá dài nhưng vẫn đủ chỗ cho reasoning của Aion 3.5 Mini.
- Nếu kết quả vượt 600 từ, app yêu cầu AI nén lại về 400–600 từ.
- Có hard cap cuối cùng ở 600 từ trước khi lưu vào `state.nextChapterHint`.
- Kiểm tra tiếng Việt vẫn được giữ nguyên.
