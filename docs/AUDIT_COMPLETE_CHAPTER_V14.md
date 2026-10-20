# Audit luồng Tạo Chương Hoàn Chỉnh — V14

## Kết luận ngắn

Luồng hiện tại chưa ổn định để viết tiểu thuyết dài kỳ. Lỗi tăng dần vì app đang dùng nhiều lớp AI tuần tự nhưng không có một **Chapter Contract bất biến** làm nguồn sự thật duy nhất. Mỗi lớp có thể diễn giải lại Arc/Outline theo cách khác nhau; khi một lớp mở sai tuyến, các lớp sau thường cố sửa bằng prompt chứ không thể khôi phục cấu trúc ban đầu.

Không nên tiếp tục vá từng loại thông báo. Cần gom lại thành một pipeline mới, trong đó lỗi drift bị chặn trước khi tốn 4.500–5.500 từ và trước khi ghi Canon.

## Sơ đồ luồng hiện tại

1. `generateChapter()` dựng một context lớn từ Story Bible, nhân vật, chương gần nhất, brief và hint.
2. Nếu Adaptive Scene bật, `generateAdaptiveChapterText()` gọi AI lập Scene Graph.
3. AI viết từng scene; mỗi scene nhận contract do chính Scene Graph tạo, đuôi scene trước và state delta.
4. Nếu thiếu 4.500 từ, `topUpShortDraftText()` gọi thêm tối đa 6 lượt. Các lượt này có thể tiếp tục viết sau điểm kết dự kiến.
5. Chương được tạo thành `chapterObj`.
6. `runQualityGate()` chạy self-check, continuity check và Auditor trên gần như toàn bộ chương.
7. Nếu lỗi, app thử patch, sau đó Segment Repair, cuối cùng mới rewrite toàn chương nếu chương đủ ngắn.
8. Nếu Gate đạt, chương được lưu rồi hậu kỳ server chạy tiếp.

## Nguyên nhân gốc của lỗi tăng dần

### 1. Scene Graph là nguồn kế hoạch nhưng không phải hợp đồng bất biến

Scene Graph được AI tạo từ context và sau đó chính các scene lại dựa vào Graph. Nếu Graph tự đưa Kim Chi, khách sạn hoặc tuyến vệ sĩ vào, toàn bộ chương sẽ nhất quán nội bộ nhưng sai Arc. Quality Gate chỉ phát hiện sau khi đã tốn toàn bộ chi phí viết.

Bản V13.6 đã thêm Arc Lock, Allowed Cast và Forbidden Drift vào prompt. Đây là cải thiện cần thiết nhưng vẫn là lời nhắc cho model, chưa phải rào chắn cấp dữ liệu. Cần validate plan trước khi bắt đầu viết; plan vi phạm phải bị từ chối, không được fallback âm thầm sang writer cũ.

### 2. Required Beat hiện quá hẹp

`adaptiveRequiredBeatBlock()` chủ yếu lấy một dòng Outline của chương và brief/hint khi không có Outline. Arc goal, Current Status, open loops, nhân vật hợp lệ và tài nguyên bị khóa chưa được đóng gói thành một Chapter Contract bắt buộc. Vì vậy model có thể đáp ứng một vài beat nhỏ nhưng vẫn rời khỏi mục tiêu Arc.

### 3. Top-up có thể làm loãng hoặc đổi hướng điểm kết

Top-up được gọi khi thiếu từ và nhận đuôi hiện tại. Nó được yêu cầu tạo diễn biến mới, nhưng không có rào chắn đủ mạnh để chỉ kéo dài các beat hợp lệ. Nếu scene ban đầu sai hướng, Top-up sẽ làm tuyến sai dài hơn; nếu scene đã khép, Top-up có thể mở thêm tình huống mới để đủ 4.500 từ.

### 4. Quality Gate đang làm nhiệm vụ biên kịch quá muộn

Auditor phát hiện lỗi cấu trúc sau khi chương đã dài. Khi đó patch thường thất bại vì AI phải tìm anchor nguyên văn; Segment Repair thất bại vì marker không khớp; rewrite toàn chương bị chặn ở khoảng 7.800 token. Kết quả là app giữ bản xấu nhất có thể nhưng không thể tự cứu.

### 5. Best Draft Guard bảo vệ điểm, không bảo vệ hướng Arc

Best Draft Guard chọn bản có review tốt hơn theo score/verdict. Một bản có score cao hơn vẫn có thể drift khỏi Arc nếu Auditor chấm continuity/style tốt. Cần ưu tiên thứ tự: contract/Arc pass → required beat pass → continuity pass → score. Không được dùng score tổng thay cho hợp đồng cốt truyện.

### 6. Có nhiều đường viết không hoàn toàn đồng nhất

Client Adaptive Scene, fallback writer cũ, Continue, Rewrite và Background Worker có các đường xử lý riêng. Việc đồng bộ shared helper không đồng nghĩa pipeline hoàn toàn giống nhau. Đây là nguồn rủi ro lớn: một thao tác có thể tạo chương theo contract, thao tác khác lại dùng prompt cũ.

### 7. Review gửi lại lượng văn bản lớn nhiều lần

Quality Review và continuity check gửi toàn bộ hoặc gần toàn bộ chương. Khi có 2–5 vòng, chi phí token tăng mạnh nhưng chất lượng cấu trúc không tăng tương ứng. Việc sửa lỗi nên chuyển sang kiểm tra theo contract/scene và chỉ gửi vùng lỗi, không gửi cả chương nhiều lần.

## Kiến trúc V14 đề xuất

### A. Tạo Chapter Contract bất biến trước khi viết

Tạo một object nội bộ, không cho model sửa tự do:

- `arcId`, `arcGoal`, `chapterNumber`, `chapterRole`;
- `requiredBeats[]` lấy từ Outline/Arc;
- `allowedCharacters[]` và vai trò được phép trong chương;
- `forbiddenDrift[]` lấy từ Arc, Story Bible và trạng thái hiện tại;
- `openingContinuity` lấy từ đoạn kết chương trước;
- `endingAnchor`;
- `mustChange` — một thay đổi thật phải xảy ra;
- `maxNewThreads`, `maxMainEvents`, `minWords`, `maxWords`.

AI chỉ được lập kế hoạch trong hợp đồng này. Không cho AI tự thay `arcGoal`, allowed cast hoặc forbidden drift.

### B. Validate Scene Graph trước khi viết

Sau khi parse Graph, chạy validator thuần code:

- Scene phải có location, time, characters, mustChange và handoff.
- Mọi required beat phải được phân bổ vào ít nhất một scene.
- `chapterGoal` phải chứa hoặc tương thích với Arc goal.
- Nhân vật quan trọng trong scene phải nằm trong allowed cast hoặc có trong chính required beat/brief.
- Không được có tuyến mới nếu `maxNewThreads=0` hoặc Outline không cho phép.
- `endingAnchor` phải thuộc contract, không được tự đổi mục tiêu.

Nếu plan fail, gọi lại plan một lần với lỗi validator. Nếu vẫn fail, dừng với trạng thái `PLAN_REJECTED`, không fallback âm thầm sang writer cũ và không tốn 5.000 từ để tạo bản chắc chắn bị loại.

### C. Viết theo scene contract, nhưng kiểm tra sau từng scene

Sau mỗi scene, kiểm tra nhanh bằng code và/hoặc một JSON review nhỏ:

- nhân vật có ngoài allowed cast không;
- địa điểm/thời gian có đổi trái contract không;
- scene có thực hiện `mustChange` không;
- có mở tuyến mới không;
- handoff có dẫn đến scene sau không.

Scene fail thì chỉ viết lại scene đó ngay. Không tiếp tục ghép 4.000 từ sai hướng.

### D. Bù độ dài theo contract, không bù tự do

Không dùng top-up chung sau khi chương đã tới điểm kết. Chia ngân sách từ đầu cho 5–7 scene. Nếu thiếu, chỉ được gọi `extendScene(sceneId)` cho scene đang thiếu; prompt phải giữ cùng purpose, location, characters, required beat và handoff. Không cho top-up mở tuyến mới hoặc thêm nhân vật.

Nếu vẫn không đạt 4.500 từ sau giới hạn lượt, trả `UNDER_TARGET` và giữ bản nháp chưa Sync; không cố kéo bằng cảnh mới.

### E. Gate theo thứ tự ưu tiên

1. Contract/Arc barrier — lỗi là HARD_FAIL.
2. Required beat barrier — thiếu [R] là HARD_FAIL.
3. Opening continuity barrier.
4. Character/world/knowledge barrier.
5. Stagnation/ending change barrier.
6. Style/pacing/appearance cảnh báo mềm.

Không để score 85 hoặc style 9/10 lấn át lỗi Arc nghiêm trọng.

### F. Sửa lỗi theo vùng có chiến lược

- Lỗi câu chữ: patch nhỏ.
- Lỗi một scene: rewrite đúng scene theo contract.
- Lỗi tuyến phụ drift: thay hoặc xóa đúng scene drift rồi viết scene hợp lệ thay thế.
- Lỗi toàn chương: không rewrite 5.000 từ trong một call; chuyển về Scene Repair theo từng scene.

Mỗi scene cần có boundary/ID nội bộ trong plan để repair không phụ thuộc vào việc AI chép đúng một đoạn anchor dài.

### G. Chỉ Sync khi contract đạt

`SYNCED` chỉ được phép khi:

- plan đã validate;
- tất cả required beat đã có bằng chứng;
- không có unauthorized important character;
- opening continuity pass;
- ending anchor/mustChange pass;
- 4.500–5.500 từ;
- Quality score đạt ngưỡng.

Nếu một trong các điều kiện trên fail, lưu vào Draft/Revision Required, không ghi Canon.

## Tối ưu token

- Plan chỉ gọi một lần, JSON ngắn.
- Scene review gửi scene hiện tại + contract compact, không gửi toàn chương.
- Final Auditor chỉ chạy một lần sau khi các scene đã pass.
- Sửa chỉ gửi scene lỗi, không gửi lại chương 5.000 từ.
- Semantic Prose/Spell Check để sau Gate hoặc chạy thủ công; không dùng nó trong vòng sửa cấu trúc.
- Loại bỏ fallback writer cũ khỏi nút Tạo Chương Hoàn Chỉnh; chỉ giữ dưới nút chẩn đoán/khôi phục.

## Kết luận triển khai

Không nên deploy thêm patch nhỏ trên V13.6. Bản V13.6 đã giảm drift ở prompt nhưng chưa giải quyết việc plan được AI tự sửa, fallback và top-up thiếu contract. Bản tiếp theo nên là một thay đổi pipeline tập trung, có validator plan, scene gate, contract barrier và repair theo scene. Chỉ sau khi chạy toàn bộ regression mới commit/deploy một lần.
