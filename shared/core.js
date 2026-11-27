// NGUỒN DUY NHẤT cho các hàm dùng chung giữa index.html (client) và write-chapter-background.js (worker).
// Sửa Ở ĐÂY rồi chạy:  node scripts/sync-shared.js   (kiểm tra:  node tests/sync-check.js)
// Chỉ dùng cú pháp ES2020, không import/require, không phụ thuộc biến ngoài (trừ `state` tuỳ chọn trong chapterWordLimits).

function countWords(text) { return (text || "").trim().split(/\s+/).filter(Boolean).length; }

function normalizeName(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function chapterWordLimits(st) {
  // Client gọi không tham số (dùng state toàn cục); worker truyền state của job.
  if (!st && typeof state !== "undefined") st = state;
  // V14.6: min/max tường minh được ưu tiên; truyện cũ không có hai trường này vẫn dùng target ±500.
  const explicitMin = Number(st && st.chapterWordMin), explicitMax = Number(st && st.chapterWordMax);
  if (Number.isFinite(explicitMin) && Number.isFinite(explicitMax) && explicitMin >= 300 && explicitMax >= explicitMin && explicitMax <= 12000) {
    const minAccept = Math.floor(explicitMin), maxAccept = Math.floor(explicitMax);
    const requestedTarget = Number(st && st.minChapterWords);
    const target = Number.isFinite(requestedTarget) && requestedTarget >= minAccept && requestedTarget <= maxAccept
      ? Math.round(requestedTarget) : Math.round((minAccept + maxAccept) / 2);
    return { target, minAccept, maxAccept, hardMax: maxAccept };
  }
  // V14.5.8: độ dài chương theo ĐÚNG số người dùng nhập ở "Độ dài mục tiêu": chấp nhận mục tiêu ±500 từ
  // (5000 -> 4500–5500; 4500 -> 4000–5000). Không nhập/không hợp lệ -> mặc định 5000.
  const requested = Number(st && st.minChapterWords);
  if (requested >= 500 && requested <= 12000) {
    const t = Math.round(requested / 100) * 100;
    return { target: t, minAccept: Math.max(300, t - 500), maxAccept: t + 500, hardMax: t + 600 };
  }
  return { target: 5000, minAccept: 4500, maxAccept: 5500, hardMax: 5600 };
}

// V13: số scene và chức năng scene do diễn biến quyết định, không gán vai trò cố định.
function adaptiveChapterWordLimits(st) {
  return chapterWordLimits(st);
}
function chapterLengthAction(st, wordCount) {
  const limits = chapterWordLimits(st), words = Math.max(0, Math.floor(Number(wordCount) || 0));
  const hasExplicitBounds = Number.isFinite(Number(st && st.chapterWordMin)) && Number.isFinite(Number(st && st.chapterWordMax)) && Number(st.chapterWordMin) >= 300 && Number(st.chapterWordMax) >= Number(st.chapterWordMin) && Number(st.chapterWordMax) <= 12000;
  if (words < limits.minAccept) return { action: "expand", deficit: limits.minAccept - words, target: limits.target, minAccept: limits.minAccept, maxAccept: limits.maxAccept };
  const maxForAction = hasExplicitBounds ? limits.maxAccept : limits.hardMax;
  if (words > maxForAction) return { action: "condense", excess: words - maxForAction, target: limits.target, minAccept: limits.minAccept, maxAccept: maxForAction };
  return { action: "within", target: limits.target, minAccept: limits.minAccept, maxAccept: limits.maxAccept, hardMax: limits.hardMax };
}

function compactSceneTail(text, maxChars) {
  const t = String(text || '').trim();
  const cap = Number(maxChars) || 2400;
  return t.length <= cap ? t : t.slice(-cap);
}

/* V14.5.11: HỒ SƠ NHÂN VẬT CHO SCENE. Trước đây prompt viết scene (adaptive) CHỈ có tên trong ALLOWED CAST — không có chức vụ, nhà ở, mức sống, tính cách —
   nên model tự bịa (thư ký riêng chủ tịch thành giúp việc, căn hộ cao cấp thành nhà tồi tàn) rồi Gate bắt lỗi "vượt hồ sơ". Khối này đưa hồ sơ của đúng các nhân vật có mặt trong scene vào prompt. */
const SCENE_PROFILE_FIELDS = [['position', 'chức vụ/địa vị', 70], ['occupation', 'nghề', 60], ['role', 'vai trò', 60], ['faction', 'tổ chức', 50], ['age', 'tuổi', 12], ['gender', 'giới tính', 14],
  ['maritalStatus', 'hôn nhân', 30], ['spouseName', 'người yêu/phối ngẫu', 40], ['residence', 'nơi ở', 90], ['home', 'nơi ở', 90], ['housing', 'nơi ở', 90], ['currentLocation', 'đang ở', 60],
  ['wealth', 'tài sản/mức sống', 70], ['assets', 'tài sản', 70], ['income', 'thu nhập', 50], ['notes', 'ghi chú hồ sơ', 220], ['appearance', 'ngoại hình', 320], ['height', 'chiều cao', 24], ['bodyType', 'dáng người', 50], ['measurements', 'SỐ ĐO', 90], ['hair', 'tóc', 40], ['eyes', 'mắt', 30], ['skin', 'da', 30], ['voice', 'giọng', 40], ['scent', 'mùi', 30], ['style', 'phong cách ăn mặc', 60], ['scars', 'sẹo', 40], ['tattoos', 'xăm', 40], ['personality', 'tính cách', 160], ['weakness', 'điểm yếu', 70], ['fear', 'nỗi sợ', 70], ['strength', 'điểm mạnh', 70],
  ['speech', 'cách nói', 70], ['goals', 'mục tiêu', 70], ['relevanceToMC', 'quan hệ với NVC', 70]];
/* V14.7.4: neo ngoại hình cho đường viết từng scene (trước đây chỉ đường viết thường có): hồ sơ hình thể phải ra được thành chữ cụ thể. */
/* V14.7.13: văn chương thân thể. Các neo trước đây ép "bằng con số" nên văn bản đọc như báo cáo ("dài 25 cm", "84-60-88"). Số liệu hồ sơ nay là dữ kiện ngầm cần DỊCH thành hình ảnh/cảm giác/tương phản. */
const BODY_PROSE_CRAFT = 'VĂN CHƯƠNG THÂN THỂ — số đo/kích thước trong hồ sơ là DỮ KIỆN NGẦM, không phải câu để đọc ra. Cấm báo cáo khô kiểu "cao 1m68, 84-60-88", "dài 25 cm". Hãy để thân thể tự kể chuyện qua hình ảnh, cảm giác và tương phản: (1) hình ảnh vật thể/thiên nhiên hợp tông truyện (đầy như quả chín, eo nhỏ đến mức một vòng tay ôm trọn, thân gân guốc to bằng cổ tay...); (2) qua cảm nhận của người nhìn/chạm: ánh mắt dừng ở đâu, bàn tay bị nuốt chìm, trọng lượng, độ nóng, độ mềm/cứng, mùi, tiếng thở; (3) qua chuyển động và vải: bước đi rung nhẹ, vải căng/xô lệch/ướt/nút áo bị đẩy; (4) tương phản (eo nhỏ – hông nở, vẻ lạnh lùng – thân thể run rẩy, da trắng – vết đỏ). Mỗi bộ phận quan trọng tả thành một cụm 2–4 câu liền mạch, giàu giác quan, rồi mới tiếp tục hành động; con số nếu cần chỉ thoáng một lần và nằm trong hình ảnh (vd "to bằng cổ tay", "dài gần hai gang tay"), không nhắc lại. Chỉ lần ĐẦU một bộ phận/đặc điểm xuất hiện mới tả đầy đủ; các lần sau chỉ nhắc bằng MỘT chi tiết mới hoặc cảm giác (chạm, nặng, nóng, run), đổi hẳn góc nhìn/hình ảnh, không lặp lại hình dáng hay con số đã nêu.';
const SCENE_APPEARANCE_ANCHOR = 'NEO NGOẠI HÌNH — người đọc phải hình dung được thân thể nhân vật: tả KỸ ở lần đầu tiên nhân vật xuất hiện trong truyện, nhắc NGẮN ở lần xuất hiện thứ hai, rồi thôi (và tả lại ngắn khi quay lại sau ≥ 6 chương vắng), hoặc khi trang phục/thân thể THAY ĐỔI, dựng chiều cao, dáng, kích thước/số đo, tóc-mắt-da ĐÚNG theo HỒ SƠ KHÓA thành hình ảnh cụ thể (không đọc số đo như báo cáo). Cấm tính từ trống đứng thay cho hình thể ("căng thẳng", "bó sát", "quyến rũ", "đầy đặn", "cao ráo"): phải gắn với phần cơ thể và một hình ảnh/cảm giác cụ thể; trang phục tả kèm cách nó ôm/hở/xô lệch trên đúng phần thân thể đó. Mục hồ sơ nào trống thì tự đặt chi tiết hợp lý và giữ nhất quán về sau. CHỐNG LẶP: nhân vật gắn nhãn ĐÃ GIỚI THIỆU thì TUYỆT ĐỐI không nhắc lại chiều cao/cân nặng/số đo/dáng đã tả, không mở scene hay chương bằng đoạn tả hình thể; số liệu hồ sơ chỉ để giữ nhất quán, không phải để đọc lại — mỗi scene tối đa 1–2 chi tiết thân thể MỚI hoặc phản ứng/cử động hiện tại, khác hẳn hình ảnh đã dùng. ' + BODY_PROSE_CRAFT;
/* V14.7.10: hồ sơ 18+ (đặc điểm cơ thể/kích thước, sở thích, giới hạn) trước đây KHÔNG vào prompt viết từng scene nên cảnh nóng không có dữ kiện để tả,
   và không có chỉ dẫn tả phản ứng người chứng kiến (chỉ "to lớn"). Nay: scene nóng của truyện 18+ nhận các trường này + neo tả cụ thể. */
const SCENE_ADULT_PROFILE_FIELDS = [['sexualExperience', 'đặc điểm/kinh nghiệm 18+', 320], ['preferences', 'sở thích 18+', 140], ['boundaries', 'giới hạn', 90], ['taboos', 'cấm kỵ', 80], ['attractionToMC', 'hấp dẫn với NVC', 90], ['tensionWithMC', 'căng thẳng với NVC', 90]];
/* V14.7.14: cảnh nóng phải tả TỪNG HÀNH ĐỘNG (lực, tốc độ, cảm giác da thịt, âm thanh, phản ứng cơ thể) theo nhịp chậm, không tóm tắt. */
const EROTIC_ACTION_CRAFT = 'TẢ TỪNG HÀNH ĐỘNG 18+ — mỗi hành động tình dục (liếm, mút, ngón tay, đẩy vào, rút ra, tát mông, kéo tóc, bóp, cắn, siết...) là MỘT nhịp riêng được tả đủ năm thứ: (1) ai làm gì bằng bộ phận nào, ở đâu trên cơ thể; (2) LỰC và TỐC ĐỘ (nhẹ/mạnh, miết chậm/dồn dập, dừng một nhịp rồi mới tiếp); (3) CẢM GIÁC DA THỊT thật (ướt, nóng, trơn, siết chặt, bị căng ra, bị đâm sâu, rát, tê, co thắt); (4) ÂM THANH phát ra (tiếng da vỗ, tiếng ướt nhép, hơi thở đứt quãng, rên, nuốt nước bọt, giường/ghế kẽo kẹt, lời nói bật ra); (5) PHẢN ỨNG CƠ THỂ của cả hai (run, cong người, siết chặt, co ngón chân, mắt nhòe, da nổi gai, nước chảy). Đi theo thứ tự thật: dạo đầu → chạm → vào từng đoạn (đầu trước, dừng một nhịp cảm nhận, rồi sâu dần) → nhịp tăng/giảm → đổi tư thế/hành động → cao trào; mỗi bước một đoạn riêng, không gộp nhiều hành động vào một câu, không nhảy cóc, không thay bằng "họ làm tình". Mỗi hành động tả bằng chi tiết khác nhau, không lặp mẫu câu; xen thoại ngắn và nội tâm đúng vai.';
/* V14.7.16: cảnh nóng dài cần NỘI TÂM + HỒI TƯỞNG xen kẽ và KHÔNG bị cắt sang cảnh khác (tu luyện, họp...) khi chưa tới cao trào. */
const EROTIC_INNER_CRAFT = 'NỘI TÂM VÀ MẠCH CẢNH 18+ — cảnh nóng dài không được chỉ toàn hành động và âm thanh (đọc như phim sex không hồn). Xen kẽ nhịp: hành động → nội tâm → hành động. Mỗi đoạn dài có ít nhất một nhịp nội tâm: câu nghĩ thầm ngắn (in nghiêng hoặc đặt riêng một dòng) của CẢ HAI phía theo đúng vai — kẻ chủ động: lạnh lùng đánh giá, toan tính, khinh miệt, chiếm hữu; người bị chi phối: xấu hổ, nhục, kháng cự rồi cơ thể phản bội, thứ khoái cảm không muốn thừa nhận. Thỉnh thoảng một mảnh HỒI TƯỞNG 1–3 câu đúng lúc (ngày đầu gặp, lời thề cũ, cái nhìn kiêu ngạo ngày xưa, ba tháng trước...) đối chiếu với hiện tại để cảnh nặng và thấm; hồi tưởng phải kết bằng hành động/cảm giác hiện tại, không kéo dài thành cảnh riêng. Nội tâm chiếm khoảng 1/4–1/3 cảnh dài, không dài dòng triết lý. KHÔNG CẮT CẢNH: khi cảnh nóng chưa tới cao trào/kết cảnh, tuyệt đối không chuyển sang địa điểm/sự kiện/nhân vật khác (tu luyện, họp, nhân vật phụ...). Mọi beat khác (VD hấp thụ linh khí, phát hiện tin nhắn, bước chân tuần tra) phải LỒNG vào ngay trong cảnh — thành cảm nhận, suy nghĩ, tiếng động xen vào — hoặc đặt SAU khi cảnh nóng đã kết thúc.';
/* V14.7.17: cung cảm xúc (kháng cự → cơ thể phản bội → điểm gãy → day dứt) và kỹ thuật điều khiển nhịp/căng thẳng cho cảnh 18+ nặng tâm lý. */
/* V14.7.18: tu luyện phải có TIẾN BỘ RÕ RÀNG, đo được — không chỉ nhắc "tu luyện" rồi mạnh hơn chung chung. */
const CULTIVATION_PROGRESS_CRAFT = 'TIẾN BỘ TU LUYỆN PHẢI RÕ RÀNG, ĐO ĐƯỢC — mỗi lần có cảnh tu luyện/hấp thụ/luyện công/luyện thể, người đọc phải THẤY mình đã tiến được gì. (1) MỐC CỤ THỂ: nêu rõ cái đã đổi — tiểu tầng/cảnh giới (ví dụ từ đệ tam trọng lên đệ tứ trọng), lượng linh lực/khí huyết (đầy thêm mấy phần, đan điền rộng ra bao nhiêu), kinh mạch/huyệt vị mới thông, tầng công pháp mới lĩnh hội, thần thông/chiêu mới. Cấm câu mơ hồ kiểu "thấy mạnh hơn một chút", "tu vi tăng lên". (2) TRƯỚC–SAU: cho thấy sự chênh bằng phép thử cụ thể (đấm vỡ tảng đá mà trước đây chỉ nứt, nhìn xa hơn, chịu được đòn trước đây gục, linh khí hút nhanh gấp mấy lần, đối thủ cũ nay thua). (3) QUÁ TRÌNH: có nút thắt, cảm giác thân thể (nóng, tê, đau xé, nở căng), hình ảnh linh khí, và CÁI GIÁ (tiêu hao, tổn thương, tài nguyên/linh thạch/đan dược mất đi, nguy cơ tẩu hỏa) — không tiến miễn phí. (4) NHỊP: tiểu tầng nhỏ có thể tăng sau vài chương tích lũy; đột phá đại cảnh giới hiếm, phải có chuẩn bị từ các chương trước, cơ duyên/tài nguyên rõ và cảnh đột phá được kể đầy đủ; không để nhiều chương liền chỉ "tu luyện" mà chỉ số đứng im — nếu chưa tới ngưỡng đột phá thì ít nhất cho thấy tiến độ tích lũy (ví dụ "đã đầy bảy phần, còn thiếu ba phần mới chạm ngưỡng"). (5) GHI RÕ ĐỂ HỒ SƠ CẬP NHẬT: khi đạt tầng/cảnh giới mới, viết MỘT câu tường minh nêu tên cảnh giới và tiểu tầng mới ngay trong truyện (ví dụ "Bùi Lạc chính thức bước vào Luyện Khí đệ ngũ trọng") để hồ sơ nhân vật nhận được bằng chứng; không nhảy cảnh giới quá một đại cảnh giới và không đặt tên cảnh giới ngoài thang. (6) Nếu tu luyện gắn với cảnh nóng (song tu, hấp thụ nguyên khí...), cảnh nóng vẫn là cảnh nóng trọn vẹn; kết quả tu vi hiện ở HẬU CẢNH sau cao trào (cảm nhận thân thể, linh lực đổi) và vẫn theo mốc cụ thể ở (1).';
const EROTIC_ARC_PACING_CRAFT = 'CUNG CẢM XÚC VÀ NHỊP 18+ — (A) ĐẢO CHIỀU CẢM XÚC theo nấc, không nhảy cóc: kháng cự (lời nói, né tránh, siết chặt người, ánh mắt) → cơ thể phản bội (nhịp thở, run, ướt, chân mềm — tả như điều cô GHÊ TỞM chính mình vì có, lý trí vẫn từ chối) → ĐIỂM GÃY là MỘT khoảnh khắc cụ thể, đọc được (một câu thốt ra, một cử động tự nguyện ngoài ý muốn, một âm thanh không giấu được) → đổ → DAY DỨT SAU KHI ĐỔ (nhục, tự ghê tởm, sợ, giận chính mình; khoái cảm thể xác không xóa sự khước từ trong lòng và không biến thành "cô thích nó" quá nhanh). Phản ứng thể xác và ý chí là HAI mạch riêng, luôn va vào nhau. Không để nhân vật đổ quá nhanh: điểm gãy đặt ở nửa sau cảnh (hoặc chương sau nếu truyện còn dài), trừ khi mệnh lệnh người dùng chỉ định khác. (B) CĂNG THẲNG = SỰ TRÌ HOÃN CÓ CHỦ ĐÍCH của kẻ nắm quyền: dừng đúng lúc, chạm gần rồi rút, bắt chờ, bắt nói ra, ra lệnh từng bước, đếm nhịp — càng trì hoãn có kiểm soát thì lúc vỡ càng mạnh; mỗi lần trì hoãn phải KHÁC nhau và đẩy nhân vật bị chi phối tới một ngưỡng mới (không lặp một mẹo). (C) PACING = ĐIỀU KHIỂN TỐC ĐỘ thông tin, cảm xúc, hành động: biết lúc nào GHÌM người đọc lại (câu dài, chi tiết giác quan, nội tâm, im lặng, dừng) và lúc nào ĐẨY tới (câu ngắn, hành động dồn, thoại cụt); xen nhịp ghìm – đẩy, không đều một tốc độ; nhịp chậm nặng tâm lý ở đoạn đầu và giữa, chỉ dồn nhanh ở đoạn vỡ; điều chưa cần biết thì chưa nói, tiết lộ từng mảnh để người đọc luôn muốn đọc tiếp.';
const SCENE_ADULT_BODY_ANCHOR = 'NEO CƠ THỂ 18+ — MỌI người tham gia cảnh nóng đều phải có thân thể cụ thể: lần đầu mỗi bộ phận lộ ra/được chạm/được nhìn (ngực, núm vú, mông, đùi, âm hộ/lồn, dương vật...), gọi thẳng tên bằng từ ngữ hợp mức 18+ của STYLE LOCK và tả theo hồ sơ (số đo, dáng, màu da, độ đầy, độ ướt/nóng/cứng, phản ứng co thắt/run), không né bằng ẩn dụ mơ hồ. Dữ kiện "đặc điểm 18+" trong hồ sơ (kích thước, hình dáng, sức bền...) là dữ kiện phải ra chữ: lần đầu bộ phận đó lộ ra/được chạm/được nhìn trong scene, tả theo đúng số liệu hồ sơ nhưng DỊCH thành hình ảnh và cảm giác (độ dài/chu vi bằng so sánh vật thể hoặc bàn tay, hình dáng, gân, độ nóng/cứng, mùi — không đọc số liệu khô), rồi tả PHẢN ỨNG của người chứng kiến/tiếp nhận: ánh mắt, hơi thở, cơ thể co/giãn, cảm giác cụ thể khi chạm/vào, và cảm xúc thật (sốc, sợ, nhục, tò mò, thèm — đúng tính cách và hoàn cảnh nhân vật). Cấm chỉ viết "to lớn", "khổng lồ" rồi bỏ qua. Mỗi lần nhắc dùng chi tiết/góc nhìn khác, không lặp một mẫu câu; nhân vật nữ tả bằng cảm nhận của chính cô, không chỉ bằng con số. ' + BODY_PROSE_CRAFT + ' ' + EROTIC_ACTION_CRAFT + ' ' + EROTIC_INNER_CRAFT + ' ' + EROTIC_ARC_PACING_CRAFT;
function sceneIsAdult(st, scene) { return !!(st && st.mature) && textHasNsfwKeyword(JSON.stringify(scene || {})); }
function sceneProfileWithAnchor(st, scene, castNames) {
  const b = sceneProfileBlock(st, scene, castNames); if (!b) return '';
  return b + '\n\n' + SCENE_APPEARANCE_ANCHOR + (sceneIsAdult(st, scene) ? '\n\n' + SCENE_ADULT_BODY_ANCHOR : '');
}
/* V14.7.15: nhân vật đã xuất hiện trong ~4 chương gần nhất = ĐÃ GIỚI THIỆU ngoại hình; prompt cấm tả lại chiều cao/số đo/dáng (trước đây mỗi scene/chương đều "lần đầu" nên lặp "cao 185cm..."). */
const APPEAR_KW = ['cao', 'thấp', 'gầy', 'mập', 'béo', 'tóc', 'mắt', 'làn da', 'da trắng', 'da ngăm', 'khuôn mặt', 'gương mặt', 'dáng', 'vóc', 'mặc', 'áo', 'váy', 'vest', 'môi', 'mày', 'mũi', 'eo', 'ngực', 'vai', 'tuổi', 'nốt ruồi', 'sẹo'];
/* V14.7.46: "đã giới thiệu ngoại hình" = chương thật sự CÓ ĐOẠN TẢ (tên + ≥3 từ khóa ngoại hình trong ~360 ký tự), không phải chỉ nhắc tên. */
function chapterDescribesCharacter(text, name) {
  const t = String(text || '').slice(0, 30000).toLowerCase(), nm = String(name || '').trim().toLowerCase(); if (!nm || !t) return false;
  let from = 0, tries = 0;
  while (tries++ < 8) {
    const at = t.indexOf(nm, from); if (at < 0) return false;
    const win = t.slice(Math.max(0, at - 160), at + 200 + nm.length); let hit = 0;
    for (const k of APPEAR_KW) { if (win.indexOf(k) >= 0 && ++hit >= 3) return true; }
    from = at + nm.length;
  }
  return false;
}
/* 'first' = chưa ai tả (tả KỸ), 'reminder' = đã tả 1 lần gần đây hoặc vắng lâu (nhắc NGẮN), 'done' = đã tả ≥2 lần gần đây (không tả lại). */
function characterIntroStage(st, c) {
  const nm = String(c && c.name || '').trim(); if (!nm) return 'first';
  const chs = ((st && st.chapters) || []).filter(x => x && x.text); let all = 0, recent = 0;
  chs.forEach((ch, i) => { if (chapterDescribesCharacter(ch.text, nm)) { all++; if (i >= chs.length - 6) recent++; } });
  if (!all) return 'first'; if (recent >= 2) return 'done'; return 'reminder';
}
function characterIntroduced(st, c) { return characterIntroStage(st, c) !== 'first'; }
const INTRO_STAGE_TAG = {
  first: ' [CHƯA GIỚI THIỆU — LẦN ĐẦU: người đọc chưa biết nhân vật này là ai, hãy tả KỸ trong MỘT đoạn riêng: 4–6 chi tiết cụ thể (tuổi/vóc dáng, khuôn mặt, nét riêng dễ nhận ra, trang phục, dáng đi/giọng nói, khí chất) lồng vào hành động; nếu đoạn trước TRONG CHƯƠNG NÀY đã tả rồi thì chỉ nhắc 1 chi tiết]',
  reminder: ' [ĐÃ GIỚI THIỆU MỘT PHẦN — chỉ nhắc LẠI NGẮN 1–2 chi tiết nhận diện (tối đa một câu), dùng hình ảnh khác lần trước; không tả lại số đo/dáng/khuôn mặt đầy đủ]',
  done: ' [ĐÃ GIỚI THIỆU NGOẠI HÌNH — KHÔNG tả lại chiều cao/cân nặng/số đo/dáng/khuôn mặt; chỉ thêm chi tiết MỚI hoặc phản ứng hiện tại]'
};
/* V14.7.46: hồ sơ nhân vật VẮNG MẶT nhưng đang được nhắc như tài liệu ("nhận hồ sơ A", "đọc lý lịch của A"). */
const DOSSIER_RE = /hồ sơ|lý lịch|tiểu sử|dossier|thông tin (?:về|của)|tài liệu (?:về|của)|báo cáo (?:về|của)/i;
/* V14.7.48: người có đất diễn mà không có tên thì Character Database không có chỗ để ghi. Buộc đặt tên NGAY lần xuất hiện đầu. */
const NAMING_RULE = 'ĐẶT TÊN NGƯỜI MỚI NGAY LẦN ĐẦU: bất kỳ người nào có lời thoại, có hành động ảnh hưởng cảnh, hoặc sẽ còn quay lại thì PHẢI có tên riêng đầy đủ (họ + tên, đúng bối cảnh Việt) ngay lần đầu xuất hiện — tên được nói ra qua lời giới thiệu, người khác gọi, bảng tên hoặc người dẫn truyện, rồi mới dùng đại từ. KHÔNG để người đó chỉ là "cô ta/anh ta/cô ấy/gã đàn ông kia" suốt cảnh. Ngoại lệ duy nhất: người ẩn danh CÓ CHỦ ĐÍCH theo brief/outline (bí ẩn) — khi đó dùng một biệt danh cố định, không đổi giữa chừng. Người qua đường không lời thoại, không ảnh hưởng (phục vụ bàn, tài xế lướt qua) có thể không tên. Không đặt trùng tên với nhân vật đã có.';
function dossierBlock(st, scene) {
  if (!scene || !st) return '';
  const hay = [scene.purpose, scene.mustChange, scene.location].concat(Array.isArray(scene.beats) ? scene.beats : []).filter(Boolean).join(' | ');
  if (!DOSSIER_RE.test(hay)) return '';
  const present = new Set((scene.characters || []).map(x => normalizeName(x)));
  const hl = hay.toLowerCase(), pool = [].concat(st.mainCharProfile && st.mainCharProfile.name ? [st.mainCharProfile] : [], st.characters || []);
  const cut = (v, n) => { v = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return v.length > n ? v.slice(0, n) + '…' : v; };
  const rows = [];
  pool.forEach(c => {
    const nm = String(c && c.name || '').trim(); if (!nm || present.has(normalizeName(nm)) || hl.indexOf(nm.toLowerCase()) < 0) return;
    const f = [['age', 'tuổi'], ['gender', 'giới tính'], ['occupation', 'nghề'], ['position', 'chức vụ'], ['role', 'vai trò'], ['appearance', 'ngoại hình'], ['height', 'chiều cao'], ['hair', 'tóc'], ['personality', 'tính cách'], ['maritalStatus', 'hôn nhân'], ['residence', 'nơi ở'], ['notes', 'xuất thân/ghi chú']]
      .map(([k, l]) => { const v = cut(c[k], 220); return v ? l + ': ' + v : ''; }).filter(Boolean);
    if (f.length) rows.push('- ' + nm + ' | ' + f.join(' | '));
  });
  if (!rows.length) return '';
  return 'NỘI DUNG HỒ SƠ ĐANG ĐƯỢC NHẬN/ĐỌC (nhân vật dưới đây KHÔNG có mặt trong cảnh, nhưng hồ sơ về họ được đưa ra): khi nhân vật trong cảnh mở/đọc/nghe về hồ sơ này, PHẢI nêu ra các chi tiết THẬT bên dưới (tuổi, giới tính, nghề/chức vụ, ngoại hình, nét đáng chú ý) bằng cách người đọc hình dung được — không được chỉ ghi "nhận hồ sơ" rồi bỏ qua nội dung; không bịa mâu thuẫn với dữ liệu:\n' + rows.join('\n');
}
/* V14.7.27: THỨ BẬC QUYỀN LỰC trong cảnh. Trước đây quy định chênh lệch chức vụ/địa vị chỉ nằm ở ngữ cảnh chung, không vào prompt từng scene; thẻ Current Status (mức phục tùng, tâm lý) lại "ưu tiên hơn hồ sơ gốc" nên dần kéo nhân vật sang sợ hãi/phục tùng, lấn át chức vụ. */
function powerHierarchyBlock(st, pick) {
  st = st || {}; const people = (pick || []).filter(c => c && c.name);
  if (people.length < 2) return '';
  const cut = (v, n) => { v = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return v.length > n ? v.slice(0, n) + '…' : v; };
  const ranks = people.slice(0, 5).map(c => { const r = cut(c.position || c.role || c.occupation, 60); return r ? c.name + ' = ' + r : ''; }).filter(Boolean);
  const def = cut(st.femaleCharacterDefinition, 420);
  if (ranks.length < 2 && !def) return '';
  return 'THỨ BẬC QUYỀN LỰC (khóa — đặt trên Current Status): ' + (ranks.length ? ranks.join('; ') + '. ' : '') +
    'Chức vụ/địa vị xã hội là CÁCH HAI NGƯỜI ĐỐI XỬ KHI CÓ NGƯỜI KHÁC hoặc trong công việc: người chức cao KHÔNG sợ, KHÔNG cúi đầu, KHÔNG xưng hạ trước người chức thấp hơn; giọng, tư thế, cách ra lệnh phải khớp cấp bậc. ' +
    'Sợ hãi/phục tùng chỉ được viết khi cảnh có NGUYÊN NHÂN CỤ THỂ đã nêu trong contract hoặc đuôi cảnh trước (bị nắm thóp, bị đe dọa, sức mạnh áp đảo riêng tư) và chỉ ở nơi riêng tư; khi ra ngoài/ở công ty phải trở lại đúng vị thế công khai. ' +
    'Mục "mức phục tùng/tâm lý" trong Current Status KHÔNG được xóa chức vụ: nếu mâu thuẫn với thứ bậc này thì giữ thứ bậc, thể hiện nỗi sợ bằng nội tâm kìm nén chứ không bằng hành vi hạ cấp công khai.' +
    (def ? ' Nguyên tắc nhân vật nữ của tác giả: ' + def : '');
}
function sceneProfileBlock(st, scene, castNames) {
  st = st || {};
  const names = [].concat((scene && scene.characters) || [], (!scene || !(scene.characters || []).length) ? (castNames || []) : []).map(x => String(x || '').trim()).filter(Boolean);
  if (!names.length) return '';
  const pool = [].concat(st.mainCharProfile && st.mainCharProfile.name ? [st.mainCharProfile] : [], Array.isArray(st.characters) ? st.characters : []).filter(c => c && c.name && !c.dead);
  const pick = [], seen = new Set();
  names.forEach(n => {
    const nn = normalizeName(n), nt = nn.split(' ').filter(Boolean);
    const c = pool.find(x => normalizeName(x.name) === nn) || pool.find(x => { const xt = normalizeName(x.name).split(' ').filter(Boolean); return xt.length >= 2 && nt.length >= 2 && (nt.every(t => xt.includes(t)) || xt.every(t => nt.includes(t))); });
    if (c && !seen.has(c.name)) { seen.add(c.name); pick.push(c); }
  });
  const cut = (v, n) => { v = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return v.length > n ? v.slice(0, n) + '…' : v; };
  const introRows = [];
  const rows = pick.slice(0, 5).map(c => {
    const f = [], used = new Set();
    SCENE_PROFILE_FIELDS.concat(sceneIsAdult(st, scene) ? SCENE_ADULT_PROFILE_FIELDS : []).forEach(([k, label, n]) => { const v = cut(c[k], n); if (v && !used.has(label + v)) { used.add(label + v); f.push(label + ': ' + v); } });
    const stage = characterIntroStage(st, c), tag = INTRO_STAGE_TAG[stage];
    if (!f.length) { if (stage !== 'done') introRows.push('- ' + c.name + tag + ' | (hồ sơ còn trống: tự đặt chi tiết hợp vai/nghề/tuổi, cụ thể và nhất quán về sau — chương xong sẽ được ghi vào hồ sơ)'); return ''; }
    return '- ' + c.name + (st.mainCharProfile && st.mainCharProfile.name === c.name ? ' (NVC)' : '') + tag + ' | ' + f.join(' | ');
  }).filter(Boolean);
  /* Trạng thái hiện tại tích lũy từ Current Status (mới hơn hồ sơ gốc; ưu tiên khi khác nhau): nghề, nơi ở, trang phục, địa vị, tính cách công khai/riêng tư... */
  const SF = [['occupation', 'công việc hiện tại', 80], ['residence', 'nơi ở hiện tại', 100], ['socialStatus', 'địa vị/quan hệ xã hội', 90], ['clothing', 'trang phục hiện tại', 90], ['marks', 'dấu vết trên cơ thể', 90],
    ['items', 'vật dụng đang dùng', 100], ['emotion', 'cảm xúc', 70], ['submission', 'mức phục tùng', 70], ['ruleCompliance', 'tuân thủ quy tắc', 70], ['publicPersonality', 'hình ảnh công khai phải giữ', 110],
    ['privatePersonality', 'tính cách khi ở riêng', 110], ['romance', 'tình cảm/hôn nhân', 70], ['weakness', 'điểm yếu', 80], ['goals', 'mục tiêu', 80], ['relationships', 'quan hệ quan trọng', 110], ['physicalState', 'thể trạng', 70], ['mentalState', 'tâm lý', 80]];
  const states = (st.statusState && Array.isArray(st.statusState.characterStates)) ? st.statusState.characterStates : [];
  const srows = pick.slice(0, 5).map(c => {
    const sc = states.find(x => x && (normalizeName(x.name || x.characterName || '') === normalizeName(c.name)));
    const ch = sc && sc.changes && typeof sc.changes === 'object' ? sc.changes : null; if (!ch) return '';
    const f = SF.map(([k, label, n]) => { const v = cut(typeof ch[k] === 'object' ? JSON.stringify(ch[k]) : ch[k], n); return v ? label + ': ' + v : ''; }).filter(Boolean);
    return f.length ? '- ' + c.name + ' | ' + f.join(' | ') : '';
  }).filter(Boolean);
  if (!rows.length && !srows.length && !introRows.length) return '';
  const introPart = introRows.length ? '\nNHÂN VẬT CHƯA CÓ HỒ SƠ — chỉ dẫn giới thiệu:\n' + introRows.join('\n') : '';
  const hier = [powerHierarchyBlock(st, pick), innerVoiceBlock(st, pick)].filter(Boolean).join('\n');
  const statusPart = srows.length ? '\nTRẠNG THÁI HIỆN TẠI (Current Status mới nhất — nếu khác hồ sơ gốc thì theo mục này):\n' + srows.join('\n').slice(0, 2200) : '';
  if (!rows.length) return (srows.length ? 'TRẠNG THÁI NHÂN VẬT TRONG SCENE — giữ đúng nghề, nơi ở, địa vị, trang phục, tính cách công khai/riêng tư:' + statusPart : 'NHÂN VẬT TRONG SCENE:') + introPart + (hier ? '\n' + hier : '');
  return 'HỒ SƠ KHÓA CỦA NHÂN VẬT TRONG SCENE (ưu tiên hơn ý tưởng của cảnh) — giữ ĐÚNG chức vụ/nghề, địa vị, nơi ở và mức sống, tính cách, cách nói. KHÔNG tự đổi sang nghề/địa vị thấp hơn hay cao hơn (vd thư ký riêng của chủ tịch không thành người giúp việc), KHÔNG tả nơi ở/mức sống khác hồ sơ (căn hộ cao cấp không thành nhà tồi tàn). Hình thể (chiều cao, dáng, SỐ ĐO, tóc, mắt, da…) có trong hồ sơ thì dùng ĐÚNG, không bịa số khác. Chi tiết hồ sơ không có thì không bịa trái ngược:\n' + rows.join('\n').slice(0, 3800) + introPart + statusPart + (hier ? '\n' + hier : '');
}

/* ===== V14.5.13 — THẺ NHÂN VẬT TRONG CURRENT STATUS (toàn thẻ, tích lũy) =====
   Trước đây bước cập nhật Status chỉ nhận "phần thay đổi có evidence" nên nhiều chương trả rỗng, thẻ nhân vật không bao giờ đầy đủ (nghề, nơi ở, trang phục...).
   Nay: (1) thẻ khởi tạo từ hồ sơ gốc; (2) mỗi chương AI trả ĐỦ thẻ cho nhân vật có mặt — trường không đổi chép lại (không cần evidence), trường đổi/mới phải có câu trích thật;
   (3) kết quả cộng dồn vào statusState.characterStates và được đưa vào prompt viết từng cảnh. */
const STATUS_CARD_KEYS = ['age', 'appearance', 'body', 'clothing', 'marks', 'cultivation', 'cultivationState', 'emotion', 'submission', 'ruleCompliance', 'socialStatus', 'occupation', 'residence', 'romance', 'weakness', 'goals', 'items', 'publicPersonality', 'privatePersonality', 'psychology', 'relationships', 'physicalState', 'mentalState', 'knowledge'];
const STATUS_CARD_LABELS = { age: 'độ tuổi', appearance: 'ngoại hình', body: 'cơ thể/thể trạng', clothing: 'trang phục hiện tại', marks: 'dấu vết trên cơ thể', cultivation: 'tu vi', cultivationState: 'trạng thái tu vi', emotion: 'cảm xúc', submission: 'mức thèm khát/phục tùng', ruleCompliance: 'mức tuân thủ quy tắc', socialStatus: 'địa vị/quan hệ xã hội', occupation: 'công việc hiện tại', residence: 'nơi ở hiện tại', romance: 'hôn nhân/tình cảm', weakness: 'điểm yếu', goals: 'mục tiêu', items: 'vật dụng/đồ chơi đang dùng', publicPersonality: 'hình ảnh công khai', privatePersonality: 'tính cách khi ở riêng', psychology: 'tâm lý', relationships: 'mối quan hệ quan trọng', physicalState: 'thể trạng hiện tại', mentalState: 'tinh thần hiện tại', knowledge: 'điều đã biết' };
function _scVal(v) { if (v == null) return ''; if (typeof v === 'object') { try { return JSON.stringify(v); } catch (_) { return ''; } } return String(v).replace(/\s+/g, ' ').trim(); }
function _scSame(a, b) {
  const x = normalizeName(a), y = normalizeName(b); if (!x || !y) return false; if (x === y) return true;
  const tx = new Set(x.split(' ').filter(Boolean)), ty = new Set(y.split(' ').filter(Boolean)); let hit = 0; tx.forEach(w => { if (ty.has(w)) hit++; });
  return hit / Math.max(1, tx.size + ty.size - hit) >= 0.85;
}
const _SC_LAZY_RE = /^\(?\s*(giữ nguyên|không (có )?thay đổi|như cũ|n\/?a|chưa rõ|không rõ)\b/i;
function seedStatusCard(c) {
  const g = k => _scVal(c && c[k]), out = {};
  const put = (k, v) => { v = _scVal(v); if (v) out[k] = v.slice(0, 220); };
  put('age', g('age')); put('appearance', g('appearance'));
  put('socialStatus', [g('position'), g('role'), g('faction')].filter(Boolean).join('; '));
  put('occupation', g('occupation')); put('residence', g('residence') || g('home') || g('housing'));
  put('romance', [g('maritalStatus'), g('spouseName') && ('với ' + g('spouseName')), g('maritalNotes')].filter(Boolean).join('; '));
  put('weakness', g('weakness')); put('goals', g('goals')); put('publicPersonality', g('personality'));
  put('physicalState', g('physicalState')); put('mentalState', g('mentalState')); put('knowledge', g('knowledge')); put('cultivation', g('realm'));
  return out;
}
function _scFindState(st, c) {
  const states = (st && st.statusState && Array.isArray(st.statusState.characterStates)) ? st.statusState.characterStates : [];
  const nn = normalizeName(c && c.name);
  return states.find(x => x && ((c.id && String(x.characterId || x.id || '') === String(c.id)) || (nn && normalizeName(x.name || x.characterName || '') === nn))) || null;
}
// Thẻ hiện hành = hồ sơ gốc (seed) bị đè bởi giá trị đã tích lũy trong Current Status.
function currentStatusCard(st, c) {
  const seed = seedStatusCard(c), prior = _scFindState(st, c), pc = prior && prior.changes && typeof prior.changes === 'object' ? prior.changes : {}, card = {};
  STATUS_CARD_KEYS.forEach(k => { const v = _scVal(pc[k]) || seed[k]; if (v && !_SC_LAZY_RE.test(v)) card[k] = v; });
  return card;
}
function _scMentioned(name, text) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean), t = String(text || '');
  const has = ph => { if (!ph || ph.length < 2) return false; const esc = ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); try { return new RegExp('(^|[^\\p{L}\\p{N}])' + esc + '(?![\\p{L}\\p{N}])', 'u').test(t); } catch (_) { return false; } };
  return has(w.join(' ')) || (w.length >= 3 && has(w.slice(-2).join(' '))) || (w.length >= 2 && has(w[w.length - 1]) && w[w.length - 1].length >= 3);
}
function statusCardTargets(st, text, max) {
  const pool = [].concat(st && st.mainCharProfile && st.mainCharProfile.name ? [Object.assign({ id: 'main' }, st.mainCharProfile)] : [], Array.isArray(st && st.characters) ? st.characters : []).filter(c => c && c.name && !c.dead);
  const seen = new Set(), out = [];
  pool.forEach(c => { const k = normalizeName(c.name); if (seen.has(k)) return; seen.add(k); if (c.id === 'main' || _scMentioned(c.name, text)) out.push(c); });
  return out.slice(0, max || 8);
}
function buildStatusCardPrompt(o) {
  o = o || {};
  return [
    'CẬP NHẬT THẺ NHÂN VẬT (Current Status) SAU CHƯƠNG ' + (o.chapterNumber || '?') + '. Chỉ trả MỘT JSON object, không markdown, tiếng Việt.',
    'Với MỖI nhân vật trong THẺ HIỆN HÀNH dưới đây, trả ĐỦ thẻ (object "card") gồm mọi khóa hợp lệ. Quy tắc:',
    '1) Trường chương KHÔNG làm đổi: chép lại ĐÚNG NGUYÊN giá trị hiện hành. Cấm viết "giữ nguyên", "không thay đổi", "như cũ" hay viết tắt.',
    '2) Trường chương cho thấy ĐÃ ĐỔI hoặc đang ở trạng thái mới (trang phục, cảm xúc, vật dụng đang dùng, dấu vết trên cơ thể, thể trạng, tâm lý, tinh thần, mức phục tùng thường đổi theo cuối chương): ghi giá trị mới VÀ đặt trong "changeEvidence" một trích đoạn NGUYÊN VĂN 5–18 từ của chương chứng minh đúng giá trị đó.',
    '3) Trường chưa có trong thẻ: chỉ điền khi chương nêu rõ (kèm changeEvidence); nếu không thì để chuỗi rỗng "". TUYỆT ĐỐI không bịa, không suy diễn, không đoán.',
    '4) Công việc, chức vụ, địa vị, nơi ở, tuổi, tình trạng hôn nhân KHÔNG ĐƯỢC đổi trừ khi chương kể rõ sự kiện làm đổi (và có changeEvidence). Nhân vật chỉ được nhắc thoáng qua thì giữ nguyên thẻ.',
    '5) Giữ mọi thông tin quan trọng cần nhớ lâu dài của thẻ cũ; chỉ rút gọn chữ thừa, không làm rơi chi tiết.',
    'KHÓA HỢP LỆ của card: ' + STATUS_CARD_KEYS.join(', ') + '.',
    'THẺ HIỆN HÀNH:\n' + JSON.stringify((o.cards || []).map(c => ({ characterId: c.id, name: c.name, card: c.card }))),
    'JSON TRẢ VỀ: {"cards":[{"characterId":"","name":"","card":{"occupation":"","residence":"","...":""},"changeEvidence":{"khóa":"trích đoạn nguyên văn"}}]}',
    'CHƯƠNG:\n' + String(o.text || '').slice(0, 42000)
  ].join('\n\n');
}
function parseStatusCards(raw) {
  const t = String(raw || '').replace(/<think(?:ing)?[\s>][\s\S]*?<\/think(?:ing)?>/gi, '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const i = t.indexOf('{'), j = t.lastIndexOf('}'); if (i < 0 || j <= i) return null;
  let obj; try { obj = JSON.parse(t.slice(i, j + 1)); } catch (_) { return null; }
  return obj && Array.isArray(obj.cards) ? obj.cards : null;
}
// V14.7.10: Character Database không có chỗ chứa trạng thái động (trang phục, dấu vết, đồ chơi, mức phục tùng, cảm xúc...) — chúng chỉ nằm trong thẻ Current Status
// nên mở tab Nhân vật thấy hồ sơ "đứng yên". Nay phản chiếu thẻ đã duyệt (có bằng chứng) sang trường currentState của nhân vật.
const CHAR_STATE_MIRROR_KEYS = ['body', 'clothing', 'marks', 'emotion', 'submission', 'ruleCompliance', 'items', 'physicalState', 'mentalState', 'residence'];
function characterStateLine(card) {
  card = card && typeof card === 'object' ? card : {};
  return CHAR_STATE_MIRROR_KEYS.map(k => { const v = _scVal(card[k]); return v ? (STATUS_CARD_LABELS[k] || k) + ': ' + v : ''; }).filter(Boolean).join(' | ').slice(0, 1800);
}
// Hồ sơ gốc đang KHÓA chặn ghi đè ngoại hình/tính cách/mục tiêu; thay vì bỏ mất chi tiết có bằng chứng, ghi vào newDetails (không đụng hồ sơ gốc).
function divertLockedDetail(c, key, value) {
  if (!c || !value || !['appearance', 'personality', 'goals', 'role'].includes(key)) return false;
  const v = String(value).replace(/\s+/g, ' ').trim(); if (!v) return false;
  if (normalizeName(c[key] || '').includes(normalizeName(v))) return false;
  const tag = ({ appearance: 'Ngoại hình', personality: 'Tính cách', goals: 'Mục tiêu', role: 'Vai trò mới' })[key] + ': ' + v;
  if (normalizeName(c.newDetails || '').includes(normalizeName(tag))) return false;
  c.newDetails = mergeTextSegments(c.newDetails || '', tag, 1500);
  return true;
}
// Ghép thẻ AI trả vào statusState.characterStates. Trường giống thẻ cũ -> bỏ qua; khác/mới -> cần changeEvidence thật trong chương, nếu không giữ giá trị cũ.
function acceptStatusCards(st, items, source, targets) {
  const out = { changed: 0, dropped: 0, characters: 0, droppedFields: [] };
  if (!st.statusState || typeof st.statusState !== 'object') st.statusState = {};
  if (!Array.isArray(st.statusState.characterStates)) st.statusState.characterStates = [];
  const byName = new Map((items || []).filter(x => x && typeof x === 'object').map(x => [normalizeName(x.name || x.characterName || ''), x]));
  const byId = new Map((items || []).filter(x => x && x.characterId).map(x => [String(x.characterId), x]));
  (targets || []).forEach(c => {
    const base = currentStatusCard(st, c), item = byId.get(String(c.id)) || byName.get(normalizeName(c.name)) || null;
    const card = item && item.card && typeof item.card === 'object' ? item.card : {}, ce = item && item.changeEvidence && typeof item.changeEvidence === 'object' ? item.changeEvidence : {};
    const result = Object.assign({}, base); let changed = 0, firstEv = '';
    STATUS_CARD_KEYS.forEach(k => {
      const v = _scVal(card[k]); if (!v || _SC_LAZY_RE.test(v)) return;
      if (base[k] && _scSame(base[k], v)) return;
      const ev = String(ce[k] || (item && item.evidence) || '').trim();
      if (fieldEvidenceSupports(v, ev, source, 0.4)) { result[k] = v.slice(0, 320); changed++; if (!firstEv) firstEv = ev; }
      else { out.dropped++; if (out.droppedFields.length < 12) out.droppedFields.push(c.name + '.' + k); }
    });
    const prior = _scFindState(st, c), entry = { characterId: c.id, name: c.name, status: changed ? 'updated' : 'unchanged', changes: result, evidence: changed ? firstEv : String((prior && prior.evidence) || '') };
    if (prior) Object.assign(prior, entry, { characterId: prior.characterId || c.id }); else st.statusState.characterStates.push(entry);
    if (changed) { const line = characterStateLine(result); if (line) { c.currentState = line; } }
    out.changed += changed; out.characters++;
  });
  return out;
}
function statusCharacterLines(states) {
  const lines = ['- Thông tin nhân vật cập nhật:'];
  (states || []).forEach(x => {
    if (!x) return; const ch = x.changes && typeof x.changes === 'object' ? x.changes : {};
    const parts = STATUS_CARD_KEYS.map(k => { const v = _scVal(ch[k]); return v ? (STATUS_CARD_LABELS[k] || k) + ': ' + v : ''; }).filter(Boolean);
    lines.push('  • ' + (x.name || x.characterName || 'Nhân vật') + ': ' + (parts.length ? (x.status === 'unchanged' ? 'Không có thay đổi đáng kể | ' : '') + parts.join(' | ') : 'Không có thay đổi đáng kể'));
  });
  return lines.join('\n');
}
// Thay khối "Thông tin nhân vật cập nhật" trong văn bản Current Status bằng thẻ mới (giữ nguyên các phần khác).
function replaceStatusCharacterBlock(text, states) {
  const t = String(text || ''), block = statusCharacterLines(states), head = '- Thông tin nhân vật cập nhật:', i = t.indexOf(head);
  if (i < 0) return (t ? t.replace(/\s+$/, '') + '\n' : '') + block;
  const rest = t.slice(i + head.length), m = rest.search(/\n- (?:XUNG ĐỘT|Current Status trước khi|[^\s•][^\n]{0,60}:)/);
  return t.slice(0, i) + block + (m >= 0 ? rest.slice(m) : '');
}
// Chạy một lượt cập nhật thẻ. o: { st, text, n, callText(prompt)->Promise<string>, maxCards }. Lỗi AI/JSON -> không đổi gì.
async function runStatusCardUpdate(o) {
  const st = o.st, text = String(o.text || '');
  const targets = statusCardTargets(st, text, o.maxCards || 8);
  if (!targets.length) return { ok: false, reason: 'no_targets' };
  const cards = targets.map(c => ({ id: c.id, name: c.name, card: currentStatusCard(st, c) }));
  let raw; try { raw = await o.callText(buildStatusCardPrompt({ chapterNumber: o.n, cards, text })); } catch (e) { return { ok: false, reason: 'ai_error: ' + (e && e.message || e) }; }
  const items = parseStatusCards(raw); if (!items) return { ok: false, reason: 'parse' };
  const r = acceptStatusCards(st, items, text, targets);
  st.currentStatus = replaceStatusCharacterBlock(st.currentStatus, st.statusState.characterStates);
  return Object.assign({ ok: true }, r);
}

function compactSceneContract(scene) {
  const s = scene || {}, out = {};
  [['id', 20], ['purpose', 260], ['location', 120], ['time', 100], ['mustChange', 240], ['handoff', 240]].forEach(([k, n]) => {
    const v = String(s[k] || '').replace(/\s+/g, ' ').trim();
    if (v) out[k] = v.slice(0, n);
  });
  if (Array.isArray(s.beats) && s.beats.length) out.beats = s.beats.map(x => String(x).replace(/\s+/g, ' ').trim().slice(0, 180)).filter(Boolean).slice(0, 6);
  if (Array.isArray(s.characters) && s.characters.length) out.characters = s.characters.map(x => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 6);
  if (Number(s.targetWords)) out.targetWords = Math.max(350, Math.min(2200, Number(s.targetWords)));
  return out;
}

function compactSceneStateDelta(delta) {
  const d = delta || {}, out = {};
  ['sceneId', 'location', 'time', 'mustChange', 'handoff'].forEach(k => {
    const v = String(d[k] || '').replace(/\s+/g, ' ').trim();
    if (v) out[k] = v.slice(0, k === 'sceneId' ? 20 : 260);
  });
  if (Array.isArray(d.characters) && d.characters.length) out.characters = d.characters.map(x => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 6);
  return out;
}

/* V14.4.2: đối chiếu từng beat của Outline chương với văn bản đã viết (0 token, bằng từ khóa có dấu). Chỉ để CẢNH BÁO: AI duyệt hay chấm outlineCompliance quá cao dù truyện lệch. */
function outlineBeatSegments(line) {
  const t = String(line || '').replace(/\s+/g, ' ').trim();
  const k = t.search(/Sự kiện\s*:/u), body = k >= 0 ? t.slice(k) : t;
  return body.split(/(?=(?:Sự kiện|Kháng cự|Hậu quả|Móc kết|Cảnh nóng|Cảnh chính)\s*:)|;|\s\+\s|(?<=[.!?…])\s+(?=\p{Lu})/u)
    .map(x => x.replace(/^(?:Sự kiện|Kháng cự|Hậu quả|Móc kết|Cảnh nóng|Cảnh chính)\s*:\s*/u, '').replace(/[.;\s]+$/u, '').trim())
    .filter(x => x.length >= 8);
}
function outlineBeatCoverage(outlineLine, chapterText, names) {
  const segs = outlineBeatSegments(outlineLine); if (!segs.length) return { total: 0, missing: [] };
  const excl = new Set();
  (names || []).forEach(n => normalizeName(n).split(/[^a-z0-9đ]+/).forEach(w => { if (w.length >= 2) excl.add(w); }));
  const words = w => (String(w || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
  const have = new Set(words(chapterText)), miss = []; let total = 0;
  segs.forEach(seg => {
    const toks = Array.from(new Set(words(seg).filter(w => w.length >= 2 && !SCENE_STOP_TOKENS.has(normalizeName(w)) && !excl.has(normalizeName(w)))));
    if (toks.length < 3) return;
    total++;
    if (toks.filter(w => have.has(w)).length / toks.length < 0.4) miss.push(seg.slice(0, 90));
  });
  return { total, missing: miss };
}
function outlineMissingBeats(outlineLine, chapterText, names) { return outlineBeatCoverage(outlineLine, chapterText, names).missing.slice(0, 6); }
/* V14.5.1: QUALITY GATE chặn khi chương thiếu nhiều ý của Outline. Thiếu >= 40% số ý đánh giá được (và có từ 2 ý trở lên) -> lỗi NẶNG (HARD_FAIL, kích hoạt tự vá);
   thiếu ít hơn -> chỉ cảnh báo. Đối chiếu bằng từ khóa nên có thể báo thừa: thông báo nói rõ và vẫn cho duyệt thủ công. Tắt bằng state.outlineBeatGate === false. */
function outlineGateCheck(st, n, text, names) {
  const out = { hard: [], warn: [] };
  if (!st || st.outlineBeatGate === false) return out;
  const ol = outlineOf(st, n); if (!ol) return out;
  const line = outlineChapterLines(ol.content, ol)[n]; if (!line) return out;
  const cov = outlineBeatCoverage(line, text, names);
  if (!cov.total || !cov.missing.length) return out;
  const msg = 'Outline chương ' + n + ' chưa thực hiện đủ (đối chiếu từ khóa): chưa thấy ' + cov.missing.length + '/' + cov.total + ' ý — ' + cov.missing.slice(0, 4).map(x => '«' + x.slice(0, 80) + '»').join(' · ') + '. Cần viết đủ các ý này trong chương; nếu truyện thật ra đã viết chúng bằng câu chữ khác thì có thể duyệt thủ công.';
  /* V14.5.9: đối chiếu từ khóa hay báo thừa (truyện đã viết ý đó bằng câu chữ khác) nên mặc định chỉ CẢNH BÁO, không HARD_FAIL.
     Muốn lại chế độ chặn cứng: state.outlineBeatGate = "strict". */
  if (st.outlineBeatGate === "strict" && cov.total >= 2 && cov.missing.length >= Math.max(1, Math.ceil(cov.total * 0.4))) out.hard.push(msg); else out.warn.push(msg);
  return out;
}
function buildAdaptiveScenePlanPrompt(o) {
  const limits = adaptiveChapterWordLimits(o.state || {});
  return [
    'BẠN LÀ BIÊN KỊCH TIỂU THUYẾT DÀI KỲ TIẾNG VIỆT.',
    'Lập Scene Graph cho chương khoảng ' + limits.target + ' từ; chấp nhận ' + limits.minAccept + '–' + limits.maxAccept + ' từ.',
    'Số scene, chức năng và độ dài scene phải LINH HOẠT theo diễn biến; không dùng khuôn Scene 1 mở đầu, Scene 2 xung đột, Scene 3 cảnh nóng.',
    'Có thể gom nhiều beat vào một scene hoặc tách một beat thành nhiều scene nếu nhịp truyện cần.',
    'Không gán giờ cụ thể cho mọi scene và không tự đặt mã/số hiệu tài liệu mới trong beats/time; chỉ ghi giờ khi cốt truyện cần (hạn chót, cuộc hẹn).',
    'Mỗi scene phải nối tự nhiên với scene trước và tạo thay đổi thật về thông tin, cảm xúc, quan hệ, mục tiêu hoặc hậu quả.',
    (o.matureBlock ? o.matureBlock : 'Nếu có cảnh trưởng thành, chỉ đặt khi mạch truyện cần; cảnh đó phải có nhân vật trưởng thành, nhất quán thiết lập và hậu quả rõ.'),
    'Không thêm biến cố lớn ngoài brief/canon. Không tự biến nhân vật phụ/nhân vật mới thành tuyến chính nếu Outline/Arc không giao việc đó. Không đổi nghề, tài nguyên, địa vị hoặc mục tiêu sinh tồn của nhân vật chính.',
    o.chapterContract ? 'CHAPTER CONTRACT BẤT BIẾN — không được sửa các trường này:\n' + JSON.stringify(promptChapterContract(o.chapterContract)) : '',
    o.allowedCast ? 'ALLOWED CAST — chỉ dùng các nhân vật/tên dưới đây; nhân vật khác chỉ được xuất hiện thoáng qua nếu chính Outline/Brief cho phép và không được thành tuyến chính:\n' + String(o.allowedCast).replace(/\s+/g, ' ').slice(0, 1800) : '',
    o.forbiddenDrift ? 'FORBIDDEN DRIFT — tuyệt đối không làm các hướng sau:\n' + String(o.forbiddenDrift).replace(/\s+/g, ' ').slice(0, 1200) : '',
    'Trả duy nhất JSON object hợp lệ theo schema: {"chapterGoal":"","endingAnchor":"","scenes":[{"id":"S1","purpose":"","beats":[""],"characters":[""],"location":"","time":"","targetWords":900,"mustChange":"","handoff":""}]}',
    'Bối cảnh/canon:\n' + String(o.context || '').slice(0, 18000),
    o.recent ? 'Đoạn gần nhất:\n' + String(o.recent).slice(-5000) : '',
    o.directive ? 'Mệnh lệnh người dùng:\n' + String(o.directive).slice(0, 6000) : '',
    o.hint ? 'Gợi ý chương sau (THAM KHẢO — THẤP HƠN Outline; phần nào trái Outline thì BỎ):\n' + String(o.hint).slice(0, 2500) : '',
    'THỨ TỰ ƯU TIÊN KHI MÂU THUẪN: (1) Outline chương + checklist beat ngay bên dưới; (2) mệnh lệnh người dùng; (3) gợi ý chương sau; (4) bối cảnh/đoạn gần nhất. Bối cảnh, đoạn gần nhất và gợi ý chỉ dùng để nối mạch; KHÔNG được thay sự kiện, thứ tự hay kết quả mà Outline đã giao cho chương này. MỌI sự kiện chính của Outline PHẢI có mặt và được viết ĐẦY ĐỦ trong chính chương này (không bỏ, không rút thành tóm tắt, không dời sang chương sau). Các quy tắc chung (yếu tố mới, xung đột, thất bại/phản đòn, bước tiến…) nên được đưa vào BÊN TRONG hoặc xen kẽ sự kiện Outline; vẫn được thêm chi tiết/tình tiết phụ, miễn là không chiếm chỗ hay làm thiếu sự kiện chính. THREADS/FORESHADOWING chỉ là bối cảnh tham khảo, không bắt buộc tiến triển.',
    o.arcProgress ? 'ARC/OUTLINE LOCK — chương này bắt buộc đi đúng hướng sau, không được mở tuyến thay thế:\n' + String(o.arcProgress).replace(/\s+/g, ' ').slice(0, 2600) : '',
    o.requiredBeats ? 'REQUIRED BEAT CHECKLIST — PHẢI PHÂN BỔ VÀO SCENE, KHÔNG ĐƯỢC BỎ SÓT:\n' + String(o.requiredBeats).slice(0, 1800) : '',
    Array.isArray(o.outlineItems) && o.outlineItems.length ? ('OUTLINE ĐÁNH SỐ — kế hoạch PHẢI bám sát. Mỗi scene khai báo thêm trường "outlineItems":[số thứ tự các mục nó THỰC HIỆN]. Quy tắc: (1) mọi mục từ 1 đến ' + o.outlineItems.length + ' phải được ĐÚNG MỘT scene thực hiện; (2) các mục theo ĐÚNG thứ tự, không đảo; (3) mỗi scene thực hiện 1–3 mục LIỀN KỀ (có thể gom hoặc tách cảnh để hợp nhịp); (4) tối đa 1 scene nối/chuyển không có mục mới (outlineItems:[]); (5) beats và mustChange của scene lấy từ chính các mục đó, không đổi kết quả; (6) mustChange phải nêu KẾT QUẢ quan sát được khi cảnh xong (dạng "xong khi …": ai làm gì, điều gì thay đổi), vì từng mục sẽ được kiểm tra bằng câu trích dẫn từ văn bản:\n' + o.outlineItems.map((t, i) => (i + 1) + '. ' + String(t).slice(0, 240)).join('\n') + (o.outlineMeta && (o.outlineMeta.resistance || o.outlineMeta.consequence || o.outlineMeta.hook) ? '\nGhi chú kết quả của chương: ' + [o.outlineMeta.resistance && 'Kháng cự: ' + o.outlineMeta.resistance, o.outlineMeta.consequence && 'Hậu quả: ' + o.outlineMeta.consequence, o.outlineMeta.hook && 'Móc kết (endingAnchor): ' + o.outlineMeta.hook].filter(Boolean).join(' | ') : '')) : ''
  ].filter(Boolean).join('\n\n');
}

// V14.0.1: model đôi khi bọc JSON trong markdown hoặc thêm một câu dẫn.
// Chỉ lấy object cân bằng đầu tiên; không coi phản hồi hợp lệ là plan rỗng.
function _repairTruncatedJson(s) {
  // Model bị cắt giữa chừng: đóng chuỗi/mảng/object còn mở rồi thử parse (chỉ dùng khi không còn cách khác).
  const stack = []; let quoted = false, escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') quoted = false; continue; }
    if (ch === '"') quoted = true; else if (ch === '{' || ch === '[') stack.push(ch); else if (ch === '}' || ch === ']') stack.pop();
  }
  let out = s;
  if (quoted) out += '"';
  out = out.replace(/[,:\s]+$/, '').replace(/,\s*"[^"]*"\s*$/, '');
  while (stack.length) out += stack.pop() === '{' ? '}' : ']';
  try { return JSON.parse(out); } catch (_) { return null; }
}

function parseAdaptiveScenePlanResponse(raw) {
  if (raw && typeof raw === 'object') return raw;
  let s = String(raw || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/<think(?:ing)?>[\s\S]*$/i, '').trim();
  if (!s) return null;
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try { return JSON.parse(s); } catch (_) {}
  // Thử từng dấu '{' làm điểm bắt đầu (lời dẫn có thể chứa '{' trước JSON thật).
  let tried = 0, pos = s.indexOf('{');
  while (pos >= 0 && tried < 6) {
    tried++;
    let depth = 0, quoted = false, escaped = false, end = -1;
    for (let i = pos; i < s.length; i++) {
      const ch = s[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') quoted = false;
        continue;
      }
      if (ch === '"') { quoted = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end >= 0) {
      try { const o = JSON.parse(s.slice(pos, end + 1)); if (o && typeof o === 'object' && (o.scenes || o.chapterGoal)) return o; } catch (_) {}
    } else {
      const fixed = _repairTruncatedJson(s.slice(pos));
      if (fixed && typeof fixed === 'object' && (fixed.scenes || fixed.chapterGoal)) return fixed;
    }
    pos = s.indexOf('{', pos + 1);
  }
  return null;
}

function normalizeAdaptiveScenePlan(raw, st) {
  const obj = parseAdaptiveScenePlanResponse(raw);
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.scenes)) return null;
  const limits = adaptiveChapterWordLimits(st || {});
  const scenes = obj.scenes.filter(Boolean).slice(0, 8).map((s, i) => ({
    id: String(s.id || ('S' + (i + 1))).slice(0, 20),
    purpose: String(s.purpose || '').slice(0, 500),
    beats: Array.isArray(s.beats) ? s.beats.map(x => String(x).slice(0, 500)).filter(Boolean).slice(0, 8) : [],
    characters: Array.isArray(s.characters) ? s.characters.map(x => String(x).slice(0, 100)).filter(Boolean).slice(0, 8) : [],
    location: String(s.location || '').slice(0, 180),
    time: String(s.time || '').slice(0, 180),
    targetWords: Math.max(350, Math.min(2200, Number(s.targetWords) || Math.round(limits.target / Math.max(1, obj.scenes.length)))),
    mustChange: String(_planField(s, ['mustChange', 'must_change', 'mustchange', 'must-change', 'change', 'keyChange', 'sceneChange', 'outcome'])).slice(0, 400),
    handoff: String(_planField(s, ['handoff', 'hand_off', 'hand-off', 'handOff', 'transition', 'nextHook', 'bridge'])).slice(0, 400),
    ...(Array.isArray(s.outlineItems) ? { outlineItems: s.outlineItems.map(Number).filter(x => Number.isInteger(x) && x > 0 && x <= 20) } : {})
  }));
  if (!scenes.length) return null;
  const one = x => String(x || '').replace(/\s+/g, ' ').trim();
  const lastSc = scenes[scenes.length - 1];
  // V14.5.2: model lớn hay bỏ trống mustChange/handoff/endingAnchor -> tự suy ra từ purpose/beats và scene kế, thay vì PLAN_REJECTED.
  const chapterGoal = String(_planField(obj, ['chapterGoal', 'chapter_goal', 'goal'])).slice(0, 600)
    || one(scenes[0].purpose || (scenes[0].beats && scenes[0].beats[0])).slice(0, 600);
  const endingAnchor = String(_planField(obj, ['endingAnchor', 'ending_anchor', 'endingHook', 'ending'])).slice(0, 600)
    || one((lastSc.beats && lastSc.beats[lastSc.beats.length - 1]) || lastSc.mustChange || lastSc.purpose).slice(0, 600);
  scenes.forEach((sc, i) => {
    const next = scenes[i + 1];
    if (!sc.mustChange.trim()) sc.mustChange = one(sc.purpose || (sc.beats && sc.beats[0]) || chapterGoal || ('Diễn biến chính của ' + sc.id)).slice(0, 400);
    if (!sc.handoff.trim()) {
      sc.handoff = (next
        ? 'Dẫn sang ' + next.id + ': ' + one(next.purpose || (next.beats && next.beats[0]) || next.location || 'scene kế tiếp')
        : 'Kết chương: ' + one(endingAnchor || 'theo Outline')).slice(0, 400);
    }
  });
  return { chapterGoal, endingAnchor, scenes };
}

function _planField(o, keys) {
  for (const k of keys) { const v = o && o[k]; if (v == null) continue; const t = Array.isArray(v) ? v.join('; ') : (typeof v === 'object' ? '' : String(v)); if (t.trim()) return t; }
  return '';
}

// V14: Contract-First — kế hoạch AI không được tự thay đổi các trường này.
function compactChapterContract(contract) {
  const c = contract || {};
  return {
    chapterNumber: Number(c.chapterNumber) || 0,
    arcGoal: String(c.arcGoal || '').replace(/\s+/g, ' ').slice(0, 700),
    chapterOutline: String(c.chapterOutline || '').replace(/\s+/g, ' ').slice(0, 1000),
    requiredBeats: Array.isArray(c.requiredBeats) ? c.requiredBeats.map(x => String(x).replace(/\s+/g, ' ').slice(0, 400)).filter(Boolean).slice(0, 8) : [],
    allowedCharacters: Array.isArray(c.allowedCharacters) ? c.allowedCharacters.map(x => String(x).trim().slice(0, 100)).filter(Boolean).slice(0, 24) : [],
    canonicalCharacters: Array.isArray(c.canonicalCharacters) ? c.canonicalCharacters.map(x => String(x).trim().slice(0, 100)).filter(Boolean).slice(0, 60) : (Array.isArray(c.knownCharacters) ? c.knownCharacters.map(x => String(x).trim().slice(0, 100)).filter(Boolean).slice(0, 60) : []),
    forbiddenDrift: Array.isArray(c.forbiddenDrift) ? c.forbiddenDrift.map(x => String(x).replace(/\s+/g, ' ').slice(0, 300)).filter(Boolean).slice(0, 8) : [],
    userBrief: String(c.userBrief || '').replace(/\s+/g, ' ').slice(0, 2000),
    nameSource: String(c.nameSource || '').replace(/\s+/g, ' ').slice(0, 30000),
    openingContinuity: String(c.openingContinuity || '').replace(/\s+/g, ' ').slice(-1200),
    mustChange: String(c.mustChange || '').replace(/\s+/g, ' ').slice(0, 600),
    minWords: Number(c.minWords) || chapterWordLimits().minAccept,
    maxWords: Number(c.maxWords) || chapterWordLimits().maxAccept
  };
}

// V14.0.8: bản contract ĐƯA VÀO PROMPT/HIỂN THỊ — bỏ userBrief (chỉ để validator đối chiếu; Mệnh lệnh/Gợi ý đã có sẵn trong prompt,
// nhét lại sẽ tốn token ở mọi scene và làm khung "Kế hoạch" tràn quy tắc chương).
function promptChapterContract(contract) {
  const c = compactChapterContract(contract);
  delete c.userBrief;
  delete c.nameSource;
  return c;
}

function _contractNameSet(contract) {
  const c = compactChapterContract(contract);
  return new Set([].concat(c.allowedCharacters || [], c.canonicalCharacters || []).map(normalizeName).filter(Boolean));
}

// V14.0.11: so khớp tên theo TỪNG TIẾNG: "Mỹ Duyên" thuộc cast nếu cast có "Trần Mỹ Duyên" (và ngược lại); biệt danh/alias nằm sẵn trong cast.
function _nameInCast(name, allowedSet) {
  const n = normalizeName(name);
  if (allowedSet.has(n)) return true;
  const nt = n.split(' ').filter(Boolean);
  for (const a of allowedSet) {
    const at = String(a).split(' ').filter(Boolean);
    if (at.length >= 2 && nt.length >= 2 && (nt.every(t => at.includes(t)) || at.every(t => nt.includes(t)))) return true;
  }
  return false;
}

// V14.0.12: tên đã được nhắc trong Outline/Arc/Gợi ý/chương gần nhất là nhân vật CÓ THẬT của truyện (Character Database chỉ chưa kịp cập nhật).
function _nameInText(name, text) {
  const t = normalizeName(text);
  if (!t) return false;
  const n = normalizeName(name);
  if (n && t.includes(n)) return true;
  const tk = n.split(' ').filter(Boolean);
  return tk.length >= 3 && t.includes(tk.slice(-2).join(' ')); // "Trần Văn Hải" ~ "Văn Hải"
}

function _looksLikeNamedCharacter(value) {
  const s = String(value || '').trim();
  return /^[A-ZÀ-ỸĐ][\p{L}]+(?:\s+[A-ZÀ-ỸĐ][\p{L}]+)+$/u.test(s);
}

function validateAdaptiveScenePlan(plan, contract) {
  const p = plan || {}, c = compactChapterContract(contract), errors = [];
  if (!p || !Array.isArray(p.scenes) || !p.scenes.length) errors.push('Scene Graph không có scene.');
  if (!String(p.chapterGoal || '').trim()) errors.push('Scene Graph thiếu chapterGoal.');
  if (!String(p.endingAnchor || '').trim()) errors.push('Scene Graph thiếu endingAnchor.');
  const allowed = _contractNameSet(c), outsiders = [];
  (p.scenes || []).forEach(s => {
    if (!String(s.mustChange || '').trim()) errors.push((s.id || 'scene') + ' thiếu mustChange.');
    if (!String(s.handoff || '').trim()) errors.push((s.id || 'scene') + ' thiếu handoff.');
    (s.characters || []).forEach(name => {
      if (_looksLikeNamedCharacter(name) && allowed.size && !_nameInCast(name, allowed) && !_nameInText(name, c.nameSource) && !outsiders.includes(String(name).trim())) outsiders.push(String(name).trim());
    });
  });
  if (outsiders.length) errors.push('Nhân vật ngoài Canon Cast: ' + outsiders.join(', ') + ' (nếu là nhân vật thật thì thêm vào Story Bible/Outline; nếu không thì bỏ khỏi plan)');
  // V14.0.6: so khớp THEO CỤM CHỦ ĐỀ nguyên vẹn (vệ sĩ, khách sạn, váy cưới...) thay vì từng âm tiết rời
  // ("vệ", "sĩ", "khách"... trùng "bảo vệ", "bác sĩ", "khách" thông thường nên chương nào cũng bị từ chối).
  // Chủ đề nào Outline/Arc/requiredBeats của chương ĐÃ ghi rõ thì được phép xuất hiện trong plan.
  const allPlan = JSON.stringify(p).toLowerCase();
  // Chủ đề được phép nếu đã có trong: Outline/Arc/beat, MỆNH LỆNH + GỢI Ý của người dùng, hoặc đoạn kết chương trước
  // (cảnh đang diễn ra ở khách sạn thì chương sau nối tiếp ở đó là liên tục, không phải lệch tuyến).
  const allowedSource = [c.chapterOutline, c.arcGoal, c.mustChange, c.userBrief, c.openingContinuity].concat(c.requiredBeats || []).join(' ').toLowerCase();
  const DRIFT_TOPICS = [
    { rule: /vệ sĩ/i, plan: /vệ sĩ/ },
    { rule: /khách sạn/i, plan: /khách sạn/ },
    { rule: /váy cưới/i, plan: /váy cưới|shop váy|tiệm váy|cửa hàng váy/ },
    { rule: /kim chi/i, plan: /kim chi/ }
  ];
  (c.forbiddenDrift || []).forEach(rule => {
    DRIFT_TOPICS.forEach(t => {
      if (t.rule.test(String(rule)) && t.plan.test(allPlan) && !t.plan.test(allowedSource)) {
        errors.push('Plan nhắc tới "' + (allPlan.match(t.plan) || [''])[0] + '" nhưng Outline/Brief/Gợi ý/đoạn kết chương trước không có — bỏ tuyến này hoặc ghi rõ vào Outline/Gợi ý. Luật: ' + String(rule).slice(0, 140));
      }
    });
  });
  return { ok: errors.length === 0, errors: errors.slice(0, 20), contract: c, outsiders };
}

function validateSceneTextAgainstContract(text, contract) {
  const c = compactChapterContract(contract), t = String(text || ''), errors = [];
  if (t.trim().length < 80) errors.push('scene quá ngắn');
  const allowed = _contractNameSet(c);
  const names = (c.allowedCharacters || []).map(String).filter(Boolean);
  // Chỉ chặn các nhân vật đã biết trong Story Bible nhưng không được phép ở chương này;
  // không cố đoán mọi danh từ chung trong văn xuôi.
  const known = Array.isArray(contract && contract.knownCharacters) ? contract.knownCharacters : [];
  known.forEach(name => {
    if (!name || allowed.has(normalizeName(name))) return;
    const re = new RegExp('(^|[^\\p{L}])' + String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^\\p{L}]|$)', 'iu');
    if (re.test(t)) errors.push('scene dùng nhân vật ngoài allowed cast: ' + name);
  });
  return { ok: errors.length === 0, errors: errors.slice(0, 10) };
}

/* ===== V14.0.16 — KIỂM TRA TỪNG SCENE (code, 0 token) + rà AI tùy chọn =====
   Lỗi NẶNG (errors) -> viết lại ĐÚNG scene đó ngay (không ghép tiếp scene sai vào chương).
   Cảnh báo (warnings) -> chỉ ghi telemetry, không tốn thêm lượt gọi AI. */
const SCENE_STOP_TOKENS = new Set(['va','la','cua','mot','cac','nhung','trong','khi','cho','voi','duoc','nay','kia','the','nao','thi','den','tu','ra','vao','len','xuong','nhu','nen','ma','cung','da','dang','se','con','chi','rat','hon','nhieu','khong','co','nguoi','viec','dieu','luc','sau','truoc','nhau','lai','roi','ve','di','de','tren','duoi','giua','ngoai','minh','ho','no','anh','chi','em','ong','ba','cau','phai','biet','thay','muon','can','moi','van','vua','cung','hay','hoac','neu','vi','nen','boi','tai','theo','sang','qua']);
const SCENE_LEAK_RE = /(^|\n)\s*(?:\*\*|#{1,4}\s*)?(?:scene|cảnh|canh)\s*\d+\s*[:.\-—)]|\b(?:CONTRACT COMPACT|STATE DELTA|ALLOWED CAST|STYLE LOCK|REQUIRED CHECKLIST|ĐIỂM KẾT BẮT BUỘC|RÀO_CHẮN_TUỔI)\b/i;
// V14.5.4: model lớn hay tự thêm tiêu đề "Scene 2:" / "**Cảnh 2.**" hoặc nhắc tên khối chỉ dẫn -> gỡ các dòng đó thay vì loại cả scene.
const SCENE_LEAK_KW_RE = /\b(?:CONTRACT COMPACT|STATE DELTA|ALLOWED CAST|STYLE LOCK|REQUIRED CHECKLIST|ĐIỂM KẾT BẮT BUỘC|RÀO_CHẮN_TUỔI)\b/i;
const SCENE_HEAD_RE = /^\s*(?:\*\*|__|#{1,4}\s*)?\s*(?:scene|cảnh|canh)\s*\d+\s*(?:\*\*|__)?\s*[:.\-—–)]\s*(?:\*\*|__)?\s*/i;
function stripSceneLeaks(text) {
  const out = [];
  String(text || '').split('\n').forEach(line => {
    if (SCENE_LEAK_KW_RE.test(line)) return;                        // dòng nhắc khối chỉ dẫn -> bỏ
    const m = line.match(SCENE_HEAD_RE);
    if (m) { const rest = line.slice(m[0].length).replace(/^\s*(?:\*\*|__)\s*/, '').trim(); if (rest.length < 25) return; line = rest; } // tiêu đề trơ -> bỏ; "Scene 2: văn xuôi…" -> giữ phần văn xuôi
    out.push(line);
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function _sceneTokens(text) {
  return normalizeName(text).split(/[^a-z0-9đ]+/).filter(t => t.length >= 3 && !SCENE_STOP_TOKENS.has(t));
}
// Tỉ lệ từ khóa của `phrase` xuất hiện trong `text` (null nếu phrase quá ít từ khóa để so sánh).
function sceneKeywordCoverage(text, phrase) {
  const pt = Array.from(new Set(_sceneTokens(phrase)));
  if (pt.length < 3) return null;
  const tt = new Set(_sceneTokens(text));
  return pt.filter(t => tt.has(t)).length / pt.length;
}
function checkSceneQuality(text, scene, ctx) {
  ctx = ctx || {}; scene = scene || {};
  const t = String(text || ''), words = countWords(t), target = Number(scene.targetWords) || 0;
  const base = validateSceneTextAgainstContract(t, ctx.contract);
  const errors = base.errors.slice(), warnings = [];
  if (words < 80 && !errors.includes('scene quá ngắn')) errors.push('scene quá ngắn');
  if (SCENE_LEAK_RE.test(t)) errors.push('scene lộ chỉ dẫn/tiêu đề (vd "Scene 2:", CONTRACT, STATE DELTA) — chỉ được trả văn xuôi');
  if (target && words >= 80 && words < target * 0.5) warnings.push('scene ngắn hơn 50% ngân sách (' + words + '/' + target + ' từ) — dựa vào bước bù từ');
  if (target && words > target * 2.2) warnings.push('scene dài gấp ' + (words / target).toFixed(1) + ' lần ngân sách (' + words + '/' + target + ' từ)');
  if (words >= 80 && !/[.!?…"”»)\]]\s*$/.test(t.trim())) warnings.push('scene kết thúc giữa câu (có thể bị cắt)');
  if (words >= 80 && scene.mustChange) {
    const cov = sceneKeywordCoverage(t, scene.mustChange);
    if (cov !== null && cov < 0.2) warnings.push('mustChange có vẻ chưa thực hiện: "' + String(scene.mustChange).slice(0, 90) + '"');
  }
  if (words >= 80 && Array.isArray(scene.characters) && scene.characters.length) {
    const nt = ' ' + normalizeName(t).replace(/[^a-z0-9\u0111]+/g, ' ') + ' ';
    const mentioned = scene.characters.some(n => {
      const full = normalizeName(n).replace(/[^a-z0-9\u0111]+/g, ' ').trim(), toks = full.split(' ').filter(x => x.length >= 2);
      return toks.length && (nt.includes(' ' + full + ' ') || nt.includes(' ' + toks[toks.length - 1] + ' '));
    });
    if (!mentioned) warnings.push('không nhắc tên nhân vật nào trong kế hoạch scene (' + scene.characters.slice(0, 3).join(', ') + ')');
  }
  if (words >= 80 && ctx.isFinal && ctx.endingAnchor) {
    const tail = t.slice(Math.floor(t.length * 0.6)), cov = sceneKeywordCoverage(tail, ctx.endingAnchor);
    if (cov !== null && cov < 0.2) warnings.push('đoạn cuối chưa chạm điểm kết dự kiến: "' + String(ctx.endingAnchor).slice(0, 90) + '"');
  }
  return { ok: errors.length === 0, errors: errors.slice(0, 8), warnings: warnings.slice(0, 6), words };
}
// Rà AI nhỏ cho MỘT scene (tùy chọn, mặc định tắt): chỉ gửi contract scene + văn bản scene, không gửi cả chương.
function buildSceneReviewPrompt(o) {
  o = o || {}; const s = o.scene || {};
  const cc = o.chapterContract ? promptChapterContract(o.chapterContract) : null;
  return [
    'KIỂM TRA MỘT SCENE tiểu thuyết so với kế hoạch. Chỉ trả JSON: {"ok":true|false,"issues":[{"code":"MUST_CHANGE|LOCATION_TIME|NEW_THREAD|CAST|HANDOFF","msg":"ngắn gọn, nêu cách sửa"}]}',
    'Chỉ báo lỗi CHẮC CHẮN. Văn phong, nhịp, từ ngữ KHÔNG phải lỗi. HANDOFF chỉ là gợi ý và KHÔNG báo vì scene sau khác địa điểm/thời điểm (scene sau sẽ tự có câu chuyển cảnh). KHÔNG tự nghĩ thêm yêu cầu: chỉ đối chiếu với chữ trong SCENE CONTRACT; ví dụ hay cách làm bạn hình dung KHÔNG phải điều bắt buộc.',
    '- MUST_CHANGE: thay đổi cốt lõi trong mustChange HOÀN TOÀN vắng trong văn bản. Thực hiện một phần, hoặc bằng hành động khác với cách bạn hình dung, vẫn là ĐẠT. Không đòi hành động/kết quả cụ thể mà mustChange không nêu; thiếu một chi tiết nhỏ thì KHÔNG báo.\n- LOCATION_TIME: địa điểm/thời điểm trái kế hoạch mà không có câu chuyển cảnh.\n- NEW_THREAD: tự mở tuyến/biến cố lớn hoặc nhân vật quan trọng mới ngoài kế hoạch.\n- CAST: dùng nhân vật ngoài allowed cast làm vai chính của cảnh.\n- HANDOFF: phần cuối không dẫn tới scene sau.',
    'SCENE CONTRACT:\n' + JSON.stringify(compactSceneContract(s)),
    cc ? 'CHAPTER CONTRACT:\n' + JSON.stringify({ allowedCharacters: cc.allowedCharacters, forbiddenDrift: cc.forbiddenDrift }) : '',
    o.nextScene ? 'SCENE SAU (để xét handoff): ' + JSON.stringify({ location: o.nextScene.location, time: o.nextScene.time, purpose: String(o.nextScene.purpose || '').slice(0, 160) }) : '',
    'VĂN BẢN SCENE:\n' + String(o.text || '').slice(0, 9000)
  ].filter(Boolean).join('\n\n');
}
function parseSceneReviewResponse(raw) {
  // Không dùng stripThinkingOutput: JSON thuần ASCII sẽ bị coi là "khối tiếng Anh" và bị xóa.
  const t = String(raw || '').replace(/<think(?:ing)?[\s>][\s\S]*?<\/think(?:ing)?>/gi, '');
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  let obj; try { obj = JSON.parse(t.slice(i, j + 1)); } catch (_) { return null; }
  if (!obj || typeof obj !== 'object') return null;
  const issues = Array.isArray(obj.issues) ? obj.issues : [];
  const errors = [], warnings = [];
  issues.slice(0, 6).forEach(x => {
    const code = String(x && x.code || '').toUpperCase(), msg = String(x && (x.msg || x.message) || '').replace(/\s+/g, ' ').slice(0, 360);
    if (!msg) return;
    (code === 'HANDOFF' ? warnings : errors).push((code || 'ISSUE') + ': ' + msg);
  });
  return { ok: obj.ok !== false && !errors.length, errors, warnings };
}

/* ===== V14.5.9 — SỔ BẰNG CHỨNG SỰ KIỆN OUTLINE =====
   Mỗi mục Outline được giao cho một scene; scene viết xong thì AI phải TRÍCH CÂU NGUYÊN VĂN làm bằng chứng cho từng mục.
   Code kiểm tra câu trích có thật trong văn bản (chống bịa). Mục thiếu -> vá CỤC BỘ đúng scene đó; cuối chương chỉ chốt lại bằng sổ này
   (thay cho đối chiếu từ khóa vốn hay báo thừa khi truyện viết ý đó bằng câu chữ khác). */
function _evNorm(x) { return String(x || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim(); }
function beatEvidenceInText(evidence, text) {
  const e = _evNorm(evidence), t = _evNorm(text);
  if (e.split(' ').filter(Boolean).length < 3) return false;
  if (t.includes(e)) return true;
  const et = e.split(' ').filter(w => w.length >= 2), tt = new Set(t.split(' '));
  return et.length >= 4 && et.filter(w => tt.has(w)).length / et.length >= 0.7;
}
/* V14.5.14: MỤC OUTLINE GHÉP (liệt kê >= 3 hành động: "Còng tay, đeo vòng cổ, bắt quỳ và …") được tách thành Ý CON.
   Trước đây chỉ cần một câu trích cho cả mục là qua kiểm tra, nên chỉ một ý con xuất hiện (đâu đó trong cảnh) vẫn "done"; bộ chấm cuối chương mới bắt lỗi -> viết xong mới biết thiếu. */
function outlineItemParts(text) {
  const parts = String(text || '').replace(/\s+/g, ' ').trim()
    .split(/\s*(?:,|;|\s\+\s|\s+và\s+|\.\s+(?=\p{Lu}))\s*/u)
    .map(s => s.replace(/[.\s]+$/u, '').trim()).filter(s => s.length >= 4);
  return parts.length >= 3 && parts.length <= 7 ? parts : [];
}
function outlineItemIsCompound(text) { return outlineItemParts(text).length >= 3; }
function buildBeatEvidencePrompt(o) {
  o = o || {}; const items = Array.isArray(o.items) ? o.items : [];
  const itemLine = x => {
    const t = String(x.text || '').replace(/\s+/g, ' ').slice(0, 300), parts = outlineItemParts(t);
    return x.n + '. ' + t + (parts.length ? '  [GỒM ' + parts.length + ' Ý CON, phải có ĐỦ TẤT CẢ: ' + parts.map((p, k) => (k + 1) + ') ' + p).join(' · ') + ']' : '');
  };
  const hasParts = items.some(x => outlineItemParts(x.text).length);
  return [
    'KIỂM TRA SỰ KIỆN BẮT BUỘC của ' + (o.scope === 'chapter' ? 'CHƯƠNG' : 'MỘT SCENE') + ' tiểu thuyết. Với MỖI sự kiện dưới đây, quyết định văn bản đã THỰC HIỆN nó chưa.',
    'Chỉ trả JSON: {"items":[{"n":1,"done":true,"evidence":"trích NGUYÊN VĂN 6–25 từ liên tục từ văn bản"}]} — evidence để rỗng nếu done=false.',
    'QUY TẮC: done=true khi sự kiện thực sự DIỄN RA trong truyện (hành động/lời thoại/thông tin/hậu quả cụ thể), kể cả viết bằng câu chữ khác hay thứ tự khác. done=false khi hoàn toàn vắng, chỉ được nhắc thoáng qua/tóm tắt một câu, hoặc diễn ra ngược lại. Không đòi chi tiết mà sự kiện không nêu. evidence PHẢI chép đúng từng chữ từ văn bản, không viết lại.',
    hasParts ? 'MỤC CÓ Ý CON: done=true CHỈ KHI TẤT CẢ các ý con đều thực sự diễn ra (không đòi từng chữ), và chúng thuộc MỘT đoạn cảnh liền mạch chứ không rải ở những cảnh/đoạn xa nhau. Thiếu dù một ý con -> done=false.' : '',
    'SỰ KIỆN CẦN KIỂM TRA:\n' + items.map(itemLine).join('\n'),
    'VĂN BẢN:\n' + String(o.text || '').slice(0, o.scope === 'chapter' ? 42000 : 12000)
  ].join('\n\n');
}
// Trả { results:[{n,done,evidence}], missing:[n], unknown:[n] } hoặc null nếu không đọc được. done=true mà câu trích không có trong văn bản -> coi là CHƯA (chống bịa).
function parseBeatEvidence(raw, ns, text) {
  const t = String(raw || '').replace(/<think(?:ing)?[\s>][\s\S]*?<\/think(?:ing)?>/gi, '');
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  let obj; try { obj = JSON.parse(t.slice(i, j + 1)); } catch (_) { return null; }
  const arr = obj && Array.isArray(obj.items) ? obj.items : null;
  if (!arr) return null;
  const want = new Set((ns || []).map(Number)), by = {};
  arr.forEach(x => { const n = Number(x && x.n); if (want.has(n) && !by[n]) by[n] = x; });
  const results = [], missing = [], unknown = [];
  (ns || []).forEach(n => {
    const x = by[n];
    if (!x) { unknown.push(n); return; }
    const ev = String(x.evidence || '').replace(/\s+/g, ' ').trim();
    const done = x.done === true && beatEvidenceInText(ev, text);
    results.push({ n, done, evidence: done ? ev.slice(0, 200) : '' });
    if (!done) missing.push(n);
  });
  return { results, missing, unknown };
}
function beatMissingError(texts) {
  /* V14.5.14: mục ghép thiếu ý con -> KHÔNG vá chèn (chèn rải ý con ra nhiều chỗ, gây cảnh rời rạc/lặp); lỗi này không thuộc diện "vá được" nên scene được VIẾT LẠI liền mạch. */
  const compound = (texts || []).filter(outlineItemIsCompound);
  if (compound.length) return 'THIẾU TRÌNH TỰ BẮT BUỘC (SỰ KIỆN BẮT BUỘC chưa đủ ý con): ' + compound.map(x => '«' + String(x).replace(/\s+/g, ' ').slice(0, 200) + '»').join(' · ') + ' — viết lại scene thành MỘT cảnh liên tục: các ý theo đúng thứ tự, mỗi ý có hành động/lời thoại/phản ứng riêng, kể mỗi ý đúng MỘT lần, không rải sang đoạn khác và không tóm tắt.' + ((texts || []).length > compound.length ? ' Đồng thời còn thiếu: ' + (texts || []).filter(x => !outlineItemIsCompound(x)).map(x => '«' + String(x).replace(/\s+/g, ' ').slice(0, 160) + '»').join(' · ') : '');
  return 'MUST_CHANGE: thiếu SỰ KIỆN BẮT BUỘC (chưa thấy diễn ra trong văn bản): ' + texts.map(x => '«' + String(x).replace(/\s+/g, ' ').slice(0, 160) + '»').join(' · ') + ' — chèn hành động/lời thoại cụ thể cho sự kiện này, không tóm tắt một câu.';
}

/* V14.3: VÁ CỤC BỘ SCENE. Lỗi rà AI kiểu "thiếu chi tiết / thiếu câu chuyển cảnh" (MUST_CHANGE, LOCATION_TIME) sửa được bằng vài câu CHÈN,
   không cần viết lại cả scene. NEW_THREAD / CAST cần gỡ nội dung nên không thuộc diện vá chèn. */
const SCENE_FIX_MAX_ADD = 320;
function sceneErrorsPatchable(errors) {
  const a = Array.isArray(errors) ? errors : [];
  return a.length > 0 && a.every(e => /^(MUST_CHANGE|LOCATION_TIME)\b/i.test(String(e)));
}
function buildSceneFixPrompt(o) {
  o = o || {}; const s = o.scene || {}, wc = countWords(o.text || ''), maxAdd = Number(o.maxAdd) || SCENE_FIX_MAX_ADD;
  const beatNote = (o.errors || []).some(e => /SỰ KIỆN BẮT BUỘC/.test(String(e))) ? 'SỰ KIỆN BẮT BUỘC là việc Outline giao nên ĐƯỢC chèn (không tính là "sự kiện ngoài kế hoạch"): viết thành khoảnh khắc đầy đủ (hành động, lời thoại, phản ứng), đặt ở chỗ hợp lý theo thứ tự nhân quả, TRƯỚC đoạn kết. TUYỆT ĐỐI giữ đúng nhân vật, tên gọi, địa điểm và thời điểm CỦA SCENE NÀY (' + [].concat(s.characters || []).slice(0, 6).join(', ') + (s.location ? ' @ ' + s.location : '') + '): nếu câu sự kiện nhắc nhân vật/nơi chốn khác với scene thì KHÔNG đem tên hay nơi đó vào, chỉ thực hiện phần hành động cho đúng nhân vật có mặt trong scene.' : '';
  return [
    'VÁ CỤC BỘ MỘT SCENE tiểu thuyết bằng cách CHÈN thêm vài câu/đoạn ngắn. KHÔNG viết lại scene, KHÔNG replace/delete, KHÔNG đổi đoạn kết.',
    'LỖI CẦN KHẮC PHỤC (từ bước rà scene):\n' + (o.errors || []).map(e => '- ' + e).join('\n'),
    'SCENE CONTRACT:\n' + JSON.stringify(compactSceneContract(s)),
    o.profile || '',
    'ĐỊNH DẠNG — chỉ trả các khối sau, không giải thích, không markdown:',
    '>>> SAU: <chép NGUYÊN VĂN 6–20 từ CUỐI của một đoạn có sẵn, đúng từng chữ>',
    '<1–3 câu hoặc một đoạn ngắn văn xuôi tiếng Việt thuần, nối mượt với đoạn trước/sau>',
    '>>> TRƯỚC: <chép NGUYÊN VĂN 6–20 từ ĐẦU của một đoạn có sẵn>',
    '<đoạn chèn>',
    beatNote,
    'QUY TẮC: tối đa 3 chỗ chèn, tổng thêm không quá ' + maxAdd + ' từ; mỗi cụm neo khác nhau và duy nhất trong scene; không chèn sau đoạn cuối; không thêm sự kiện lớn, tuyến hay nhân vật mới ngoài kế hoạch; không nhãn, tiêu đề hay ghi chú.',
    'Với MUST_CHANGE: chèn đúng chi tiết/hành động còn thiếu vào chỗ hợp lý. Với LOCATION_TIME: chèn 1–2 câu cầu nối (rời nơi cũ, đến nơi mới, thời điểm mới).',
    '===== VĂN BẢN SCENE (' + wc + ' từ) =====\n' + String(o.text || '').slice(0, 12000) + '\n===== HẾT ====='
  ].filter(Boolean).join('\n\n');
}
// Ghép các khối chèn vào scene. Trả { ok, text, added, reason }.
function applySceneFixInserts(text, raw, maxAdd) {
  const blocks = parseInsertBlocks(raw);
  if (!blocks.length) return { ok: false, reason: 'AI không trả khối chèn hợp lệ' };
  const base = String(text || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); // cùng cách chuẩn hóa với applyChapterPatches, để kiểm tra 'không đổi đoạn kết' không lệch vì khoảng trắng thừa
  const res = applyExpandInserts(base, blocks, countWords(base) + (Number(maxAdd) || SCENE_FIX_MAX_ADD));
  if (!res.applied) return { ok: false, reason: 'không ghép được khối chèn nào' + (res.skipped && res.skipped[0] ? ' (' + res.skipped[0].reason + ')' : '') };
  if (res.added < 8) return { ok: false, reason: 'đoạn chèn quá ít (+' + res.added + ' từ)' };
  return { ok: true, text: res.text, added: res.added, applied: res.applied };
}
// Tóm tắt cảnh báo scene cho người dùng: scene bị "giữ dù AI chê" luôn hiện đầy đủ, rồi tới cảnh báo khác; báo rõ phần bị ẩn.
function summarizeSceneWarnings(stats, maxOther) {
  const st = stats || {}, all = Array.isArray(st.sceneWarnings) ? st.sceneWarnings : [], lim = maxOther == null ? 4 : maxOther;
  const important = all.filter(w => /GIỮ BẢN CUỐI|ĐÃ VÁ/.test(w)), rest = all.filter(w => !/GIỮ BẢN CUỐI|ĐÃ VÁ/.test(w));
  /* V14.3.8: HANDOFF chỉ là gợi ý — gộp thành MỘT dòng ngắn thay vì liệt kê từng câu dài trên thẻ chương. */
  const hand = rest.filter(w => /\bHANDOFF\b/.test(w)), others = rest.filter(w => !/\bHANDOFF\b/.test(w));
  const handIds = Array.from(new Set(hand.map(w => (String(w).match(/^(S\d+)/) || [])[1]).filter(Boolean)));
  const shown = important.concat(others.slice(0, lim)).concat(handIds.length ? ['gợi ý nối scene (HANDOFF, không phải lỗi): ' + handIds.join(', ')] : []), hidden = others.length - Math.min(others.length, lim);
  return { shown, hidden, kept: Array.isArray(st.sceneKept) ? st.sceneKept : [], patched: Array.isArray(st.scenePatched) ? st.scenePatched : [], total: all.length };
}

// Một dòng tóm tắt cho người dùng (đường viết thường hiển thị ở dòng trạng thái). '' nếu không có gì đáng báo.
function formatSceneNote(stats) {
  const st = stats || {}, kept = Array.isArray(st.sceneKept) ? st.sceneKept : [], patched = Array.isArray(st.scenePatched) ? st.scenePatched : [];
  const warnN = Array.isArray(st.sceneWarnings) ? st.sceneWarnings.length : 0;
  const parts = [];
  if (kept.length) parts.push('⚠ scene giữ dù AI rà báo lỗi: ' + kept.join(', ') + ' (nên đọc lại)');
  if (patched.length) parts.push('đã vá cục bộ: ' + patched.join(', '));
  const other = warnN - kept.length - patched.length;
  if (other > 0) parts.push(other + ' cảnh báo scene khác');
  return parts.join(' · ');
}

// V14.0.20: quality contract for Vietnamese-native fiction. Keep this shared so
// normal writing, background writing and adaptive scenes do not drift stylistically.
function vietnameseNovelWritingPrompt() {
  return [
    'CHẤT LƯỢNG VĂN XUÔI TIẾNG VIỆT:',
    '- Viết như tác phẩm được sáng tác trực tiếp bằng tiếng Việt, không dịch từng chữ từ tiếng Anh/Trung; ưu tiên collocation và trật tự từ tự nhiên.',
    '- Giữ POV, thì kể, xưng hô, địa vị xã hội, kiến thức và giọng riêng của từng nhân vật; không để mọi người nói cùng một giọng.',
    '- Mỗi lượt thoại phải có mục đích: bộc lộ ý định, quan hệ, xung đột, cảm xúc hoặc thông tin cần thiết; không lặp lại nguyên văn điều phần kể đã nói.',
    '- Tách người nói thành đoạn riêng; khi đổi người nói, đổi hành động trọng tâm hoặc đổi nhịp cảm xúc thì xuống đoạn. Ưu tiên đoạn ngắn-vừa dễ đọc trên điện thoại.',
    '- Thể hiện cảm xúc bằng hành động, phản ứng cơ thể, lựa chọn và chi tiết quan sát được; tránh liên tục gọi tên cảm xúc hoặc dùng tính từ chung chung.',
    '- Xen kẽ câu ngắn và câu dài có kiểm soát; không dồn quá nhiều mệnh đề, không mở liên tiếp nhiều câu bằng cùng một chủ ngữ/cấu trúc.',
    '- Mỗi scene phải có điều nhân vật muốn, vật cản, một lựa chọn có giá phải trả và một thay đổi (quyền lực, hiểu biết, niềm tin, nguy hiểm hoặc quan hệ); không viết thành chuỗi sự kiện liệt kê.',
    '- Thoại có ẩn ý: người nói né tránh, ngắt lời, nói lệch hoặc im lặng khi bị dồn; không giải thích cốt truyện hay cảm xúc thành lời thoại diễn thuyết.',
    '- Chi tiết cảm giác phải cụ thể và riêng của cảnh (mùi, âm thanh, xúc giác, nhiệt độ, vật cản trong tay), không chỉ thị giác; không dùng sáo ngữ cảm giác có sẵn.',
    '- Chậm nhịp ở khoảnh khắc nặng (phản bội, mất mát, thú nhận, thân mật, quyết định không đảo ngược) và để lại dư âm trước khi chuyển cảnh; nén nhịp ở phần chuyển tiếp.',
    '- Kết cảnh bằng bước ngoặt, câu hỏi mở hoặc hậu quả đang tới; không kết bằng đoạn tóm tắt cảm xúc, bài học hay lời bình của người kể.',
    '- Không recap đầu chương nếu không cần; không chèn nhãn ngày giờ, tiêu đề scene, metadata, lời giải thích hay ghi chú của AI vào văn xuôi.'
  ].join('\n');
}

// V14.3.2: scene prompt CHỈ nhận checklist của chính scene đó (trước đây cả outline chương bị lặp 3 lần trong mọi scene prompt -> model kể lại toàn bộ chuỗi sự kiện ở từng scene).
/* V14.5.14: meta = ghi chú Kháng cự/Hậu quả của Outline chương; items = các mục Outline đánh số. Trước đây prompt VIẾT scene không thấy "Kháng cự" (chỉ prompt lập kế hoạch thấy)
   nên writer tước dao ngay dù Outline đòi "chống trả quyết liệt"; mục ghép cũng không có "trình tự liên tục" để writer giữ trong MỘT cảnh. */
function sceneScopeOf(scenes, i, meta, items) {
  const list = Array.isArray(scenes) ? scenes : [];
  const pick = sc => [sc && sc.id, String((sc && sc.mustChange) || '').replace(/\s+/g, ' ').trim().slice(0, 220)].filter(Boolean).join(': ');
  const scope = { index: i, total: list.length, done: list.slice(0, i).map(pick).filter(Boolean), later: list.slice(i + 1).map(pick).filter(Boolean), notes: [], sequences: [] };
  const cur = list[i], own = cur && Array.isArray(cur.outlineItems) ? cur.outlineItems.map(Number).filter(n => n >= 1) : [];
  if (!own.length) return scope;
  const m = meta || {}, clean = v => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 260);
  if (clean(m.resistance)) scope.notes.push('KHÁNG CỰ CỦA CHƯƠNG (diễn tiến xuyên suốt các scene; scene này chỉ thể hiện phần hợp với vị trí của nó, không kể lại phần đã có, không rút ngắn thành một câu. Nếu mục của scene là kháng cự rồi bị khống chế/tước vũ khí thì phải viết cuộc giằng co thật — nhiều nhịp đòn/đỡ/phản ứng — TRƯỚC khi bị khống chế, không tước ngay): ' + clean(m.resistance));
  if (clean(m.consequence)) {
    const idxs = []; list.forEach((sc, k) => { if (sc && Array.isArray(sc.outlineItems) && sc.outlineItems.length) idxs.push(k); });
    let owner = idxs.length ? idxs[idxs.length - 1] : -1, best = 0;
    const ct = _beatToks(m.consequence);
    idxs.forEach(k => {
      const pool = new Set(); list[k].outlineItems.forEach(n => _beatToks((items || [])[n - 1] || '').forEach(w => pool.add(w)));
      const hit = ct.filter(w => pool.has(w)).length;
      if (hit > best) { best = hit; owner = k; }
    });
    if (owner === i) scope.notes.push('HẬU QUẢ CẦN THỂ HIỆN (một lần, ở scene này): ' + clean(m.consequence));
  }
  own.forEach(n => {
    const parts = outlineItemParts((items || [])[n - 1] || '');
    if (parts.length >= 3) scope.sequences.push(parts);
  });
  return scope;
}
// V14.5.14: tách mệnh đề Hậu quả đã được một mục Outline nêu -> bỏ khỏi ghi chú, tránh một sự kiện bị yêu cầu hai lần (nguồn của cảnh lặp ba lần).
function _beatToks(t) { return Array.from(new Set(normalizeName(t).split(/[^a-z0-9đ]+/).filter(w => w.length >= 2 && !SCENE_STOP_TOKENS.has(w)))); }
function outlineClauseCovered(clause, items) {
  const ct = _beatToks(clause); if (ct.length < 2) return false;
  const pool = new Set(); (items || []).forEach(it => _beatToks(it).forEach(w => pool.add(w)));
  return ct.filter(w => pool.has(w)).length / ct.length >= 0.6;
}
function dedupeOutlineMeta(meta, items) {
  const out = Object.assign({}, meta || {});
  if (out.consequence) {
    const keep = String(out.consequence).split(/\s*(?:\s\+\s|;)\s*/).map(s => s.trim()).filter(Boolean).filter(c => !outlineClauseCovered(c, items));
    if (keep.length) out.consequence = keep.join(' + '); else delete out.consequence;
  }
  return out;
}
function sceneScopedContract(contract) {
  const c = promptChapterContract(contract);
  delete c.chapterOutline; delete c.requiredBeats; delete c.mustChange;
  c.arcGoal = String(c.arcGoal || '').slice(0, 240);
  return c;
}
function sceneScopedChecklistBlock(scene, scope) {
  const s = scene || {}, sc = scope || {};
  const mine = [String(s.mustChange || '')].concat(Array.isArray(s.beats) ? s.beats : []).map(x => String(x).replace(/\s+/g, ' ').trim().slice(0, 220)).filter(Boolean);
  const perBeat = (Number(s.targetWords) && Array.isArray(s.beats) && s.beats.length) ? Math.round(Number(s.targetWords) / s.beats.length / 10) * 10 : 0;
  const out = ['CHECKLIST RIÊNG CỦA SCENE ' + (s.id || '') + ' (' + ((sc.index || 0) + 1) + '/' + (sc.total || '?') + ') — chỉ thực hiện các mục này rồi dừng ở handoff' + (perBeat >= 150 ? '; mỗi mục viết thành cảnh đầy đủ (hành động, lời thoại, phản ứng), khoảng ' + perBeat + ' từ/mục, không tóm tắt' : '') + ':\n- ' + mine.join('\n- ')];
  if (sc.done && sc.done.length) out.push('ĐÃ KỂ XONG Ở SCENE TRƯỚC — TUYỆT ĐỐI KHÔNG kể lại hay diễn đạt lại (chỉ được nhắc hậu quả bằng một mệnh đề ngắn):\n- ' + sc.done.join('\n- '));
  if (sc.later && sc.later.length) out.push('DÀNH CHO SCENE SAU — KHÔNG kể diễn biến ở scene này; chỉ được gợi sang bằng 1–2 câu cuối theo handoff:\n- ' + sc.later.join('\n- '));
  (sc.sequences || []).forEach(parts => out.push('TRÌNH TỰ LIÊN TỤC BẮT BUỘC — viết trong MỘT cảnh liền mạch, đúng thứ tự, mỗi bước kể ĐÚNG MỘT LẦN (không tách sang đoạn khác, không nhắc lại như hậu quả, không bỏ bước): ' + parts.join(' → ')));
  (sc.notes || []).forEach(n => out.push(n));
  return out.join('\n\n');
}
// V14.3.2: phát hiện scene mới KỂ LẠI sự kiện đã có ở scene trước bằng câu chữ khác (so theo từ đặc trưng của từng đoạn, không cần trùng nguyên văn).
function sceneParaphraseOverlap(priorText, newText) {
  const pri = _splitParas(priorText), cur = _splitParas(newText);
  if (pri.length < 2 || cur.length < 3) return { hit: 0, total: 0 };
  const all = pri.concat(cur), prof = _paraProfiles(all);
  let hit = 0, total = 0;
  for (let k = pri.length; k < all.length; k++) {
    if (prof[k].size < 5) continue; total++;
    for (let j = 0; j < pri.length; j++) if (_setSim(prof[k], prof[j]) >= 0.45) { hit++; break; }
  }
  return { hit, total };
}

/* V14.3.8: scene bị cắt giữa câu (hết token) -> lùi về câu hoàn chỉnh gần nhất ngay khi nhận, thay vì để câu cụt nằm giữa chương. Chỉ cắt khi phần dở ngắn (<= 60 từ). */
function trimDanglingSceneEnd(text) {
  const t = String(text || '').replace(/\s+$/, '');
  if (!t || /[.!?…"”»)\]*]\s*$/.test(t)) return t;
  const paras = t.split(/\n{2,}/), last = paras.pop() || '';
  const ends = Array.from(last.matchAll(/[.!?…]["”»)\]]*(?=\s|$)/g));
  if (ends.length) {
    const e = ends[ends.length - 1], idx = e.index + e[0].length;
    if (countWords(last.slice(idx)) <= 60) return paras.concat([last.slice(0, idx).trimEnd()]).join('\n\n');
    return t;
  }
  if (paras.length && countWords(last) <= 40) return paras.join('\n\n');
  return t;
}
/* V14.3.8: scene khác địa điểm/thời điểm so với scene trước -> BẮT BUỘC mở bằng câu chuyển cảnh (nguyên nhân phổ biến của cảnh báo HANDOFF "scene sau diễn ra buổi tối tại tầng hầm nhưng scene này kết thúc vào buổi sáng..."). */
function _sceneNorm(x) { return String(x || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function _sceneSame(a, b) { const x = _sceneNorm(a), y = _sceneNorm(b); return !x || !y || x === y || x.includes(y) || y.includes(x) || /^tiếp nối|^ngay sau/.test(x) || /^tiếp nối|^ngay sau/.test(y); }
function sceneBridgeBlock(scene, prev) {
  if (!scene || !prev) return '';
  const locDiff = !_sceneSame(scene.location, prev.location), timeDiff = !_sceneSame(scene.time, prev.time);
  if (!locDiff && !timeDiff) return '';
  return 'CẦU NỐI BẮT BUỘC: scene trước kết thúc ở "' + String(prev.location || '?').slice(0, 80) + '" (' + String(prev.time || '?').slice(0, 60) + '), scene này diễn ra ở "' + String(scene.location || '?').slice(0, 80) + '" (' + String(scene.time || '?').slice(0, 60) + '). Câu/đoạn ĐẦU TIÊN phải là 1–2 câu chuyển cảnh nêu rõ nhân vật rời đâu, đến đâu và thời điểm nào, rồi mới vào nội dung scene.';
}
function buildAdaptiveSceneWritePrompt(o) {
  const s = o.scene || {}, limits = adaptiveChapterWordLimits(o.state || {});
  return [
    'VIẾT SCENE TIẾP NỐI bằng tiếng Việt; chỉ trả văn xuôi, không tiêu đề/giải thích.',
    vietnameseNovelWritingPrompt(),
    'Tổng chương ' + limits.minAccept + '–' + limits.maxAccept + ' từ; scene khoảng ' + s.targetWords + ' từ. Ưu tiên nhịp tự nhiên, không độn.',
    'CONTRACT:\n' + JSON.stringify(compactSceneContract(s)),
    o.chapterGoal ? 'MỤC TIÊU CHƯƠNG: ' + String(o.chapterGoal).replace(/\s+/g, ' ').slice(0, 300) : '',
    sceneBridgeBlock(s, o.prevScene),
    o.sceneScope ? sceneScopedChecklistBlock(s, o.sceneScope) : o.requiredBeats ? 'REQUIRED CHECKLIST — scene này phải thực hiện hoặc bàn giao rõ một mục; cuối chương mọi mục phải có bằng chứng:\n' + String(o.requiredBeats).replace(/\s+/g, ' ').slice(0, 1200) : '',
    o.chapterContract ? 'CONTRACT COMPACT — scene chỉ được dùng cast, Arc và hướng đi trong contract:\n' + JSON.stringify(o.sceneScope ? sceneScopedContract(o.chapterContract) : promptChapterContract(o.chapterContract)) : '',
    sceneProfileWithAnchor(o.state, s, String(o.allowedCast || '').split(/\s*,\s*/)),
    dossierBlock(o.state, s),
    NAMING_RULE,
    TIME_CODE_RULE,
    o.isOpeningScene ? chapterOpeningVariationBlock(o.state) : '',
    SENTENCE_RHYTHM_RULE,
    compactOverusedGuide(o.state),
    lessonsBlock(o.state),
    (o.state && o.state.mature && sceneIsAdult(o.state, s)) ? submissionLadderBlock(o.state, (o.chapterNumber || ((o.state.chapters || []).length + 1)), o.state.chapters) : '',
    o.allowedCast ? 'ALLOWED CAST — không biến tên ngoài danh sách thành nhân vật chính: ' + String(o.allowedCast).replace(/\s+/g, ' ').slice(0, 1200) : '',
    o.forbiddenDrift ? 'CẤM DRIFT KHỎI ARC: ' + String(o.forbiddenDrift).replace(/\s+/g, ' ').slice(0, 900) : '',
    o.isFinalScene ? 'KẾT CHƯƠNG CÓ MÓC: câu cuối KHÔNG được là lời tóm tắt nội tâm hay kế hoạch ("cô biết…", "chuẩn bị cho…"). Kết bằng một hình ảnh cụ thể, một câu thoại, hoặc một thông tin/biến cố mới khiến người đọc muốn lật trang.' : '',
    o.endingAnchor && o.isFinalScene ? 'ĐIỂM KẾT BẮT BUỘC: ' + String(o.endingAnchor).replace(/\s+/g, ' ').slice(0, 360) : '',
    o.previousTail ? (o.isOpeningScene
      ? 'ĐOẠN KẾT CHƯƠNG TRƯỚC — KHÓA CẢNH MỞ: phải nối đúng địa điểm, thời điểm và người đang có mặt. Nếu muốn chuyển từ đường phố/phòng/xe sang nơi khác, bắt buộc viết hành động di chuyển hoặc câu chuyển tự nhiên trước khi đổi cảnh; tuyệt đối không nhảy thẳng vào địa điểm mới:\n'
      : 'ĐUÔI SCENE TRƯỚC — nối tiếp, không lặp:\n') + compactSceneTail(o.previousTail, 2400) : 'Mở scene đầu chương.',
    o.isOpeningScene && o.prevUnfinished ? UNFINISHED_SCENE_RULE : '',
    isHotSceneDef(o.scene) ? HOT_SCENE_COMPLETION_RULE : '',   // V14.7.53
    o.stateDelta ? 'STATE DELTA:\n' + JSON.stringify(compactSceneStateDelta(o.stateDelta)) : '',
    o.style ? 'STYLE LOCK:\n' + String(o.style).replace(/\s+/g, ' ').slice(0, 2800) : '',
    'Giữ nhân vật/địa điểm/thời gian và thay đổi trong contract; không thêm arc hay biến cố lớn. Cảnh trưởng thành (nếu contract có) chỉ dùng người trưởng thành và giữ nhất quán thiết lập.',
    o.correction ? 'BẢN VIẾT TRƯỚC CỦA SCENE NÀY BỊ TỪ CHỐI — viết lại scene từ đầu, giữ đúng contract và SỬA các lỗi sau (không nhắc tới lỗi trong văn bản):\n' + String(o.correction).replace(/\s+/g, ' ').slice(0, 900) : '',
    'Chỉ trả văn xuôi scene.'
  ].filter(Boolean).join('\n\n');
}

function buildAdaptiveSceneTopUpPrompt(o) {
  const p = o || {}, need = Math.max(200, Math.min(1800, Number(p.needWords) || 800));
  return [
    'VIẾT BỔ SUNG TIẾP NỐI bằng tiếng Việt; chỉ trả văn xuôi, không tiêu đề/giải thích.',
    p.completeOnly ? 'Chương đã đủ độ dài (' + (Number(p.currentWords) || '?') + ' từ). Lượt này CHỈ để viết nốt các sự kiện chính của Outline còn thiếu, khoảng ' + need + ' từ; không kể thêm gì khác.' : 'Chương hiện mới khoảng ' + (Number(p.currentWords) || '?') + ' từ và còn thiếu khoảng ' + need + ' từ để đạt tối thiểu 4.500 từ.',
    p.completeOnly ? '' : 'BẮT BUỘC viết ít nhất ' + need + ' từ (mục tiêu ' + Math.ceil(need * 1.15) + ' từ) diễn biến MỚI, tự nhiên; không tóm tắt, không lặp, không kéo dài rỗng.',
    p.missingBeats && p.missingBeats.length ? 'SỰ KIỆN CHÍNH CỦA OUTLINE CÒN THIẾU TRONG CHƯƠNG — PHẢI viết ĐỦ (có hành động, lời thoại, phản ứng; không tóm tắt). Nếu một sự kiện dưới đây thực ra ĐÃ được viết (dù bằng câu chữ khác) thì BỎ QUA, không viết lại:\n- ' + p.missingBeats.map(x => String(x).slice(0, 160)).join('\n- ') : '',
    'Đây chưa phải điểm kết: nếu đoạn cuối hiện tại có vẻ đã khép, coi đó là chuyển nhịp và tiếp tục hợp lý; chỉ dừng sau khi tạo thêm diễn biến, phản ứng, thông tin, quyết định hoặc hậu quả có thật.',
    p.chapterGoal ? 'MỤC TIÊU CHƯƠNG: ' + String(p.chapterGoal).replace(/\s+/g, ' ').slice(0, 500) : '',
    p.doneList && p.doneList.length ? 'ĐÃ KỂ ĐỦ TRONG CHƯƠNG — TUYỆT ĐỐI không kể lại hay diễn đạt lại các sự kiện này; chỉ mở rộng phản ứng, nội tâm, hậu quả, chi tiết bối cảnh tại điểm hiện tại:\n- ' + p.doneList.join('\n- ') : p.requiredBeats ? 'REQUIRED BEATS CÒN PHẢI ĐẢM BẢO:\n' + String(p.requiredBeats).replace(/\s+/g, ' ').slice(0, 1200) : '',
    p.chapterContract ? 'CONTRACT COMPACT — top-up chỉ mở rộng diễn biến đã hợp lệ, không mở tuyến mới:\n' + JSON.stringify((p.doneList && p.doneList.length ? sceneScopedContract : promptChapterContract)(p.chapterContract)) : '',
    p.allowedCast ? 'ALLOWED CAST — không biến tên ngoài danh sách thành nhân vật chính: ' + String(p.allowedCast).replace(/\s+/g, ' ').slice(0, 1200) : '',
    p.forbiddenDrift ? 'CẤM DRIFT KHỎI ARC: ' + String(p.forbiddenDrift).replace(/\s+/g, ' ').slice(0, 900) : '',
    p.endingAnchor ? 'ĐIỂM KẾT DỰ KIẾN: ' + String(p.endingAnchor).replace(/\s+/g, ' ').slice(0, 400) : '',
    p.previousTail ? 'ĐUÔI HIỆN TẠI — nối ngay từ đây, không lặp:\n' + compactSceneTail(p.previousTail, 2400) : '',
    p.stateDelta ? 'STATE DELTA:\n' + JSON.stringify(compactSceneStateDelta(p.stateDelta)) : '',
    p.style ? 'STYLE LOCK: ' + String(p.style).replace(/\s+/g, ' ').slice(0, 2800) : '',
    'Giữ đúng canon, nhân vật, địa điểm, thời gian và ngôi kể. Không thêm nhân vật quan trọng, arc mới hoặc biến cố lớn ngoài kế hoạch.'
  ].filter(Boolean).join('\n\n');
}

// V12.23: ĐỒNG BỘ viết thường ↔ viết nền — các khối prompt dùng chung (cùng một bản chữ cho cả hai nơi).
/* V14.7.28: CHỐNG VĂN MÁY MÓC. Đo trên 30 chương thật: "run rẩy" 285 lần, "nhục nhã" 134, "hít một hơi thật sâu" 33, 15/30 chương mở bằng "Bùi Lạc đứng/tiến/buông…". Ô Từ vựng của người dùng trống nên app không có gì để tránh.
   (1) danh sách cụm hay lặp có sẵn + cụm lặp tự phát hiện từ chính truyện, đưa vào prompt; (2) cổng đếm cụm lặp (cảnh báo / lỗi nặng khi quá gấp đôi hạn mức) ; (3) cổng kiểu mở chương. */
const OVERUSED_WATCH = [
  { p: 'run rẩy', max: 4, hard: true, alt: 'tả cử động cụ thể: ngón tay bấu mép bàn, hơi thở đứt, đầu gối khuỵu' },
  { p: 'nhục nhã', max: 3, hard: true, alt: 'cho thấy qua hành động/lời nói thay vì gọi tên cảm xúc' },
  { p: 'nóng hổi', max: 2, hard: true, alt: 'đổi: hơi ấm, rát, ẩm; hoặc bỏ' },
  { p: 'hít một hơi thật sâu', max: 1, hard: true, alt: 'nhân vật làm việc khác để lấy lại bình tĩnh' },
  { p: 'luồng điện', max: 1, hard: true, alt: 'tả cảm giác bằng vị trí cơ thể cụ thể' },
  { p: 'mồ hôi rịn', max: 1, hard: true, alt: 'chi tiết khác: gáy ẩm, lòng bàn tay trơn' },
  { p: 'tê dại', max: 2, hard: true, alt: 'tả phản ứng cụ thể của cơ bắp/hơi thở' },
  { p: 'sống lưng', max: 2, hard: false, alt: '' }, { p: 'giật nảy', max: 2, hard: false, alt: '' },
  { p: 'phục tùng', max: 4, hard: false, alt: '' }, { p: 'trầm thấp', max: 2, hard: false, alt: '' },
  { p: 'vô cảm', max: 2, hard: false, alt: '' }, { p: 'ánh mắt', max: 6, hard: false, alt: '' }, { p: 'đôi mắt', max: 5, hard: false, alt: '' }
];
function _prTokens(t) { return String(t || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []; }
function _countPhrase(low, p) { let n = 0, i = 0; while ((i = low.indexOf(p, i)) >= 0) { n++; i += p.length; } return n; }
let _overusedCache = { key: '', val: [] };
/* Cụm 4 từ xuất hiện ở ≥3 trong 8 chương gần nhất = đang thành thói quen của model. */
function detectOverusedPhrases(chapters, limit) {
  const chs = (Array.isArray(chapters) ? chapters : []).filter(c => c && c.text).slice(-8);
  if (chs.length < 3) return [];
  const key = chs.length + ':' + chs.map(c => String(c.text).length).join(',') + ':' + (limit || 10);
  if (_overusedCache.key === key) return _overusedCache.val;
  const cnt = new Map();
  chs.forEach(c => { const w = _prTokens(c.text), seen = new Set(); for (let i = 0; i + 4 <= w.length; i++) seen.add(w.slice(i, i + 4).join(' ')); seen.forEach(g => cnt.set(g, (cnt.get(g) || 0) + 1)); });
  const cand = [...cnt.entries()].filter(([g, n]) => n >= 3 && g.split(' ').some(x => x.length >= 4)).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  const out = [];
  for (const [g] of cand) { const tk = g.split(' '); if (out.some(o => { const ot = o.split(' '); return tk.filter(x => ot.includes(x)).length >= 3; })) continue; out.push(g); if (out.length >= (limit || 10)) break; }
  _overusedCache = { key, val: out };
  return out;
}
function overusedPhraseGuide(state) {
  const watch = OVERUSED_WATCH.filter(w => w.hard).map(w => '"' + w.p + '" (tối đa ' + w.max + '/chương' + (w.alt ? '; ' + w.alt : '') + ')').join('; ');
  const auto = detectOverusedPhrases(state && state.chapters, 10);
  return 'HẠN CHẾ CỤM SÁO (truyện đang lặp): ' + watch + '.' + (auto.length ? ' Cụm đã lặp qua nhiều chương gần đây — KHÔNG dùng lại: ' + auto.map(x => '"' + x + '"').join(', ') + '.' : '') +
    ' Lời kể hạn chế biệt danh miệt thị lặp ("gã/tên/kẻ bảo vệ", "thấp kém", "hèn mọn"): luân phiên gọi tên, "hắn", hoặc tả hành động.' + ' Thay "gọi tên cảm xúc" bằng hành động/lời nói/chi tiết vật cụ thể; xen câu ngắn sau đoạn dài.';
}
/* V14.7.35: guide chống cụm sáo từng bị CẮT mất vì nằm trong khối Từ vựng (clip 600 ở ngữ cảnh, 260 ở prompt scene). Tách riêng + bản gọn cho scene. */
function compactOverusedGuide(st) {
  const hard = OVERUSED_WATCH.filter(w => w.hard).map(w => '"' + w.p + '"≤' + w.max).join(', ');
  const auto = detectOverusedPhrases(st && st.chapters, 5);
  return 'TRÁNH SÁO (số = tối đa/chương): ' + hard + (auto.length ? '; không lặp lại: ' + auto.map(x => '"' + x + '"').join(', ') : '') + '. Tả hành động cụ thể thay vì gọi tên cảm xúc.';
}
/* V14.7.37: SỔ RÚT KINH NGHIỆM. Không huấn luyện model; app suy ra các lỗi đã LẶP LẠI từ chính các chương (cảnh báo, hard failure) và nhắc ngắn trong prompt chương sau.
   Tính lại từ chương mỗi lần (không lưu riêng) nên xóa/viết lại chương tự cập nhật; chỉ lưu state.lessonMuted (bài học người dùng tắt) và state.lessonsOff. */
const LESSON_RULES = [
  { key: 'place', re: /LOCATION_TIME|sai địa điểm|trái với kế hoạch là|sai (?:chỗ|nơi)/i, advice: 'Mở mỗi cảnh đúng địa điểm và thời điểm ghi trong kế hoạch; không tự đổi nơi diễn ra.' },
  { key: 'beats', re: /MUST_CHANGE|Thiếu hành động|thiếu (?:beat|việc bắt buộc)|chưa (?:thực hiện|làm) (?:đủ )?beat/i, advice: 'Làm ĐỦ mọi hành động bắt buộc của cảnh (beats) bằng hành động cụ thể trước khi sang cảnh khác.' },
  { key: 'cast', re: /chưa có trong Character Database|ngoài danh sách nhân vật|ALLOWED CAST/i, advice: 'Chỉ dùng nhân vật trong danh sách cho phép; người mới (nếu được phép) phải có tên riêng, không gọi bằng danh xưng chung.' },
  { key: 'repeat', re: /lặp(?: lại)? (?:cụm|cảm giác|mô tả|ý)|OVERUSED|cụm sáo|sự lặp lại/i, advice: 'Không lặp cảm giác/cụm từ đã dùng ở chương trước; tả bằng chi tiết mới.' },
  { key: 'ending', re: /kết chương|câu cuối.*tóm tắt|ENDING_SUMMARY|chưa tới điểm kết|CHƯA TỚI ĐIỂM KẾT/i, advice: 'Kết chương bằng hành động, hình ảnh hoặc câu thoại còn treo, không tóm tắt nội tâm.' },
  { key: 'power', re: /quyền lực|vị thế|chức vụ|cấp bậc|rank/i, advice: 'Giữ đúng thang quyền lực đã khai báo; chỉ thay đổi khi có nguyên nhân riêng được viết ra.' },
  { key: 'canon', re: /mâu thuẫn|canon|trái với (?:hồ sơ|Current Status)|continuity/i, advice: 'Đối chiếu Current Status và hồ sơ nhân vật trước khi viết; không tự đổi sự thật đã chốt.' }
];
function lessonSourceText(ch) {
  const out = [];
  const add = v => { if (v == null) return; if (Array.isArray(v)) v.forEach(add); else if (typeof v === 'object') out.push(JSON.stringify(v)); else out.push(String(v)); };
  if (!ch || typeof ch !== 'object') return '';
  add(ch.autoUpdateIssues);
  if (ch.review && typeof ch.review === 'object') { add(ch.review.hardFailures); add(ch.review.warnings); }
  add(ch.continuityWarnings);
  return out.join('\n');
}
function lessonStats(state) {
  const items = LESSON_RULES.map(r => ({ key: r.key, advice: r.advice, chapters: [] }));
  (state && state.chapters || []).forEach((ch, i) => {
    const t = lessonSourceText(ch); if (!t) return;
    LESSON_RULES.forEach((r, k) => { if (r.re.test(t)) items[k].chapters.push(i + 1); });
  });
  return items.filter(x => x.chapters.length);
}
function activeLessons(state, max) {
  if (!state || state.lessonsOff) return [];
  const muted = Array.isArray(state.lessonMuted) ? state.lessonMuted : [];
  const total = (state.chapters || []).length;
  return lessonStats(state).filter(x => x.chapters.length >= 2 && !muted.includes(x.key) && x.chapters[x.chapters.length - 1] >= total - 7)
    .sort((a, b) => b.chapters[b.chapters.length - 1] - a.chapters[a.chapters.length - 1] || b.chapters.length - a.chapters.length).slice(0, max || 4);
}
function lessonsBlock(state) {
  const a = activeLessons(state, 4); if (!a.length) return '';
  const txt = 'RÚT KINH NGHIỆM (lỗi đã lặp ở các chương trước — tránh lặp lại): ' + a.map(x => x.advice + ' (gặp ở chương ' + x.chapters.slice(-3).join(', ') + ')').join(' | ');
  return txt.length > 700 ? txt.slice(0, 700) : txt;
}
/* V14.7.37: danh xưng chung ("Gã hàng xóm", "Giám đốc vận hành", "Bảo vệ") không phải tên riêng → không tự thành thẻ NV.
   Quy tắc: từ CUỐI không viết hoa. "Giám đốc Hoàng", "Quỳnh Anh", "chị Linh" vẫn hợp lệ. */
function isGenericAddressName(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return false;
  const last = w[w.length - 1].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  return !!last && /^\p{Ll}/u.test(last);
}
/* V14.7.37: kiểm tra model có trả JSON hậu kỳ dùng được không (dùng cho nút "Kiểm tra JSON của model"). */
const JSON_HEALTH_SAMPLE = 'Quỳnh Anh bước vào phòng nghỉ, mặt tái đi. Cô là thư ký của tổng giám đốc, kiêu ngạo và hay quát mắng người khác. "Anh định tống tiền tôi sao?" Quỳnh Anh run lên khi Lạc giơ điện thoại.';
function jsonHealthPrompt() {
  return 'Đọc đoạn chương và CHỈ trả MỘT JSON object hợp lệ, không markdown: {"characters":[{"name":"","role":"","evidence":"<trích NGUYÊN VĂN từ đoạn>","fieldEvidence":{"role":"<trích nguyên văn>"}}]}\n<chapter>\n' + JSON_HEALTH_SAMPLE + '\n</chapter>';
}
function jsonHealthCheck(parsed, rawText) {
  const notes = []; let ok = true;
  if (!parsed || typeof parsed !== 'object') return { ok: false, notes: ['FAIL: không đọc được JSON (model trả văn bản/markdown hoặc bị cắt).'] };
  notes.push('PASS: đọc được JSON.');
  const rows = Array.isArray(parsed.characters) ? parsed.characters : null;
  if (!rows || !rows.length) { return { ok: false, notes: notes.concat(['FAIL: thiếu mảng "characters" hoặc rỗng.']) }; }
  const r = rows.find(x => x && /quỳnh anh/i.test(String(x.name || ''))) || rows[0];
  if (!/quỳnh anh/i.test(String(r.name || ''))) { ok = false; notes.push('FAIL: không nhận ra nhân vật Quỳnh Anh.'); } else notes.push('PASS: nhận ra nhân vật.');
  const quotes = [r.evidence].concat(Object.values(r.fieldEvidence && typeof r.fieldEvidence === 'object' ? r.fieldEvidence : {})).filter(q => typeof q === 'string' && q.trim());
  if (!quotes.length) { ok = false; notes.push('FAIL: không có câu trích evidence.'); }
  else if (quotes.some(q => evidenceInText(q, JSON_HEALTH_SAMPLE))) notes.push('PASS: có câu trích khớp nguyên văn.');
  else { ok = false; notes.push('FAIL: câu trích là tóm lược, không khớp nguyên văn (dễ bị bỏ thẻ nhân vật).'); }
  return { ok, notes };
}
/* Kiểu mở chương: so với 2 chương trước. */
function openingKind(text) {
  const first = String(text || '').trim().split(/\n/)[0].trim(), w = _prTokens(first);
  if (/^["“«—-]/.test(first)) return 'thoại';
  if (/^(đêm|sáng|chiều|trưa|tối|ba giờ|\d+ giờ|hôm|ngày|tiếng chuông)/i.test(first)) return 'thời gian/âm thanh';
  const head = w.slice(0, 2).join(' ');
  if (/^(bùi lạc|quỳnh anh|minh châu|trần minh châu)$/.test(head) || /^(hắn|cô|anh|nàng)$/.test(w[0] || '')) return 'nhân vật+động từ';
  return 'khác';
}
function openingHead(text) { return _prTokens(String(text || '').trim().split(/\n/)[0]).slice(0, 3).join(' '); }
function chapterOpeningVariationBlock(state) {
  const prev = (((state && state.chapters) || []).filter(c => c && c.text)).slice(-3);
  if (!prev.length) return '';
  const kinds = prev.map(c => openingKind(c.text)), heads = prev.map(c => '"' + String(c.text).trim().split(/\n/)[0].split(/\s+/).slice(0, 5).join(' ') + '…"');
  const same = kinds.length >= 2 && kinds.slice(-2).every(k => k === 'nhân vật+động từ');
  return 'KIỂU MỞ CHƯƠNG: các chương trước mở bằng ' + heads.join(' / ') + '. KHÔNG mở bằng "<tên nhân vật> + đứng/tiến/buông/thức dậy" như vậy' + (same ? ' (đã lặp ≥2 chương liền)' : '') + '; mở bằng một lời thoại, âm thanh, đồ vật, hoặc mốc thời gian cụ thể, rồi mới tới nhân vật.';
}
/* V14.7.29: GIỌNG NỘI TÂM RIÊNG TỪNG NGƯỜI + NHỊP CÂU. Trong 30 chương thật, Quỳnh Anh và Minh Châu cùng một công thức "nhục nhã nhưng cơ thể phản bội". Mỗi nhân vật trong cảnh nhận một KIỂU PHẢN ỨNG khi bị kiểm soát (suy từ tính cách/giọng nói trong hồ sơ; nếu không khớp thì gán luân phiên) và hai người trong cùng cảnh không bao giờ trùng kiểu. */
const REACTION_MODES = [
  { id: 'giữ thể diện', re: /kiêu|tự tôn|sĩ diện|lạnh lùng|cao ngạo|quyết đoán|nghiêm|mỉa mai|gắt/, text: 'giữ thể diện đến phút cuối: nói năng đúng chức vụ, cố nhìn thẳng, chỉ để lộ qua một chi tiết nhỏ (giọng hụt, tay siết); nỗi sợ nén lại thành giận hoặc mỉa mai' },
  { id: 'tính toán', re: /sắc sảo|thông minh|chú trọng chi tiết|tính toán|cẩn thận|thận trọng|tò mò|soi mói/, text: 'vừa chịu đựng vừa tính: ghi nhớ giờ giấc, camera, lối thoát, từng sơ hở của hắn; suy nghĩ ngắn, lạnh, thực dụng' },
  { id: 'im lặng nuốt xuống', re: /nhút nhát|ngoan|dịu dàng|e dè|yếu đuối|nhu mì|thụ động|lắp bắp/, text: 'im lặng, cúi mắt, làm theo từng việc nhỏ; nội tâm là những câu dở dang, tự trấn an bằng việc quen thuộc (đếm, sắp xếp đồ)' },
  { id: 'cãi rồi gục', re: /nóng|bốc đồng|ương|cứng đầu|bướng|hung/, text: 'phản kháng bằng lời, cãi lại ngắn và gắt, rồi nhanh chóng mất lý lẽ; không dùng độc thoại dài' },
  { id: 'hài hước gượng', re: /hài|lém|duyên|vui|nghịch/, text: 'đùa gượng, nói lảng để che sợ hãi; câu đùa vỡ giữa chừng' }
];
function reactionModesForScene(chars) {
  const used = new Set(), out = [];
  (chars || []).forEach((c, idx) => {
    const src = String((c && (c.personality || '')) + ' ' + (c && c.speech || '') + ' ' + (c && c.publicPersonality || '')).toLowerCase();
    let m = REACTION_MODES.find(x => !used.has(x.id) && x.re.test(src));
    if (!m) m = REACTION_MODES.find(x => !used.has(x.id));
    if (m) { used.add(m.id); out.push({ name: c.name, mode: m }); }
  });
  return out;
}
function innerVoiceBlock(st, pick) {
  const mcName = st && st.mainCharProfile && st.mainCharProfile.name;
  const people = (pick || []).filter(c => c && c.name && c.name !== mcName);
  if (people.length < 1) return '';
  const rows = reactionModesForScene(people.slice(0, 4));
  const cut = (v, n) => { v = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return v.length > n ? v.slice(0, n) + '…' : v; };
  const lines = rows.map(r => { const c = people.find(x => x.name === r.name) || {}; const sp = cut(c.speech, 60); return '- ' + r.name + ': ' + r.mode.text + (sp ? ' | giọng nói: ' + sp : ''); });
  return 'GIỌNG NỘI TÂM RIÊNG TỪNG NGƯỜI (mỗi người một cách; KHÔNG dùng chung công thức "nhục nhã nhưng cơ thể phản bội", KHÔNG gọi tên cảm xúc thay cho hành động):\n' + lines.join('\n');
}
const SENTENCE_RHYTHM_RULE = 'NHỊP CÂU: sau một đoạn nhiều câu dài phải có ít nhất một câu rất ngắn (≤6 từ) hoặc một dòng thoại cụt; trong cảnh nóng cứ vài đoạn xen một chi tiết đời thường ngắn (tiếng chuông, tin nhắn, đồng hồ) để ngắt nhịp. Không mở 3 câu liền bằng cùng một chủ ngữ.';
function sentenceRhythmStats(text) {
  const sents = String(text || '').split(/(?<=[.!?…”"])\s+/).map(x => x.trim()).filter(Boolean).map(x => _prTokens(x).length).filter(n => n > 0);
  if (sents.length < 20) return null;
  const short = sents.filter(n => n <= 6).length / sents.length;
  let run = 0, maxRun = 0; sents.forEach(n => { if (n >= 18) { run++; maxRun = Math.max(maxRun, run); } else run = 0; });
  return { total: sents.length, shortRatio: short, maxLongRun: maxRun };
}
/* V14.7.31: 5 mục chất lượng tiểu thuyết: (1) kết chương có móc, (2) mỗi chương một thay đổi quan hệ, (3) nhân vật nữ tự quyết định, (4) luân phiên biệt danh, (5) giữ mạch chính (tu luyện/âm mưu) không biến mất. */
const ENDING_SUMMARY_RE = /(cô|hắn|anh|nàng|ả|y)\s+(biết|hiểu|nhận ra|thầm nghĩ|tự nhủ|thề|tin rằng)|chuẩn bị cho|bước tiếp theo|kế hoạch|từ (giây phút )?(này|nay)|cuộc chơi|sẽ không còn|mãi mãi|ván cờ|tất cả chỉ mới/i;
function endingHookCheck(text) {
  const paras = String(text || '').trim().split(/\n+/).map(x => x.trim()).filter(x => x && !/^\*\*|^#/.test(x));
  if (!paras.length) return { summary: false };
  const last = paras[paras.length - 1], tail = last.slice(-450), hasQuote = /["“”]/.test(last);
  return { summary: !hasQuote && ENDING_SUMMARY_RE.test(tail), tail };
}
const PLOT_TERM_RE = /tu luyện|linh khí|đột phá|cảnh giới|công pháp|huyền nguyên|âm mưu|truy sát|kẻ thù|phản diện|hãm hại|oan khuất|báo thù|bí mật năm xưa|manh mối/gi;
function plotTermHits(text, st) {
  const t = String(text || '').toLowerCase(); let n = (t.match(PLOT_TERM_RE) || []).length;
  String((st && st.realmLadder) || '').split(/[,;>→\n]+/).map(x => x.trim().toLowerCase()).filter(x => x.length >= 4).forEach(x => { n += _countPhrase(t, x); });
  return n;
}
function mainThreadDrift(st, chapterNumber) {
  const n = Math.max(1, Number(chapterNumber) || 1), chs = ((st && st.chapters) || []).slice(Math.max(0, n - 4), n - 1).filter(c => c && c.text);
  if (chs.length < 3) return 0;
  let streak = 0; for (let i = chs.length - 1; i >= 0; i--) { if (plotTermHits(chs[i].text, st) < 3) streak++; else break; }
  return streak >= 3 ? streak : 0;
}
/* V14.7.32: ÂM MƯU & KẺ THÙ (canon). Người dùng là độc giả, không phải tác giả: app tự dựng bản âm mưu nhiều phe/nhiều tầng MỘT lần từ Cốt Truyện Chính + dàn nhân vật, người dùng đọc rồi chọn/sửa/lưu; bản đã lưu là canon đưa vào mọi ngữ cảnh viết và kế hoạch chương để AI không bịa lại mâu thuẫn ở mỗi chương. */
function conspiracyClean(raw, max) {
  let t = String(raw == null ? '' : raw).replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').replace(/\r/g, '').trim();
  t = t.replace(/\n{3,}/g, '\n\n');
  const lim = max || 5200; if (t.length > lim) { const cut = t.slice(0, lim), i = cut.lastIndexOf('\n'); t = (i > lim * 0.7 ? cut.slice(0, i) : cut).trim(); }
  return t;
}
function buildConspiracyPrompt(st, opts) {
  st = st || {}; opts = opts || {};
  const cut = (v, n) => { v = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return v.length > n ? v.slice(0, n) + '…' : v; };
  const main = (st.mainCharProfile && st.mainCharProfile.name) || 'nhân vật chính';
  const cast = (st.characters || []).filter(c => c && c.name).slice(0, 14).map(c => '- ' + c.name + ': ' + cut([c.role, c.relevanceToMC, c.occupation].filter(x => x && !/không rõ/i.test(x)).join('; ') || '(chưa rõ vai trò)', 110)).join('\n');
  return [
    'Bạn là biên tập viên cốt truyện cho một tiểu thuyết 18+ dành cho người lớn (mọi nhân vật đều là người trưởng thành). Nhiệm vụ: dựng "BẢN ÂM MƯU & KẺ THÙ" nhất quán, NHIỀU PHE, NHIỀU TẦNG QUYỀN LỰC, gắn chặt với thế giới truyện. Người dùng là độc giả, họ sẽ chỉ đọc và chọn, nên bản phải rõ ràng, cụ thể, không mơ hồ.',
    'CỐT TRUYỆN CHÍNH CỦA TÁC GIẢ (giữ nguyên mọi quy tắc, không mâu thuẫn):\n' + cut(st.mainPlot, 6500),
    st.worldSetting ? 'THẾ GIỚI: ' + cut(st.worldSetting, 500) : '',
    st.worldRules ? 'LUẬT THẾ GIỚI: ' + cut(st.worldRules, 500) : '',
    st.cultivationSystem ? 'HỆ TU LUYỆN: ' + cut(st.cultivationSystem, 600) : '',
    'NHÂN VẬT HIỆN CÓ (ưu tiên DÙNG LẠI các tên này, gán cho họ vai trò trong âm mưu; chỉ thêm tên mới khi thật cần, tối đa 6 người mới, mỗi người có chức vụ rõ):\n' + (cast || '(chưa có)'),
    opts.previous ? 'BẢN CŨ (người dùng muốn bản KHÁC, đừng lặp lại chủ mưu/tầng như bản này):\n' + cut(opts.previous, 1500) : '',
    'YÊU CẦU: viết bằng tiếng Việt, văn bản thuần (KHÔNG JSON, KHÔNG markdown ```), tối đa khoảng 3500 ký tự, đúng các mục sau theo thứ tự:',
    'SỰ THẬT NĂM XƯA: chuyện gì đã xảy ra, khi nào, ai bị hại, vì sao phải che giấu (3–5 câu cụ thể, có địa điểm và mốc thời gian).',
    'MẢNH GHÉP ' + main + ' NẮM: hắn đã thấy/biết chính xác điều gì khi trực ca và vì sao bị truy sát.',
    'CÁC PHE PHÁI (3–5 phe): mỗi phe một dòng "Tên phe — đại diện (tên, chức vụ) — mục tiêu — thế lực/quyền lực — quan hệ với phe khác (liên minh/đối đầu)". Có cả phe trong công ty, phe doanh nhân/chính trị, gia tộc, giới tu luyện.',
    'CÁC TẦNG LỘ DẦN (4–5 tầng, đi từ đáy lên, mỗi tầng quyền lực cao hơn): mỗi tầng ghi đúng dạng "TẦNG k (chương a–b): người liên quan — loại quyền lực — manh mối/vật chứng cụ thể sẽ lộ — cái giá/rủi ro cho ' + main + '". Tầng cuối viết dạng "TẦNG k (chương a trở đi)". Tuân thủ nguyên tắc tiến chậm, không đường tắt.',
    'KẺ CHỦ MƯU THẬT: tên, chức vụ, động cơ, và điều khiến hắn chưa thể bị đụng tới.',
    'KẺ THÙ ĐANG HÀNH ĐỘNG: chúng biết gì về ' + main + ', nước đi tiếp theo, điều có thể làm hắn bị lộ hoặc làm hỏng kế hoạch của hắn (để có áp lực từ bên ngoài).',
    'VAI TRÒ TRONG ÂM MƯU của từng nhân vật hiện có (mỗi người 1 dòng: biết gì/che giấu gì/bị lợi dụng thế nào/giúp hay cản).',
    'QUY TẮC LỘ: kẻ chủ mưu thật không được lộ trước tầng cuối; mỗi tầng phải có vật chứng cụ thể; không để ' + main + ' dựa vào thế lực có sẵn.'
  ].filter(Boolean).join('\n\n');
}
function conspiracyParseTiers(text) {
  const out = [], re = /TẦNG\s*(\d+)\s*\(\s*chương\s*~?\s*(\d+)\s*(?:(?:[–\-—]|đến)\s*(\d+|trở đi|\+)?|(\+|trở đi))?\s*\)\s*:?\s*([^\n]*)/gi; let m;
  while ((m = re.exec(String(text || '')))) out.push({ tier: +m[1], from: +m[2], to: /^\d+$/.test(m[3] || '') ? +m[3] : Infinity, text: m[5].trim() });
  return out;
}
const CONSPIRACY_MAX_CHARS = 7000;
/* Vật chứng cố định theo chương: dòng dạng "... → lộ khoảng chương 25–35" (do người dùng hoặc AI ghi). */
function conspiracyParseClues(text) {
  const out = [], re = /^[ \t]*(?:\d+[\.\)]?|[•\-\*])?[ \t]*(.+?)[ \t]*(?:→|->|—>)[ \t]*lộ[^\n\d]*chương\s*~?\s*(\d+)\s*(?:[–\-—]|đến)\s*(\d+)/gim; let m;
  while ((m = re.exec(String(text || '')))) out.push({ text: m[1].trim().slice(0, 160), from: +m[2], to: +m[3] });
  return out;
}
function conspiracyClueFor(st, chapterNumber) {
  const n = Math.max(1, Number(chapterNumber) || 1), cl = conspiracyParseClues(st && st.conspiracyBible);
  const due = cl.filter(c => n >= c.from - 6 && n <= c.to);
  if (due.length) return { kind: 'due', clue: due[0] };
  const next = cl.filter(c => c.from > n).sort((a, b) => a.from - b.from)[0];
  return next ? { kind: 'next', clue: next } : null;
}
function conspiracyBlock(st, chapterNumber) {
  const t = String((st && st.conspiracyBible) || '').trim();
  if (!t) return '';
  const n = Math.max(1, Number(chapterNumber) || 1), tiers = conspiracyParseTiers(t);
  const cur = tiers.find(x => n >= x.from && n <= x.to) || (tiers.length && n > tiers[tiers.length - 1].from ? tiers[tiers.length - 1] : null);
  return 'ÂM MƯU & KẺ THÙ (CANON — không mâu thuẫn, không tự đổi chủ mưu/phe/tầng; chỉ lộ đúng theo tầng):\n' + conspiracyClean(t, CONSPIRACY_MAX_CHARS) +
    (cur ? '\nTẦNG ĐANG ÁP DỤNG (chương ' + n + '): TẦNG ' + cur.tier + ' — ' + cur.text.slice(0, 260) : '')
    + (function () { const k = conspiracyClueFor(st, n); return k ? (k.kind === 'due' ? '\nVẬT CHỨNG ĐẾN LƯỢT LỘ (chương ' + n + '): ' + k.clue.text + ' [dự kiến chương ' + k.clue.from + '–' + k.clue.to + ']' : '\nVẬT CHỨNG KẾ TIẾP (chưa lộ, chỉ được gợi nhẹ): ' + k.clue.text + ' [dự kiến chương ' + k.clue.from + '–' + k.clue.to + ']') : ''; })();
}
/* V14.7.34: dọn bộ nhớ "mồ côi". Xóa hết chương (hoặc xóa lệch thứ tự) nhưng Timeline/Foreshadowing/Knowledge/Threads/Scenes… vẫn còn mục của chương không còn tồn tại (ảnh người dùng: 0 chương mà vẫn "Diễn biến gần: Ch16…"). Mục có số chương > tổng số chương hiện có bị bỏ; khi 0 chương thì bỏ hết dữ liệu sinh từ chương. Không đụng nhân vật/Current Status/cài đặt. */
function pruneOrphanChapterMemory(st) {
  const total = Array.isArray(st && st.chapters) ? st.chapters.length : 0, removed = {};
  const orphan = (...vals) => { const nums = vals.map(Number).filter(n => Number.isFinite(n) && n > 0); return total === 0 || nums.some(n => n > total); };
  const prune = (key, test) => { const a = Array.isArray(st[key]) ? st[key] : []; const kept = a.filter(x => !test(x || {})); if (kept.length !== a.length) { removed[key] = a.length - kept.length; st[key] = kept; } };
  prune('timeline', e => orphan(e.chapter));
  prune('memoryEvents', e => orphan(e.chapter));
  prune('foreshadowing', f => orphan(f.plantedChapter, f.lastUpdated, f.resolvedChapter));
  prune('knowledgeLedger', k => orphan(k.firstChapter, k.lastUpdated));
  prune('threads', t => orphan(t.chapterIntroduced, t.lastUpdatedChapter));
  prune('scenes', x => orphan(x.chapter));
  prune('consentLog', x => orphan(x.chapter));
  const tr = st.characterStateTracker && typeof st.characterStateTracker === 'object' ? st.characterStateTracker : {};
  Object.keys(tr).forEach(k => { if (tr[k] && orphan(tr[k].chapter)) { delete tr[k]; removed.characterStateTracker = (removed.characterStateTracker || 0) + 1; } });
  if (total === 0 && st.layeredMemory && st.layeredMemory.summaries) { ['L1', 'L2', 'L3', 'L4'].forEach(L => { if ((st.layeredMemory.summaries[L] || []).length) { removed['layered.' + L] = st.layeredMemory.summaries[L].length; st.layeredMemory.summaries[L] = []; } }); }
  st.lastStatusChapter = Math.min(Number(st.lastStatusChapter || 0), total);
  st.lastMemorySyncChapter = Math.min(Number(st.lastMemorySyncChapter || 0), total);
  removed.total = Object.keys(removed).filter(k => k !== 'total').reduce((a, k) => a + removed[k], 0);
  return removed;
}
function chapterCraftPlanBlock(st, chapterNumber) {
  const n = Math.max(1, Number(chapterNumber) || 1), L = [];
  L.push('THAY ĐỔI QUAN HỆ (bắt buộc, mỗi chương một lần): trong beat [R] cuối ghi rõ AI mất gì / được gì / lộ gì với ai, khiến quan hệ giữa hai nhân vật khác đi so với đầu chương (quyền lực, niềm tin, nợ, bí mật). Thêm một chiêu/đạo cụ mới mà quan hệ không đổi thì KHÔNG tính.');
  if (n % 3 === 0) L.push('HÀNH ĐỘNG TỰ QUYẾT ĐỊNH CỦA NHÂN VẬT NỮ (chương này): một nhân vật nữ tự CHỦ ĐỘNG làm một việc có mục tiêu riêng, không phải phản ứng theo lệnh Bùi Lạc — ví dụ chống cự có tính toán (thất bại hoặc có giá), thỏa hiệp đổi lấy thứ cô cần, giấu hoặc dò một bí mật, nhờ một người phụ. Việc đó phải để lại hậu quả cho kế hoạch của hắn.');
  const dr = mainThreadDrift(st, n);
  if (dr) L.push('MẠCH CHÍNH ĐÃ BỊ BỎ QUÊN ' + dr + ' chương liền (tu luyện/âm mưu hầu như không xuất hiện): chương này BẮT BUỘC có một beat [R] đẩy mạch chính tiến một bước thật — tu luyện có mốc tiến triển cụ thể hoặc âm mưu lộ ra một manh mối/hành động của kẻ thù — rồi mới tới phần còn lại.');
  if (String((st && st.conspiracyBible) || '').trim()) { const cb = conspiracyBlock(st, n), i = cb.lastIndexOf('TẦNG ĐANG ÁP DỤNG'); L.push('ÂM MƯU (canon đã chốt): ' + (i >= 0 ? cb.slice(i) : 'bám bản âm mưu trong ngữ cảnh') + '. Beat đẩy mạch chính của chương phải dùng manh mối/vật chứng/nhân vật của tầng này; không lộ kẻ chủ mưu thật sớm hơn tầng cuối.'); }
  { const k = conspiracyClueFor(st, n); if (k && k.kind === 'due') L.push('VẬT CHỨNG ĐẾN LƯỢT LỘ: ' + k.clue.text + ' — chương này hoặc 1–2 chương tới phải lộ/đưa vào cốt truyện đúng vật chứng này (không lộ thêm vật chứng sau nó).'); }
  return L.join('\n');
}
const NARRATOR_EPITHETS = [
  { p: 'gã bảo vệ', max: 3 }, { p: 'tên bảo vệ', max: 2 }, { p: 'kẻ bảo vệ', max: 2 }, { p: 'thấp kém', max: 3 }, { p: 'hèn mọn', max: 2 }
];
function prosePatternGate(state, chapterNumber, text) {
  const hard = [], warn = [], t = String(text || ''), low = t.toLowerCase(), words = Math.max(1, t.split(/\s+/).length), scale = Math.max(0.6, words / 3500);
  const over = [];
  OVERUSED_WATCH.forEach(w => {
    const n = _countPhrase(low, w.p), lim = Math.max(1, Math.round(w.max * scale));
    if (n > lim) over.push({ w, n, lim });
  });
  const severe = over.filter(o => o.w.hard && o.n > o.lim * 2);
  if (severe.length) hard.push('Lặp cụm sáo quá nhiều (viết lại, giữ nội dung, đổi cách diễn đạt): ' + severe.map(o => '"' + o.w.p + '" ' + o.n + ' lần (tối đa ' + o.lim + ')' + (o.w.alt ? ' — ' + o.w.alt : '')).join('; '));
  const rest = over.filter(o => !severe.includes(o));
  if (rest.length) warn.push('Cụm hay lặp: ' + rest.map(o => '"' + o.w.p + '" ' + o.n + '/' + o.lim).join(', '));
  const eh = endingHookCheck(t);
  if (eh.summary) warn.push('Kết chương bằng câu tóm tắt nội tâm/kế hoạch ("' + eh.tail.slice(-90).replace(/\s+/g, ' ') + '") — kết bằng hình ảnh, câu thoại hoặc thông tin mới.');
  const epi = NARRATOR_EPITHETS.map(e => ({ e, n: _countPhrase(low, e.p), lim: Math.max(1, Math.round(e.max * scale)) })).filter(x => x.n > x.lim);
  if (epi.length) warn.push('Biệt danh lặp trong lời kể: ' + epi.map(x => '"' + x.e.p + '" ' + x.n + '/' + x.lim).join(', ') + ' — luân phiên bằng tên/"hắn".');
  if (chapterNumber && mainThreadDrift(state, chapterNumber) && plotTermHits(t, state) < 3) warn.push('Mạch chính (tu luyện/âm mưu) vắng mặt ≥4 chương liền kể cả chương này.');
  const rh = sentenceRhythmStats(t);
  if (rh && (rh.shortRatio < 0.08 || rh.maxLongRun >= 12)) warn.push('Nhịp câu đều/dài: ' + Math.round(rh.shortRatio * 100) + '% câu ≤6 từ, chuỗi ' + rh.maxLongRun + ' câu dài liền — xen câu ngắn/thoại cụt.');
  const prev = (((state && state.chapters) || []).filter((c, i) => c && c.text && (!chapterNumber || i < chapterNumber - 1))).slice(-2);
  if (prev.length) {
    const k = openingKind(t), h = openingHead(t);
    if (prev.some(c => openingHead(c.text) === h && h)) warn.push('Mở chương giống chương trước ("' + h + '…") — đổi cách mở.');
    else if (prev.length >= 2 && k === 'nhân vật+động từ' && prev.every(c => openingKind(c.text) === k)) warn.push('3 chương liền mở bằng "nhân vật + động từ" — nên mở bằng thoại/âm thanh/đồ vật/mốc thời gian.');
  }
  return { hard, warn };
}

function buildVocabularyBlockFrom(state) {
  const v = (state && state.vocabulary) || {};
  const parts = [];
  if (v.preferred) parts.push("TỪ MUỐN DÙNG: " + v.preferred.replace(/\n/g, ", "));
  if (v.banned) parts.push("TỪ CẦN TRÁNH: " + v.banned.replace(/\n/g, ", "));
  if (v.overused) parts.push("CỤM ĐÃ LẶP NHIỀU (tránh dùng lại): " + v.overused.replace(/\n/g, " · "));
  if (v.anatomy) parts.push("CÁCH GỌI BỘ PHẬN: " + v.anatomy);
  return parts.join("\n");
}

function _clipChapterText(t, maxChars) {
  t = t || "";
  if (t.length <= maxChars) return t;
  return t.slice(0, Math.floor(maxChars * 0.3)) + "\n\n[...]\n\n" + t.slice(-Math.floor(maxChars * 0.6));
}
// V14.0.17: active-record filter — deleted/invalidated chapters must never become continuity input.
function isActiveStoryChapter(chapter) {
  if (!chapter || typeof chapter !== "object") return false;
  const status = String(chapter.status || "").toLowerCase();
  return status !== "deleted" && status !== "invalidated" && chapter.deleted !== true && chapter.invalidated !== true;
}
function activeStoryChapters(chapters) {
  return (Array.isArray(chapters) ? chapters : []).filter(isActiveStoryChapter);
}
// Draft/soft-fail material must not outrank an accepted chapter when canon exists.
// Legacy chapters without a status are treated as accepted for backward compatibility.
function isAcceptedStoryChapter(chapter) {
  if (!isActiveStoryChapter(chapter)) return false;
  const status = String(chapter.status || (chapter.sync && chapter.sync.status) || "").toLowerCase();
  if (!status) return true;
  return /^(accepted|approved|synced|synced_with_warnings|complete|completed)$/.test(status) || !!(chapter.sync && /^(synced|synced_with_warnings)$/.test(String(chapter.sync.status || "").toLowerCase()));
}
function acceptedStoryChapters(chapters) {
  const active = activeStoryChapters(chapters);
  const accepted = active.filter(isAcceptedStoryChapter);
  return accepted.length ? accepted : active;
}
// Invalidate metadata whose chapter identity is removed; callers still own array cleanup/remapping.
function invalidateChapterDependentRecords(st, removedChapter) {
  if (!st || typeof st !== "object") return st;
  const removed = Number(removedChapter);
  if (!Number.isFinite(removed) || removed < 1) return st;
  const meta = st.nextChapterHintMeta;
  if (meta && typeof meta === "object") {
    const target = Number(meta.targetChapter);
    if (target === removed) {
      st.nextChapterHint = "";
      st.nextChapterHintMeta = Object.assign({}, meta, { targetChapter: 0, status: "invalidated", invalidated: true, invalidatedByChapter: removed, updatedAt: Date.now() });
    } else if (target > removed) {
      st.nextChapterHintMeta = Object.assign({}, meta, { targetChapter: target - 1, updatedAt: Date.now() });
    }
  }
  const statusChapter = Number(st.lastStatusChapter);
  if (statusChapter === removed) {
    st.currentStatus = "";
    st.statusState = {};
    st.lastStatusChapter = Math.max(0, removed - 1);
  } else if (statusChapter > removed) st.lastStatusChapter = statusChapter - 1;
  const memoryChapter = Number(st.lastMemorySyncChapter);
  st.lastMemorySyncChapter = memoryChapter === removed ? Math.max(0, removed - 1) : (memoryChapter > removed ? memoryChapter - 1 : st.lastMemorySyncChapter);
  return st;
}
// V14.0.17: hint provenance. Missing metadata is intentionally unverified, never guessed as active.
function chapterHintVerification(state, targetChapter) {
  const text = String(state && state.nextChapterHint || "").trim();
  const meta = state && state.nextChapterHintMeta;
  const target = Number(targetChapter) || 0;
  if (!text) return { text: "", verified: false, reason: "empty" };
  if (!meta || typeof meta !== "object") return { text: "", verified: false, reason: "missing_metadata" };
  const metaTarget = Number(meta.targetChapter) || 0;
  const status = String(meta.status || "").toLowerCase();
  const verified = metaTarget === target && (status === "active" || status === "confirmed") && meta.invalidated !== true && meta.superseded !== true;
  return verified ? { text, verified: true, targetChapter: metaTarget, version: Number(meta.version) || 1 } : { text: "", verified: false, reason: metaTarget !== target ? "target_mismatch" : "inactive_status" };
}
// V12.32: chỉ gửi tóm tắt ngắn của chương gần nhất + đoạn cuối để nối mạch.
// Không tự động gửi tóm tắt các chương xa; canon dài hạn lấy từ Story Bible/Memory có chọn lọc.
function buildRecentBlocks(priorChapters) {
  const pc = acceptedStoryChapters(priorChapters);
  if (!pc.length) return { recentFullText: "", olderSummaries: "" };
  const last = pc[pc.length - 1];
  const summary = String(last.summary || "").trim();
  const compactSummary = summary
    ? (summary.length > 1100 ? summary.slice(0, 1100).trimEnd() + "…" : summary)
    : _clipChapterText(last.text || "", 700);
  const ending = String(last.text || "").trim().slice(-1400);
  const recentFullText = [
    "--- CHƯƠNG GẦN NHẤT: TÓM TẮT SỰ KIỆN QUAN TRỌNG ---",
    compactSummary || "(Chưa có tóm tắt; chỉ dùng đoạn kết bên dưới để nối tiếp.)",
    ending ? "--- ĐOẠN CUỐI ĐỂ NỐI TIẾP ---\n" + ending : ""
  ].filter(Boolean).join("\n\n");
  return { recentFullText, olderSummaries: "" };
}

// Prompt lập KẾ HOẠCH chương. Có brief của người dùng: giữ ĐỦ mọi nhịp (không còn giới hạn 3 sự kiện / 5 beat làm nén gợi ý nhiều nhịp).
// V14.7.7: kế hoạch chương phải LÊN LỊCH cảnh nóng theo Trọng tâm trưởng thành. Trước đây mục 8 chỉ ghi "nếu có cảnh trưởng thành" và brief
// của người dùng cấm thêm sự kiện, nên AI bỏ cảnh nóng ở mọi chương không được brief nhắc tới (truyện PRIMARY vẫn 0 cảnh 18+ từ chương 3).
function matureChapterPlanBlock(o) {
  if (!o || !o.mature) return "";
  const mf = normalizeChapterMatureFocus(o.matureFocus);
  if (mf === "none") return "";
  const streak = Math.max(0, Number(o.heatFreeStreak) || 0), primary = mf === "primary";
  const must = primary || streak >= 3;
  return [
    "LỊCH CẢNH NÓNG (truyện người lớn, Trọng tâm trưởng thành = " + mf.toUpperCase() + (streak ? "; " + streak + " chương gần nhất chưa có cảnh nóng" : "") + "):",
    must
      ? "- Kế hoạch PHẢI có ít nhất MỘT beat là CẢNH NÓNG. Ghi đúng cụm \"cảnh nóng\" trong beat, nêu 2 nhân vật tham gia (đều từ 18 tuổi, theo tên trong hồ sơ), địa điểm, tình huống đưa tới cảnh, và điều cảnh đó làm đổi (quan hệ/quyền lực/bí mật/hậu quả)."
      : "- Nên có một beat CẢNH NÓNG nếu quan hệ/tình huống đã tích tụ đủ; nếu có, ghi đúng cụm \"cảnh nóng\" trong beat và nêu 2 nhân vật tham gia (đều từ 18 tuổi).",
    "- Nếu brief/mệnh lệnh của người dùng không nhắc cảnh nóng: vẫn thêm beat này dưới dạng [S] (beat hỗ trợ, bám đúng tình huống và nhân vật đang có), KHÔNG tính là sự kiện chính thứ 4 và KHÔNG làm lệch các mốc A/B của brief. Cảnh nóng đặt SAU các mốc bắt buộc hoặc xen vào nhịp phù hợp.",
    "- Mỗi cảnh nóng phải đổi hướng quan hệ hoặc thế lực, không lặp lại cảnh trước (đổi bối cảnh, tư thế, động lực, cảm xúc).",
    "- Cảnh nóng có kháng cự/ép buộc/quyền lực: lên nhịp theo nấc (kháng cự → cơ thể phản bội → điểm gãy → day dứt); kẻ nắm quyền trì hoãn có chủ đích, KHÔNG để nhân vật đổ quá nhanh — điểm gãy đặt ở nửa sau cảnh (hoặc chương sau nếu Outline còn dài) trừ khi brief chỉ định khác; day dứt sau khi đổ phải có chỗ, không bỏ qua.",
    "- Beat khác nằm GIỮA lúc đang quan hệ (tu luyện, hấp thụ linh khí, tin nhắn, người đi ngang...) KHÔNG được thành cảnh riêng chen giữa: ghi nó là chi tiết LỒNG trong chính cảnh nóng (cảm nhận/suy nghĩ/tiếng động) hoặc xếp SAU khi cảnh nóng kết thúc."
  ].join("\n");
}
/* V14.7.40: (1) PRIMARY phải có cảnh nóng ở Scene Graph; (2) thang khuất phục theo nấc, không đổ quá nhanh. */
const HOT_BEAT_RE = /cảnh nóng|quan hệ (?:thể xác|tình dục)|giao hợp|làm tình|ân ái|lên giường|cưỡng ép thể xác|thể xác|tình dục|nhục dục|hoan lạc|cực khoái|\bsex\b/i;
function planHasHotBeat(graph) {
  return !!(graph && Array.isArray(graph.scenes) && graph.scenes.some(sc => HOT_BEAT_RE.test([sc.purpose, sc.mustChange, ...(sc.beats || [])].join(' '))));
}
function chapterNeedsHeat(st) {
  if (!st || !st.mature) return false;
  const mf = normalizeChapterMatureFocus(st.chapterMatureFocus);
  return mf === 'primary';
}
const SUBMISSION_STAGES = [
  null,
  'NẤC 1 — CHỐNG ĐỐI: còn căm ghét/sợ/tính toán trả đũa; bị ép từng bước nhỏ; cơ thể có phản ứng nhưng miệng và lý trí vẫn cự tuyệt; KHÔNG gọi chủ, KHÔNG thề phục tùng, KHÔNG chủ động xin.',
  'NẤC 2 — GIẰNG XÉ: cơ thể phản bội nhiều hơn, bắt đầu bị cuốn nhưng tự dằn vặt, vẫn tìm cách chống/giữ thể diện; có thể nhượng bộ có điều kiện; KHÔNG tự nguyện hoàn toàn, KHÔNG tuyên thệ.',
  'NẤC 3 — PHỤ THUỘC: thèm khát/lệ thuộc rõ, đôi lúc chủ động nhưng còn xấu hổ, ghen, toan tính hoặc gượng cứng ngoài mặt; vẫn có phản kháng nhỏ.',
  'NẤC 4 — QUY PHỤC: được phép tự nguyện, chủ động, gọi chủ/tuyên thệ; vẫn giữ tính cách riêng, không biến thành con rối.'
];
function submissionStageFor(chaptersSince, encounters) {
  const byCh = chaptersSince < 2 ? 1 : chaptersSince < 5 ? 2 : chaptersSince < 10 ? 3 : 4;
  const byEnc = encounters <= 0 ? 1 : encounters <= 1 ? 2 : encounters <= 3 ? 3 : 4;
  return Math.min(byCh, byEnc);
}
function submissionLadder(st, chapterNumber, priorChapters) {
  if (!st || !st.mature) return [];
  const mc = normalizeName((st.mainCharProfile && st.mainCharProfile.name) || '');
  const prior = (Array.isArray(priorChapters) ? priorChapters : (st.chapters || [])).filter(c => c && c.text);
  const recentTxt = normalizeName(prior.slice(-3).map(c => c.text).join(' '));
  const out = [];
  (Array.isArray(st.characters) ? st.characters : []).forEach(c => {
    const nm = String(c && c.name || '').trim();
    if (!nm || normalizeName(nm) === mc || (c.tier === 'minor' && !recentTxt.includes(normalizeName(nm)))) return;
    if (c.dead || (typeof isGenericAddressName === 'function' && isGenericAddressName(nm))) return;
    const key = normalizeName(nm);
    if (!recentTxt.includes(key) && c.tier !== 'major') return;
    const first = Math.max(1, Number(c.firstAppearance) || 1);
    const enc = prior.filter(p => normalizeName(p.text).includes(key) && textHasNsfwKeyword(p.text)).length;
    out.push({ name: nm, stage: submissionStageFor(Math.max(0, chapterNumber - first), enc), encounters: enc, since: Math.max(0, chapterNumber - first) });
  });
  return out.slice(0, 5);
}
function submissionLadderBlock(st, chapterNumber, priorChapters) {
  const l = submissionLadder(st, chapterNumber, priorChapters); if (!l.length) return '';
  return 'THANG KHUẤT PHỤC (chống đổ quá nhanh) — mỗi nhân vật chỉ được tiến TỐI ĐA tới nấc cho phép, mỗi chương chỉ nhích tối đa 1 nấc nhỏ, không nhảy cóc:\n'
    + l.map(x => '- ' + x.name + ': cho phép tới ' + SUBMISSION_STAGES[x.stage]).join('\n')
    + '\nKẻ nắm quyền trì hoãn có chủ đích; nhân vật nữ phải giữ chính kiến, tính cách và lý do riêng; mỗi lần khuất phục thêm một chút phải có cái giá/hậu quả cụ thể.';
}
const NOVELTY_AXES = [
  ['dùng miệng', /bú |ngậm|liếm/i], ['trói/bịt mắt/còng', /trói|còng|bịt mắt|dây lụa/i],
  ['vòng cổ/xích/bò bằng bốn chân', /vòng cổ|xích|\bbò\b/i], ['dụng cụ rung/điều khiển từ xa', /trứng rung|điều khiển từ xa/i],
  ['nơi công cộng/công sở/nhà hàng/trong xe', /nhà hàng|văn phòng|trong xe|phòng họp/i], ['thụt rửa/nút đệm', /thụt|phích cắm|nút đệm/i],
  ['máy móc/lồng/sáp nến', /cỗ máy|piston|lồng|sáp nến/i], ['trước gương', /gương/i], ['đánh đòn/roi', /paddle|đánh đòn|roi/i]
];
function noveltyLedger(st, priorChapters) {
  const prior = (Array.isArray(priorChapters) ? priorChapters : (st && st.chapters) || []).filter(c => c && c.text && textHasNsfwKeyword(c.text));
  const used = NOVELTY_AXES.filter(a => prior.some(c => a[1].test(c.text))).map(a => a[0]);
  const fresh = NOVELTY_AXES.filter(a => used.indexOf(a[0]) < 0).map(a => a[0]);
  return { used, fresh };
}
function noveltyLedgerBlock(st, priorChapters) {
  const n = noveltyLedger(st, priorChapters);
  if (!n.used.length && !n.fresh.length) return '';
  return 'SỔ LEO THANG (mỗi cảnh nóng phải thêm ÍT NHẤT MỘT yếu tố mới: đạo cụ, địa điểm hoặc nấc quyền lực; không lặp nguyên cảnh cũ, không lặp đoạn văn):'
    + (n.used.length ? '\n- Đã dùng: ' + n.used.join('; ') : '')
    + (n.fresh.length ? '\n- Chưa dùng (ưu tiên chọn 1): ' + n.fresh.join('; ') : '');
}
function matureScenePlanBlock(st, chapterNumber, priorChapters) {
  if (!st || !st.mature) return '';
  const mf = normalizeChapterMatureFocus(st.chapterMatureFocus);
  if (mf === 'none') return '';
  const primary = mf === 'primary';
  const parts = [
    'LỊCH CẢNH NÓNG (truyện người lớn 18+, Trọng tâm = ' + mf.toUpperCase() + '):',
    primary
      ? '- Chương này BẮT BUỘC có ít nhất MỘT scene là CẢNH NÓNG chính (targetWords ≥ 1100): ghi đúng cụm "cảnh nóng" trong beats, nêu 2 nhân vật tham gia (đều ≥18 tuổi, đúng tên hồ sơ), địa điểm, tình huống dẫn tới, và điều cảnh đó làm đổi quan hệ/thế lực. Nếu cốt truyện chương có nhiều tình huống thì chọn tình huống hợp nhất để đặt cảnh nóng; không bỏ cảnh nóng để nhường chỗ cho đoạn dẫn truyện. Cảnh nóng chiếm khoảng 40–60% độ dài chương (các đoạn dẫn/âm mưu đặt trước hoặc sau, chương kết bằng móc nối như tin nhắn/cuộc gọi của kẻ thù).'
      : '- Nên có cảnh nóng nếu quan hệ đã tích tụ đủ; nếu có thì ghi cụm "cảnh nóng" trong beats và nêu 2 nhân vật (≥18).',
    '- Nếu Arc/Outline không nhắc cảnh nóng: vẫn thêm dưới dạng beat hỗ trợ [S] bám đúng tình huống và nhân vật đang có; không lệch mốc chính của Arc.',
    '- Mỗi cảnh nóng phải đổi bối cảnh, động lực hoặc thế lực so với cảnh trước, và có hậu quả sau cảnh.',
    '- Cảnh nóng có kháng cự/quyền lực: lên nhịp theo nấc (kháng cự → cơ thể phản bội → điểm gãy → day dứt); điểm gãy đặt nửa sau cảnh, không đổ ngay.'
  ];
  const nov = noveltyLedgerBlock(st, priorChapters);
  if (nov) parts.push(nov);
  const lad = submissionLadderBlock(st, chapterNumber, priorChapters);
  if (lad) parts.push(lad);
  return parts.join('\n');
}
// Chèn beat cảnh nóng xác định khi model lập plan thiếu (chỉ khi PRIMARY, sau khi đã thử lại).
function injectHotBeat(graph, st, chapterContract) {
  if (!graph || !Array.isArray(graph.scenes) || !graph.scenes.length) return graph;
  const mc = (st.mainCharProfile && st.mainCharProfile.name) || '';
  const isMc = n => normalizeName(n) === normalizeName(mc);
  const lad = submissionLadder(st, (st.chapters || []).length + 1, st.chapters || []);
  const allowed = (chapterContract && chapterContract.allowedCharacters) || [];
  const inGraph = [];
  graph.scenes.forEach(sc => (sc.characters || []).forEach(n => { if (n && !isMc(n) && !inGraph.includes(n) && !(typeof isGenericAddressName === 'function' && isGenericAddressName(n))) inGraph.push(n); }));
  const cands = [].concat(lad.map(x => x.name), inGraph, allowed.filter(n => !isMc(n)));
  const pn = (cands.find(n => inGraph.some(g => normalizeName(g) === normalizeName(n))) || cands[0] || '');
  if (!pn || !mc) return graph;
  let idx = graph.scenes.findIndex(sc => (sc.characters || []).some(n => normalizeName(n) === normalizeName(pn)) && (sc.characters || []).some(n => normalizeName(n) === normalizeName(mc)));
  if (idx < 0) idx = graph.scenes.length - 1;
  const sc = graph.scenes[idx];
  sc.beats = (sc.beats || []).concat(['[S] cảnh nóng giữa ' + mc + ' và ' + pn + ' (đều trưởng thành): kháng cự → cơ thể phản bội → điểm gãy nhỏ → day dứt; đổi thế lực/quan hệ, nhân vật nữ chưa đổ hoàn toàn']);
  sc.characters = Array.from(new Set([].concat(sc.characters || [], [mc, pn])));
  sc.targetWords = Math.max(Number(sc.targetWords) || 0, 1100);
  graph.heatInjected = true;
  return graph;
}
/* V14.7.46: AI ĐIỀN HỒ SƠ CÒN TRỐNG. Bước đọc chương bị cấm bịa (đúng, để khỏi sai canon) nên nhân vật mới chỉ có tên; nút này cho phép dựng thẻ hồ sơ
   nhất quán với truyện, CHỈ vào ô trống, không ghi đè ô người dùng đã nhập, không đụng nhóm 18+ (người dùng tự nhập). */
const CHAR_FILL_FIELDS = [['age', 'tuổi', 12], ['gender', 'giới tính', 12], ['occupation', 'nghề', 70], ['position', 'chức vụ', 70], ['height', 'chiều cao', 24], ['bodyType', 'dáng người', 70],
  ['hair', 'tóc', 50], ['eyes', 'mắt', 40], ['skin', 'da', 40], ['voice', 'giọng nói', 60], ['style', 'phong cách ăn mặc', 90], ['scars', 'sẹo/dấu vết', 60], ['tattoos', 'hình xăm', 60],
  ['appearance', 'ngoại hình tổng quát', 320], ['personality', 'tính cách', 260], ['speech', 'cách nói', 140], ['goals', 'mục tiêu', 200], ['secret', 'bí mật', 200], ['weakness', 'điểm yếu', 160],
  ['fear', 'nỗi sợ', 140], ['strength', 'điểm mạnh', 160], ['notes', 'ghi chú xuất thân/quá khứ', 300]];
function emptyCharFillFields(c) {
  return CHAR_FILL_FIELDS.map(f => f[0]).filter(k => !String(c && c[k] != null ? c[k] : '').trim());
}
function characterMentionExcerpts(st, name, max) {
  const nm = String(name || '').trim().toLowerCase(); if (!nm) return [];
  const out = [], chs = (st && st.chapters) || [];
  for (let i = chs.length - 1; i >= 0 && out.length < (max || 3); i--) {
    const t = String(chs[i] && chs[i].text || ''), at = t.toLowerCase().indexOf(nm);
    if (at >= 0) out.push('Ch.' + (i + 1) + ': …' + t.slice(Math.max(0, at - 220), at + 320).replace(/\s+/g, ' ') + '…');
  }
  return out.reverse();
}
function buildCharacterFillPrompt(st, c, keys) {
  st = st || {}; const cut = (v, n) => { v = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return v.length > n ? v.slice(0, n) + '…' : v; };
  const labelOf = k => (CHAR_FILL_FIELDS.find(f => f[0] === k) || [k, k])[1], capOf = k => (CHAR_FILL_FIELDS.find(f => f[0] === k) || [0, 0, 200])[2];
  const known = Object.keys(c || {}).filter(k => ['name', 'tier', 'role', 'relevanceToMC', 'maritalStatus', 'spouseName', 'faction', 'currentLocation', 'residence', 'wealth'].concat(CHAR_FILL_FIELDS.map(f => f[0])).includes(k) && String(c[k] || '').trim() && keys.indexOf(k) < 0)
    .map(k => '- ' + (k === 'name' ? 'tên' : k === 'tier' ? 'tầm quan trọng' : k === 'role' ? 'vai trò' : labelOf(k)) + ': ' + cut(c[k], 300));
  const mc = st.mainCharProfile || {}, others = (st.characters || []).filter(x => x && x.name && x !== c && !x.dead).slice(0, 12)
    .map(x => '- ' + x.name + [x.gender, x.age ? x.age + ' tuổi' : '', x.role || x.occupation || x.position].filter(Boolean).map(v => ', ' + v).join(''));
  const ex = characterMentionExcerpts(st, c && c.name, 3);
  return [
    'Bạn là biên tập viên hồ sơ nhân vật cho một tiểu thuyết Việt Nam. Hãy DỰNG các mục còn trống trong thẻ hồ sơ của nhân vật dưới đây, sao cho cụ thể, đời thường và NHẤT QUÁN với truyện.',
    st.genre ? 'THỂ LOẠI: ' + cut(st.genre, 120) : '', st.worldSetting ? 'BỐI CẢNH: ' + cut(st.worldSetting, 500) : '', st.mainPlot ? 'CỐT TRUYỆN: ' + cut(st.mainPlot, 900) : '',
    mc.name ? 'NHÂN VẬT CHÍNH: ' + mc.name + [mc.gender, mc.age ? mc.age + ' tuổi' : '', mc.occupation || mc.role].filter(Boolean).map(v => ', ' + v).join('') : '',
    others.length ? 'NHÂN VẬT KHÁC (để tránh trùng/mâu thuẫn):\n' + others.join('\n') : '',
    'NHÂN VẬT CẦN ĐIỀN: ' + (c && c.name) + '\nĐÃ CÓ (CANON — tuyệt đối giữ đúng, không mâu thuẫn):\n' + (known.length ? known.join('\n') : '- (chưa có gì ngoài tên)'),
    ex.length ? 'ĐOẠN TRUYỆN ĐÃ VIẾT CÓ NHÂN VẬT NÀY (canon, ưu tiên hơn mọi suy đoán):\n' + ex.join('\n') : '',
    'CÁC MỤC CẦN ĐIỀN (chỉ trả về các khóa này):\n' + keys.map(k => '- ' + k + ' (' + labelOf(k) + ', tối đa ~' + capOf(k) + ' ký tự)').join('\n'),
    'QUY TẮC: (1) Mọi chi tiết phải khớp phần ĐÃ CÓ và đoạn truyện; không đổi nghề/chức vụ/tuổi nếu đã có. (2) Nhân vật người lớn: tuổi ≥ 18; nếu hồ sơ/đoạn truyện cho thấy nhân vật dưới 18 thì giữ đúng như vậy và KHÔNG tạo chi tiết thân thể gợi dục. (3) Ngoại hình viết bằng hình ảnh cụ thể (khuôn mặt, dáng, nét riêng), không chung chung "xinh đẹp". (4) Không viết nội dung tình dục; các mục 18+ do người dùng tự nhập. (5) Mục nào không thể điền hợp lý thì để "".',
    'CHỈ TRẢ JSON thuần, đúng một object, khóa đúng như trên, giá trị là chuỗi tiếng Việt.'
  ].filter(Boolean).join('\n\n');
}
function parseCharacterFill(obj, keys) {
  const out = {}; if (!obj || typeof obj !== 'object') return out;
  keys.forEach(k => {
    let v = obj[k]; if (v == null) return; if (Array.isArray(v)) v = v.join(', '); v = String(v).replace(/\s+/g, ' ').trim(); if (!v) return;
    const cap = (CHAR_FILL_FIELDS.find(f => f[0] === k) || [0, 0, 200])[2] * 1.5; if (v.length > cap) v = v.slice(0, Math.round(cap)).replace(/\s+\S*$/, '') + '…';
    if (k === 'age') { const n = parseInt(v, 10); if (!(n > 0 && n < 130)) return; v = String(n); }
    out[k] = v;
  });
  return out;
}
function applyCharacterFill(c, fill) {
  const done = []; if (!c || !fill) return done;
  Object.keys(fill).forEach(k => { if (!String(c[k] != null ? c[k] : '').trim() && String(fill[k] || '').trim()) { c[k] = fill[k]; done.push(k); } });
  if (done.length) { c.aiFilledFields = Array.from(new Set((c.aiFilledFields || []).concat(done))); }
  return done;
}
function cultivationActive(st) {
  if (!st) return false;
  const hasLadder = Array.isArray(st.realmLadder) ? st.realmLadder.length > 0 : !!String(st.realmLadder || "").trim();
  return !!(String(st.cultivationSystem || "").trim() || hasLadder || isCultivationGenre(st.genre));
}
function cultivationPlanBlock(o) {
  if (!o || !o.cultivation) return "";
  return [
    "TIẾN BỘ TU LUYỆN (truyện có hệ thống tu luyện):",
    "- Nếu chương có beat tu luyện/luyện công/đột phá: ghi trong beat MỐC TIẾN BỘ CỤ THỂ sẽ đạt (tầng/cảnh giới từ đâu lên đâu, hoặc tiến độ tích lũy bao nhiêu phần, hoặc thần thông/chiêu mới) và PHÉP THỬ cho thấy sự khác biệt trước–sau, cùng CÁI GIÁ phải trả. Không ghi beat tu luyện mà không có kết quả đo được.",
    "- Lên kế hoạch nhịp: tiểu tầng tăng sau vài chương tích lũy, đột phá đại cảnh giới hiếm và phải được chuẩn bị; chương chưa đột phá vẫn phải cho thấy tiến độ tích lũy. Chỉ dùng tên cảnh giới trong thang của truyện."
  ].join("\n");
}
function buildChapterPlanPrompt(o) {
  const userDirective = String(o.directive || "").trim(), userHint = String(o.hint || "").trim();
  const hintVerified = o.hintVerified !== false;
  const effectiveHint = hintVerified ? userHint : "";
  const maxNamedCharacters = Math.max(1, Math.min(12, Number(o.maxNamedCharacters) || 6));
  const hasUserBrief = !!(userDirective || effectiveHint);
  return [
    "BẮT BUỘC: TIẾNG VIỆT 100%.", "",
    "Bạn là biên kịch cho tiểu thuyết dài kỳ. Lập KẾ HOẠCH cho CHƯƠNG " + o.chapterNumber + ".",
    "",
    "Bối cảnh:", o.context, "",
    o.storyControl || "", "",
    o.recent ? ("Chương gần nhất:\n" + String(o.recent).slice(0, 8000)) : "Chương đầu tiên.", "",
    o.mainCharName ? ("NHÂN VẬT CHÍNH: " + o.mainCharName + " — là TRỤC của kế hoạch này và phải có mặt trong chương, nhưng KHÔNG cần có mặt ở mọi cảnh: nhân vật phụ quan trọng có thể có cảnh/nhịp riêng (việc riêng, mục tiêu riêng, hành động chủ động) rồi giao với tuyến của nhân vật chính. Ghi rõ nhịp nào theo góc nhìn nhân vật nào.") : "",
    hasUserBrief ? [
      "===== YÊU CẦU/GỢI Ý DO NGƯỜI DÙNG VIẾT — NGUỒN SỰ KIỆN ƯU TIÊN CAO =====",
      userDirective ? ("MỆNH LỆNH:\n" + userDirective) : "",
      effectiveHint ? ("GỢI Ý:\n" + effectiveHint) : "",
      "===== HẾT YÊU CẦU NGƯỜI DÙNG =====",
      "QUY TẮC ĐẶC BIỆT: Phải chuyển ĐẦY ĐỦ mọi chi tiết, hành động, mốc mở đầu, diễn biến và mốc kết thúc mà người dùng đã nêu thành kế hoạch. Không được bỏ sót, rút gọn, gộp nhịp hoặc thay thế chi tiết quan trọng.",
      "Không tự thêm tuyến truyện, mục tiêu, nhân vật quan trọng, địa điểm mới hoặc biến cố lớn không có trong yêu cầu người dùng. Nếu cần nối các mốc, chỉ dùng diễn biến cầu nối tối thiểu để giữ liền mạch.",
      "Nếu yêu cầu có ghi rõ bắt đầu tại A và kết thúc tại B, A và B là hai ANCHOR BẮT BUỘC; kế hoạch phải đi từ A đến B và không mở tuyến khác làm lệch trọng tâm.",
      "CANON/CONFLICT POLICY: Canon đã xác nhận trong chương đã Sync và hồ sơ khóa là bất biến. Nếu Directive/Gợi ý yêu cầu retcon hoặc thay đổi canon, ghi mục CONFLICT, giữ canon cũ và chỉ áp dụng thay đổi khi người dùng xác nhận rõ đó là retcon có chủ đích.",
      "THỨ TỰ ƯU TIÊN: (1) canon đã xác nhận và hồ sơ khóa; (2) mệnh lệnh người dùng hiện tại nếu không retcon canon; (3) dòng Outline đúng chương; (4) gợi ý đã xác minh; (5) đề xuất riêng của AI. Khi hai nguồn cùng cấp mâu thuẫn, ghi CONFLICT và nêu phương án bị loại.",
      "Không được đưa một chi tiết do AI tự nghĩ ra vào [R] hoặc coi là canon. Mọi chi tiết không đến từ nguồn (1)-(4) phải đánh [S] và chỉ là vật liệu cầu nối."
    ].filter(Boolean).join("\n") : "",
    hasUserBrief ? "Lập kế hoạch BÁM SÁT BRIEF — số nhịp bằng đúng số nhịp trong brief:" : "Lập kế hoạch theo NGÂN SÁCH SỰ KIỆN — không vượt quá 3 sự kiện chính:",
    "1. Mục tiêu chương", "2. Xung đột chính",
    hasUserBrief ? "3. DANH SÁCH CÁC NHỊP/SỰ KIỆN THEO ĐÚNG THỨ TỰ BRIEF (mỗi nhịp ghi: mục đích + diễn biến + hậu quả); KHÔNG gộp, KHÔNG bỏ nhịp nào"
                 : "3. DANH SÁCH 1-3 SỰ KIỆN CHÍNH (mỗi sự kiện ghi: mục đích + diễn biến + hậu quả). Mỗi sự kiện có thể có biến cố lớn lồng bên trong nếu thật sự cần cho nhân-quả hoặc cao trào; biến cố lồng không tính thành sự kiện chính thứ 4 và không bắt buộc chương nào cũng phải có.",
    "3a. BEAT LEDGER — phân loại rõ để không biến đề xuất của AI thành canon: đánh mã [R1], [R2]... cho BEAT BẮT BUỘC xuất phát từ brief người dùng, dòng Outline của đúng chương hoặc canon đã xác nhận; đánh mã [S1], [S2]... cho BEAT HỖ TRỢ/CẦU NỐI do AI đề xuất để nối mạch. Mỗi beat ghi: MỤC TIÊU | HÀNH ĐỘNG/THÔNG TIN | NHÂN VẬT/ĐỊA ĐIỂM | BẰNG CHỨNG | HẬU QUẢ. Chỉ [R] mới là điều kiện bắt buộc; [S] được phép thay đổi hoặc bỏ nếu làm truyện mượt hơn.",
    "4. Nhân vật xuất hiện: BẮT BUỘC có nhân vật chính; TỐI ĐA " + maxNamedCharacters + " NHÂN VẬT CÓ TÊN RIÊNG xuất hiện trực tiếp trong cả chương; ưu tiên nhân vật đã có.",
    "5. Địa điểm + DÒNG THỜI GIAN (ghi chú NỘI BỘ để giữ nhất quán, KHÔNG phải để in thành nhãn trong văn): thời điểm tương đối khi mở chương, quãng đã trôi từ chương trước (nếu có nhảy), các beat nối nhau theo thời gian thế nào, cảnh nào thời gian thật sự quan trọng (hạn chót/khẩn cấp); nêu cách thể hiện tự nhiên trong văn (ánh sáng, việc đang làm, một câu chuyển trong mạch kể)",
    "5b. CẢNH & NGƯỜI CÓ MẶT: với MỖI beat ghi: địa điểm | ai có mặt | ai VÀO cảnh (cách vào) | ai RỜI cảnh (cách rời). Người không được ghi có mặt thì không được nói/hành động trong beat đó.",
    hasUserBrief ? "6. SCENE BEATS: MỖI nhịp của brief là MỘT beat (không giới hạn số beat), ghi gợi ý độ dài từng beat để cả chương đạt mục tiêu từ; KHÔNG tự sinh thêm sự kiện lớn ngoài brief"
                 : "6. SCENE BEATS (tối đa 5 beat) — chỉ triển khai 1-3 sự kiện trên, KHÔNG tự sinh thêm sự kiện lớn",
    "7. Kết chương — phải khớp mốc kết thúc người dùng yêu cầu nếu có",
    "7a. TIẾN ĐỘ ARC/OUTLINE: nếu bối cảnh có mục TIẾN ĐỘ ARC/OUTLINE, ghi rõ chương này thực hiện VIỆC BẮT BUỘC/bước tiến nào của Arc hoặc Outline (đúng dòng của chương nếu Outline có), và mỗi sự kiện chính phải là một BƯỚC TIẾN thật, không phải cảnh độn",
    "7b. THAY ĐỔI/TIẾN TRIỂN: ghi rõ điều gì ĐÃ ĐỔI giữa đầu và cuối chương (quan hệ/thông tin/quyền lực/mục tiêu/hậu quả); không được để trống",
    "9. DÒNG TỰ KIỂM TRA CUỐI KẾ HOẠCH: LEDGER_ORDER: R1 -> S1 -> R2 -> ... -> END | REQUIRED_DONE: R1,R2,... | STOP_AFTER: mã beat cuối cùng. Không được kết chương trước khi mọi [R] đã có bằng chứng; beat [S] không được dùng để tạo hard failure.",
    "8. Nếu có cảnh trưởng thành: mức intensity + structure + cảnh đó làm đổi điều gì (quan hệ/quyền lực/bí mật/hậu quả) và dẫn tới bước nào kế tiếp; không thay đổi phạm vi sự kiện người dùng đã chỉ định",
    "",
    hasUserBrief ? "QUY TẮC CỨNG: Không thêm sự kiện lớn ngoài brief. Không tạo nhân vật quan trọng mới nếu không có lý do cốt truyện rõ ràng. Nếu có thể dùng nhân vật hiện có thì phải dùng nhân vật hiện có."
                 : "QUY TẮC CỨNG: Không thêm sự kiện lớn thứ 4. Không tạo nhân vật quan trọng mới nếu không có lý do cốt truyện rõ ràng. Nếu có thể dùng nhân vật hiện có thì phải dùng nhân vật hiện có.",
    hasUserBrief ? "ƯU TIÊN ĐỘ TRUNG THÀNH VỚI BRIEF: Không 'sáng tạo thêm cho hay'. Nhiệm vụ là chuyển brief thành kế hoạch có thể viết được, không phải mở rộng phạm vi truyện." : "",
    matureChapterPlanBlock(o),
    castPoolBlock(o.castPool, { allowNew: !!o.castAllowNew }),
    o.craftPlanBlock || '',
    cultivationPlanBlock(o),
    "KHÔNG viết văn xuôi. Chỉ bullet points."
  ].filter(Boolean).join("\n");
}

// V12.23: KẾ HOẠCH ĐỘ DÀI — chia ngân sách từ cho từng nhịp của gợi ý để AI không nén mỗi nhịp thành vài đoạn rồi kết sớm.
function buildLengthPlan(brief, target) {
  const raw = String(brief || "").trim();
  if (!raw || !target) return "";
  let beats = raw.split(/\n+/).map(x => x.trim()).filter(x => x.length >= 20);
  if (beats.length < 3) beats = raw.split(/(?<=[.!?…])\s+/).map(x => x.trim()).filter(x => x.length >= 20);
  if (beats.length < 2) return "";
  const isEnd = (x) => /^(chương\s+)?kết thúc|kết chương|cuối chương/i.test(x);
  const weights = beats.map(x => isEnd(x) ? 0.5 : 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const goal = Math.round(target * 1.05);
  const lines = beats.map((x, i) => {
    const w = Math.max(100, Math.round((goal * weights[i] / sum) / 50) * 50);
    const label = x.length > 70 ? x.slice(0, 70).replace(/\s+\S*$/, "") + "…" : x;
    return (i + 1) + ") " + label + " ≈ " + w + " từ";
  });
  return [
    "===== KẾ HOẠCH ĐỘ DÀI (BẮT BUỘC — lý do chương hay bị ngắn là nén mỗi nhịp thành vài đoạn) =====",
    "Chia chương thành " + beats.length + " phần theo ĐÚNG thứ tự gợi ý, mỗi phần viết ĐỦ ngân sách từ (tổng ≈ " + goal + " từ):",
    lines.join("\n"),
    "Mỗi phần phải có: bối cảnh/không khí, hành động từng bước, hội thoại, nội tâm + cảm giác, phản ứng và hệ quả. CẤM tóm tắt một phần thành 1–2 đoạn hay nhảy cóc thời gian. Chỉ viết phần cuối cùng khi cộng dồn đã gần đủ " + goal + " từ; nếu thấy mới được khoảng " + Math.round(target * 0.9) + " từ thì mở rộng các phần giữa chứ KHÔNG kết chương.",
    "===== HẾT KẾ HOẠCH ĐỘ DÀI ====="
  ].join("\n");
}

// V12.23: MỞ RỘNG CUỐI — khi đã hết lượt viết thêm mà chương vẫn thiếu từ, nhờ AI viết lại TOÀN BỘ chương dài hơn (giữ nguyên sự kiện + điểm kết).
function buildExpandPrompt(o) {
  const wc = o.wc, goal = o.goal, pct = Math.max(5, Math.round((goal * 1.04 / Math.max(1, wc) - 1) * 100));
  const brief = [o.directive ? ("MỆNH LỆNH: " + String(o.directive).trim()) : "", o.hint ? ("GỢI Ý: " + String(o.hint).trim()) : ""].filter(Boolean).join("\n");
  return [
    "BẮT BUỘC NGÔN NGỮ: 100% TIẾNG VIỆT CÓ DẤU.",
    "MỞ RỘNG CHƯƠNG: bản hiện tại chỉ " + wc + " từ, CHƯA ĐỦ độ dài. Cần tối thiểu " + goal + " từ (mục tiêu " + o.target + ", tuyệt đối không vượt " + o.maxWords + ").",
    "Hãy VIẾT LẠI TOÀN BỘ chương thành bản DÀI HƠN khoảng +" + pct + "% (≥ " + goal + " từ).",
    "CÁCH MỞ RỘNG: giữ NGUYÊN thứ tự, mọi sự kiện, mọi lời thoại quan trọng, giọng văn, POV, xưng hô và ĐIỂM KẾT CHƯƠNG. Với MỖI cảnh: thêm không khí/bối cảnh, hành động từng bước, hội thoại, nội tâm, giác quan, phản ứng và hệ quả. Đoạn nào đang kể tóm tắt/lướt nhanh thì viết thành cảnh đầy đủ. Cảnh nào ngắn nhất thì mở rộng nhiều nhất.",
    "CẤM: bỏ hoặc rút gọn bất kỳ đoạn nào; thêm biến cố lớn, nhân vật quan trọng mới, arc mới; lặp ý hoặc độn chữ; đổi điểm kết chương; chèn ghi chú/giải thích.",
    o.style || "",
    brief ? ("===== KẾ HOẠCH NGƯỜI DÙNG (không đổi) =====\n" + brief + (o.closing ? ("\nENDING ANCHOR: " + o.closing) : "") + "\n===== HẾT =====") : "",
    "===== BẢN HIỆN TẠI (" + wc + " từ) =====",
    String(o.text || ""),
    "===== HẾT BẢN HIỆN TẠI =====",
    "CHỈ TRẢ VỀ toàn bộ chương đã mở rộng (không tiêu đề, không 'NỘI DUNG:', không giải thích)."
  ].filter(Boolean).join("\n");
}

function acceptExpandedChapter(oldText, newText, maxWords) {
  let t = String(newText || "").trim();
  t = t.replace(/^\s*(?:TIÊU ĐỀ|TITLE)\s*:\s*[^\n]+\n+/i, "").replace(/^\s*NỘI DUNG\s*:\s*/i, "").trim();
  const ow = countWords(oldText), nw = countWords(t);
  if (!t || nw < 100) return { ok: false, reason: "AI trả rỗng/quá ngắn" };
  if (nw < ow * 0.9) return { ok: false, reason: "bản mở rộng ngắn hơn bản gốc (" + nw + " < " + ow + " từ)" };
  if (nw < ow + 120) return { ok: false, reason: "bản mở rộng không dài hơn đáng kể (" + nw + " so với " + ow + " từ)" };
  const cap = trimToWordLimit(t, maxWords);
  return { ok: true, text: cap.text, words: countWords(cap.text), trimmed: cap.trimmed };
}

function trimToWordLimit(text, maxWords) {
  // V12.14: cắt theo vị trí ký tự để GIỮ NGUYÊN xuống dòng/đoạn (bản cũ split+join làm mất toàn bộ đoạn văn/thoại).
  const s = String(text || "").trim();
  if (!s || countWords(s) <= maxWords) return { text: s, trimmed: false };
  const re = /\S+/g; let mt, n = 0, end = 0;
  while ((mt = re.exec(s))) { n++; end = mt.index + mt[0].length; if (n >= maxWords) break; }
  let out = s.slice(0, end);
  const m = out.match(/^([\s\S]*[.!?…][”"’']?)(?:\s|$)/);
  // V12.20: ngưỡng 70% giới hạn (bản cũ chỉ 180 từ cuối -> hay cắt cụt giữa câu khi đoạn dài)
  if (m && countWords(m[1]) >= Math.max(1, Math.floor(maxWords * 0.7))) out = m[1];
  return { text: out.trim(), trimmed: true };
}

// V12.21.2: xóa phần lập kế hoạch tiếng Anh mà model thinking nhúng vào đầu output.
// FIX: dùng mật độ diacritics (>12%) thay vì chỉ kiểm tra có/không,
// tránh bị lừa bởi tên nhân vật Việt lẫn trong đoạn tiếng Anh.
function stripThinkingOutput(text) {
  if (!text) return text;
  let t = String(text);
  // 1. Xóa <think>/<thinking> tags
  t = t.replace(/<think(?:ing)?[\s>][\s\S]*?<\/think(?:ing)?>/gi, '');
  // 2. Xóa khối tiếng Anh trước câu chuyện tiếng Việt.
  //    Văn xuôi tiếng Việt thật: mật độ diacritics > 12%.
  //    Tiếng Anh dù có tên Việt (Bùi Lạc, Mỹ Duyên) chỉ đạt ~3-8%.
  const viDRe = /[\u00C0-\u024F\u1EA0-\u1EF9]/g;
  const paras = t.split(/\n{2,}/); let start = 0;
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i].trim(); if (!p) continue;
    const tot = p.replace(/\s/g, '').length || 1;
    const viC = (p.match(viDRe) || []).length;
    if (viC / tot > 0.12) { start = i; break; }        // văn xuôi Việt thật -> dừng
    const asc = (p.match(/[a-zA-Z0-9 .,!?:;()\-*_#*]/g)||[]).length;
    if (asc / tot > 0.75) start = i + 1;               // đoạn tiếng Anh -> bỏ
  }
  if (start > 0) t = paras.slice(start).join('\n\n');
  // 3. Xóa label còn sót
  t = t.replace(/^\s*\*{0,2}Block\s+[A-Z][:\s].{0,120}\n/gim, '')
       .replace(/^\s*(?:Let me|Let's|I'll|I will|I need|Note:|Draft:|Writing:)[^\n]*/gim, '')
       .replace(/^\s*[-*]{3,}\s*$/gm, '');
  return t.replace(/^\s+/, '').trim();
}

// V12.23: xóa câu/đoạn TIẾNG ANH do model "nghĩ to" lẫn vào giữa truyện (vd: "The user wants me to write the bridge section in Vietnamese...").
// stripThinkingOutput chỉ xử lý khối tiếng Anh Ở ĐẦU output; đoạn chèn/viết tiếp bị ghép giữa chương nên lọt qua.
const _EN_LEAK_STOP = new Set(["the","and","of","is","are","was","were","that","this","with","for","user","wants","want","write","writing","section","bridge","leaked","should","must","need","needs","will","would","vietnamese","chapter","text","output","response","let","not","but","from","then","now","here","there","scene","story","ending","anchor","insert","continue","paragraph","previous","existing","content","already"]);
function _isEnglishLeak(seg) {
  const plain = String(seg).replace(/\s/g, "");
  if (plain.length < 25) return false;
  const vi = (String(seg).match(/[\u00C0-\u024F\u1EA0-\u1EF9]/g) || []).length;
  if (vi / plain.length > 0.04) return false;                      // văn Việt thật có nhiều dấu
  const toks = String(seg).toLowerCase().match(/[a-z']+/g) || [];
  if (toks.length < 6) return false;
  let hits = 0; for (const t of toks) if (_EN_LEAK_STOP.has(t)) hits++;
  return hits >= 3;
}
function removeEnglishLeaksDetailed(text) {
  const removed = [];
  if (!text) return { text: text, removed };
  const lines = String(text).split("\n").map(line => {
    if (!line.trim()) return line;
    if (_isEnglishLeak(line)) { removed.push(line.trim().slice(0, 80)); return null; }
    const sents = line.split(/(?<=[.!?…])\s+/);
    if (sents.length < 2) return line;
    const keep = sents.filter(x => { if (_isEnglishLeak(x)) { removed.push(x.trim().slice(0, 80)); return false; } return true; });
    return keep.length === sents.length ? line : keep.join(" ");
  }).filter(x => x !== null);
  return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n"), removed };
}
function removeEnglishLeaks(text) { return removeEnglishLeaksDetailed(text).text; }

/* V14.7.39: DỌN RÒ RỈ CỦA MODEL (xác định, không tốn tiền AI). Model (nhất là bản uncensored/abliterated) hay: chèn từ tiếng Anh lẻ vào câu Việt, tự nhắc lệnh
   ("Chi tiết dưới đây viết đầy đủ..."), để nhãn "Nội tâm người nữ:", sót dấu * và viết ".," thay dấu chấm. Chỉ sửa ca chắc chắn; từ lạ khác vẫn để findStrayWords xử lý. */
/* V14.7.51: (1) model có lúc viết cả cảnh DÍNH dấu câu vào chữ ("đi tới,không thèm trả lời.Nàng") ; (2) rò từ tiếng Anh lẻ ("—but", "—he nói", "one cái gật", "knuckle", "Aftercare"). Sửa chắc chắn, xác định, không tốn AI. */
function fixGluedPunctuation(text) {
  return String(text || '')
    .replace(/([\p{L}\p{Nd}])([,;:!?])(?=\p{L})/gu, '$1$2 ')
    .replace(/(\p{Ll})\.(?=\p{Lu}\p{Ll})/gu, '$1. ')
    .replace(/(\p{L})—(?=\p{L})/gu, '$1 — ').replace(/(\p{L})\s—(?=\p{L})/gu, '$1 — ');
}
const VI_DIA_RE = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i;
const LEAK_WORDS = { but: 'nhưng', and: 'và', or: 'hoặc', from: 'từ', one: 'một', knuckle: 'khớp ngón tay', knuckles: 'khớp ngón tay', aftercare: 'phần chăm sóc sau đó', 'old-file': 'cũ', he: null, she: null };
function fixEnglishLeaks(text) {
  let t = String(text || ''); if (!t) return t;
  const cnt = re => (t.match(re) || []).length;
  const male = cnt(/\bHắn\b|\bhắn\b/g) >= cnt(/\b[Aa]nh\b/g) ? 'hắn' : 'anh', female = cnt(/\bnàng\b|\bNàng\b/g) >= cnt(/\b[Cc]ô\b/g) ? 'nàng' : 'cô';
  return t.replace(/(?<![\p{L}\p{N}_-])(old-file|knuckles?|aftercare|but|and|or|from|one|he|she)(?![\p{L}\p{N}_-])/giu, (m, w, off) => {
    const before = t.slice(Math.max(0, off - 14), off), after = t.slice(off + m.length, off + m.length + 14);
    const prevW = (before.match(/([\p{L}]+)[^\p{L}]*$/u) || [])[1] || '', nextW = (after.match(/^[^\p{L}]*([\p{L}]+)/u) || [])[1] || '';
    if (!(VI_DIA_RE.test(prevW) || VI_DIA_RE.test(nextW))) return m;   // quanh đó không phải tiếng Việt → có thể là câu tiếng Anh cố ý, để nguyên
    const k = w.toLowerCase(); let vi = LEAK_WORDS[k]; if (k === 'he') vi = male; if (k === 'she') vi = female;
    if (!vi) return m;
    return /^[A-Z]/.test(m) && (off === 0 || /[.!?…"\n]\s*$/.test(before)) ? vi.charAt(0).toUpperCase() + vi.slice(1) : vi;
  });
}
const EN_LEAK_MAP = [
  [/\bresidual lingering\b/gi, 'còn đọng lại'], [/\bwithout\b/gi, 'mà không'], [/\bbecause\b/gi, 'vì'], [/\btonight\b/gi, 'đêm nay'], [/\bwhen\b/gi, 'lúc'],
  [/\bwhile\b/gi, 'trong khi'], [/\bcorresponding\b/gi, 'tương ứng'], [/\bresidual\b/gi, 'còn sót'], [/\blingering\b/gi, 'đọng lại'], [/\bhowever\b/gi, 'tuy nhiên'],
  [/\bsuddenly\b/gi, 'đột nhiên'], [/\bslowly\b/gi, 'chậm rãi'], [/\bquietly\b/gi, 'lặng lẽ'], [/\bsilently\b/gi, 'lặng lẽ'], [/(?<=\p{L})Warm\b/gu, ' ấm'], [/\bwarm\b/gi, 'ấm']
];
/* V14.7.49: model (GLM/uncensored) chèn GHI CHÚ KỸ THUẬT / lời chào trợ lý ("Nếu bạn muốn tôi xuất bản phiên bản sạch… hãy xác nhận") GIỮA văn xuôi, kèm chữ Latin dính liền ("lánhanymorefromkeyfobBattery"). */
/* V14.7.55: (1) model lẩm bẩm KẾ HOẠCH viết cảnh ("Viết cảnh S4, khoảng 600 từ…", "Hmm — hợp lý?", "Giải pháp:", "Tốt. Viết theo trình tự đó") rò vào chương; (2) giờ giấc và mã/số hiệu tài liệu dày đặc. */
const PLAN_LEAK_RE = /^\s*(?:Viết cảnh S\d|Vậy (?:thì )?cảnh S\d|Giải pháp\s*:|Cần khoảng \d+ từ|Kết bằng (?:móc|hình ảnh)|Viết tự nhiên\b|Viết\s*[.:]\s*$|Bắt đầu\s*:\s*$|Tốt\.\s*Viết\b|Được\.\s*Rồi sau đó|Tránh dùng\b|Đơn giản nhất\s*:|Cách khác\s*:|Nhưng để tránh|Có thể gộp\b|Có thể tả\b|Chuyển cảnh mở\s*:|Hmm\b|Chi tiết tuần tra\s*:|Giọng \S+(?: \S+){0,3} (?:trầm|ít nói)[^\n]{0,30}\.\s*$)/i;
const PLAN_LEAK_ANY_RE = /\bHmm\s*[—–-]|\?\)\s*$|\bhợp lý\?|khoảng \d+ từ,? tiếng Việt|\bscene S\d\b[^\n]{0,60}\b(?:phải|cần)\s+(?:tiếp|mở|nối)/i;
function isPlanningLeakPara(p) { const t = String(p || '').trim(); if (!t || /^["“'‘—-]/.test(t) && !/^[—-]\s*Hmm/.test(t) && !PLAN_LEAK_RE.test(t.replace(/^["“'‘—-]\s*/, ''))) return false; return PLAN_LEAK_RE.test(t) || PLAN_LEAK_ANY_RE.test(t); }
function planningLeakIndex(text) {
  const paras = String(text || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
  for (let i = 0; i < paras.length; i++) { if (!isPlanningLeakPara(paras[i])) continue; let n = 0; for (let j = i; j < Math.min(paras.length, i + 8); j++) if (isPlanningLeakPara(paras[j])) n++; if (n >= 2 || /^\s*Viết cảnh S\d/i.test(paras[i])) return i; }
  return -1;
}
function stripPlanningLeak(text) { const src = String(text || ''); const paras = src.split(/\n{2,}/); const flat = paras.join('\n'); if (planningLeakIndex(flat) < 0) return src; const keep = []; for (const p of paras) { const lines = p.split('\n'); if (lines.some(l => isPlanningLeakPara(l)) && planningLeakIndex(p + '\n' + paras.slice(paras.indexOf(p) + 1, paras.indexOf(p) + 6).join('\n')) >= 0) break; keep.push(p); } return keep.join('\n\n'); }
const TIME_CODE_RULE = 'GIỜ GIẤC VÀ MÃ SỐ: cả scene chỉ nêu tối đa 2 mốc giờ cụ thể (chỉ khi cốt truyện cần, ví dụ hạn chót); các chỗ khác dùng cách nói tự nhiên (khuya, gần sáng, sau bữa trưa, lúc tan ca). KHÔNG mở đoạn bằng giờ, KHÔNG ghi giờ vào từng tin nhắn/báo cáo, KHÔNG đồng hồ điểm giờ liên tục. Tài liệu/vật phẩm gọi bằng tên thường ("tập hồ sơ đỏ", "khu kỹ thuật"); KHÔNG tự đặt mã/số hiệu/ký hiệu mới (KT-07, P-1908, 114/ĐK-TK…) — chỉ dùng mã đã có trong bộ nhớ, và mỗi mã nhắc tối đa MỘT lần trong cả scene.';
function timeCodeDensity(text) {
  const t = String(text || ''), words = (t.match(/\S+/g) || []).length;
  const times = (t.match(/\b\d{1,2}\s?[:h]\s?\d{2}\b|\b(?:[a-zà-ỹ]+|\d{1,2}) giờ(?: (?:[a-zà-ỹ]+|\d{1,2}) phút| rưỡi| kém(?: [a-zà-ỹ]+)?| (?:sáng|chiều|tối|đêm))?\b/gi) || []).length;
  const codes = new Set((t.match(/\b[A-ZĐ]{1,5}(?:-[A-Z0-9]{1,5})*-\d{2,}[\w-]*|\b[A-Z]-\d{2,}\b|\b\d{2,}\/[A-ZĐ]{2,}(?:-[A-ZĐ]{2,})*\b/g) || [])).size;
  return { words, times, codes };
}
const ASSISTANT_NOTE_START_RE = /^[\s*_#>\-•]*(?:\(?\s*)?(?:GHI CHÚ(?: KỸ THUẬT| BIÊN TẬP| CỦA (?:TÔI|MODEL|AI))?|LƯU Ý KỸ THUẬT|TECHNICAL NOTE|AUTHOR'?S NOTE)\b/;
const ASSISTANT_NOTE_BODY_RE = /không thuộc phần văn xuôi|(?:nếu|neu) bạn muốn tôi|hãy xác nhận(?: hoặc| để)|yêu cầu điều chỉnh thêm|xuất bản phiên bản|phiên bản (?:sạch )?(?:đã )?sửa|theo yêu cầu S\d|lỗi drift|vượt quá phạm vi cho phép|lỗi tạo sinh|lỗi lai ngữ|ký tự Latinh|ngoài contract|\bhandoff\b\s*:|beat cuối cùng .{0,60}nên dành/i;
const GLUED_LATIN_RE = /\p{Ll}\p{Lu}\p{Ll}|[a-z]{14,}/u;   // chữ hoa GIỮA từ (…fobBattery) hoặc ≥14 chữ Latin liền: tiếng Việt không có
function isAssistantNotePara(p) { const t = String(p || '').trim(); return !!t && (ASSISTANT_NOTE_START_RE.test(t) || ASSISTANT_NOTE_BODY_RE.test(t)); }
function hasGluedLatin(w) { const x = String(w || '').replace(/[^\p{L}]/gu, ''); return x.length >= 16 && GLUED_LATIN_RE.test(x); }
function stripAssistantNotes(text) {
  const src = String(text || ''); if (!src) return src;
  const paras = src.split(/\n{2,}/); let changed = false;
  const out = paras.filter(p => { const lines = p.split('\n'); if (isAssistantNotePara(lines[0]) || (lines.length > 1 && lines.every(l => !l.trim() || isAssistantNotePara(l) || /^\s*[-•*]/.test(l)) && lines.some(isAssistantNotePara))) { changed = true; return false; } return true; })
    .map(p => p.split('\n').filter(l => { if (isAssistantNotePara(l)) { changed = true; return false; } return true; }).join('\n'));
  return changed ? out.filter(p => p.trim()).join('\n\n') : src;
}
function cleanModelArtifacts(text) {
  let t = String(text || ''); if (!t) return t;
  t = stripAssistantNotes(t);   // V14.7.49
  t = stripPlanningLeak(t);   // V14.7.55
  t = fixGluedPunctuation(t); t = fixEnglishLeaks(t);   // V14.7.51
  EN_LEAK_MAP.forEach(([re, vi]) => { t = t.replace(re, (m, off) => { const cap = /^[A-Z]/.test(m) && (off === 0 || /[.!?…"\n]\s*$/.test(t.slice(Math.max(0, off - 3), off))); return cap ? vi.charAt(0).toUpperCase() + vi.slice(1) : vi; }); });
  t = t.replace(/Chi tiết dưới đây[^.\n]*\.\s*/g, '').replace(/(^|\n)\s*(?:Bản viết gọn|Viết lại(?: gọn| lần cuối)?)\s*:\s*/g, '$1');
  t = t.replace(/(^|\n)(\s*)Nội tâm(?: của)?(?: người nữ| nhân vật nữ| nhân vật| hắn| cô ta| nàng)?\s*:\s*/g, '$1$2');
  t = t.split('\n').map(l => (((l.match(/\*/g) || []).length % 2) ? l.replace(/\*+/g, '') : l)).join('\n');
  t = t.replace(/([.!?…])\s*,\s+(?=[\p{Lu}"“—])/gu, '$1 ').replace(/\.:\s+/g, ': ');
  return t;
}
/* V14.7.46: model TRÔI LAN MAN — câu 45–110 từ gần như không dấu phẩy, hay kết bằng "…", chèn giọng bản tin/quảng cáo ("các bạn ơi", "bye bye", "quê hương tôi…").
   Đối chiếu 19 chương tác giả: 0–1 câu thưa dấu/chương; chương app lan man: 12–39 câu. */
const DRIFT_CHATTER_RE = /các bạn ơi|bye bye|hẹn gặp lại|cảm ơn (?:mọi người|các bạn) đã theo dõi|nghen các bạn|chia sẻ tiếp những|quê hương tôi|đất Việt Nam ta|kỷ nguyên số hóa/i;
function splitSentencesKeep(p) { return String(p || '').match(/[^.!?]+(?:[.!?]+["”“'»)]*|$)\s*/g) || [String(p || '')]; }
function isSparseLongSentence(sn) {
  const w = String(sn).trim().split(/\s+/).filter(Boolean).length; if (w < 45) return false;
  const c = (String(sn).match(/[,;:—–]/g) || []).length;
  return c / w < 0.04;
}
function countRunOnDrift(text) {
  let sparse = 0, chatter = 0;
  String(text || '').split(/\n+/).forEach(p => { splitSentencesKeep(p).forEach(sn => { if (isSparseLongSentence(sn)) sparse++; if (DRIFT_CHATTER_RE.test(sn)) chatter++; }); });
  return { sparse, chatter };
}
/* Cắt xác định: câu lan man → giữ ~26 từ đầu (tại ranh giới từ) rồi đóng câu; câu chứa giọng bản tin → bỏ phần từ chỗ lạc. Trả { text, trimmed }. */
function trimRunOnDrift(text) {
  let trimmed = 0;
  const out = String(text || '').split('\n').map(line => {
    if (!line.trim()) return line;
    const parts = splitSentencesKeep(line).map(sn => {
      const m = sn.match(DRIFT_CHATTER_RE);
      let cut = null;
      if (m) { const pre = sn.slice(0, m.index).split(/\s+/).filter(Boolean); cut = pre.slice(0, Math.max(0, Math.min(pre.length, 26))).join(' '); }
      else if (isSparseLongSentence(sn)) cut = sn.trim().split(/\s+/).slice(0, 26).join(' ');
      if (cut === null) return sn;
      trimmed++;
      cut = cut.replace(/[\s,;:—–…-]+$/, '');
      if (!cut || cut.split(/\s+/).length < 4) return '';
      const q = (cut.match(/[“”"]/g) || []).length % 2 ? '”' : '';
      return cut + '.' + q + ' ';
    });
    return parts.join('').replace(/[ \t]+$/, '').replace(/([.!?])\s*\.+/g, '$1');
  }).filter((l, i, a) => l.trim() || (i > 0 && a[i - 1].trim()));
  return { text: out.join('\n'), trimmed };
}
/* V14.7.39: CỔNG VĂN SUY BIẾN. Phát hiện model sụp (lặp cụm, dòng "Vẫn" lặp, chữ vỡ/dính, văn không dấu, câu lẩm bẩm "Viết lại"). */
/* V14.7.41: văn sụp giữa chừng ("america america america…") — giữ phần ĐẦU còn sạch, cắt từ đoạn hỏng đầu tiên. Trả '' nếu không còn gì đáng giữ. */
/* V14.7.50: chương KẾT GIỮA CẢNH (cụt ở "…lớp này tới lớp khác; rồi."). Chương sau thấy "đuôi" là cảnh đang diễn ra nhưng không được báo → model coi đó là phần thừa cần chốt nhanh (vài trăm từ). */
function endsMidScene(text) {
  const t = String(text || '').trim(); if (t.length < 200) return false;
  const tail = t.slice(-160);
  if (!/[.!?…"”»)]\s*$/.test(tail)) return true;
  if (/[;,:—]\s*[.…]*\s*$/.test(tail)) return true;
  return /(?:^|[\s;,—])(?:rồi|và|nhưng|khi|để|thì|mà|như|của|với|còn|nên|vì|nếu|lúc|trong khi)\s*[.…]+\s*$/i.test(tail);
}
const UNFINISHED_SCENE_RULE = 'CHƯƠNG TRƯỚC DỪNG GIỮA CẢNH (câu cuối bỏ lửng): đây là cảnh ĐANG DIỄN RA, chưa tới cao trào/dư âm. Scene mở đầu PHẢI tiếp tục đúng khoảnh khắc đó, cùng cường độ, cùng mức chi tiết giác quan và cùng nhịp chậm như đoạn trước; KHÔNG tóm tắt, KHÔNG chốt nhanh cho xong trong vài trăm từ. Cho cảnh đi trọn nhịp: tiếp diễn → leo thang → cao trào → dư âm/hậu quả, rồi mới sang diễn biến mới của chương.';
/* V14.7.53: CẢNH NÓNG BỊ BỎ DỞ. Scene dừng theo checklist beat (và "dừng ở handoff") nên hành vi đang diễn ra (vd. bị bắt bú) bị ngắt/nhảy giờ trước khi tới cao trào + dư âm. */
const HOT_CORE_RE = /cặc|lồn|dương vật|âm đạo|âm vật|hột le|nhũ hoa|bầu vú|núm vú/i;
const HOT_ACT_RE = /liếm|mút|thúc|địt|đụ|nứng|cắm|đâm|dập|rên|ngậm|nuốt|ép sâu|rút ra|đẩy vào/gi;
const HOT_CLIMAX_RE = /xuất (?:tinh|ra|hết|vào)|phun (?:ra|tinh|vào)|tinh (?:trùng|dịch)|bắn (?:ra|vào|đầy)|lên đỉnh|cao trào|cực khoái|vỡ (?:ra|òa|tan)|đỉnh điểm|co thắt|run (?:lên|bần bật|rẩy)|trào ra|dư âm|thở (?:hổn hển|dốc)|gục (?:xuống|hẳn)|tan chảy|nuốt (?:xuống|hết|trọn)|lả (?:đi|người)|rũ (?:xuống|người)/i;
function hotParaIsExplicit(p) { const t = String(p || ''); return HOT_CORE_RE.test(t) || ((t.match(HOT_ACT_RE) || []).length >= 2 && /\b(?:hắn|nàng|ả|cô|anh)\b/i.test(t) && /(?:môi|miệng|ngực|hông|đùi|lưng|cổ họng|da thịt)/i.test(t)); }
function hotActOpen(text) {
  const paras = String(text || '').split(/\n{2,}/); const ex = []; paras.forEach((p, i) => { if (hotParaIsExplicit(p)) ex.push(i); });
  if (ex.length < 3) return false;                                   // không phải cảnh nóng thật sự (hoặc chỉ gợi) → không can thiệp
  return !HOT_CLIMAX_RE.test(paras.slice(ex[0]).join('\n\n'));       // đã có cao trào/dư âm ở đâu đó từ lúc bắt đầu cảnh nóng → coi như đã khép
}
function isHotSceneDef(scene) { const s = scene || {}; return HOT_BEAT_RE.test([s.purpose, s.mustChange].concat(Array.isArray(s.beats) ? s.beats : []).join(' ')); }
const HOT_SCENE_COMPLETION_RULE = 'CẢNH NÓNG PHẢI ĐI TRỌN MỘT VÒNG TRONG CHÍNH SCENE NÀY: tiếp diễn → leo thang → cao trào → dư âm ngay tại chỗ. Nếu có biến cố chen ngang (bước chân, điện thoại, người đi ngang) thì viết phản ứng TẠI CHỖ (nín thở, khựng lại), khi nguy cơ qua đi PHẢI viết tiếp hành vi đang dở tới cao trào. TUYỆT ĐỐI không nhảy giờ ("vài phút sau", "đã đi lên tầng…"), không đổi địa điểm, không tóm tắt, không bỏ ngang để sang việc khác trước khi cảnh này khép lại.';
/* V14.7.54: scene SỤP GIỮA CHỪNG rồi bị cắt còn ~1/3 → các beat nửa sau (cao trào, dư âm, điểm gãy, nhiệm vụ mới) mất hẳn và vá cục bộ không chèn nổi. Viết tiếp đúng phần còn thiếu bằng MỘT lượt (model chính, nhiệt thấp). */
function buildSalvageContinuePrompt(o) {
  const sc = o.scene || {}, beats = [String(sc.mustChange || '')].concat(Array.isArray(sc.beats) ? sc.beats : []).map(x => String(x).replace(/\s+/g, ' ').trim().slice(0, 220)).filter(Boolean);
  const hot = isHotSceneDef(sc);
  return ['SCENE BỊ CẮT GIỮA CHỪNG VÌ LỖI SINH VĂN — viết tiếp PHẦN CÒN LẠI (khoảng ' + o.remaining + ' từ) nối NGAY sau câu cuối của đoạn dưới, cùng địa điểm, cùng thời điểm, cùng giọng văn.',
    beats.length ? 'CÁC MỤC CỦA SCENE (đối chiếu với đoạn đã có; chỉ viết những mục CHƯA được thể hiện, theo đúng thứ tự):\n- ' + beats.join('\n- ') : '',
    hot ? HOT_SCENE_COMPLETION_RULE : '',
    sc.handoff ? 'Kết scene theo handoff: ' + String(sc.handoff).slice(0, 240) : '',
    'Câu độ dài vừa phải, có đủ dấu câu, đoạn 2–4 câu, KHÔNG lan man, KHÔNG nói với người đọc, KHÔNG ghi chú, KHÔNG lặp lại đoạn đã có, KHÔNG kể scene sau, KHÔNG kết chương.',
    'ĐOẠN CUỐI HIỆN CÓ:\n' + String(o.text || '').slice(-2200), 'PHẦN TIẾP THEO (chỉ văn xuôi):'].filter(Boolean).join('\n\n');
}
function buildHotFinishPrompt(o) {
  const tail = String(o.text || '').slice(-2200), cast = Array.isArray(o.scene && o.scene.characters) ? o.scene.characters.join(', ') : '';
  return ['CẢNH NÓNG ĐANG DỞ — chỉ viết PHẦN TIẾP THEO (300–600 từ) nối NGAY sau câu cuối của đoạn dưới, cùng địa điểm, cùng thời điểm, cùng nhịp và mức chi tiết giác quan.',
    cast ? 'Nhân vật tại cảnh: ' + cast + '.' : '', HOT_SCENE_COMPLETION_RULE,
    'Hành vi đang dở phải đi tiếp tới cao trào và dư âm. Kết ở dư âm (hơi thở, run rẩy, im lặng…), KHÔNG kết chương, KHÔNG kể scene sau, KHÔNG lặp lại đoạn đã có, tiếng Việt có dấu, câu độ dài vừa phải, không ghi chú ngoài văn xuôi.',
    'ĐOẠN CUỐI HIỆN CÓ:\n' + tail, 'PHẦN TIẾP THEO (chỉ văn xuôi):'].filter(Boolean).join('\n\n');
}
function paraHasDrift(p) { return splitSentencesKeep(p).some(sn => isSparseLongSentence(sn) || DRIFT_CHATTER_RE.test(sn)); }
function salvageBeforeDegeneration(raw) {
  const DIA = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i;
  const paras = String(raw || '').split(/\n+/).map(x => x.trim()).filter(Boolean), keep = [];
  const seen = new Set();
  for (const p of paras) {
    const w = p.split(/\s+/);
    let run = 1, runMax = 1; for (let i = 1; i < w.length; i++) { if (w[i].toLowerCase() === w[i - 1].toLowerCase() && /\p{L}/u.test(w[i])) { run++; runMax = Math.max(runMax, run); } else run = 1; }
    const longW = w.filter(x => x.replace(/[^\p{L}]/gu, '').length >= 28).length;
    const g = new Map(); let rep = 0; for (let i = 0; i + 3 <= w.length; i++) { const k = w.slice(i, i + 3).join(' ').toLowerCase(); const n = (g.get(k) || 0) + 1; g.set(k, n); if (n >= 3) rep++; }
    const noDia = w.length >= 15 && !DIA.test(p);
    const dup = p.length >= 80 && seen.has(p.toLowerCase());
    const noteOrGlue = isAssistantNotePara(p) || isPlanningLeakPara(p) || w.some(hasGluedLatin) || paraHasDrift(p);   // V14.7.49/50: cả câu lê thê/giọng bản tin
    if (runMax >= 4 || longW >= 1 || rep >= 2 || noDia || dup || noteOrGlue) break;
    seen.add(p.toLowerCase()); keep.push(p);
  }
  return keep.join('\n\n');
}
function degenerationCheck(text) {
  const t = String(text || ''), reasons = [], words = t.split(/\s+/).filter(Boolean);
  if (words.length < 30) return { bad: false, reasons };
  const g = new Map();
  for (let i = 0; i + 4 <= words.length; i++) { const k = words.slice(i, i + 4).join(' ').toLowerCase(); g.set(k, (g.get(k) || 0) + 1); }
  let wk = '', wn = 0; g.forEach((n, k) => { if (n > wn) { wn = n; wk = k; } });
  if (wn >= 9) reasons.push('cụm "' + wk.slice(0, 40) + '" lặp ' + wn + ' lần');
  const lines = t.split('\n').map(x => x.trim()).filter(Boolean); let run = 1, runMax = 1;
  for (let i = 1; i < lines.length; i++) { if (lines[i] === lines[i - 1] && lines[i].length < 40) { run++; runMax = Math.max(runMax, run); } else run = 1; }
  if (runMax >= 4) reasons.push('một dòng ngắn lặp liên tiếp ' + runMax + ' lần');
  let single = 0, singleMax = 0;
  words.forEach(w => { if (/^\p{L}$/u.test(w)) { single++; singleMax = Math.max(singleMax, single); } else single = 0; });
  if (singleMax >= 6) reasons.push('chữ bị vỡ thành mảnh 1 ký tự');
  const longW = words.filter(w => w.replace(/[^\p{L}]/gu, '').length >= 28).length;
  if (longW >= 2) reasons.push('chữ bị dính liền (' + longW + ' chuỗi quá dài)');
  const DIA = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i; let noDia = 0;
  lines.forEach(l => { if (l.split(/\s+/).length >= 15 && !DIA.test(l)) noDia++; });
  if (noDia >= 2) reasons.push(noDia + ' đoạn viết không dấu');
  if (/(^|\n)\s*(?:Viết lại (?:gọn|lần cuối|từ đầu)|Bản viết gọn|Viêt laji)/i.test(t)) reasons.push('model tự lẩm bẩm "viết lại"');
  // V14.7.40: model tự nói chuyện/đánh dấu bản thảo giữa văn xuôi (GLM): "Xin lỗi! Tôi bị lỗi", "Final rewrite", "BẢN CUỐI", "á đúng vậy đó".
  if (/(?:^|\n)\s*(?:\*\*)?\s*(?:final (?:rewrite|version|draft)|BẢN CUỐI(?: CÙNG)?|BẢN VIẾT LẠI|rewrite|draft \d)\b/i.test(t) || /(?:^|\n)\s*Xin lỗi[!,.]?[^\n]{0,40}\b(?:tôi|mình)\b[^\n]{0,40}(?:lỗi|nhầm|viết lại)/i.test(t)) reasons.push('model chèn lời thoại/đánh dấu bản thảo vào truyện');
  // V14.7.41: đoạn văn dài lặp nguyên văn (lỗi chương mẫu ch17).
  const pc = new Map(); lines.forEach(l => { if (l.length >= 80) { const k = l.toLowerCase(); pc.set(k, (pc.get(k) || 0) + 1); } });
  let dupP = 0; pc.forEach(n => { if (n >= 2) dupP += n - 1; });
  if (dupP >= 2) reasons.push(dupP + ' đoạn văn dài bị lặp nguyên văn');
  { const rd = countRunOnDrift(t); // V14.7.46
    if (rd.chatter >= 1) reasons.push('văn lạc sang giọng bản tin/quảng cáo (' + rd.chatter + ' chỗ)');
    if (rd.sparse >= 2) reasons.push(rd.sparse + ' câu dài lê thê gần như không dấu câu (model lan man)'); }
  if (planningLeakIndex(t) >= 0) reasons.push('model rò kế hoạch/lời tự nhắc viết cảnh vào văn ("Viết cảnh S…", "Hmm —", "Giải pháp:")');   // V14.7.55
  { const notes = t.split(/\n+/).filter(isAssistantNotePara).length; if (notes) reasons.push('model chèn ghi chú kỹ thuật/lời trợ lý vào giữa văn (' + notes + ' đoạn)');   // V14.7.49
    const glued = words.filter(hasGluedLatin).length; if (glued) reasons.push('chữ Latin dính liền lẫn trong câu Việt (' + glued + ' chỗ)'); }
  const FILLER = (t.match(/(?:^|[\s"“])(?:á đúng|ờ nhỉ|ừ nhỉ|đúng vậy đó|ok luôn|oke|nhỉ nhỉ)(?=[\s,.!?"”]|$)/gi) || []).length;
  if (FILLER >= 4) reasons.push('văn lẫn lời chat (' + FILLER + ' chỗ)');
  return { bad: reasons.length > 0, reasons };
}
function stripForeign(text) {
  text = stripThinkingOutput(text); // V12.21
  if (!text) return text;
  return cleanModelArtifacts(sanitizeChapterText(text));   // V14.7.39
}
// V12.32.6c: bước làm sạch thuần (không có stripThinkingOutput) — dùng cho nút Chuẩn hóa trên chương đã lưu.
/* V14.3.5: model (đặc biệt model gốc Trung) rò chữ pinyin "de" (的/得/地) vào văn xuôi: "Sự kiêu hãnh cuối cùng de một tiểu thư". Trước đây không bị bắt vì mọi từ < 4 chữ cái bị bỏ qua.
   Tự sửa CHỈ ca chắc chắn (de + từ xác định/đại từ/tên riêng = sở hữu -> "của"); ca còn lại (de + động/tính từ) để findStrayWords báo cho bước sửa bằng AI. */
function fixPinyinDe(text) {
  const t = String(text || ""); if (!t || t.indexOf("de") < 0) return t;
  const DET = "(?:một|những|các|mọi|mình|nàng|hắn|cô|anh|chị|tên|kẻ|người|chính|nó|họ|tầng|căn|tòa|chiếc|cái|bản|toàn|từng|trứng|vòng|chủ)";
  const re = new RegExp("(?<![\\p{L}\\p{N}])de(?=[ \\t]+(?:" + DET + "(?![\\p{L}\\p{N}])|\\p{Lu}))", "gu");
  return t.replace(re, (m, off) => {
    const after = t.slice(off + 2).replace(/^[ \t]+/, ""), before = t.slice(0, off);
    if (/^\p{Lu}/u.test(after) && /(?:^|[ \t])\p{Lu}[\p{L}]*[ \t]+$/u.test(before) && /^[A-Za-z]/.test(after) && /[A-Za-z]$/.test(before.trim())) return m; // "Charles de Gaulle": tên nước ngoài, giữ nguyên
    return "của";
  });
}
function sanitizeChapterText(text) {
  // V12.10: dọn chữ Hán/Nhật/Hàn/Cyrillic/Thái/Ả Rập/Hindi còn sót (kể cả khi dưới ngưỡng viết lại).
  if (!text) return text;
  text = removeEnglishLeaks(text);   // V12.23
  let t = String(text)
    .replace(/，/g, ", ").replace(/。/g, ". ").replace(/！/g, "! ").replace(/？/g, "? ").replace(/：/g, ": ").replace(/、/g, ", ").replace(/；/g, "; ").replace(/（/g, " (").replace(/）/g, ") ").replace(/\u2014{2,}|—\s*—/g, " — ")
    .replace(/[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0400-\u04FF\u0E00-\u0E7F\u0600-\u06FF\u0900-\u097F]+/g, "");
  t = stripJunkSymbols(t);
  t = fixPinyinDe(t);
  t = cleanProseArtifacts(t);
  return t.replace(/[ \t]{2,}/g, " ").replace(/ +([,.!?;:])/g, "$1").replace(/\( *\)|“ *”|" *"/g, "");
}
// Xóa hẳn các từ lạ (khớp nguyên từ, phân biệt hoa/thường) khỏi văn bản rồi dọn khoảng trắng/dấu câu.
function removeStrayWords(text, words) {
  let t = String(text || "");
  (words || []).forEach(w => {
    const esc = String(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!esc) return;
    t = t.replace(new RegExp("(?<![\\p{L}\\p{N}])" + esc + "(?![\\p{L}\\p{N}])", "gu"), "");
  });
  return t.replace(/[ \t]{2,}/g, " ").replace(/ +([,.!?;:…])/g, "$1").replace(/([,;:]) *([.!?…])/g, "$2").replace(/\( *\)|“ *”|" *"/g, "").replace(/[ \t]+\n/g, "\n");
}
/* V12.32.6b: làm sạch "tạp chất" thường gặp trong output model để chương là văn xuôi thuần tiếng Việt:
   Unicode NFC, Ð→Đ, markdown/HTML, emoji, ghi chú meta của AI, nhãn "(tiếng Anh)", lặp từ/ký tự/dấu câu bất thường. */
function cleanProseArtifacts(text) {
  let t = String(text || "");
  if (!t) return t;
  t = t.normalize("NFC").replace(/Ð/g, "Đ").replace(/ð/g, "đ");
  // HTML / markdown (giữ chữ, bỏ ký hiệu). Không đụng dấu gạch đầu dòng thoại (— – -).
  t = t.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?(?:p|div|span|b|i|u|em|strong|center|h[1-6])\b[^>]*>/gi, "");
  t = t.replace(/`{1,3}/g, "").replace(/^[ \t]*#{1,6}[ \t]+/gm, "").replace(/^[ \t]*>[ \t]?/gm, "");
  t = t.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/(?<![\p{L}\p{N}*])\*([^*\n]+)\*(?![\p{L}\p{N}*])/gu, "$1").replace(/(?<![\p{L}\p{N}_])_([^_\n]+)_(?![\p{L}\p{N}_])/gu, "$1");
  t = t.replace(/\*{2,}/g, "");
  // Biến mẫu/ngoặc nhọn model để rò ("{phương án tài chính}") -> giữ chữ bên trong, bỏ ngoặc.
  t = t.replace(/\{\{?\s*([^{}\n]{1,120}?)\s*\}?\}/g, "$1");
  // Emoji / ký hiệu hình ảnh (văn xuôi thuần).
  t = t.replace(/[\p{Extended_Pictographic}\uFE0F\u20E3]/gu, "");
  // Nhãn ngôn ngữ do model rò rỉ: đoạn có >=2 nhãn bị bỏ cả đoạn; 1 nhãn thì bỏ nhãn.
  t = t.split("\n").filter(l => (l.match(/\((?:bằng\s+)?tiếng\s+(?:Việt|Anh|Trung|Nhật|Hàn|Pháp|Nga)\)/gi) || []).length < 2).join("\n")
       .replace(/\s*\((?:bằng\s+)?tiếng\s+(?:Việt|Anh|Trung|Nhật|Hàn|Pháp|Nga)\)/gi, "");
  // Dòng meta của AI (không phải lời thoại: không bắt đầu bằng nháy/gạch thoại).
  t = t.split("\n").filter(l => !/^\s*[\[(]?\s*(?:ghi chú|lưu ý|chú thích|note|word count|số từ|tổng số từ|hết chương|còn tiếp|to be continued|end of chapter)(?![\p{L}])[^\n]{0,160}$/iu.test(l)).join("\n");
  // Dấu câu bất thường.
  t = t.replace(/\.{4,}/g, "…").replace(/…{2,}/g, "…").replace(/([!?]){4,}/g, "$1$1$1").replace(/([,;:]){2,}/g, "$1").replace(/(?<=[\p{L}\p{N}”"’)]) ?\.{2}(?!\.)/gu, ".");
  // Lặp ký tự/từ bất thường (thoái hóa của model).
  t = t.replace(/(\p{L})\1{6,}/gu, "$1$1$1$1$1$1");
  t = t.replace(/\b([\p{L}]+)(?:[ \t]+\1\b){5,}/giu, "$1 $1 $1");
  // Dòng/đoạn lặp liền kề.
  const lines = t.split("\n"), out = [];
  for (const l of lines) { if (l.trim() && out.length && out[out.length - 1].trim() === l.trim() && l.trim().length > 12) continue; out.push(l); }
  return out.join("\n");
}

/* V12.32.6: model nhỏ đôi khi xả ký tự rác (chữ thuộc bảng chữ cái lạ như ᒞ, tổ hợp "/…/", ",/", dòng chỉ có ký hiệu).
   stripForeign trước đây chỉ bỏ Hán/Nhật/Hàn/Cyrillic/Thái/Ả Rập/Hindi nên các ký tự này lọt vào truyện và còn bị tách thành đoạn riêng. */
function stripJunkSymbols(text) {
  let t = String(text || "");
  // 1) Chữ cái không phải Latin (Canadian syllabics, Hy Lạp, Do Thái, Armenia, Georgia, Ethiopia, Cherokee...).
  t = t.replace(/(?![\p{Script=Latin}])\p{L}+/gu, "");
  // 2) Các ký tự điều khiển/ẩn lạ (giữ \n và \t).
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\uFEFF\uFFFC\uFFFD]/g, "");
  // 3) Mảnh rác: token (tách bằng khoảng trắng) không có chữ/số nhưng chứa / \ | ^ ~ < > = _ (vd: "/…/", ",/", "\\|").
  t = t.replace(/(^|[ \t])[^\s\p{L}\p{N}]*[\/\\|^~<>=_][^\s\p{L}\p{N}]*(?=[ \t]|$)/gmu, "$1");
  // 4) Dòng không có chữ/số (trừ dòng ngăn cảnh như ---, ***, * * *, —, …).
  t = t.split("\n").filter(l => !l.trim() || (/[\p{L}\p{N}]/u.test(l) && !/^\s*\p{L}\s*$/u.test(l)) || /^[\s\-–—*_=~•·#…]+$/.test(l)).join("\n"); // bỏ cả dòng chỉ còn đúng 1 chữ cái lẻ (tàn dư sau khi lọc rác)
  return t;
}

function detectNonVietnamese(text) {
  if (!text) return false;
  const foreign = (String(text).match(/[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0400-\u04FF\u0E00-\u0E7F\u0600-\u06FF\u0900-\u097F]/g) || []).length;
  const total = String(text).replace(/\s/g, "").length || 1;
  return (foreign / total) > 0.005;
}

function normalizeChapterMatureFocus(v) {
  const x = String(v || "none").toLowerCase();
  return x === "primary" || x === "secondary" ? x : "none";
}

const NSFW_KEYWORDS = [
  "cảnh nóng", "cảnh sex", "cảnh 18", "cảnh 18+", "làm tình", "ân ái", "giao hợp", "sex", "sexx", "sexy", "nsfw", "erotic", "erotica", "porn", "âu yếm", "vuốt ve", "mơn trớn", "ve vuốt", "hôn sâu", "hôn môi", "hôn cổ", "cởi đồ", "cởi áo", "cởi quần", "không mặc", "khỏa thân", "trần truồng", "nude", "sờ soạng", "sờ ngực", "sờ mông", "nắn bóp", "liếm", "thổi kèn", "dương vật", "âm đạo", "âm hộ", "núm vú", "háng", "cặc", "lồn", "thúc mạnh", "xuất tinh", "orgasm", "cao trào", "khoái cảm", "doggy", "missionary", "cowgirl", "oral", "blowjob", "handjob", "viết nóng", "viết 18", "tăng nhiệt", "nóng hơn", "cảnh ân ái", "đêm tân hôn", "mất trinh", "đoạt mất", "chiếm đoạt cơ thể", "ham muốn", "dục vọng", "nứng", "rên rỉ", "rên la", "rên ưỡn", "quan hệ tình dục", "quan hệ xác thịt", "bóp mông",
  /* V14.7.14b: từ khóa thường gặp trong Outline 18+ mà danh sách cũ bỏ sót (phá trinh, bú, edging, trứng rung...) nên cảnh không được nhận là cảnh nóng. */
  "phá trinh", "nước dâm", "dâm thủy", "thủ dâm", "dâm đãng", "bú cu", "bú liếm", "bú mút", "bắt bú", "bú", "mút", "ngón tay và miệng", "kích thích", "đâm chậm", "đâm sâu", "đâm sầm", "cương cứng", "tinh dịch", "tinh trùng", "vú", "ngực trần", "địt", "chịch", "đụ", "buồi", "edging", "dirty talk", "trứng rung", "butt plug", "bị đâm", "quan hệ trên", "quan hệ đứng", "quan hệ ngay"
];

const _NSFW_RE = new RegExp("(?<![\\p{L}\\p{N}])(?:" + NSFW_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![\\p{L}\\p{N}])", "iu");

/* V14.7.14b: chương trước dừng GIỮA cảnh nóng (có từ khóa 18+ ở đuôi nhưng chưa có dấu hiệu cao trào/kết cảnh) thì chương sau phải viết tiếp NGAY cảnh đó. */
function unfinishedHotSceneNote(prevEnding) {
  const tail = String(prevEnding || '').slice(-1200);
  if (!tail || !textHasNsfwKeyword(tail)) return '';
  const done = /(cao trào|đạt đỉnh|lên đỉnh|xuất (?:tinh|ra)|bắn (?:vào|ra|tinh)|tinh dịch|run lên bần bật|co giật|ngất đi|thở dốc|mệt lả|nằm thở|buông (?:thõng|lỏng)|rút ra|đổ gục|sau khi (?:xong|kết thúc)|kết thúc cuộc|xong việc|mặc lại|chỉnh lại (?:váy|áo|quần))/i.test(tail);
  if (done) return '';
  return '\nLƯU Ý LIÊN TỤC: đoạn kết chương trước đang ở GIỮA cảnh nóng, chưa tới cao trào/kết cảnh. Cảnh mở đầu chương này PHẢI viết tiếp NGAY từ đúng khoảnh khắc, tư thế và nhịp đó (không nhảy sang thời điểm/địa điểm khác, không tóm tắt phần dở), tiếp tục tả từng hành động, đưa cảnh tới cao trào và hậu cảnh ngắn rồi mới sang các beat Outline tiếp theo.';
}
function textHasNsfwKeyword(text) {
  if (!text) return false;
  return _NSFW_RE.test(String(text).normalize("NFC"));
}

// V14.1: ưu tiên số đứng ngay trước "tuổi" ("17 tuổi, đã tu luyện 300 năm" -> 17), nếu không có thì lấy số đầu tiên như cũ.
function parseAgeNum(a) {
  const s = String(a == null ? "" : a);
  const m = s.match(/(\d{1,4})\s*tuổi/i) || s.match(/\d{1,4}/);
  return m ? parseInt(m[1] !== undefined ? m[1] : m[0], 10) : null;
}
// V14.1: tuổi dùng cho rào chắn 18+ = số NHỎ NHẤT trong (tuổi, tuổi ngoại hình). Nhân vật tu tiên "300 tuổi nhưng ngoại hình 16" vẫn bị chặn.
function profileAgeNum(c, u) {
  const a = parseAgeNum((c && c.age) || (u && u.age)), b = parseAgeNum((c && c.apparentAge) || (u && u.apparentAge));
  if (a === null) return b; if (b === null) return a; return Math.min(a, b);
}

function underageNames(s) {
  const out = []; const chk = (n, c) => { const v = profileAgeNum(c); if (n && v !== null && v < 18) out.push(String(n)); };
  chk(s.mainCharProfile && s.mainCharProfile.name, s.mainCharProfile);
  (s.characters || []).forEach(c => chk(c && c.name, c));
  return out;
}

function ageGuardPrompt(s) {
  const u = underageNames(s);
  return "RÀO CHẮN TUỔI (bắt buộc): chỉ nhân vật đã trưởng thành (từ 18 tuổi trở lên) mới được tham gia cảnh tình dục/khiêu dâm. Tuyệt đối không viết nội dung tình dục với nhân vật dưới 18 tuổi hoặc được mô tả như trẻ em."
    + (u.length ? (" Nhân vật KHÔNG được xuất hiện trong cảnh 18+: " + u.join(", ") + ".") : "");
}

// V14.7.6 Cast Planner: AI đề xuất dàn nhân vật phụ bám truyện (chỉ người trưởng thành), tự nạp thành bản nháp để tác giả sửa sau.
// V14.7.9: dàn nhân vật mỏng (chỉ NVC + 1 người) thì tự nạp Cast Planner; kế hoạch chương phải LUÂN PHIÊN đưa nhân vật đã khai báo vào truyện.
function castIsThin(st) {
  st = st || {};
  const main = normalizeName(st.mainCharProfile && st.mainCharProfile.name || "");
  const others = (st.characters || []).filter(c => c && c.name && !c.dead && !c.isDead && normalizeName(c.name) !== main);
  return others.length < 3;
}
/* V14.7.30: NHÂN VẬT PHỤ THÚC ĐẨY TRUYỆN (vừa đủ). Backup 30 chương: Yến Nhi xuất hiện 6/30 chương, Hùng 8, Tuấn 3, Phương Anh 2; role "không rõ". Cũ: chọn 4 người đầu danh sách, chỉ "nếu hợp mạch". Mới: chọn tối đa 2 người theo độ vắng × tầm quan trọng, mỗi người kèm CHỨC NĂNG cụ thể của chương, bắt buộc ≥1 người tác động thật; cho phép tối đa 1 nhân vật phụ mới khi dàn gần đây quá mỏng. */
const SUPPORT_FUNCTIONS = [
  { re: /cấp trên|giám đốc|ceo|sếp|trưởng phòng|chủ tịch|quản lý/i, fn: 'gây áp lực/giao việc/nghi ngờ đúng quyền hạn chức vụ, buộc nhân vật chính hoặc nữ nhân phải xử lý (không sợ hãi vô cớ)' },
  { re: /đối thủ|đối tác|cạnh tranh|kẻ thù|phe/i, fn: 'ra một nước đi hoặc đòi hỏi mới làm đổi thế cân bằng; thử thách Bùi Lạc' },
  { re: /theo dõi|thu thập|đối tượng|mục tiêu|nghi phạm|hãm hại/i, fn: 'để lộ một hành động/manh mối mới về âm mưu năm xưa; có hậu quả cho kế hoạch của hắn' },
  { re: /cung cấp thông tin|tin tức|nguồn tin|người nhận|liên lạc/i, fn: 'đưa MỘT mẩu thông tin có thật làm đổi hướng việc nhân vật chính sắp làm' },
  { re: /đồng nghiệp|nhân viên|lễ tân|bảo vệ|tạp vụ|tài xế/i, fn: 'tình cờ thấy điều bất thường và hỏi/nhắc một câu khó, tạo nguy cơ bị lộ' },
  { re: /người thân|bạn|chồng|người yêu|gia đình/i, fn: 'kéo nhân vật vào đời sống riêng, tạo ràng buộc hoặc nguy cơ bị phát hiện' }
];
function supportFunctionFor(c) {
  const src = [c.role, c.relevanceToMC, c.occupation, c.relationship].filter(Boolean).join(' ');
  const m = SUPPORT_FUNCTIONS.find(x => x.re.test(src));
  return m ? m.fn : 'tác động cụ thể vào mục tiêu hoặc quyết định của một nhân vật chính (đưa thông tin, gây áp lực, hoặc lộ điều đáng ngờ)';
}
function _lastChapterWith(st, name) {
  const chs = (st && st.chapters) || [], parts = String(name || '').trim().split(/\s+/), key = parts.length > 1 ? parts.slice(-2).join(' ') : parts[0];
  for (let i = chs.length - 1; i >= 0; i--) { const t = chs[i] && chs[i].text; if (t && (t.indexOf(name) >= 0 || (key && t.indexOf(key) >= 0))) return i + 1; }
  return 0;
}
function castPoolForPlan(st, chapterNumber) {
  st = st || {};
  const main = normalizeName(st.mainCharProfile && st.mainCharProfile.name || "");
  const n = Math.max(1, Number(chapterNumber) || 1);
  const W = { major: 3, important: 3, supporting: 2, minor: 1 };
  const cands = (st.characters || []).filter(c => c && c.name && !c.dead && !c.isDead && normalizeName(c.name) !== main).map(c => {
    const tier = String(c.importance || c.tier || 'supporting').toLowerCase(), w = W[tier] || (/background|extra/.test(tier) ? 0 : 1);
    const last = ((st.chapters || []).some(x => x && x.text) ? _lastChapterWith(st, c.name) : (Number(c.lastAppearance) || 0)), absent = last ? (n - 1 - last) : Math.max(0, n - 1);
    return { c, w, absent, last };
  }).filter(x => x.w > 0 && x.absent >= (x.w >= 2 ? 3 : 6));
  cands.sort((a, b) => b.absent * b.w - a.absent * a.w);
  return cands.slice(0, 2).map(x => ({ name: String(x.c.name), role: String(x.c.role && !/không rõ/i.test(x.c.role) ? x.c.role : (x.c.relevanceToMC || '')).slice(0, 80), absent: x.absent, fn: supportFunctionFor(x.c) }));
}
function recentNamedCastCount(st, chapterNumber) {
  const n = Math.max(1, Number(chapterNumber) || 1), main = normalizeName(st && st.mainCharProfile && st.mainCharProfile.name || "");
  return ((st && st.characters) || []).filter(c => c && c.name && !c.dead && normalizeName(c.name) !== main && _lastChapterWith(st, c.name) >= n - 5 && _lastChapterWith(st, c.name) > 0).length;
}
function castPoolBlock(pool, extra) {
  const allowNew = extra && extra.allowNew;
  if ((!Array.isArray(pool) || !pool.length) && !allowNew) return "";
  const lines = [];
  if (Array.isArray(pool) && pool.length) {
    lines.push("NHÂN VẬT PHỤ CẦN ĐƯA TRỞ LẠI (đã vắng khá lâu) — dùng VỪA ĐỦ, không thêm người dư:");
    pool.forEach(c => lines.push("- " + c.name + (c.role ? " (" + c.role + ")" : "") + (c.absent ? " — vắng " + c.absent + " chương" : "") + ": chức năng chương này = " + c.fn));
    lines.push("- BẮT BUỘC ít nhất MỘT người trong danh sách trên xuất hiện TRỰC TIẾP (có lời thoại hoặc hành động) và để lại tác động cụ thể (thông tin mới, quyết định, áp lực hoặc hậu quả) cho sự kiện chính — không chỉ nhắc tên hay lướt qua. Ghi đúng tên hồ sơ trong beat [R] hoặc [S]; không phá các mốc bắt buộc của brief.");
  }
  if (allowNew) lines.push("- DÀN PHỤ ĐANG MỎNG (rất ít nhân vật có tên xuất hiện gần đây): được phép giới thiệu TỐI ĐA 1 nhân vật phụ MỚI nếu sự kiện chính thật sự cần; phải có tên riêng, chức vụ/vai trò rõ, mối liên hệ với âm mưu hoặc với nhân vật chính, và một lý do xuất hiện. Không tạo thêm ngoài 1 người.");
  else lines.push("- Không tạo thêm nhân vật có tên ngoài hồ sơ.");
  return lines.join("\n");
}
const CAST_PLANNER_FIELDS = ["name","age","gender","role","relationship","desire","secret","appearance","height","bodyType","measurements","hair","eyes","skin","voice","scent","speech","addressTerms","personality","occupation"];
function buildCastPlannerPrompt(st, opts) {
  st = st || {}; opts = opts || {};
  const n = Math.max(3, Math.min(10, Number(opts.count) || 6));
  const mc = st.mainCharProfile || {};
  const known = [mc.name].concat((st.characters || []).map(c => c && c.name)).filter(Boolean);
  const mcLine = [mc.name, mc.age ? "tuổi " + mc.age : "", mc.gender, mc.occupation, mc.goals ? "mục tiêu: " + mc.goals : "", mc.personality].filter(Boolean).join(" | ");
  const outline = (st.outlinePlans || []).slice(0, 12).map(o => typeof o === "string" ? o : (o && (o.beat || o.title || o.summary || o.text)) || "").filter(Boolean).join("\n").slice(0, 1500);
  return [
    "Bạn là biên kịch dựng dàn nhân vật cho tiểu thuyết tiếng Việt. Hãy ĐỀ XUẤT " + n + " nhân vật mới, bám sát truyện, để câu chuyện có thêm xung đột, quan hệ và biến cố.",
    st.genre ? "THỂ LOẠI: " + st.genre : "",
    st.mainPlot ? "CỐT TRUYỆN: " + String(st.mainPlot).slice(0, 1500) : "",
    st.worldSetting ? "THẾ GIỚI: " + String(st.worldSetting).slice(0, 800) : "",
    mcLine ? "NHÂN VẬT CHÍNH: " + mcLine : "",
    outline ? "OUTLINE/CHẶNG TRUYỆN:\n" + outline : "",
    known.length ? "NHÂN VẬT ĐÃ CÓ (KHÔNG trùng tên, KHÔNG viết lại): " + known.join(", ") : "",
    st.mature ? "Truyện người lớn 18+: các nhân vật nên có sức hút, ham muốn, quan hệ quyền lực/cảm xúc đủ để triển khai cảnh nóng sau này." : "",
    "QUY TẮC BẮT BUỘC:",
    "- TẤT CẢ nhân vật phải là người trưởng thành, tuổi ghi rõ bằng SỐ từ 18 trở lên. Không đề xuất ai dưới 18, không dùng ngoại hình/vai trò học sinh/trẻ con.",
    "- Mỗi người phải có quan hệ cụ thể với nhân vật chính hoặc với nhau, một mong muốn rõ và một bí mật có thể bị lộ về sau.",
    "- Đa dạng vai trò (đồng minh, đối thủ, người cám dỗ, người cản đường, người giữ bí mật...), không trùng tính cách.",
    "- Ngoại hình cụ thể: chiều cao, vóc dáng, số đo (nếu hợp thể loại), tóc, mắt, da, giọng, mùi hương, dấu hiệu nhận dạng. Không dùng từ chung chung.",
    "- Cách nói và xưng hô riêng (gọi nhân vật chính là gì, tự xưng gì, giọng điệu).",
    "CHỈ TRẢ VỀ JSON thuần, một mảng, mỗi phần tử có các khóa: " + CAST_PLANNER_FIELDS.join(", ") + ". Không thêm giải thích."
  ].filter(Boolean).join("\n");
}
function normalizeCastPlannerCards(cards, st) {
  st = st || {};
  const accepted = [], rejected = [];
  const seen = new Set([(st.mainCharProfile && st.mainCharProfile.name)].concat((st.characters || []).map(c => c && c.name)).map(normalizeName).filter(Boolean));
  const str = v => (v == null ? "" : String(v)).trim();
  (Array.isArray(cards) ? cards : []).forEach(raw => {
    if (!raw || typeof raw !== "object") return;
    const name = str(raw.name);
    if (!name) return;
    const key = normalizeName(name);
    if (seen.has(key)) { rejected.push({ name, reason: "trùng tên nhân vật đã có" }); return; }
    const age = parseAgeNum(raw.age);
    if (age === null) { rejected.push({ name, reason: "thiếu tuổi (phải ghi số ≥ 18)" }); return; }
    if (age < 18) { rejected.push({ name, reason: "dưới 18 tuổi" }); return; }
    seen.add(key);
    const speech = [str(raw.speech), str(raw.addressTerms) ? "Xưng hô: " + str(raw.addressTerms) : ""].filter(Boolean).join(" | ");
    accepted.push({
      name, tier: "supporting", age: String(age), gender: str(raw.gender), role: str(raw.role), relevanceToMC: str(raw.relationship),
      goals: str(raw.desire), secret: str(raw.secret), appearance: str(raw.appearance), height: str(raw.height), bodyType: str(raw.bodyType),
      measurements: str(raw.measurements), hair: str(raw.hair), eyes: str(raw.eyes), skin: str(raw.skin), voice: str(raw.voice), scent: str(raw.scent),
      speech, personality: str(raw.personality), occupation: str(raw.occupation), locked: false
    });
  });
  return { accepted, rejected };
}

// V14.0.20 post-audit: nút "AI đề xuất" của Outline phải theo cài đặt 18+ của truyện (trước đây prompt không đọc
// mature/chapterMatureFocus nên luôn ra outline thường). Chỉ ở mức KẾ HOẠCH: chương nào có cảnh nóng, ai–ai (đều >=18),
// cảnh làm đổi điều gì — không tả chi tiết tình dục. Cụm "cảnh nóng" trong beat cũng là từ khoá để bộ định tuyến NSFW chọn model 18+.
function outlineMaturePrompt(st, total) {
  st = st || {};
  if (!st.mature) return "";
  const mf = normalizeChapterMatureFocus(st.chapterMatureFocus);
  if (mf === "none") return "";
  const n = Number(total) > 0 ? Number(total) : 10, primary = mf === "primary";
  const lo = primary ? Math.round(n * 0.4) : Math.max(1, Math.round(n * 0.2));
  const hi = primary ? Math.round(n * 0.6) : Math.max(lo, Math.round(n * 0.3));
  return [
    "NỘI DUNG 18+ (truyện người lớn, đã BẬT; trọng tâm trưởng thành: " + mf.toUpperCase() + "):",
    (primary
      ? "- Outline này PHẢI có khoảng " + lo + "–" + hi + " trong " + n + " chương là chương có cảnh nóng (cảnh nóng là trọng tâm của chương đó, vẫn có diễn biến cốt truyện trước/sau). Không được viết thành outline thuần tình tiết thường."
      : "- Outline nên có khoảng " + lo + "–" + hi + " trong " + n + " chương có cảnh nóng, đặt ở chỗ quan hệ/quyền lực/tình huống đã tích tụ tới mức hợp lý; các chương còn lại là cốt truyện."),
    "- Chương có cảnh nóng: beat PHẢI chứa đúng cụm \"cảnh nóng\", nêu rõ 2 nhân vật tham gia (theo tên trong Story Bible), tình huống đưa tới cảnh, và điều cảnh đó làm THAY ĐỔI (quan hệ, quyền lực, bí mật, hậu quả hoặc quyết định). Tối đa 3 câu. Outline chỉ là kế hoạch: KHÔNG tả chi tiết tình dục trong beat.",
    "- Các cảnh nóng không được lặp nhau: mỗi cảnh một tình huống và một mức thay đổi quan hệ khác nhau, tăng dần theo mạch truyện.",
    ageGuardPrompt(st),
    "- Nhân vật không ghi tuổi trong hồ sơ được coi là người lớn. Nhân vật có tuổi dưới 18 hoặc được mô tả như học sinh/trẻ em KHÔNG được tham gia cảnh nóng."
  ].join("\n");
}

// Rà kết quả AI: trả danh sách số chương có cảnh 18+ mà dính nhân vật dưới 18 tuổi (theo hồ sơ) hoặc từ ngữ chỉ trẻ em/học sinh.
function outlineAdultViolations(rows, st) {
  const kid = /(?<![\p{L}\p{N}])(?:học sinh|nữ sinh|nam sinh|trẻ em|bé gái|bé trai|dưới 18|chưa đủ 18|chưa thành niên)(?![\p{L}\p{N}])/iu;
  const nameRes = underageNames(st || {}).map(nm => new RegExp("(?<![\\p{L}\\p{N}])" + String(nm).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\p{L}\\p{N}])", "iu"));
  const bad = [];
  (rows || []).forEach(r => {
    const b = String((r && r.b) || "");
    if (!textHasNsfwKeyword(b)) return;
    if (kid.test(b) || nameRes.some(re => re.test(b))) bad.push(Number(r.n));
  });
  return bad;
}

function _sumNorm(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim(); }

function summaryNameList(text, characters){
  const nt=_sumNorm(text);
  return (characters||[]).map(c=>c&&c.name).filter(Boolean).filter(n=>nt.includes(_sumNorm(n))).slice(0,40);
}

function _sumNameGrounded(name, text){
  const toks=String(name).split(/\s+/).filter(Boolean);
  let hit=0;
  toks.forEach(t=>{ try{ if(new RegExp("(^|[^\\p{L}])"+t+"(?![\\p{L}])","u").test(text)) hit++; }catch(_){} });
  return hit >= Math.ceil(toks.length/2);
}

function summaryGrounded(summary, text){
  const names=[]; const bad=[]; let good=0;
  (String(summary).match(/(?:\p{Lu}\p{Ll}+)(?:\s+\p{Lu}\p{Ll}+)+/gu)||[]).forEach(nm=>{
    if(names.includes(nm)) return; names.push(nm);
    if(_sumNameGrounded(nm, text)) good++; else bad.push(nm);
  });
  const nameOk = names.length<2 || bad.length/names.length <= 0.34;
  const tw=new Set((_sumNorm(text).match(/[a-z0-9]{2,}/g)||[]));
  const sw=(_sumNorm(summary).match(/[a-z]{4,}/g)||[]);
  const ov = sw.length ? sw.filter(w=>tw.has(w)).length/sw.length : 1;
  return { ok: nameOk && ov>=0.4, bad, ov };
}

function extractiveSummary(text){
  const paras=String(text||"").split(/\n+/).map(p=>p.trim()).filter(p=>p.length>60);
  if(!paras.length) return "";
  const pick=Math.min(9, paras.length); const out=[];
  for(let i=0;i<pick;i++){
    const p=paras[Math.floor(i*paras.length/pick)];
    const w=p.split(/\s+/); let seg=w.slice(0,45).join(" ");
    if(w.length>45){ const k=Math.max(seg.lastIndexOf(". "),seg.lastIndexOf("! "),seg.lastIndexOf("? ")); if(k>seg.length*0.4) seg=seg.slice(0,k+1); }
    out.push(seg);
  }
  return "**Tóm tắt chương:** (trích tự động từ văn bản)\n\n"+out.join("\n\n");
}

function buildSummaryPrompt(text, n, names, adult){
  return [
    "Bạn là bộ máy tóm tắt. Chỉ được dựa vào văn bản trong thẻ <chuong>; không có kiến thức nào khác về truyện này.",
    "<chuong>", text, "</chuong>",
    "NHIỆM VỤ: tóm tắt CHƯƠNG "+n+" trên đây theo đúng trình tự diễn ra.",
    "1) Chỉ dùng nhân vật, địa điểm, đồ vật, giờ giấc, lời thoại CÓ trong <chuong>. Không thêm, không suy diễn. Nếu chương không nêu giờ giấc hay chức danh thì KHÔNG ghi.",
    names && names.length ? "2) Tên nhân vật xuất hiện trong chương (chỉ dùng đúng các tên này): "+names.join(", ")+"." : "2) Dùng đúng tên nhân vật như viết trong chương.",
    "3) Định dạng: mở đầu bằng dòng \"**Tóm tắt chương:**\", rồi 1 câu nêu mạch chính, sau đó 4-5 đoạn ngắn theo diễn biến (mỗi đoạn một cảnh/mốc). Không dùng nhãn Đầu/Giữa/Cuối, không gạch đầu dòng, không mô tả tiêu chí tóm tắt.",
    adult
      ? "4) Chương này có cảnh người lớn (18+/khống chế): thuật lại CỤ THỂ, không nói giảm nói tránh — nêu đúng ai làm gì với ai, hành động, đạo cụ, tư thế/vị trí, câu nói/mệnh lệnh chính và hệ quả, dùng đúng từ ngữ mà chương đã dùng; không rút gọn thành 'cảnh nóng/thân mật', không bỏ cảnh, không thêm chi tiết ngoài văn bản, không bình luận đạo đức."
      : "4) Với cảnh nhạy cảm (18+/bạo lực/cưỡng ép): thuật lại ngắn gọn, trung lập ai làm gì với ai, câu nói/mệnh lệnh chính và hệ quả — không bỏ cảnh, không thêm chi tiết ngoài văn bản.",
    "5) Câu cuối: trạng thái cuối chương theo đúng văn bản.",
    "6) Độ dài 300-400 từ tiếng Việt, tối đa 400. Chỉ trả về bản tóm tắt."
  ].join("\n");
}

function summaryRetryNote(g){
  return "\n\nLỖI LẦN TRƯỚC: bản tóm tắt chứa nội dung KHÔNG có trong <chuong>"+(g.bad&&g.bad.length?" (tên không có trong chương, cấm dùng: "+g.bad.join(", ")+")":"")+". Viết lại: bắt đầu bằng \"**Tóm tắt chương:**\" rồi chỉ kể lại các sự kiện có thật trong <chuong>.";
}

function formatParagraphs(text) {
  // V12.15: tự ngắt đoạn khi AI trả về khối văn đặc; mỗi lượt thoại một đoạn riêng; các đoạn cách nhau 1 dòng trống.
  let src = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!src) return src;
  // V12.32.6b: model đôi khi xuống dòng cứng giữa câu -> nối lại khi dòng trước chưa kết thúc và dòng sau bắt đầu bằng chữ thường.
  src = src.replace(/([\p{L}\p{N},;])[ \t]*\n(?!\n)[ \t]*(?=\p{Ll})/gu, "$1 ");
  // Viết tắt/tên viết tắt không phải điểm ngắt câu (TP. Hồ Chí Minh, TS. Nam, N. V. A...).
  const isAbbrevEnd = s0 => /(?:^|[\s“"(])(?:TP|TS|GS|PGS|BS|ThS|KS|Mr|Mrs|Ms|Dr|St|Q|P|TT|VN|Cty|CT|PTGĐ|GĐ)\.$/.test(s0.trim()) || /(?:^|[\s“"(])\p{Lu}\.$/u.test(s0.trim());
  const OPEN = /^[“"«‘'—–-]\s*/;
  const isTerm = c => ".!?…".indexOf(c) >= 0;
  const splitSentences = block => {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < block.length; i++) {
      const ch = block[i]; cur += ch;
      if (ch === "“") q = true; else if (ch === "”") q = false; else if (ch === '"') q = !q;
      if (q) continue;
      let j = i; while (j + 1 < block.length && /["”’'»)]/.test(block[j + 1])) { j++; cur += block[j]; }
      const last = cur.replace(/["”’'»)\s]+$/, "").slice(-1);
      if (isTerm(last) && (j === i ? isTerm(ch) : true) && /\s/.test(block[j + 1] || " ")) {
        let k = j + 1; while (k < block.length && /\s/.test(block[k])) k++;
        const nx = block.slice(k, k + 1);
        if ((!nx || /[\p{Lu}“"«‘—–-]/u.test(nx)) && !(last === "." && isAbbrevEnd(cur.replace(/["”’»)\s]+$/, "")))) { out.push(cur.trim()); cur = ""; }
        i = j;
      } else i = j;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  const paras = [];
  for (const raw of src.split(/\n+/)) {
    const block = raw.trim(); if (!block) continue;
    const sents = splitSentences(block);
    if (block.length <= 500 && !sents.some((x, i) => i > 0 && OPEN.test(x))) { paras.push(block); continue; }
    let cur = [], len = 0, curDialog = false;
    const flush = () => { if (cur.length) paras.push(cur.join(" ")); cur = []; len = 0; curDialog = false; };
    for (const s of sents) {
      const dlg = OPEN.test(s);
      if (dlg && cur.length) flush();
      if (!dlg && curDialog) flush();
      cur.push(s); len += s.length; curDialog = dlg || curDialog;
      if (curDialog) { if (/["”’»][^“"]{0,80}$/.test(s) || /[.!?…]$/.test(s)) flush(); }
      else if (cur.length >= 3 || len >= 320) flush();
    }
    flush();
  }
  // V12.32.6b: bỏ đoạn rỗng chữ/số (trừ dòng ngăn cảnh), nối mảnh vụn chưa kết thúc vào đoạn trước, bỏ đoạn trùng liền kề.
  const fin = [];
  for (const p0 of paras) {
    const p1 = p0.trim(); if (!p1) continue;
    const hasText = /[\p{L}\p{N}]/u.test(p1), isSep = /^[\s\-–—*_=~•·#…]+$/.test(p1);
    if (!hasText && !isSep) continue;
    if (fin.length && fin[fin.length - 1] === p1 && p1.length > 12) continue;
    const words = p1.split(/\s+/).length;
    if (fin.length && hasText && words <= 3 && !/[.!?…”"’»)]$/.test(p1) && /^\p{Ll}/u.test(p1) && !OPEN.test(p1) && !/^[\s\-–—*_=~•·#…]+$/.test(fin[fin.length - 1])) { fin[fin.length - 1] += " " + p1; continue; }
    fin.push(p1);
  }
  return fin.join("\n\n");
}

// ===== V12.15: chống lặp cảnh + phát hiện từ lạ =====
function _normWords(s) {
  return String(s || "").toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
}
function _grams(words, n) {
  const set = new Set();
  for (let i = 0; i + n <= words.length; i++) set.add(words.slice(i, i + n).join(" "));
  return set;
}
function _sim(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const g of a) if (b.has(g)) inter++;
  return inter / Math.min(a.size, b.size);
}
// ===== V12.22b: chống "viết lại cả chương từ đầu rồi dán nối" (kể cả khi bản 2 chỉ diễn đạt lại, không trùng nguyên văn) =====
// Nhãn "TIÊU ĐỀ: ... / NỘI DUNG:" nằm GIỮA văn bản (kể cả dính liền câu trước, không xuống dòng) = model xuất lại cả chương.
const _LABEL_RE = /\*{0,2}\b(?:TIÊU ĐỀ|TITLE)\s*:\s*\*{0,2}[^\n]{0,160}\n+\s*\*{0,2}NỘI DUNG\s*:\*{0,2}[ \t]*|(?:^|\n)[ \t]*\*{0,2}NỘI DUNG\s*:\*{0,2}[ \t]*/gi;
function splitByInnerLabels(text) {
  const src = String(text || ""); const parts = []; let last = 0, m;
  _LABEL_RE.lastIndex = 0;
  while ((m = _LABEL_RE.exec(src))) { parts.push(src.slice(last, m.index)); last = m.index + m[0].length; }
  parts.push(src.slice(last));
  return parts.map(x => x.trim()).filter(x => x.length > 0);
}
// Hồ sơ từ NỘI DUNG của từng đoạn: bỏ từ quá phổ biến trong chương (cô, hắn, của, váy...) để so khớp theo từ đặc trưng.
function _paraProfiles(paras) {
  const words = paras.map(p => _normWords(p)), df = new Map();
  words.forEach(ws => new Set(ws).forEach(w => df.set(w, (df.get(w) || 0) + 1)));
  const lim = Math.max(3, Math.ceil(paras.length * 0.2));
  return words.map(ws => new Set(ws.filter(w => w.length >= 2 && (df.get(w) || 0) <= lim)));
}
function _setSim(a, b) {
  if (a.size < 5 || b.size < 5) return 0;
  let n = 0; for (const w of a) if (b.has(w)) n++;
  return n / Math.min(a.size, b.size);
}
// Tìm đoạn bắt đầu của "bản viết lại": từ đó trở đi các đoạn lần lượt khớp (diễn đạt lại hoặc y nguyên) với các đoạn phía trước
// THEO ĐÚNG THỨ TỰ (đường chéo: đoạn i+k khớp đoạn j+k, lệch tối đa ±2 do tách/gộp đoạn). Trả -1 nếu không có.
// minStart: chỉ xét từ đoạn này trở đi (phía trước đó là bản gốc/đã có).
function _findRestartIndex(paras, minStart, thr, win) {
  thr = thr || 0.5; win = win || 6;
  const n = paras.length; if (n < minStart + 3) return -1;
  const prof = _paraProfiles(paras);
  const START = Math.min(0.35, thr), HIT = Math.min(0.28, thr);
  const walk = (i, j0, limit) => {          // đi dọc đường chéo từ (i, j0), trả {q, hit}
    let q = 0, hit = 0, j = j0;
    for (let k = i; k < Math.min(n, limit); k++, j++) {
      if (prof[k].size < 5) continue; q++;
      let bs = 0, bj = j;
      for (let jj = Math.max(0, j - 2); jj <= j + 2 && jj < k - 2; jj++) { const v = _setSim(prof[k], prof[jj]); if (v > bs) { bs = v; bj = jj; } }
      if (bs >= HIT) { hit++; j = bj; }
    }
    return { q, hit };
  };
  for (let i = Math.max(3, minStart); i < n - 2; i++) {
    if (prof[i].size < 5) continue;
    const cands = [];
    for (let j = 0; j < i - 3; j++) { const v = _setSim(prof[i], prof[j]); if (v >= START) cands.push([v, j]); }
    cands.sort((x, y) => y[0] - x[0]);
    for (const [, j0] of cands.slice(0, 3)) {
      const w = walk(i, j0, i + Math.max(win, 8));
      if (w.hit < 3 || w.hit / Math.max(1, w.q) < 0.6) continue;
      const all = walk(i, j0, n);
      if (all.hit / Math.max(1, all.q) < 0.5) continue;
      // lùi ngược: đoạn mở đầu của bản viết lại thường diễn đạt lại nhiều hơn nên điểm khớp thấp hơn (>=0.2), vẫn phải đúng thứ tự
      let cut = i, ref = j0;
      for (let step = 0; step < 6 && cut - 1 >= Math.max(3, minStart) && ref > 0; step++) {
        const a = prof[cut - 1]; if (a.size < 5) { cut--; continue; }
        let bs = 0, bj = -1; for (let jj = Math.max(0, ref - 3); jj < ref; jj++) { const v = _setSim(a, prof[jj]); if (v > bs) { bs = v; bj = jj; } }
        if (bs >= 0.2 && bj >= 0) { cut--; ref = bj; } else break;
      }
      return cut;
    }
  }
  return -1;
}
// Nếu văn bản có một "bản viết lại" của phần đầu (model chép lại từ đầu), cắt bỏ từ chỗ lặp trở đi.
// Trả về text gốc nếu không phát hiện gì. Chấp nhận cả trường hợp 2 bản dính liền không có dòng trống.
function _dedupeByGrams(src) {
  const sep = src.replace(/(\p{Ll}[.!?…”"])(\p{Lu}\p{Ll})/gu, "$1\n\n$2");
  const paras = sep.split(/\n\s*\n+|\n/).map(p => p.trim()).filter(Boolean);
  const info = paras.map(p => { const w = _normWords(p); return { p, n: w.length, g: _grams(w, 3) }; });
  const isDup = (i, from) => {
    if (info[i].n < 8) return -1;
    for (let j = from; j < i; j++) if (info[j].n >= 8 && _sim(info[i].g, info[j].g) >= 0.5) return j;
    return -1;
  };
  for (let i = 3; i < info.length - 1; i++) {
    const j = isDup(i, 0);
    if (j < 0 || j > 2) continue; // chỉ coi là 'viết lại từ đầu' khi trùng với các đoạn mở đầu chương
    // xác nhận: đoạn kế tiếp cũng trùng với một đoạn nằm sau j (tránh nhầm câu lặp có chủ đích)
    let ok = false;
    for (let k = i + 1; k <= Math.min(i + 2, info.length - 1) && !ok; k++) {
      if (info[k].n < 8) continue;
      for (let m = j + 1; m < i; m++) if (_sim(info[k].g, info[m].g) >= 0.5) { ok = true; break; }
    }
    if (ok) return paras.slice(0, i).join("\n\n");
  }
  return src;
}
function _splitParas(t) { return String(t || "").replace(/(\p{Ll}[.!?…”"])(\p{Lu}\p{Ll})/gu, "$1\n\n$2").split(/\n\s*\n+|\n/).map(p => p.trim()).filter(Boolean); }
function dedupeRepeatedScene(text) {
  const raw = String(text || "");
  if (raw.length < 1500) return raw;
  // (1) Có nhãn TIÊU ĐỀ/NỘI DUNG giữa văn bản -> model xuất lại cả chương: tách các bản, giữ bản tốt nhất, bỏ bản lặp.
  const segs = splitByInnerLabels(raw);
  let src = raw;
  if (segs.length > 1) {
    let keep = segs[0];
    for (let k = 1; k < segs.length; k++) {
      const sg = segs[k], pk = _splitParas(keep), ps = _splitParas(sg);
      const idx = _findRestartIndex(pk.concat(ps), pk.length, 0.4, 5);
      const prof = _paraProfiles(pk.concat(ps));
      let q = 0, hit = 0;
      for (let i = pk.length; i < pk.length + ps.length; i++) { if (prof[i].size < 5) continue; q++; let ok = false; for (let j = 0; j < pk.length && !ok; j++) if (_setSim(prof[i], prof[j]) >= 0.4) ok = true; if (ok) hit++; }
      const isDup = idx >= 0 || (q >= 3 && hit / q >= 0.4) || countWords(sg) < 40;
      if (isDup) {
        // chọn bản đầy đủ hơn: bản sau chỉ thắng khi bản đầu bị cụt còn bản sau kết gọn và không ngắn hơn đáng kể
        if (!endsCleanly(keep) && endsCleanly(sg) && countWords(sg) >= countWords(keep) * 0.8) keep = sg;
      } else keep = keep.replace(/\s+$/, "") + "\n\n" + sg;   // không phải bản lặp (nhãn thừa): chỉ bỏ nhãn, giữ cả hai phần
    }
    src = keep;
  }
  // (2) Trùng gần nguyên văn với đoạn mở đầu
  const g = _dedupeByGrams(src);
  if (g.length < src.length) return g;
  // (3) Bản viết lại chỉ DIỄN ĐẠT LẠI (khác câu chữ nhưng cùng diễn biến), dính liền hoặc cách dòng
  const paras = _splitParas(src);
  const cut = _findRestartIndex(paras, 3, 0.5, 6);
  if (cut > 0) {
    const head = paras.slice(0, cut).join("\n\n"), tail = paras.slice(cut).join("\n\n");
    return (!endsCleanly(head) && endsCleanly(tail) && countWords(tail) >= countWords(head) * 0.8) ? tail : head;
  }
  return src.length < raw.length ? src : raw;
}
// Với lượt viết tiếp: bỏ các đoạn mở đầu lặp lại nội dung đã có. Trả "" nếu toàn bộ là lặp.
// V14.0.8: bỏ RIÊNG các đoạn của phần mới mà gần như trùng nguyên văn với văn bản đã có (model mở đầu lại cùng một cảnh),
// GIỮ các đoạn mới còn lại — khác dropRestartedContinuation (cắt toàn bộ từ chỗ lặp đầu tiên trở đi).
function dropRepeatedParagraphs(baseText, newText) {
  const baseG = _grams(_normWords(String(baseText || "")), 3);
  const paras = String(newText || "").split(/\n\s*\n+|\n/).map(p => p.trim()).filter(Boolean);
  const kept = paras.filter(p => { const w = _normWords(p); return w.length < 8 || _sim(_grams(w, 3), baseG) < 0.7; });
  return kept.join("\n\n");
}

// V14.0.9: dedupeRepeatedScene được viết cho trường hợp model xuất LẠI cả chương (cắt từ chỗ lặp trở đi, mất tới ~50%).
// Với chương Adaptive do code tự ghép scene, chỉ vài đoạn lặp lẻ cũng có thể khiến nó cắt cụt 3.000+ từ ("tụt" xuống ~4.100/3.400 từ).
// Bản an toàn: nếu cắt mất > 20% số từ thì GIỮ NGUYÊN (đoạn lặp lẻ đã được dropRepeatedParagraphs xử lý ở từng scene).
function safeDedupeRepeatedScene(text, minKeep) {
  const src = String(text || ""), d = dedupeRepeatedScene(src);
  if (d.length >= src.length) return src;
  return countWords(d) >= countWords(src) * (minKeep || 0.8) ? d : src;
}

function dropRestartedContinuation(baseText, contText) {
  const base = String(baseText || ""); let cont = String(contText || "").trim();
  if (!cont) return cont;
  // V12.22b: bản viết tiếp mở đầu bằng nhãn TIÊU ĐỀ/NỘI DUNG = model viết lại cả chương -> bỏ nhãn rồi để các bước dưới lọc phần lặp.
  const sg = splitByInnerLabels(cont); if (sg.length) cont = sg.join("\n\n");
  const baseG = _grams(_normWords(base), 3);
  const paras = cont.split(/\n\s*\n+|\n/).map(p => p.trim()).filter(Boolean);
  let cut = paras.length;
  for (let i = 0; i < paras.length; i++) {
    const w = _normWords(paras[i]); if (w.length < 15) continue;
    if (_sim(_grams(w, 3), baseG) >= 0.7) { cut = i; break; }
  }
  let out = paras.slice(0, cut);
  // V12.22b: phần viết tiếp diễn đạt lại nội dung đã có (không trùng nguyên văn) -> cắt từ chỗ lặp
  if (out.length >= 3) {
    const bp = _splitParas(base);
    if (bp.length >= 3) {
      const all = bp.concat(out), r = _findRestartIndex(all, bp.length, 0.5, 4);
      if (r >= bp.length) out = out.slice(0, r - bp.length);
    }
  }
  return out.join("\n\n");
}
const _VN_OK = new Set(["sedan","neon","email","wifi","online","offline","game","app","video","office","laptop","zalo","facebook","youtube","internet","tiktok","inbox","mail","file","link","logo","menu","poster","taxi","radio","karaoke","video","casino","hotel","studio","check","deadline","ceo","kpi","vip","boss","sexy","show","team","sale","sales","manager","ipad","iphone","macbook","google","zoom","slack","excel","word","pdf","silicon","latex","titan","inox","laser","camera","remote","vibrator","plug","cuff","temp","lock","sexy","porn","sms","wifi","bluetooth","smartphone","selfie","livestream","hashtag","comment","story","stress","stalker","vest","blazer","jacket","cardigan","sandal","jeans","shorts","bikini","lingerie","corset","sofa","mascara","vecni","lipstick","gloss","lotion","serum","shampoo","parfum","spa","massage","gym","yoga","pilates","sandwich","burger","pizza","coffee","latte","cappuccino","cocktail","whisky","vodka","chanel","dior","gucci","prada","hermes","versace","nike","adidas","lelo","durex","kindle","netflix","spotify","messenger","instagram","iphone","android","samsung","alô","alo","hello","okay","bye","café","cafe","bar","pub","resort","menu","blouse","boxer","ballet","salon","shop","box","stylist","designer","leader","model","manager","outfit","style","cocktail"]);
const _VN_SYL = /^(ngh|ng|nh|kh|gh|gi|ph|qu|th|tr|ch|[bcdghklmnpqrstvx])?[aeiouy]{1,3}(ng|nh|ch|[cmnpt])?$/;
// V12.19: tiếng cười/hét/thở/tượng thanh viết bằng chữ không dấu (Aaaa, hahaha, hihi, hmmm, shhh...) KHÔNG phải từ lạ.
const _VN_SFX_RUN = /(.)\1{2,}/i;                                   // aaaa, ahhh, hmmm, shhh, ooooh
const _VN_SFX_LAUGH = /^[aeiou]?([hk][aeiou])\1+h?$/i;               // hahaha, hihi, hehe, huhuhu, kekeke, ahaha
const _VN_SFX_WORD = /^(?:h+m+|sh+|ps+t+|ts+k+|gr+|zz+z*|uh+m*|ah+|oh+|eh+)$/i;
function _isSoundEffect(low) { return _VN_SFX_RUN.test(low) || _VN_SFX_LAUGH.test(low) || _VN_SFX_WORD.test(low); }
// V12.19: bằng chứng đổi hồ sơ (thăng chức...) phải TRÍCH từ chính chương: >=70% từ của bằng chứng có trong văn bản nguồn.
function evidenceInText(evidence, text) {
  const ev = _normWords(String(evidence || "")).filter(w => w.length >= 2);
  if (ev.length < 3) return false;
  const have = new Set(_normWords(String(text || "")));
  let hit = 0; ev.forEach(w => { if (have.has(w)) hit++; });
  return hit / ev.length >= 0.7;
}
// V12.30: bằng chứng phải hỗ trợ chính giá trị được đề xuất, không chỉ là một câu bất kỳ trong chương.
function evidenceSupportsValue(value, evidence, threshold = 0.55) {
  const stop = new Set(["va","la","cua","cho","voi","mot","nhung","cac","da","dang","se","thi","ma","nay","do","kia","duoc","bi","boi","tai","trong","ngoai","tren","duoi","den","tu","rat","hon","nhu","khi","neu","vi","sau","truoc","roi","con","cung","khong","co","ban"]);
  const words = _normWords(String(value || "")).filter(w => w.length >= 2 && !stop.has(w));
  const ev = new Set(_normWords(String(evidence || "")).filter(w => w.length >= 2));
  if (!words.length || !ev.size) return false;
  const uniq = [...new Set(words)];
  let hit = 0; uniq.forEach(w => { if (ev.has(w)) hit++; });
  return hit / uniq.length >= Math.max(0, Math.min(1, Number(threshold) || 0.55));
}
/* V14.7.25: AI thường chỉ đưa MỘT câu trích chung cho cả nhân vật (về sự kiện), không đưa câu trích riêng cho từng trường. Giá trị ngoại hình/tuổi/nghề... nằm ở câu khác nên cổng
   "từ khóa giá trị ⊂ câu trích chung" loại hết → thẻ nhân vật tạo ra rỗng dù Current Status mô tả rất đủ. Cổng bổ sung: giá trị được chấp nhận nếu phần lớn từ khóa (và MỌI con số) có thật trong chương. */
let _chapterWordCache = { src: null, set: null };
function chapterCoverageSupports(value, source, min) {
  const v = String(value || "").trim(), src = String(source || ""); if (!v || !src) return false;
  if ((v.match(/\d+/g) || []).some(n => !src.includes(n))) return false;   // số (tuổi, số đo) phải có đúng trong chương
  if (_chapterWordCache.src !== src) _chapterWordCache = { src, set: new Set(_normWords(src)) };
  const stop = new Set(["va","la","cua","cho","voi","mot","nhung","cac","da","dang","se","thi","ma","nay","do","kia","duoc","bi","boi","tai","trong","ngoai","tren","duoi","den","tu","rat","hon","nhu","khi","neu","vi","nen","de","co","khong","cung","van"]);
  const words = [...new Set(_normWords(v).filter(w => w.length >= 2 && !stop.has(w)))]; if (!words.length) return false;
  let hit = 0; words.forEach(w => { if (_chapterWordCache.set.has(w)) hit++; });
  return hit / words.length >= (min || 0.6);
}
function fieldSupportedInChapter(value, evidence, source, threshold) {
  return fieldEvidenceSupports(value, evidence, source, threshold) || chapterCoverageSupports(value, source);
}
/* V14.7.19: trường DIỄN GIẢI (vai trò, quan hệ, ranh giới, sở thích 18+...) là tóm tắt/nhận định của AI — từ ngữ gần như không trùng câu trích, nên cổng so khớp từ khóa làm rụng gần hết. Với nhóm này chỉ cần câu trích là câu THẬT trong chương. */
/* V14.7.22: trạng thái thread là TỪ KHÓA (seeded/developing/...), không thể "có mặt trong câu trích" → cổng so từ khóa luôn xóa nó, thread kẹt ở "seeded". Chuẩn hóa về tập hợp hợp lệ. */
const THREAD_STATUSES = ["seeded", "developing", "blocked", "resolved", "paid_off", "abandoned"];
function normalizeThreadStatus(v) {
  const n = normalizeName(v).replace(/đ/g, "d").replace(/[^a-z_ ]/g, " ").replace(/\s+/g, " ").trim(); if (!n) return "";
  const key = n.replace(/ /g, "_"); if (THREAD_STATUSES.includes(key)) return key;
  if (/phat trien|dang dien ra|tiep dien|leo thang|developing|progress/.test(n)) return "developing";
  if (/da giai quyet|giai quyet xong|khep lai|hoan tat|completed|resolved/.test(n)) return "resolved";
  if (/tra gia|hoi thanh|paid off|payoff/.test(n)) return "paid_off";
  if (/bi chan|tam hoan|tre|blocked|stalled/.test(n)) return "blocked";
  if (/bo ngo|huy bo|abandon/.test(n)) return "abandoned";
  if (/gieo|moi mo|seed/.test(n)) return "seeded";
  return "";
}
/* V14.7.24: mở rộng sang các trường TÂM LÝ / DIỄN BIẾN (tính cách, mục tiêu, điểm yếu, nỗi sợ, hiểu biết, sự kiện của NV trong chương, trạng thái tâm lý/thể chất) — nhân vật chủ yếu xuất hiện trong cảnh nội tâm/quan hệ có giá trị trừu tượng nên bị cổng từ khóa loại. Trường cụ thể (tuổi, giới, nghề, chức vụ, phe, ngoại hình, vị trí) vẫn dùng cổng từ khóa. */
const INTERPRETIVE_CHAR_FIELDS = ["role", "relevanceToMC", "sexualExperience", "boundaries", "taboos", "preferences", "attractionToMC", "tensionWithMC", "consentNotes", "personality", "goals", "weakness", "fear", "knowledge", "chapterEvent", "independentPlot", "strength", "mentalState", "physicalState"];
function fieldQuoteSupports(value, evidence, source) {
  return !!String(value || "").trim() && !!String(evidence || "").trim() && evidenceInText(evidence, source);
}
function fieldEvidenceSupports(value, evidence, source, threshold = 0.55) {
  return !!String(value || "").trim() && !!String(evidence || "").trim()
    && evidenceInText(evidence, source)
    && evidenceSupportsValue(value, evidence, threshold);
}
// V12.20: kiểm tra một âm tiết tiếng Việt hợp lệ (bỏ dấu thanh, giữ ă â ê ô ơ ư đ). Bắt lỗi kiểu "mươititude", "bănnton", "bọcampo".
const _VN_SYL_FULL = /^(?:ngh|ng|nh|kh|gh|gi|ph|qu|th|tr|ch|[bcdđghklmnpqrstvx])?[aăâeêioôơuưy]{1,3}(?:ng|nh|ch|[cmnpt])?$/;
function _stripToneMarks(s) { return String(s).normalize("NFD").replace(/[\u0300\u0301\u0303\u0309\u0323]/g, "").normalize("NFC"); }
function _isValidVnSyllable(low) { return _VN_SYL_FULL.test(_stripToneMarks(low)); }
function _hasVnDiacritic(t) { return /[ăâêôơưđàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i.test(t); }
// V12.46: Semantic Prose Check — kiểm tra cụm tiếng Việt hợp lệ về mặt ký tự
// nhưng vô nghĩa/sai chính tả theo ngữ cảnh (ví dụ "tớn tiền"). Không tự đoán
// bằng từ điển: AI phải trả cụm nguyên văn + câu nguyên văn để có thể vá hẹp.
function splitSemanticSentences(text, maxChars) {
  const src = String(text || ""), cap = Number(maxChars) || 900;
  const out = []; let re = /[^\n.!?…]+(?:[.!?…]+|$)/gu, m;
  while ((m = re.exec(src))) {
    const raw = m[0], left = raw.search(/\S/); if (left < 0) continue;
    const right = raw.trimEnd().length, sentence = raw.slice(left, right);
    if (!sentence || sentence.length < 8) continue;
    out.push({ id: out.length + 1, sentence: sentence.slice(0, cap), start: m.index + left, end: m.index + left + Math.min(sentence.length, cap) });
  }
  return out;
}
function buildSemanticProseCheckPrompt(sentences) {
  const rows = (sentences || []).map(x => String(x.sentence || "").replace(/\r?\n/g, " ") ? (x.id + "|" + String(x.sentence || "").replace(/\r?\n/g, " ")) : "").filter(Boolean);
  return [
    "===== SEMANTIC PROSE CHECK — KHÔNG VIẾT LẠI CẢ CHƯƠNG =====",
    "Bạn là biên tập viên kiểm tra NGỮ NGHĨA văn xuôi tiếng Việt.",
    "Rà từng câu dưới đây để tìm CỤM TỪ rõ ràng vô nghĩa, sai chính tả theo ngữ cảnh hoặc bị ghép nhầm âm tiết, kể cả khi từng từ riêng lẻ đều là tiếng Việt.",
    "Ví dụ lỗi: ‘tớn tiền’ trong ngữ cảnh chi phí có thể phải là ‘tốn tiền’. Không được bắt lỗi chỉ vì văn phong lạ, từ địa phương, tên riêng, thuật ngữ, khẩu ngữ hoặc nội dung 18+ hợp ngữ cảnh.",
    "Mỗi câu chỉ được tối đa một mục. Nếu không chắc ít nhất 85%, dùng status=uncertain; không đề xuất sửa chắc chắn.",
    "CHỈ trả JSON hợp lệ dạng: {\"items\":[{\"id\":1,\"status\":\"fix|uncertain|ok\",\"phrase\":\"cụm nguyên văn\",\"replacement\":\"cụm thay thế\",\"confidence\":0.0,\"reason\":\"ngắn\"}]}",
    "Với status=ok, phrase/replacement để chuỗi rỗng. Với uncertain, replacement có thể để rỗng hoặc chỉ là gợi ý; ứng dụng sẽ KHÔNG tự thay.",
    "Không viết lại cả câu, không giải thích ngoài JSON.", "", rows.join("\n")
  ].join("\n");
}
function parseSemanticProseCheckResponse(raw) {
  let s = String(raw || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(), obj = null;
  try { obj = JSON.parse(s); } catch (_) {
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) { try { obj = JSON.parse(s.slice(a, b + 1)); } catch (_) {} }
  }
  const items = obj && Array.isArray(obj.items) ? obj.items : [];
  return items.map(x => ({
    id: Number(x && x.id), status: /^(fix|uncertain|ok)$/i.test(String(x && x.status)) ? String(x.status).toLowerCase() : "uncertain",
    phrase: String(x && x.phrase || "").trim(), replacement: String(x && x.replacement || "").trim(),
    confidence: Math.max(0, Math.min(1, Number(x && x.confidence) || 0)), reason: String(x && x.reason || "").trim()
  })).filter(x => Number.isInteger(x.id) && x.id > 0);
}
function applySemanticProseFixes(text, sentences, items, minConfidence) {
  let out = String(text || ""); const warnings = [], applied = [];
  const byId = new Map((sentences || []).map(x => [Number(x.id), x]));
  const ops = [];
  const normPhrase = s => String(s || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("vi");
  const isFragment = s => {
    const v = String(s || "").trim(), words = v.split(/\s+/).filter(Boolean);
    return v.length < 4 || (words.length === 2 && words.every(w => w.replace(/[^\p{L}]/gu, "").length <= 3));
  };
  (items || []).forEach(x => {
    const row = byId.get(Number(x.id));
    if (!row || x.status === "ok") return;
    // Không hiển thị/ghi nhận các phản hồi vô tác dụng hoặc mảnh từ do AI cắt sai.
    if (isFragment(x.phrase)) return;
    if (normPhrase(x.phrase) === normPhrase(x.replacement)) return;
    if (x.status !== "fix" || Number(x.confidence) < (Number(minConfidence) || 0.85) || !x.phrase || !x.replacement) {
      warnings.push({ id: x.id, phrase: x.phrase, reason: x.reason || "AI không đủ chắc chắn; cần người dùng chọn" }); return;
    }
    const at = row.sentence.indexOf(x.phrase);
    if (at < 0 || /[\r\n]/.test(x.replacement) || x.replacement.length > Math.max(80, x.phrase.length * 4)) {
      warnings.push({ id: x.id, phrase: x.phrase, reason: "Không khớp nguyên văn nên không tự sửa" }); return;
    }
    ops.push({ start: row.start + at, end: row.start + at + x.phrase.length, replacement: x.replacement, id: x.id, phrase: x.phrase });
  });
  ops.sort((a, b) => b.start - a.start).forEach(op => { out = out.slice(0, op.start) + op.replacement + out.slice(op.end); applied.push({ id: op.id, phrase: op.phrase, replacement: op.replacement }); });
  return { text: out, applied: applied.reverse(), warnings };
}
// Liệt kê từ lạ (không phải âm tiết tiếng Việt) chen trong văn bản. Chỉ để cảnh báo / làm đầu vào cho bước tự sửa.
// V12.20: bắt cả từ CÓ DẤU bị ghép lỗi (mươititude, bănnton, bọcampo); trước đây chỉ bắt từ không dấu.
const _LOANWORD_OK = new Set(['mini','micro','notebook','laptop','router','switch','robot','analog','digital','decibel','drap','vest','wifi','internet','online','offline','email','camera','video','radio','taxi','menu','game','show','shop','test','app','sim','usb','pin','tivi','karaoke','cà']);
function findStrayWords(text, allowNames, limit) {
  const out = []; const seen = new Set(); const max = Number(limit) || 12;
  const allow = new Set(_normWords((allowNames || []).join(" ")).map(w => w.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
  const allowExact = new Set(_normWords((allowNames || []).join(" ")));
  const toks = String(text || "").match(/\p{L}+/gu) || [];
  /* V14.3.5: "de" (pinyin 的/得/地) và "then" (tiếng Anh "rồi/sau đó") rò vào truyện. "de" < 4 chữ cái nên bị bỏ qua; "then" là âm tiết Việt hợp lệ ("then cài") nên bị coi là đúng. */
  { const src = String(text || "");
    if (!allow.has("de") && /(?<![\p{L}\p{N}])de(?![\p{L}\p{N}])/u.test(src)) { out.push("de"); seen.add("de"); }
    if (!allow.has("then") && out.length < max) {
      for (const m of src.matchAll(/(?<![\p{L}\p{N}])then(?![\p{L}\p{N}])/gu)) {
        const after = src.slice(m.index + 4, m.index + 24), before = src.slice(Math.max(0, m.index - 14), m.index);
        if (/^[ \t]+(?:cài|cửa|chốt|ngang|gài|sắt|máy|khóa|gỗ|tre)(?![\p{L}])/u.test(after) || /(?:cái|chiếc|đóng|cài|gài|chốt|cửa|vặn)[ \t]+$/u.test(before)) continue;
        out.push("then"); seen.add("then"); break;
      }
    }
  }
  for (const t of toks) {
    const low = t.toLowerCase();
    if (seen.has(low)) continue;
    if (_LOANWORD_OK.has(low)) continue; // V14.3.8: từ vay mượn thông dụng trong tiếng Việt hiện đại (robot, router, notebook, mini...)
    if (/^[A-Za-z]+$/.test(t)) {
      if (t.length < 4) continue;
      if (_VN_OK.has(low) || _VN_SYL.test(low) || _isSoundEffect(low) || allow.has(low)) continue;
    } else {
      // Có dấu tiếng Việt: hợp lệ nếu là một âm tiết đúng cấu trúc. Chữ cái ngoài bảng chữ cái Việt (ü, ñ...) bỏ qua.
      if (t.length < 3 || !/^[\p{Script=Latin}]+$/u.test(t) || !_hasVnDiacritic(t)) continue;
      if (/[^a-zA-ZăâêôơưđĂÂÊÔƠƯĐàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵÀÁẢÃẠẰẮẲẴẶẦẤẨẪẬÈÉẺẼẸỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌỒỐỔỖỘỜỚỞỠỢÙÚỦŨỤỪỨỬỮỰỲÝỶỸỴ]/.test(t)) continue;
      if (_isValidVnSyllable(low) || _VN_OK.has(low) || allowExact.has(low) || allow.has(low.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) continue;
    }
    seen.add(low); out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

// V12.20: tìm câu chứa từng từ lỗi để gửi AI sửa. Trả mảng { word, start, end, sentence, before } (không chồng lấn, theo thứ tự xuất hiện).
function locateWordSentences(text, words) {
  const src = String(text || ""); const found = [];
  const isL = (ch) => !!ch && /\p{L}/u.test(ch);
  for (const w of words || []) {
    let from = 0;
    while (from < src.length) {
      const i = src.indexOf(w, from); if (i < 0) break;
      from = i + w.length;
      if (isL(src[i - 1]) || isL(src[i + w.length])) continue;
      let a = i; while (a > 0 && !/[.!?…\n]/.test(src[a - 1])) a--;
      let b = i + w.length; while (b < src.length && !/[.!?…\n]/.test(src[b])) b++;
      while (b < src.length && /[.!?…”"’')]/.test(src[b]) && src[b] !== "\n") b++;
      const sentence = src.slice(a, b).replace(/^\s+/, ""); const start = b - sentence.length;
      found.push({ word: w, start, end: b, sentence, before: src.slice(Math.max(0, start - 160), start).replace(/\s+/g, " ").trim() });
      break; // mỗi từ lỗi xử lý lần xuất hiện đầu tiên; các lần sau sẽ được quét lại ở vòng kế
    }
  }
  found.sort((x, y) => x.start - y.start);
  const out = []; let lastEnd = -1;
  for (const f of found) { if (f.start < lastEnd) { out[out.length - 1].extra = (out[out.length - 1].extra || []).concat(f.word); continue; } out.push(f); lastEnd = f.end; }
  return out;
}

// V12.20: câu sửa của AI chỉ được nhận nếu bỏ từ lỗi, độ dài gần câu gốc, và giữ phần lớn các từ còn lại.
function acceptWordFix(orig, fixed, badWords) {
  const f = String(fixed || "").trim(), o = String(orig || "").trim();
  if (!f || f.length < 8) return false;
  for (const w of badWords || []) if (f.includes(w)) return false;
  if (/[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0400-\u04FF]/.test(f)) return false;
  const ow = _normWords(o), fw = _normWords(f);
  if (Math.abs(ow.length - fw.length) > 6 || f.length > o.length * 1.5 + 20) return false;
  const bad = new Set((badWords || []).map(w => _normWords(w)[0]));
  const keep = ow.filter(w => !bad.has(w)); if (!keep.length) return true;
  const have = new Set(fw); let hit = 0; keep.forEach(w => { if (have.has(w)) hit++; });
  return hit / keep.length >= 0.7;
}

// V12.20: câu cuối đã kết thúc đúng cách chưa (. ! ? … có thể kèm ngoặc/nháy đóng).
function endsCleanly(text) {
  const t = String(text || "").replace(/[\s*_]+$/, "");
  if (!t) return true;
  return /[.!?…][”"’')\]）»]*$/.test(t) || /[—–]$/.test(t);
}
// V12.20: lùi về câu hoàn chỉnh gần nhất. Giữ lại ít nhất minRatio độ dài; nếu không có chỗ cắt hợp lý thì trả nguyên.
function trimToLastSentence(text, minRatio) {
  const t = String(text || "").replace(/\s+$/, "");
  if (endsCleanly(t)) return { text: t, cut: false };
  const re = /[.!?…][”"’')\]）»]*(?=\s|$)/g; let m, last = -1;
  while ((m = re.exec(t))) last = m.index + m[0].length;
  if (last < 0 || last < t.length * (minRatio || 0.6)) return { text: t, cut: false };
  return { text: t.slice(0, last).replace(/\s+$/, ""), cut: true };
}
// V12.20: lấy "cú chốt / kết chương" mà người dùng ghi trong gợi ý/mệnh lệnh (để nhắc AI dừng đúng chỗ và để khép chương khi bị cụt).
function extractClosingBeat(text) {
  const src = String(text || ""); if (!src.trim()) return "";
  const re = /(ending\s*anchor|điểm\s*neo\s*kết|anchor\s*kết|cú chốt|câu chốt|chốt chương|chốt cuối|kết thúc chương|kết chương|kết bằng|khép chương|cliffhanger)/i;
  const lines = src.split(/\n+/).map(x => x.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) if (re.test(lines[i])) return lines[i].slice(0, 500);
  const sents = src.split(/(?<=[.!?…])\s+/);
  for (let i = sents.length - 1; i >= 0; i--) if (re.test(sents[i])) return sents.slice(i).join(" ").slice(0, 500);
  return "";
}

// V12.24: ENDING-ANCHOR GATE — không coi "đủ số từ" là đã hoàn thành nếu brief còn mốc kết chưa tới.
function extractEndingAnchor(text) {
  const src = String(text || "").trim();
  if (!src) return "";
  const explicit = extractClosingBeat(src);
  if (explicit) return explicit.replace(/^\s*(?:ending\s*anchor|điểm\s*neo\s*kết|anchor\s*kết|cú chốt|câu chốt|chốt chương|chốt cuối|kết thúc chương|kết chương|kết bằng|khép chương|cliffhanger)\s*[:：-]?\s*/i, "").trim();
  const lines = src.split(/\n+/).map(x => x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean);
  const candidates = lines.filter(x => x.length >= 30 && !/^(?:gợi ý|mệnh lệnh|outline|chapter outline|arc manager)\s*[:：]?$/i.test(x));
  return candidates.length ? candidates[candidates.length - 1].slice(0, 500) : "";
}

// V12.28.3: giữ helper Ending Target ở SHARED-CORE để client và worker luôn đồng bộ.
// Ưu tiên Ending Anchor trong GỢI Ý; nếu không có thì dùng MỆNH LỆNH.
function getEndingTarget(hint, directive) {
  const h = extractEndingAnchor(hint);
  if (h) return h;
  return extractEndingAnchor(directive);
}
function _anchorTokens(s) {
  const stop = new Set(["chương","kết","cuối","sau","trước","đến","rồi","và","là","của","cho","một","những","được","trong","với","này","đó","khi","thì","cũng","đã","sẽ","có","về","theo","nhưng","nếu","vào","ra","từ","tại","mà","lại","để","anh","cô","hắn","nàng","hắn","người"]);
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w => w.length >= 3 && !stop.has(w));
}
function endingAnchorReached(text, anchor) {
  const cleanAnchor = String(anchor || "").replace(/^\s*(?:ending\s*anchor|điểm\s*neo\s*kết|anchor\s*kết|cú chốt|câu chốt|chốt chương|chốt cuối|kết thúc chương|kết chương|kết bằng|khép chương|cliffhanger)\s*[:：-]?\s*/i, "");
  const a = _anchorTokens(cleanAnchor);
  if (a.length < 3) return false;
  const full = new Set(_anchorTokens(text));
  const tail = new Set(_anchorTokens(String(text || "").slice(-3500)));
  const hitFull = a.filter(w => full.has(w)).length / a.length;
  const hitTail = a.filter(w => tail.has(w)).length / a.length;
  // Ưu tiên đoạn cuối: một anchor được "đạt" khi các từ khóa cốt lõi đã xuất hiện và đang nằm trong đoạn kết.
  return hitTail >= 0.72 || (hitTail >= 0.58 && hitFull >= 0.82);
}
function endingGateInstruction(anchor) {
  return anchor ? [
    "===== ENDING ANCHOR / ĐIỂM KẾT BẮT BUỘC =====",
    anchor,
    "Đây là MỐC KẾT của chương, không phải gợi ý tùy chọn.",
    "Không được dừng chỉ vì đã đạt số từ. Nếu đoạn hiện tại CHƯA thực hiện mốc này, phải viết tiếp liền mạch cho tới khi hoàn thành mốc.",
    "Được kéo dài các diễn biến đang có bằng cảnh, thoại, nội tâm, phản ứng, chuyển tiếp và hệ quả; CẤM mở arc mới hoặc thêm biến cố lớn chỉ để đủ từ.",
    "Ngay sau khi thực hiện xong mốc kết này thì DỪNG HẲN, không viết thêm hậu cảnh."
  ].join("\n") : "";
}

// ===== V12.17: Quality Gate — phần THUẦN (không gọi AI, không đụng DOM/state toàn cục) =====
// Client và worker cùng dùng các hàm này; phần gọi AI / dựng prompt vẫn nằm riêng ở từng nơi.
const GATE_MAX_ATTEMPTS = 5;          // tối đa số lần chấm (và sửa) cho một chương (V12.32.12: 3 → 5)
const GATE_DEFAULT_ATTEMPTS = 5;     // mặc định; giá trị lưu cũ = 3 (mặc định cũ, không có ô chỉnh trên giao diện) cũng được nâng lên 5
const GATE_MAX_VERSIONS = 3;          // số bản gốc giữ lại trong chapter.versions
const GATE_MIN_REWRITE_RATIO = 0.6;   // bản sửa ngắn hơn 60% bản gốc bị từ chối

function gateItemText(x) { return typeof x === "string" ? x : ((x && (x.description || x.problem)) || JSON.stringify(x)); }

function gateMaxAttempts(v) { const n = Number(v); const eff = (!n || n === 3) ? GATE_DEFAULT_ATTEMPTS : n; return Math.max(1, Math.min(GATE_MAX_ATTEMPTS, eff)); }

// V14.1.5: lỗi cảnh chỉ là THIẾU CÂU CHUYỂN CẢNH (nhảy địa điểm/thời gian) hay là NGƯỜI VẮNG MẶT nói/làm? Chỉ loại thứ hai mới là lỗi nặng.
function sceneTransitionOnly(text) {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return false;
  const transition = /chuyển cảnh|đột ngột|không có (câu|mô tả)|không có dòng|thiếu (câu|mô tả)|nhảy (từ|sang|địa điểm|thời gian)|không (rõ|thấy) (cách|việc) (di chuyển|đến)|xuất hiện (ở|tại|trong)/.test(t);
  const absent = /không có mặt|đã rời (đi|khỏi cảnh)|đã đi khỏi|đã cúp máy|đã bị đưa đi|lời thoại[^|]{0,40}(cảnh cũ|lẫn)|(nói|trả lời|phản ứng|lên tiếng|chen vào)[^|]{0,60}(khi|dù|lúc)[^|]{0,40}(không có mặt|đã rời|chưa (đến|tới)|vắng)/.test(t);
  return transition && !absent;
}
// Chuẩn hoá kết quả Auditor → review có verdict cuối cùng. Trả null nếu obj không phải object JSON.
// opts: { maxMainEvents, maxNamedCharacters, passScore, softFailScore, extraHard: string[], now }
/* V14.5.14: Auditor hay nhét NHẬN XÉT "KHÔNG CÓ LỖI" vào danh sách lỗi ("… nên không phải lỗi continuity", "hợp lý", "đúng trình tự", "đã đúng"). Các dòng đó vào luồng AI tự sửa
   làm model sửa nhầm chỗ đang đúng. Chỉ bỏ dòng có kết luận "không lỗi" VÀ không chứa từ chỉ lỗi thật (thiếu/sai/mâu thuẫn/lặp/…), nên dòng lỗi thật không bị nuốt. */
function isNoopAuditNote(text) {
  const t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return false;
  const ok = /(không phải (?:là )?(?:một )?lỗi|không (?:có )?lỗi|không có vấn đề|không cần sửa|hợp lý|đúng trình tự|đã đúng|đúng như outline|đạt yêu cầu|nên không phải)/.test(t);
  if (!ok) return false;
  const bad = /(không hợp lý|bất hợp lý|chưa hợp lý|không đúng|chưa đúng|không đạt|sai lệch|trái |thiếu|sai |sai\.|mâu thuẫn|vi phạm|bỏ sót|bị lặp|lặp lại|nhầm|không khớp|chưa (?:thấy|có|viết|thực hiện|rõ)|thừa|lỗi nặng|nên (?:sửa|thêm|bổ sung|viết lại)|cần (?:sửa|thêm|bổ sung|viết lại))/.test(t);
  return !bad;
}
function evaluateReview(obj, opts) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  opts = opts || {};
  const maxEv = Number(opts.maxMainEvents) || 3, maxCh = Number(opts.maxNamedCharacters) || 6;
  const passScore = Number(opts.passScore) || 90, softScore = Number(opts.softFailScore) || 75;
  const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
  // Một số Auditor đặt câu kiểm tra đạt vào hardFailures dù đây không phải lỗi.
  // Không để dòng "Không có lỗi continuity mức cao..." làm nhiễu Gate/UI.
  const hard = arr(obj.hardFailures, 20).filter(x => !/^\s*Không có lỗi continuity mức cao/i.test(gateItemText(x)) && !isNoopAuditNote(gateItemText(x)));
  const noiseDropped = (Array.isArray(obj.warnings) ? obj.warnings.slice(0, 20) : []).filter(x => isNoopAuditNote(gateItemText(x))).length + (Array.isArray(obj.hardFailures) ? obj.hardFailures.slice(0, 20).length : 0) - hard.length;
  /* V14.5.9: AI Auditor hay báo "Thiếu sự kiện/beat bắt buộc" dù chương đã viết ý đó bằng câu chữ khác -> chỉ CẢNH BÁO, không HARD_FAIL
     (viết lại không hết lỗi). Bật lại chặn cứng bằng opts.strictBeats. */
  const beatWarn = [];
  if (!opts.strictBeats) {
    const isMissingBeat = x => /(thiếu|chưa (?:thấy|thực hiện|có|viết)|bỏ sót|không (?:có|thấy)).{0,60}(sự kiện|beat|\[R\d|mốc|ý của outline)|(sự kiện|beat|\[R\d).{0,60}(bắt buộc|còn thiếu|thiếu bằng chứng)|Outline chương \d+ chưa thực hiện đủ/i.test(gateItemText(x));
    for (let i = hard.length - 1; i >= 0; i--) if (isMissingBeat(hard[i])) beatWarn.unshift(gateItemText(hard.splice(i, 1)[0]));
  }
  (opts.extraHard || []).forEach(m => hard.push(m));
  if (Number(obj.mainEventCount) > maxEv) hard.push("Vượt ngân sách sự kiện: " + obj.mainEventCount + " > " + maxEv);
  if (Number(obj.namedCharacterCount) > maxCh) hard.push("Vượt số nhân vật có tên: " + obj.namedCharacterCount + " > " + maxCh);
  if (obj.unauthorizedImportantCharacter) hard.push("Có nhân vật mới quan trọng không được outline/brief cho phép.");
  if (obj.knowledgeViolation) hard.push("Vi phạm Knowledge Ledger / nhân vật biết thông tin chưa thể biết.");
  if (obj.retcon) hard.push("Có dấu hiệu retcon canon đã xác nhận.");
  if (obj.stagnation) {
    const sn = (Array.isArray(obj.stagnationNotes) ? obj.stagnationNotes : []).slice(0, 2).map(x => typeof x === "string" ? x : (x && (x.description || x.problem)) || "").filter(Boolean).join(" | ");
    hard.push("Chương dậm chân tại chỗ: cảnh lặp/kéo dài, cuối chương không có thay đổi nào so với đầu chương" + (sn ? ": " + sn : "."));
  }
  if (obj.arcStall) {
    const an2 = (Array.isArray(obj.arcNotes) ? obj.arcNotes : []).slice(0, 2).map(x => typeof x === "string" ? x : (x && (x.description || x.problem)) || "").filter(Boolean).join(" | ");
    hard.push("Chương không đưa Arc/Outline tiến thêm bước nào (không làm việc bắt buộc của giai đoạn)" + (an2 ? ": " + an2 : "."));
  }
  const sceneWarn = [];
  if (obj.sceneViolation) {
    const sn2 = (Array.isArray(obj.sceneNotes) ? obj.sceneNotes : []).slice(0, 3).map(x => typeof x === "string" ? x : (x && (x.description || x.problem)) || "").filter(Boolean).join(" | ");
    // V14.1.5: Auditor hay ghi cùng một lỗi cảnh hai lần (một dòng "sceneViolation: ..." trong hardFailures + cờ sceneViolation) => chương bị đếm 2 lỗi nặng.
    const isSceneItem = x => /^\s*(sceneViolation\b|Lỗi cảnh\/người có mặt)/i.test(gateItemText(x));
    const sceneItems = hard.filter(isSceneItem).map(gateItemText);
    const sceneText = sceneItems.concat(sn2).join(" | ");
    for (let i = hard.length - 1; i >= 0; i--) if (isSceneItem(hard[i])) hard.splice(i, 1);
    // Chỉ thiếu câu chuyển cảnh/nhảy địa điểm (không có ai nói/làm khi vắng mặt) => cảnh báo, không phải lỗi nặng; viết lại bằng vá chèn câu chuyển cảnh.
    if (sceneTransitionOnly(sceneText)) sceneWarn.push("Thiếu câu chuyển cảnh (không có nhân vật nào nói/làm khi vắng mặt)" + (sceneText ? ": " + sceneText.replace(/^\s*sceneViolation:\s*/i, "").slice(0, 600) : "."));
    else hard.push("Lỗi cảnh/người có mặt: nhân vật tự xuất hiện hoặc nói khi không có mặt/đã rời đi, hoặc lẫn cảnh" + (sceneText ? ": " + sceneText.slice(0, 900) : "."));
  }
  if (obj.profileViolation) {
    const pv = (Array.isArray(obj.profileViolations) ? obj.profileViolations : []).slice(0, 3).map(x => typeof x === "string" ? x : (x && (x.description || x.problem)) || "").filter(Boolean).join(" | ");
    hard.push("Nhân vật hành xử/nói vượt thiết lập hồ sơ (địa vị, nghề, quyền hạn, năng lực, kiến thức, cách nói)" + (pv ? ": " + pv : "."));
  }
  if (obj.genderAnatomyMismatch) {
    const ga = (Array.isArray(obj.genderAnatomyNotes) ? obj.genderAnatomyNotes : []).slice(0, 3).map(x => typeof x === "string" ? x : (x && (x.description || x.problem || x.character)) || "").filter(Boolean).join(" | ");
    hard.push("Nhầm giải phẫu/đặc điểm sinh học giữa các giới theo hồ sơ nhân vật" + (ga ? ": " + ga : "."));
  }
  const timeWarn = [];
  /* V14.2: văn "liệt kê hành động" và kết chương không có móc chỉ là CẢNH BÁO mềm (không chặn Sync); dùng để gợi ý sửa/viết lại tay. */
  if (obj.listLikeProse) {
    const ln = (Array.isArray(obj.listLikeNotes) ? obj.listLikeNotes : []).slice(0, 2).map(x => typeof x === "string" ? x : (x && (x.description || x.problem)) || "").filter(Boolean).join(" | ");
    timeWarn.push("Văn như liệt kê hành động nối nhau, thiếu cảm xúc/quyền lực đan xen" + (ln ? ": " + ln : "."));
  }
  if (obj.weakHook) {
    const hn = (Array.isArray(obj.hookNotes) ? obj.hookNotes : []).slice(0, 2).map(x => typeof x === "string" ? x : (x && (x.description || x.problem)) || "").filter(Boolean).join(" | ");
    timeWarn.push("Kết chương chưa có móc (lệnh mới/nguy cơ bị phát hiện/ham muốn chưa thỏa/phụ thuộc hơn)" + (hn ? ": " + hn : "."));
  }
  if (obj.timeStagnation) {
    const tn = (Array.isArray(obj.timeNotes) ? obj.timeNotes : []).slice(0, 2).map(x => typeof x === "string" ? x : (x && (x.description || x.problem)) || "").filter(Boolean).join(" | ");
    timeWarn.push("Thời gian truyện bất nhất hoặc đứng yên" + (tn ? ": " + tn : "."));
  }
  if (obj.appearanceVague) {
    const an = (Array.isArray(obj.appearanceNotes) ? obj.appearanceNotes : []).slice(0, 3).map(x => typeof x === "string" ? x : (x && (x.description || x.name)) || "").filter(Boolean).join(" | ");
    timeWarn.push("Miêu tả ngoại hình chung chung, thiếu kích thước/chi tiết cụ thể" + (an ? ": " + an : "."));
  }
  const score = Math.max(0, Math.min(100, Number(obj.score) || 0));
  const verdict = hard.length ? "HARD_FAIL" : (score >= passScore ? "PASS" : (score >= softScore ? "SOFT_FAIL" : "HARD_FAIL"));
  return Object.assign({}, obj, {
    score, verdict, hardFailures: hard,
    dimensions: obj.dimensions && typeof obj.dimensions === "object" ? obj.dimensions : {},
    warnings: arr(obj.warnings, 20).filter(x => !isNoopAuditNote(gateItemText(x))).concat(beatWarn, sceneWarn, timeWarn, opts.extraWarnings || []), noiseDropped: Math.max(0, noiseDropped), suggestions: arr(obj.suggestions, 20), rewriteInstructions: arr(obj.rewriteInstructions, 12),
    reviewedAt: opts.now || Date.now()
  });
}

// Hướng sửa gửi cho Writer: ưu tiên rewriteInstructions, nếu trống thì dùng hardFailures.
function rewriteInstructionsText(review) {
  review = review || {};
  const ins = (review.rewriteInstructions || []).join("\n");
  return ins || (review.hardFailures || []).map(gateItemText).join("\n");
}

// Bản sửa có được phép thay bản thảo không? (không rỗng, không ngắn bất thường)
function checkRewriteAcceptable(oldWc, newText, newWc) {
  if (!String(newText || "").trim() || newWc < Math.max(20, Math.floor(oldWc * GATE_MIN_REWRITE_RATIO)))
    return { ok: false, reason: "Bản sửa quá ngắn/rỗng (" + newWc + " từ so với " + oldWc + ")" };
  return { ok: true };
}

// ===== V12.32.10: SỬA CỤC BỘ (patch) — AI chỉ trả các đoạn cần xoá/thêm/thay, app tự ghép vào bản thảo =====
// Lý do: viết lại cả chương dài thường bị cắt/tóm tắt (vd 1159/5309 từ) → Gate từ chối bản sửa. Vá cục bộ không có rủi ro đó.
const PATCH_MAX_COUNT = 12;            // tối đa số thao tác vá một lượt
const PATCH_MIN_RATIO = 0.6;           // sau vá, chương ngắn hơn 60% bản gốc bị từ chối
const PATCH_MAX_RATIO = 1.35;          // sau vá, chương dài hơn 135% bản gốc bị từ chối
function buildPatchPrompt(p) {
  p = p || {};
  const rv = p.review || {};
  return [
    "VÁ CỤC BỘ BẢN THẢO CHƯƠNG " + p.chapterNumber + " THEO QUALITY REVIEW.",
    "KHÔNG viết lại cả chương. Chỉ trả về danh sách thao tác nhỏ để app tự ghép vào bản thảo. Phần không nhắc đến sẽ được giữ nguyên 100%.",
    "Chỉ sửa đúng các lỗi được nêu. Không thêm sự kiện chính mới, không tạo nhân vật quan trọng mới. Giữ POV, xưng hô, giọng văn.",
    "ƯU TIÊN TUYỆT ĐỐI: OUTLINE/CONTRACT luôn thắng HƯỚNG SỬA. Bỏ qua mọi gợi ý nào xoá/thay/làm nhẹ beat, sự kiện hoặc lời thoại bắt buộc của Outline, hoặc thêm cảnh/tuyến ngoài Outline; chỉ áp dụng phần sửa cách viết, lặp, chuyển cảnh, thiếu beat.",
    p.storyControl || "",
    p.characterLock || "",
    (p.contractLabel || "OUTLINE/CONTRACT") + ":\n" + (p.contract || ""),
    p.context ? "CANON CONTEXT:\n" + compactGateContext(p.context, 6000, false) : "",
    p.prevEnding ? "ĐOẠN KẾT CHƯƠNG TRƯỚC (cảnh mở đầu chương này PHẢI nối tiếp đúng địa điểm / thời điểm / người có mặt ở đây — đây là sự thật, không được tự bịa địa điểm khác):\n" + String(p.prevEnding).slice(-1500) + unfinishedHotSceneNote(p.prevEnding) : "",
    (rv.alreadyFixed && rv.alreadyFixed.length) ? "LỖI ĐÃ SỬA Ở VÒNG TRƯỚC — GIỮ NGUYÊN các chỗ đã sửa, tuyệt đối không làm hỏng hoặc hoàn tác:\n- " + rv.alreadyFixed.join("\n- ") : "",
    "LỖI CẦN SỬA:\n" + (rv.hardFailures || []).concat((rv.warnings || []).slice(0, 8)).map(gateItemText).join("\n"),
    "HƯỚNG SỬA ƯU TIÊN (chỉ áp dụng phần KHÔNG mâu thuẫn Outline/Contract; mâu thuẫn thì Outline thắng):\n" + rewriteInstructionsText(rv),
    "ĐỊNH DẠNG TRẢ VỀ — CHỈ MỘT JSON, không markdown, không giải thích:",
    '{"patches":[{"op":"replace|delete|insert_after|insert_before|insert_before_end|insert_start|insert_end","find":"...","from":"...","to":"...","which":1,"text":"..."}]}',
    "QUY TẮC:",
    "- find / from / to: chép NGUYÊN VĂN từ bản thảo, 6–25 từ liên tiếp, nằm trong một đoạn. Không sửa dấu, không đổi dấu câu.",
    "- Xoá/thay một đoạn dài: dùng from (6–12 từ đầu đoạn) + to (6–12 từ cuối đoạn), không chép cả đoạn. Xoá/thay một câu ngắn: dùng find.",
    '- Nếu find/from xuất hiện nhiều lần (đoạn bị lặp), thêm which = số thứ tự lần xuất hiện cần tác động (1, 2, 3...) hoặc "last" cho lần cuối. Muốn xoá bản lặp ở cuối chương thì which = "last".',
    "- replace: thay đoạn tìm được bằng text. delete: xoá, không có text. insert_after / insert_before: chèn text (câu chuyển cảnh tự nhiên, chi tiết bổ sung…) sau/trước find. insert_before_end: chèn một cảnh còn thiếu ngay trước đoạn kết cuối cùng, KHÔNG cần find — ưu tiên dùng cho beat/biến cố Outline bị bỏ sót. insert_start / insert_end: chèn ở đầu / cuối chương, không cần find.",
    "- Nếu QUALITY REVIEW nói thiếu một beat/sự kiện bắt buộc nhưng không có câu neo chắc chắn, dùng insert_before_end thay vì bịa find. Cảnh mới phải nối tự nhiên với đoạn trước và không viết lại đoạn kết.",
    p.retryNote ? ("RETRY VÁ — lượt trước không ghép được patch. Với mọi [R] thiếu, BẮT BUỘC dùng insert_before_end có text là cảnh ngắn hoàn chỉnh; không dùng find [R1]/[R2] hoặc tên beat vì các mã đó thường không nằm trong bản thảo. Chỉ dùng replace/insert_after khi find là câu nguyên văn chắc chắn trong BẢN THẢO. Lý do lượt trước: " + p.retryNote) : "",
    "- text: văn xuôi tiếng Việt thuần, không đánh dấu, không ghi chú. Câu chuyển cảnh chỉ 1–3 câu.",
    p.prevEnding ? "- Khi sửa lỗi nối cảnh/địa điểm: đọc ĐOẠN KẾT CHƯƠNG TRƯỚC, rồi viết câu chuyển cảnh nối đúng từ chỗ đó vào cảnh mở đầu của bản thảo (ví dụ chương trước kết ở hành lang thì phải có hành động đi tiếp/mở cửa/bước vào trước khi tả cảnh trong phòng). Không dời cảnh sang địa điểm mới nào khác." : "",
    "- Chi tiết thêm vào (ngoại hình, đồ vật, thời gian) phải khớp CANON CONTEXT và hồ sơ nhân vật, không mâu thuẫn với phần còn lại của chương.",
    "- KHÔNG thêm câu/dòng báo ngày giờ như một nhãn ở đầu hoặc cuối chương. Nếu cần sửa lỗi thời gian, lồng chi tiết thời gian vào mạch kể (ánh sáng, việc đang làm, một mệnh đề chuyển) như văn xuôi thuần túy.",
    "- Tối đa " + PATCH_MAX_COUNT + " thao tác. Mỗi lỗi một thao tác ngắn nhất có thể.",
    "BẢN THẢO HIỆN TẠI:\n" + (p.draft || "")
  ].filter(Boolean).join("\n\n");
}
// Đọc JSON do AI trả về (chịu được ```json … ``` và chữ thừa quanh JSON). Trả mảng patch hoặc null.
function parsePatchResponse(raw) {
  const s = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const tryParse = t => { try { return JSON.parse(t); } catch (_) { return undefined; } };
  let obj = tryParse(s);
  if (obj === undefined) { const a = s.indexOf("{"), b = s.lastIndexOf("}"); if (a >= 0 && b > a) obj = tryParse(s.slice(a, b + 1)); }
  if (obj === undefined) { const a = s.indexOf("["), b = s.lastIndexOf("]"); if (a >= 0 && b > a) obj = tryParse(s.slice(a, b + 1)); }
  const arr = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.patches) ? obj.patches : null);
  return arr ? arr.filter(x => x && typeof x === "object").slice(0, PATCH_MAX_COUNT) : null;
}
// Tìm mọi vị trí của snippet: khớp nguyên văn trước, không được thì khớp linh hoạt khoảng trắng/xuống dòng.
function _patchLocate(text, snippet, fromPos) {
  const sn = String(snippet || "").trim(); if (!sn) return [];
  const out = []; let i = text.indexOf(sn, fromPos || 0);
  while (i >= 0) { out.push({ start: i, end: i + sn.length }); i = text.indexOf(sn, i + sn.length); }
  if (out.length) return out;
  const re = new RegExp(sn.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "g");
  re.lastIndex = fromPos || 0; let m;
  while ((m = re.exec(text))) { out.push({ start: m.index, end: m.index + m[0].length }); if (m[0].length === 0) re.lastIndex++; }
  return out;
}
function _patchPick(hits, which) {
  if (!hits.length) return { err: "không tìm thấy đoạn trong bản thảo" };
  const w = String(which === undefined || which === null ? "" : which).toLowerCase();
  if (w === "last") return { hit: hits[hits.length - 1] };
  const n = Number(w);
  if (n >= 1) return n <= hits.length ? { hit: hits[n - 1] } : { err: "which=" + n + " nhưng chỉ có " + hits.length + " chỗ khớp" };
  if (hits.length > 1) return { err: "đoạn khớp " + hits.length + " chỗ (cần which)" };
  return { hit: hits[0] };
}
// Ghép các patch vào văn bản. Trả { text, applied, skipped:[{index,reason}] }. Patch lỗi bị bỏ qua, không làm hỏng cả lượt.
function applyChapterPatches(text, patches) {
  let cur = String(text || ""); const skipped = []; let applied = 0;
  (Array.isArray(patches) ? patches : []).slice(0, PATCH_MAX_COUNT).forEach((p, index) => {
    const op = String((p && p.op) || "").toLowerCase(), add = String((p && p.text) || "").trim();
    const skip = r => skipped.push({ index, reason: op + ": " + r });
    if (op === "insert_start") { if (!add) return skip("thiếu text"); cur = add + "\n\n" + cur.replace(/^\s+/, ""); applied++; return; }
    if (op === "insert_end") { if (!add) return skip("thiếu text"); cur = cur.replace(/\s+$/, "") + "\n\n" + add; applied++; return; }
    if (op === "insert_before_end") {
      if (!add) return skip("thiếu text");
      const trimmed = cur.replace(/\s+$/, "");
      const cut = trimmed.lastIndexOf("\n\n");
      if (cut <= 0) { cur = trimmed + "\n\n" + add; applied++; return; }
      cur = trimmed.slice(0, cut) + "\n\n" + add + "\n\n" + trimmed.slice(cut + 2);
      applied++; return;
    }
    if (!["replace", "delete", "insert_after", "insert_before"].includes(op)) return skip("thao tác không hợp lệ");
    if (op !== "delete" && !add) return skip("thiếu text");
    let start, end;
    if (p.from && p.to && (op === "replace" || op === "delete")) {
      const a = _patchPick(_patchLocate(cur, p.from), p.which); if (a.err) return skip("from: " + a.err);
      const bh = _patchLocate(cur, p.to, a.hit.end).filter(h => h.start >= a.hit.start);
      if (!bh.length) return skip("to: không tìm thấy phía sau from");
      start = a.hit.start; end = bh[0].end;
      if (end - start > cur.length * 0.4) return skip("đoạn from→to quá dài (>40% chương)");
    } else {
      const f = p.find || p.from; if (!f) return skip("thiếu find");
      const a = _patchPick(_patchLocate(cur, f), p.which); if (a.err) return skip(a.err);
      start = a.hit.start; end = a.hit.end;
    }
    if (op === "replace") cur = cur.slice(0, start) + add + cur.slice(end);
    else if (op === "delete") cur = cur.slice(0, start) + cur.slice(end);
    else if (op === "insert_after") {
      let e2 = end; while (e2 < cur.length && /[.!?…”"’')\]]/.test(cur[e2])) e2++;   // neo thiếu dấu chấm/ngoặc đóng cuối đoạn vẫn tính là cuối đoạn
      const para = e2 >= cur.length || cur[e2] === "\n", at = para ? e2 : end;
      cur = cur.slice(0, at) + (para ? "\n\n" : " ") + add + cur.slice(at);
    } else {
      let s2 = start; while (s2 > 0 && /["“‘'(\[—\- \t]/.test(cur[s2 - 1])) s2--;          // neo thiếu ngoặc mở/gạch thoại đầu đoạn vẫn tính là đầu đoạn
      const para = s2 === 0 || cur[s2 - 1] === "\n", at = para ? s2 : start;
      cur = cur.slice(0, at) + add + (para ? "\n\n" : " ") + cur.slice(at);
    }
    applied++;
  });
  cur = cur.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: cur, applied, skipped };
}
// Bản vá có được thay bản thảo không? (đã ghép ≥1 patch, độ dài không lệch quá nhiều)
function checkPatchAcceptable(oldText, res) {
  const oldWc = countWords(oldText), newWc = countWords(res && res.text);
  if (!res || !res.applied) return { ok: false, reason: "không có thao tác vá nào ghép được" + (res && res.skipped && res.skipped.length ? " (" + res.skipped.slice(0, 2).map(s => s.reason).join("; ") + ")" : "") };
  if (newWc < Math.max(20, Math.floor(oldWc * PATCH_MIN_RATIO))) return { ok: false, reason: "bản vá làm chương ngắn bất thường (" + newWc + " từ so với " + oldWc + ")" };
  if (newWc > Math.ceil(oldWc * PATCH_MAX_RATIO)) return { ok: false, reason: "bản vá làm chương dài bất thường (" + newWc + " từ so với " + oldWc + ")" };
  return { ok: true, wordCount: newWc };
}

// V12.45: sửa theo vùng — dùng khi câu neo của patch không ghép được và chương quá dài để viết lại toàn bộ.
// AI chỉ trả hai mốc nguyên văn + phần thay thế; app tự tìm vùng và giữ nguyên phần còn lại.
function buildSegmentRepairPrompt(p) {
  p = p || {}; const rv = p.review || {};
  return [
    "SỬA THEO VÙNG BẢN THẢO CHƯƠNG " + p.chapterNumber + " THEO QUALITY REVIEW.",
    "Không viết lại cả chương. Chọn đúng MỘT vùng nhỏ nhất chứa lỗi được nêu (thường 1 cảnh hoặc 2–8 đoạn), rồi viết lại chỉ vùng đó.",
    "Nếu lỗi là tuyến phụ/nhân vật mới làm lệch Arc, được phép thay toàn bộ vùng đó bằng một đoạn cầu nối hoặc cảnh đúng Outline; không cố giữ tuyến sai. Không thêm nhân vật/tuyến mới.",
    p.storyControl || "", p.characterLock || "",
    (p.contractLabel || "OUTLINE/CONTRACT") + ":\n" + (p.contract || ""),
    p.context ? "CANON CONTEXT:\n" + compactGateContext(p.context, 5000, false) : "",
    "LỖI CẦN SỬA:\n" + (rv.hardFailures || []).concat((rv.warnings || []).slice(0, 8)).map(gateItemText).join("\n"),
    "HƯỚNG SỬA (chỉ áp dụng phần KHÔNG mâu thuẫn Outline/Contract; mâu thuẫn thì Outline thắng):\n" + rewriteInstructionsText(rv),
    "Với lỗi style/pacing: ưu tiên rút gọn câu dài, bỏ lặp ý/triết lý, tăng nhịp; không xóa sự kiện cần thiết.",
    "ĐỊNH DẠNG — chỉ trả đúng một JSON, không markdown:",
    '{"start":"8–24 từ NGUYÊN VĂN ở đầu vùng cần sửa","end":"8–24 từ NGUYÊN VĂN ở cuối vùng cần sửa","replacement":"toàn bộ văn xuôi mới thay cho vùng đó"}',
    "QUY TẮC MỐC:",
    "- start và end phải chép đúng từng chữ từ BẢN THẢO, không dùng mã [R], mô tả vị trí hoặc câu tự chế.",
    "- start phải đứng trước end; vùng thay thế không quá khoảng 30% chương.",
    "- replacement phải là văn xuôi tiếng Việt thuần, nối mượt với phần trước/sau; không ghi chú, không tiêu đề; với tuyến drift phải chuyển về đúng Arc/Outline.",
    "- Với cảnh bị dài, replacement có thể ngắn hơn bản cũ nhưng vẫn phải giữ nguyên nguyên nhân–kết quả và điểm kết.",
    "BẢN THẢO HIỆN TẠI:\n" + (p.draft || "")
  ].filter(Boolean).join("\n\n");
}
function parseSegmentRepairResponse(raw) {
  const s = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let obj; try { obj = JSON.parse(s); } catch (_) {
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) { try { obj = JSON.parse(s.slice(a, b + 1)); } catch (__) {} }
  }
  if (!obj || typeof obj !== "object") return null;
  const start = String(obj.start || obj.startMarker || "").trim();
  const end = String(obj.end || obj.endMarker || "").trim();
  const replacement = String(obj.replacement || obj.text || "").trim();
  return start && end && replacement ? { start, end, replacement } : null;
}
function applySegmentRepair(text, repair) {
  const src = String(text || ""), r = repair || {};
  const sh = _patchLocate(src, r.start), eh = _patchLocate(src, r.end);
  if (!sh.length) return { ok: false, reason: "start: không tìm thấy mốc đầu vùng" };
  if (!eh.length) return { ok: false, reason: "end: không tìm thấy mốc cuối vùng" };
  const start = sh[0].start;
  const after = eh.filter(x => x.start >= start);
  if (!after.length) return { ok: false, reason: "mốc cuối nằm trước mốc đầu" };
  const end = after[0].end;
  if (end <= start || end - start > src.length * 0.30) return { ok: false, reason: "vùng sửa quá rộng hoặc không hợp lệ" };
  const replacement = String(r.replacement || "").trim();
  if (countWords(replacement) < 20) return { ok: false, reason: "phần thay thế quá ngắn" };
  const out = (src.slice(0, start) + replacement + src.slice(end)).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const oldWc = countWords(src), newWc = countWords(out);
  if (newWc < Math.floor(oldWc * 0.85) || newWc > Math.ceil(oldWc * 1.15)) return { ok: false, reason: "sửa theo vùng làm thay đổi tổng độ dài quá mạnh (" + newWc + "/" + oldWc + " từ)" };
  return { ok: true, text: out, wordCount: newWc, start: r.start, end: r.end };
}

// ===== V12.32.13: GIỚI HẠN OUTPUT & MỞ RỘNG CHƯƠNG BẰNG CHÈN ĐOẠN (không viết lại cả chương) =====
// Mọi lệnh gọi AI bị chặn ở AI_MAX_OUTPUT_TOKENS token output (provider ~8192). Chương dài (vd 5000+ từ ≈ 9–11k token)
// KHÔNG thể được "viết lại toàn bộ" trong một lệnh gọi → bị cắt/tóm tắt. Thay vào đó AI chỉ viết các đoạn mới cần chèn.
const AI_MAX_OUTPUT_TOKENS = 7800;
function estimateOutputTokens(text) { return Math.ceil(String(text || "").length / 3); }   // ước lượng thô cho tiếng Việt
function wholeRewriteFits(text) {
  const est = Math.ceil(estimateOutputTokens(text) * 1.12);
  return { fits: est <= Math.floor(AI_MAX_OUTPUT_TOKENS * 0.9), est, cap: AI_MAX_OUTPUT_TOKENS };
}
function expandMaxTokens(needWords) { return Math.max(1500, Math.min(AI_MAX_OUTPUT_TOKENS, Math.ceil(Math.max(0, Number(needWords) || 0) * 2.6) + 1200)); }
function buildExpandInsertPrompt(o) {
  const wc = o.wc, need = Math.max(150, Math.ceil(o.goal * 1.04 - wc)), room = Math.max(0, o.maxWords - wc);
  const brief = [o.directive ? ("MỆNH LỆNH: " + String(o.directive).trim()) : "", o.hint ? ("GỢI Ý: " + String(o.hint).trim()) : ""].filter(Boolean).join("\n");
  return [
    "BẮT BUỘC NGÔN NGỮ: 100% TIẾNG VIỆT CÓ DẤU.",
    "MỞ RỘNG CHƯƠNG BẰNG CÁCH CHÈN THÊM ĐOẠN. Bản hiện tại " + wc + " từ, CHƯA ĐỦ độ dài: cần tối thiểu " + o.goal + " từ (mục tiêu " + o.target + ", tuyệt đối không vượt " + o.maxWords + "). Cần THÊM khoảng " + need + " từ (tối đa " + room + " từ).",
    "KHÔNG viết lại chương. Giữ nguyên 100% văn bản hiện có. Chỉ viết các ĐOẠN MỚI để chèn vào những chỗ chương đang kể lướt/thiếu chi tiết, và nêu chỗ chèn.",
    "CÁCH LÀM: chọn 4–8 chỗ khác nhau; mỗi chỗ viết 1–3 đoạn mới (không khí/bối cảnh, hành động từng bước, hội thoại, nội tâm, giác quan, phản ứng và hệ quả), cùng giọng văn, POV, xưng hô, nối mượt với câu trước và sau chỗ chèn.",
    "CẤM: thêm biến cố lớn, nhân vật quan trọng mới, arc mới; lặp ý hoặc độn chữ; mâu thuẫn với phần có sẵn; chèn sau câu cuối chương hoặc đổi điểm kết chương; ghi chú/giải thích.",
    o.style || "",
    brief ? ("===== KẾ HOẠCH NGƯỜI DÙNG (không đổi) =====\n" + brief + (o.closing ? ("\nENDING ANCHOR: " + o.closing) : "") + "\n===== HẾT =====") : "",
    "ĐỊNH DẠNG TRẢ VỀ — chỉ dùng đúng định dạng này, lặp lại cho từng chỗ chèn, không lời dẫn:",
    ">>> SAU: <chép NGUYÊN VĂN 6–20 từ CUỐI của một đoạn có sẵn, đúng từng chữ, không sửa dấu>",
    "<các đoạn mới, cách nhau một dòng trống>",
    ">>> TRƯỚC: <chép NGUYÊN VĂN 6–20 từ ĐẦU của một đoạn có sẵn>",
    "<các đoạn mới>",
    "Mỗi chỗ chèn dùng cụm neo khác nhau và duy nhất trong chương. Không chèn sau đoạn cuối cùng của chương.",
    "===== BẢN HIỆN TẠI (" + wc + " từ) =====",
    String(o.text || ""),
    "===== HẾT BẢN HIỆN TẠI ====="
  ].filter(Boolean).join("\n");
}
// Đọc các khối ">>> SAU: <neo>" / ">>> TRƯỚC: <neo>" + đoạn mới. Không dùng JSON để khỏi vỡ vì dấu ngoặc kép trong lời thoại.
function parseInsertBlocks(raw) {
  const re = /^\s*>>>\s*(SAU|TRƯỚC|TRUOC)\s*:\s*(.+?)\s*$/i, out = []; let cur = null;
  String(raw || "").replace(/\r/g, "").split("\n").forEach(ln => {
    const m = ln.match(re);
    if (m) { if (cur) out.push(cur); cur = { op: /^SAU$/i.test(m[1]) ? "insert_after" : "insert_before", find: m[2].replace(/^["“‘'`]+|["”’'`…]+$/g, "").trim(), body: [] }; }
    else if (cur) cur.body.push(ln);
  });
  if (cur) out.push(cur);
  return out.map(p => ({ op: p.op, find: p.find, text: p.body.join("\n").replace(/\n{3,}/g, "\n\n").trim() })).filter(p => p.find && p.text).slice(0, PATCH_MAX_COUNT);
}
// Chèn từng khối; bỏ khối nào làm đổi đoạn kết, vượt maxWords hoặc không tìm thấy neo. Trả { text, applied, skipped, added }.
function applyExpandInserts(text, blocks, maxWords) {
  const base = String(text || "").trim(), tail = base.slice(-160), skipped = []; let cur = base, applied = 0;
  (Array.isArray(blocks) ? blocks : []).forEach((b, index) => {
    if (!b || (b.op !== "insert_after" && b.op !== "insert_before")) return skipped.push({ index, reason: "chỉ cho phép chèn" });
    const res = applyChapterPatches(cur, [b]);
    if (!res.applied) return skipped.push({ index, reason: res.skipped[0] ? res.skipped[0].reason : "không ghép được" });
    if (!res.text.endsWith(tail)) return skipped.push({ index, reason: "chèn vào đoạn kết chương" });
    if (maxWords && countWords(res.text) > maxWords) return skipped.push({ index, reason: "vượt giới hạn " + maxWords + " từ" });
    cur = res.text; applied++;
  });
  return { text: cur, applied, skipped, added: countWords(cur) - countWords(base) };
}
function acceptExpandInserts(oldText, res) {
  if (!res || !res.applied) return { ok: false, reason: "không chèn được đoạn nào" + (res && res.skipped && res.skipped.length ? " (" + res.skipped.slice(0, 2).map(s => s.reason).join("; ") + ")" : "") };
  if (res.added < 120) return { ok: false, reason: "đoạn chèn quá ít (+" + res.added + " từ)" };
  return { ok: true, text: res.text, words: countWords(res.text), added: res.added };
}

// Lưu bản gốc vào chapter.versions (mới nhất đứng đầu, giữ tối đa GATE_MAX_VERSIONS).
function backupBeforeRewrite(chapter, note) {
  if (!Array.isArray(chapter.versions)) chapter.versions = [];
  const oldText = String(chapter.text || "");
  chapter.versions.unshift({ timestamp: Date.now(), text: oldText, wordCount: countWords(oldText), modelUsed: chapter.modelUsed || null, isNsfw: !!chapter.isNsfw, polished: !!chapter.polished, note: note || "Trước khi Quality Gate sửa" });
  chapter.versions = chapter.versions.slice(0, GATE_MAX_VERSIONS);
}

// Mỗi lượt thay cảnh báo do AI cũ bằng cảnh báo mới (giữ cảnh báo khác nguồn), không cộng dồn.
function mergeAiContinuityWarnings(existing, incoming, cap) {
  const keep = (Array.isArray(existing) ? existing : []).filter(w => !(w && w.source === "ai"));
  const fresh = (Array.isArray(incoming) ? incoming : []).map(w => Object.assign({}, w, { source: "ai" }));
  return keep.concat(fresh).slice(-(cap || 20));
}

// ===== V12.17 (phần 2): Story Control, dựng prompt Gate, vòng lặp Gate, đánh dấu Sync =====

// --- Story Control: một nguồn duy nhất cho chuẩn hoá + prompt (trước đây client và worker viết khác nhau) ---
function normalizeStoryControl(st) {
  const sc = (st && st.storyControl && typeof st.storyControl === "object") ? st.storyControl : {};
  return {
    schemaVersion: Number(sc.schemaVersion) || 1,
    maxMainEvents: Math.max(1, Math.min(3, Number(sc.maxMainEvents) || 3)),
    /* V14.7.5: mặc định nới (6) và tác giả chỉnh được (tới 12). Giá trị 4 cũ do mặc định cũ lưu lại không được coi là lựa chọn của tác giả (castCapUserSet). */
    maxNamedCharacters: Math.max(1, Math.min(12, sc.castCapUserSet === true ? (Number(sc.maxNamedCharacters) || 6) : Math.max(6, Number(sc.maxNamedCharacters) || 0))),
    castCapUserSet: sc.castCapUserSet === true, castAutoPlanned: sc.castAutoPlanned === true,
    maxNewThreads: Math.max(0, Math.min(5, Number(sc.maxNewThreads) || 3)),
    noRetcon: sc.noRetcon !== false,
    timePace: ["scene","day","fewdays","week"].includes(sc.timePace) ? sc.timePace : "",
    lockedFields: Array.isArray(sc.lockedFields) ? sc.lockedFields : ["identity","age","background","canon","relationships","cultivation","abilities","importantItems","secrets","promises","worldRules"],
    agencyRequired: sc.agencyRequired !== false
  };
}
// --- V12.32.5: TIẾN TRIỂN BẮT BUỘC + TRÍ NHỚ TRUYỆN (chống dậm chân tại chỗ, tăng liền lạc giữa các chương) ---
function progressRulesPrompt(st) {
  const mf = normalizeChapterMatureFocus(st && st.chapterMatureFocus);
  return [
    "TIẾN TRIỂN BẮT BUỘC (chống dậm chân tại chỗ):",
    "- Cuối chương, ít nhất MỘT điều phải đã THAY ĐỔI so với đầu chương: quan hệ giữa các nhân vật, thông tin/bí mật được lộ, quyền lực/vị thế, mục tiêu, hoặc một hậu quả mới. Không kết chương ở đúng trạng thái đã có lúc mở chương.",
    "- Mỗi cảnh phải có hành động hoặc lựa chọn làm tình thế dịch chuyển; cấm lặp lại cùng một hành động, cùng một kiểu miêu tả hay cùng nhịp cảm xúc chỉ để kéo dài. Muốn dài hơn thì đẩy tình huống sang bước kế tiếp, không nhắc lại bước vừa qua.",
    "- Chương phải tiếp nối từ điểm kết chương trước và các việc ĐANG DANG DỞ (nếu có trong bối cảnh); không bỏ quên và không làm như chưa từng xảy ra.",
    mf === "primary" ? "- Cảnh trưởng thành là trọng tâm nhưng KHÔNG phải toàn bộ chương: chỉ chiếm khoảng một nửa đến hai phần ba nội dung; phần còn lại (trước, xen kẽ, sau) là diễn biến cốt truyện/quan hệ. Cảnh nóng phải tự làm đổi điều gì đó (quan hệ, quyền lực, bí mật, hậu quả, quyết định) và mở ra bước kế tiếp; đừng lặp lại cùng một động tác hay cùng một đoạn tả." : ""
  ].filter(Boolean).join("\n");
}
// --- V12.32.8: NEO NGOẠI HÌNH — người đọc phải hình dung được nhân vật (kích thước/số đo cụ thể, không tính từ trống). ---
function appearanceAnchorPrompt(st, adult) {
  const mature = !!(adult || (st && st.mature));
  return [
    "NEO NGOẠI HÌNH (để người đọc hình dung được nhân vật):",
    "- Khi nhân vật có tên xuất hiện LẦN ĐẦU (và khi quay lại sau nhiều chương vắng mặt): tả 2–4 câu gồm tuổi/vẻ ngoài, chiều cao, vóc dáng, mặt-tóc-mắt-da, trang phục và MỘT nét nhận dạng riêng. Dùng con số hoặc so sánh cụ thể (VD: cao khoảng 1m65, vai hẹp, tóc ngang vai, mắt một mí), không chỉ tính từ chung chung.",
    "- CHỐNG LẶP: nhân vật đã được tả ở các chương trước thì KHÔNG nhắc lại chiều cao/cân nặng/số đo/dáng; chỉ thêm chi tiết MỚI hoặc phản ứng hiện tại, và không mở chương bằng đoạn tả hình thể.",
    "- Cấm tính từ trống đứng một mình như \"đẹp\", \"quyến rũ\", \"to\", \"đầy đặn\", \"cao ráo\": phải kèm kích thước, hình dáng hoặc so sánh cụ thể để người đọc hình dung ra.",
    "- Hồ sơ có chiều cao/dáng/SỐ ĐO thì dùng ĐÚNG. Hồ sơ còn trống mục ngoại hình thì TỰ ĐẶT chi tiết hợp lý ngay lần tả đầu và giữ nhất quán ở các chương sau (chi tiết này sẽ được lưu vào hồ sơ).",
    "- " + BODY_PROSE_CRAFT,
    mature ? "- " + EROTIC_ACTION_CRAFT : "",
    mature ? "- " + EROTIC_INNER_CRAFT : "",
    mature ? "- " + EROTIC_ARC_PACING_CRAFT : "",
    mature ? "- Khi tả cơ thể của nhân vật ĐÃ ĐỦ 18 TUỔI trong cảnh người lớn: dựng kích thước ít nhất ở lần tả đầu tiên thành hình ảnh và cảm giác (ngực: độ đầy, độ nảy, trọng lượng; eo, mông, đùi; với nam: kích thước và hình dạng) theo mục SỐ ĐO trong hồ sơ, không đọc số như báo cáo; hồ sơ trống thì tự đặt số hợp lý và giữ nhất quán. Nhân vật dưới 18 tuổi hoặc không rõ tuổi: KHÔNG tả số đo hay đặc điểm tình dục của cơ thể." : ""
  ].filter(Boolean).join("\n");
}
// Tóm tắt truyện đến nay: mỗi chương cũ 1–2 câu (trừ chương gần nhất đã có khối riêng), tổng không quá maxChars.
function storySoFarPrompt(chapters, maxChars) {
  const active = acceptedStoryChapters(chapters);
  const cs = active.slice(0, -1);
  maxChars = Number(maxChars) || 2800;
  const clean = c => String((c && c.summary) || "").replace(/\*\*[^*]*\*\*:?/g, " ").replace(/\s+/g, " ").trim();
  const items = [];
  cs.forEach((c, i) => { const t = clean(c); if (t) items.push({ n: Number(c.chapterNumber) || i + 1, t }); });
  if (!items.length) return "";
  const N = Math.min(items.length, Math.max(1, Math.floor(maxChars / 90)));
  const use = items.slice(-N), per = Math.max(80, Math.min(260, Math.floor(maxChars / N) - 8));
  const cutSentence = (t, n) => { if (t.length <= n) return t; const h = t.slice(0, n); const k = Math.max(h.lastIndexOf(". "), h.lastIndexOf("! "), h.lastIndexOf("? ")); return (k > n * 0.5 ? h.slice(0, k + 1) : h.trimEnd() + "…"); };
  const lines = use.map(x => "Ch" + x.n + ": " + cutSentence(x.t, per));
  return "TRUYỆN ĐẾN NAY (tóm tắt các chương trước" + (use.length < items.length ? ", chỉ " + use.length + " chương gần nhất" : "") + " — giữ liền mạch, không mâu thuẫn):\n" + lines.join("\n");
}
// Các việc đang dang dở lấy từ Current Status có cấu trúc.
function openLoopsPrompt(st) {
  const ss = (st && st.statusState && typeof st.statusState === "object") ? st.statusState : {};
  const cur = ss.currentState || {}, lt = ss.longTerm || {};
  const pick = (k) => { const v = cur[k] != null && cur[k] !== "" ? cur[k] : lt[k]; return typeof v === "string" ? v.trim() : (v ? JSON.stringify(v) : ""); };
  const rows = [["Chưa giải quyết", "unresolved"], ["Mâu thuẫn", "conflict"], ["Mục tiêu kế tiếp", "nextGoal"], ["Móc nối chương sau", "nextHooks"]]
    .map(([l, k]) => { const v = pick(k); return v ? "- " + l + ": " + (v.length > 260 ? v.slice(0, 260) + "…" : v) : ""; }).filter(Boolean);
  return rows.length ? "ĐANG DANG DỞ (phải tiếp nối, không bỏ quên):\n" + rows.join("\n") : "";
}

// --- V12.32.4: HỒ SƠ KHÓA — buộc AI không để nhân vật vượt thiết lập (địa vị/nghề/quyền hạn/tài sản/năng lực/kiến thức/giọng nói). ---
// Nhân vật có tên xuất hiện trong text (kèm nhân vật chính) — dùng cho Review/Rewrite.
function lockCharsForText(st, text, limit) {
  const t = String(text || ""), out = [], seen = new Set();
  const push = c => { if (c && c.name && !seen.has(c.name) && out.length < (limit || 8)) { seen.add(c.name); out.push(c); } };
  ((st && st.characters) || []).forEach(c => { if (c && c.name && !c.dead && knownNameMentions(t, [c.name]).length) push(c); });
  return out;
}
// --- V14.1: HỆ THỐNG TU LUYỆN (tu tiên / huyền huyễn / võ hiệp) ---
// Thang đại cảnh giới (thấp -> cao), mỗi đại cảnh giới chia 9 tiểu tầng "đệ nhất ... đệ cửu trọng". Người dùng có thể đổi thang trong Story Bible (state.realmLadder).
const CULT_GENRE_RE = /tu (tiên|chân|luyện|đạo)|tiên hiệp|huyền huyễn|kiếm hiệp|võ hiệp|xianxia|cultivation|wuxia|tiên nghịch/i;
const DEFAULT_REALM_LADDER = ["Luyện Khí", "Trúc Cơ", "Kết Đan", "Nguyên Anh"];
const CULT_DEFAULT_SYSTEM_TEXT = [
  "Cảnh giới giữ tên gọi cũ; mỗi đại cảnh giới chia chín tiểu tầng (đệ nhất đến đệ cửu trọng).",
  "• Luyện Khí: khởi đầu. Chín tiểu tầng chủ yếu rèn thể chất, mở kinh mạch. Đệ cửu là ngưỡng cửa trước Trúc Cơ — nhiều người mắc kẹt hàng chục năm vì thiếu tài nguyên.",
  "• Trúc Cơ: nơi phần lớn dừng chân lâu dài. Thể chất mạnh lên, nhan sắc giữ gìn, tuổi thọ kéo dài. Trúc Cơ hậu kỳ đã là nhân vật có tiếng trong giới trung lưu.",
  "• Kết Đan: đẳng cấp khan hiếm. Kim đan ngưng kết, sức mạnh tăng vọt. Đệ cửu (viên mãn) được xem là đỉnh cao của thời đại đối với phần lớn người còn sống.",
  "• Nguyên Anh trở lên: gần như chỉ còn trong lời đồn và cổ tịch. Còn nhiều cảnh giới khác chưa có ai chạm tới và chưa có ghi chép."
].join("\n");
const REALM_TIER_WORDS = ["nhat", "nhi", "tam", "tu", "ngu", "luc", "that", "bat", "cuu"];
// Các trường tu luyện của hồ sơ nhân vật (dùng chung NPC + nhân vật chính). aliases/peakRealm xử lý riêng.
const CULT_FIELDS = ["realm", "peakRealm", "spiritRoot", "talent", "element", "technique", "arts", "combatPower", "treasure", "inventory", "spiritStones", "apparentAge", "lifespan", "masterLine", "fortune", "grudges", "originSecret", "innerDemon", "karma"];
const CULT_ACCUM = ["arts", "fortune", "grudges", "innerDemon", "karma"];                       // ghi thêm, không xóa cũ
const CULT_FILL = ["spiritRoot", "talent", "element", "masterLine", "originSecret", "apparentAge"]; // chỉ điền khi còn trống
const CULT_EXPLICIT = ["technique", "treasure", "lifespan"];                                       // điền khi trống; đổi cần sự kiện + bằng chứng
const CULT_FREE = ["combatPower", "inventory", "spiritStones"];                                    // trạng thái động, được cập nhật
function isCultivationGenre(genre) { return CULT_GENRE_RE.test(String(genre || "")); }
function _rn(s) { return normalizeName(String(s == null ? "" : s).replace(/đ/gi, "d")).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(); }
function realmLadderOf(st) {
  const raw = st && st.realmLadder;
  let arr = Array.isArray(raw) ? raw : String(raw || "").split(/[,;\n>→]+/);
  arr = arr.map(x => String(x).trim()).filter(Boolean).slice(0, 30);
  return arr.length ? arr : DEFAULT_REALM_LADDER.slice();
}
// "Trúc Cơ đệ tam trọng" -> {major:1, tier:3, name:"Trúc Cơ", rank:13, known:true}. Tên ngoài thang -> known:false. "Phàm nhân" -> major:-1.
function parseRealm(text, ladder) {
  const n = _rn(text); if (!n) return null;
  ladder = ladder && ladder.length ? ladder : DEFAULT_REALM_LADDER;
  if (/(^| )(pham nhan|nguoi pham|chua tu luyen|chua nhap mon)( |$)/.test(n)) return { major: -1, tier: 0, name: "Phàm nhân", rank: -10, known: true };
  let major = -1, best = "";
  ladder.forEach((r, i) => { const rn = _rn(r); if (rn && (" " + n + " ").includes(" " + rn + " ") && rn.length >= best.length) { major = i; best = rn; } });
  if (major < 0) return { major: -1, tier: 0, name: "", rank: null, known: false };
  let tier = 0, m;
  if ((m = n.match(/(?:^| )de (nhat|nhi|tam|tu|ngu|luc|that|bat|cuu) (?:trong|tang)/))) tier = REALM_TIER_WORDS.indexOf(m[1]) + 1;
  else if ((m = n.match(/(?:tang|trong|cap) (\d)(?: |$)/)) || (m = n.match(/(?:^| )(\d) (?:trong|tang)/))) tier = Math.max(0, Math.min(9, parseInt(m[1], 10)));
  else if (/vien man|dinh phong|dai vien man/.test(n)) tier = 9;
  else if (/(^| )hau ky/.test(n)) tier = 8; else if (/(^| )trung ky/.test(n)) tier = 5; else if (/(^| )so ky/.test(n)) tier = 2;
  return { major, tier, name: ladder[major], rank: major * 10 + tier, known: true };
}
// Quyết định có chấp nhận đổi cảnh giới old -> new không (chưa tính bằng chứng). ok=true: hợp lệ về mặt thang bậc.
function realmChangeVerdict(oldText, newText, ladder) {
  const nn = String(newText || "").trim(); if (!nn) return { ok: false, reason: "empty" };
  const o = String(oldText || "").trim();
  const b = parseRealm(nn, ladder);
  if (!b || !b.known) return { ok: false, reason: "unknown", warn: "Cảnh giới \"" + nn.slice(0, 40) + "\" không nằm trong thang cảnh giới của truyện — bỏ qua (không tự đặt cảnh giới mới)." };
  if (!o) return { ok: true, kind: "set" };
  if (_rn(o) === _rn(nn)) return { ok: false, reason: "same" };
  const a = parseRealm(o, ladder);
  if (!a || !a.known) return { ok: true, kind: "set" };
  if (b.major - a.major >= 2) return { ok: false, reason: "jump", warn: "Bỏ qua đổi cảnh giới \"" + o.slice(0, 30) + "\" → \"" + nn.slice(0, 30) + "\": nhảy từ 2 đại cảnh giới trở lên." };
  if (b.rank > a.rank) return { ok: true, kind: b.major > a.major ? "breakthrough" : "advance" };
  return { ok: true, kind: "drop" };
}
function _realmEvidenceOk(newRealm, evidence, ladder) {
  const b = parseRealm(newRealm, ladder); if (!b || !b.known) return false;
  const e = _rn(evidence); if (!e) return false;
  return (b.name && e.includes(_rn(b.name))) || /dot pha|tien vao|tien len|len toi|dat toi|dat den|ngung ket|vien man|tang|trong|hau ky|trung ky|so ky|dinh phong|phe|tut|roi xuong|ton hai|suy giam/.test(e);
}
// Áp các trường tu luyện từ bản cập nhật AI `u` lên hồ sơ `target` (NPC hoặc nhân vật chính). Trả về mảng ghi chú/cảnh báo.
// o: { explicit:boolean (có explicitCoreChange + bằng chứng hợp lệ), evidence:string, state }
function applyCultivationUpdate(target, u, o) {
  const notes = [];
  if (!target || !u) return notes;
  o = o || {};
  const ladder = realmLadderOf(o.state), explicit = !!o.explicit;
  const has = v => v != null && String(v).trim() !== "";
  const clip = (v, n) => String(v).replace(/\s+/g, " ").trim().slice(0, n);
  if (has(u.realm)) {
    const v = realmChangeVerdict(target.realm, u.realm, ladder);
    if (v.ok) {
      const wasEmpty = !has(target.realm);
      if (wasEmpty || (explicit && _realmEvidenceOk(u.realm, o.evidence, ladder))) {
        target.realm = clip(u.realm, 80);
        if (!wasEmpty) notes.push("Cảnh giới: " + (v.kind === "drop" ? "tụt" : "tăng") + " → " + target.realm);
      } else notes.push("Bỏ qua đổi cảnh giới → \"" + clip(u.realm, 40) + "\": thiếu sự kiện đột phá có bằng chứng trích từ chương.");
    } else if (v.warn) notes.push(v.warn);
  }
  { const pr = parseRealm(target.realm, ladder), pk = parseRealm(target.peakRealm, ladder);
    if (pr && pr.known && pr.rank != null && (!pk || !pk.known || pr.rank > pk.rank)) target.peakRealm = target.realm; }
  CULT_ACCUM.forEach(k => { if (has(u[k])) target[k] = mergeTextSegments(target[k], clip(u[k], 800), 1200); });
  CULT_FILL.forEach(k => { if (has(u[k]) && !has(target[k])) target[k] = clip(u[k], 200); });
  CULT_EXPLICIT.forEach(k => { if (has(u[k]) && (!has(target[k]) || explicit)) target[k] = clip(u[k], 240); });
  CULT_FREE.forEach(k => { if (has(u[k])) target[k] = clip(u[k], 300); });
  { // tên khác / đạo hiệu: chỉ thêm tên mới, không trùng nhân vật khác
    const raw = Array.isArray(u.aliases) ? u.aliases : (has(u.aliases) ? String(u.aliases).split(/[,;\n]+/) : []);
    if (raw.length) {
      const cur = Array.isArray(target.aliases) ? target.aliases.slice() : [];
      const taken = new Set([_rn(target.name)].concat(cur.map(_rn)));
      const others = new Set();
      const sts = o.state;
      if (sts) { ((sts.characters) || []).forEach(c => { if (c && c !== target) { others.add(_rn(c.name)); (c.aliases || []).forEach(a => others.add(_rn(a))); } });
        if (sts.mainCharProfile && sts.mainCharProfile !== target) others.add(_rn(sts.mainCharProfile.name)); }
      raw.forEach(a => { const s = clip(a, 40), k = _rn(s);
        if (!k || taken.has(k) || cur.length >= 8) return;
        if (others.has(k)) { notes.push("Bỏ qua tên khác \"" + s + "\": trùng nhân vật khác."); return; }
        cur.push(s); taken.add(k); });
      if (cur.length) target.aliases = cur;
    }
  }
  return notes;
}
// Khối canon về hệ thống tu luyện đưa vào prompt (rỗng nếu truyện không dùng).
function cultivationSystemBlock(st) {
  if (!st) return "";
  const txt = String(st.cultivationSystem || "").trim();
  const hasLadder = Array.isArray(st.realmLadder) ? st.realmLadder.length > 0 : !!String(st.realmLadder || "").trim();
  if (!txt && !hasLadder && !isCultivationGenre(st.genre)) return "";
  const ladder = realmLadderOf(st), top = ladder[ladder.length - 1];
  const out = ["HỆ THỐNG TU LUYỆN (CANON — không tự đổi):"];
  if (txt) out.push(txt.length > 1800 ? txt.slice(0, 1800) + "…" : txt);
  out.push("Thang đại cảnh giới (thấp → cao): " + ladder.join(" → ") + ". Mỗi đại cảnh giới chia 9 tiểu tầng: đệ nhất, nhị, tam, tứ, ngũ, lục, thất, bát, cửu trọng.");
  out.push("- Dùng ĐÚNG tên cảnh giới trong thang; không tự đặt tên cảnh giới/đại cảnh giới mới. Các cảnh giới cao hơn " + top + " chưa có ai chạm tới và chưa có ghi chép: chỉ được nhắc như lời đồn/cổ tịch mơ hồ, KHÔNG đặt tên, KHÔNG miêu tả chi tiết, KHÔNG cho nhân vật nào đạt tới.");
  out.push("- Nhân vật chỉ đột phá/tụt cảnh khi chương kể RÕ sự kiện (tài nguyên, cơ duyên, ngộ đạo, bị thương nặng...). Không nhảy cảnh giới giữa hai chương; không vượt quá một đại cảnh giới mỗi lần.");
  out.push("- " + CULTIVATION_PROGRESS_CRAFT);
  out.push("- Chênh lệch đại cảnh giới là vực sâu: thắng người cao hơn một đại cảnh giới phải có bù đắp cụ thể trong chương (pháp bảo, trận pháp, mưu kế, đối phương bị thương). Tiểu tầng cao hơn trong cùng đại cảnh giới chỉ là ưu thế vừa phải.");
  return out.join("\n");
}

function characterLockPrompt(mc, chars, short) {
  const cut = (v, n) => { v = String(v == null ? "" : v).replace(/\s+/g, " ").trim(); return v.length > n ? v.slice(0, n) + "…" : v; };
  const line = (c, isMain) => {
    const f = [];
    if (c.occupation) f.push("nghề: " + cut(c.occupation, 50));
    if (c.role) f.push("vai trò: " + cut(c.role, 50));
    if (c.position) f.push("chức vụ/địa vị: " + cut(c.position, 50));
    if (c.faction) f.push("phe/tổ chức: " + cut(c.faction, 40));
    if (c.gender) f.push("giới tính theo hồ sơ: " + cut(c.gender, 20));
    if (c.maritalStatus) f.push("tình trạng hôn nhân: " + cut(c.maritalStatus, 30));
    if (c.spouseName) f.push("người phối ngẫu/người yêu: " + cut(c.spouseName, 50));
    if (c.maritalNotes) f.push("ghi chú hôn nhân: " + cut(c.maritalNotes, 80));
    if (c.age) f.push("tuổi: " + cut(c.age, 10));
    if (c.skills || c.strength) f.push("năng lực: " + cut(c.skills || c.strength, 60));
    if (c.realm) f.push("cảnh giới: " + cut(c.realm, 40));
    if (c.peakRealm && c.peakRealm !== c.realm) f.push("từng đạt: " + cut(c.peakRealm, 40));
    if (c.spiritRoot || c.talent) f.push("linh căn/tư chất: " + cut([c.spiritRoot, c.talent].filter(Boolean).join("; "), 60));
    if (c.technique) f.push("công pháp: " + cut(c.technique, 50));
    if (c.arts) f.push("thần thông/chiêu thức: " + cut(c.arts, 70));
    if (c.combatPower) f.push("sức chiến đấu: " + cut(c.combatPower, 50));
    if (c.treasure) f.push("pháp bảo/binh khí: " + cut(c.treasure, 50));
    if (c.masterLine) f.push("sư môn/bối phận: " + cut(c.masterLine, 50));
    if (c.apparentAge) f.push("tuổi ngoại hình: " + cut(c.apparentAge, 20));
    if (c.lifespan) f.push("thọ nguyên: " + cut(c.lifespan, 30));
    if (Array.isArray(c.aliases) && c.aliases.length) f.push("tên khác: " + cut(c.aliases.join(", "), 50));
    if (c.speech || c.voice) f.push("cách nói: " + cut(c.speech || c.voice, 60));
    if (c.personality) f.push("tính: " + cut(c.personality, 60));
    if (c.knowledge) f.push("biết: " + cut(c.knowledge, 60));
    if (c.relevanceToMC) f.push("với NVC: " + cut(c.relevanceToMC, 50));
    return f.length ? "- " + (c.name || "?") + (isMain ? " (NVC)" : "") + " | " + f.join(" | ") : "";
  };
  const rows = [];
  if (mc && mc.name) rows.push(line(mc, true));
  (chars || []).forEach(c => { if (c && c.name && !(mc && mc.name === c.name)) rows.push(line(c, false)); });
  const lines = rows.filter(Boolean);
  if (!lines.length) return "";
  const hasCult = [mc].concat(chars || []).some(c => c && (c.realm || c.technique || c.arts));
  const cultRule = hasCult ? "- CẢNH GIỚI/CÔNG PHÁP: giữ đúng cảnh giới, công pháp, thần thông, pháp bảo ghi trong hồ sơ; không tự nâng/hạ cảnh giới, không tự thêm công pháp hoặc thần thông cao hơn hồ sơ. Đột phá chỉ khi chương kể rõ sự kiện; thắng người cao hơn một đại cảnh giới phải có bù đắp cụ thể." : "";
  const anatomyLock = [
    "GENDER ANATOMY LOCK — bắt buộc phân biệt nhân vật theo giới tính trong hồ sơ:",
    "- Trước mọi đoạn tả thân thể, đối chiếu đúng TÊN nhân vật với giới tính hồ sơ; không lấy mô tả của người này gán sang người khác.",
    "- Nhân vật nam không được nhận bộ phận, đặc điểm hoặc phản ứng sinh học đặc trưng của nhân vật nữ; nhân vật nữ không được nhận bộ phận, đặc điểm hoặc phản ứng sinh học đặc trưng của nhân vật nam.",
    "- Khi nhiều nhân vật cùng cảnh, mỗi câu tả thân thể phải có chủ thể rõ bằng tên hoặc đại từ đã khóa; không dùng đại từ mơ hồ.",
    "- Nếu giới tính hồ sơ trống hoặc mâu thuẫn, không suy đoán chi tiết nhạy cảm; dùng mô tả trung tính và giữ nguyên hồ sơ."
  ];
  if (short) return ["HỒ SƠ KHÓA — giữ đúng nghề/địa vị/quyền hạn/năng lực/cách nói của từng nhân vật, không tự nâng cấp hay vượt thiết lập:", ...(cultRule ? [cultRule] : []), ...anatomyLock, ...lines].join("\n");
  return [
    "HỒ SƠ KHÓA — NHÂN VẬT PHẢI ĐÚNG THIẾT LẬP (ưu tiên hơn sự hấp dẫn của cảnh):",
    "- Mỗi nhân vật chỉ được nói, nghĩ và hành xử trong phạm vi nghề, địa vị, quyền hạn, tài sản, năng lực, tuổi, hiểu biết và tính cách ghi dưới đây. Không tự nâng cấp (quyền lực, giàu có, võ công, quan hệ, chức danh) và không tự hạ cấp.",
    "- Lời thoại và cách xưng hô phải hợp địa vị: người cấp thấp không ra lệnh như cấp trên, không nhận tài sản/tổ chức/quyền không có trong hồ sơ là của mình; người chưa biết một bí mật thì không được nói hay hành động như đã biết.",
    "- Muốn nhân vật vượt hồ sơ (thăng chức, lộ thân phận, có năng lực mới) thì phải có sự kiện RÕ RÀNG trong chính chương làm nguyên nhân (và brief cho phép); nếu không, giữ đúng hồ sơ.",
    "- Hồ sơ trống ở một mục nghề/địa vị/quyền hạn/tài sản/năng lực = chưa xác định: đừng bịa chi tiết quan trọng cho mục đó, dùng chi tiết trung tính hoặc để mở. (NGOẠI LỆ: ngoại hình/vóc dáng/số đo trống thì được tự đặt chi tiết cụ thể, hợp lý.)",
    "- Trước khi viết mỗi cảnh, tự hỏi: nhân vật này có THẬT SỰ được phép nói/làm điều này theo hồ sơ không? Nếu không, đổi cách viết.",
    ...(cultRule ? [cultRule] : []),
    ...anatomyLock,
    "HỒ SƠ:", ...lines
  ].join("\n");
}

// --- V12.32.18: TIẾN ĐỘ ARC + OUTLINE THEO CHƯƠNG (chống truyện đi quá chậm) ---
function activeArcOf(st) { return ((st && st.arcs) || []).find(a => a && a.status === "active") || null; }
function outlineOf(st, n) { return ((st && st.outlinePlans) || []).find(o => o && n >= o.from && n <= o.to) || null; }
// Tách nội dung outline thành dòng theo chương: "Ch12: ...", "Chương 12: ...", "12. ...", "12) ...", "12 - ...".
// V14.5.7: outline dán từ Word/Google Docs hay chứa ngắt dòng mềm U+2028/U+2029/U+0085 (Shift+Enter) trước "Sự kiện:/Kháng cự:/Hậu quả:/Móc kết:".
// JS không coi chúng là xuống dòng thường và `.` không khớp chúng -> toàn bộ outline "không có chương nào". Đổi thành khoảng trắng (giữ nhãn cùng dòng như định dạng chuẩn).
/* V14.7.12: "Chương 6 Nội dung..." (không dấu : . ) – sau số) trước đây KHÔNG được nhận là tiêu đề chương; nếu cả outline viết kiểu đó thì không dòng nào khớp
   và chương 6 bị gán 900 ký tự ĐẦU outline (= nội dung chương 1–2) -> app đòi viết lại sự kiện chương 1–2 trong chương 6. Chuẩn hóa về "Chương 6: Nội dung...". */
function outlineNormalizeText(s) { return String(s || "").replace(/\r\n?/g, "\n").replace(/[\u2028\u2029\u0085\u000b\u000c]/g, " ").replace(/^([ \t]*(?:[-*•][ \t]*)?(?:chương|chuong|chapter|chap)\.?[ \t]*\d{1,4})[ \t]+(?=[^\s:.)\-–—\d])/gim, "$1: "); }
// Outline có đánh số chương nhưng không tách được dòng nào thì KHÔNG được lấy phần đầu outline làm dòng của chương hiện tại.
function outlineHasNumberedChapters(content) { return /(?:^|\n)[ \t]*(?:[-*•][ \t]*)?(?:chương|chuong|chapter|chap|ch)\.?[ \t]*\d/i.test(String(content || "")); }
// V14.5.6: outline đánh số lại từ 1 trong từng gói (gói áp dụng cho chương 7–12 nhưng viết Ch1…Ch6) -> đổi về số chương tuyệt đối để chương 9 không rơi vào dòng của chương khác.
function _outlineRemapLocal(map, ol) {
  if (!ol) return map;
  const from = Number(ol.from) || 1, to = Number(ol.to) || from, keys = Object.keys(map).map(Number);
  if (from <= 1 || !keys.length) return map;
  const mn = Math.min.apply(null, keys), mx = Math.max.apply(null, keys);
  if (!(mn < from && mx <= to - from + 1)) return map; // có khóa tuyệt đối hợp lệ -> giữ nguyên
  const out = {}; keys.forEach(k => { out[k + from - 1] = map[k]; });
  return out;
}
function outlineChapterLines(content, ol) {
  const map = {}; let cur = 0;
  /* V14.7.8: tiêu đề CHẶNG "Chương 2–3" / "Ch 4-5: ..." (nhiều chương chung một khối) trước đây bị đọc nhầm thành chương 2 với nội dung "3…" hoặc bị bỏ,
     nên outline dạng chặng không tới được kế hoạch từng chương. Nay: mọi dòng dưới tiêu đề chặng là nội dung chặng; chia đều cho các chương trong chặng,
     mỗi chương nhận nguyên nội dung kèm nhãn "phần k/n" để chỉ làm bước k, không dồn cả chặng vào một chương. */
  let range = null; const ranges = [];
  const closeRange = () => { if (range && range.body.length) ranges.push(range); range = null; };
  outlineNormalizeText(content).split(/\n+/).forEach(l => {
    const line = l.trim();
    const rm = line.match(/^(?:[-*•]\s*)?(?:ch(?:ư[ơ]ng)?\.?\s*)(\d{1,4})\s*[–—-]\s*(\d{1,4})\s*(?:[:.)]\s*)?(.*)$/i);
    const hm = !(rm && Number(rm[2]) > Number(rm[1])) ? line.match(/^(?:[-*•]\s*)?(?:chương|chuong|chapter|chap|ch)\.?\s*(\d{1,4})\s*[:.)\-–—]?\s*$/i) : null;
    if (hm) { closeRange(); cur = 0; range = { a: Number(hm[1]), b: Number(hm[1]), body: [] }; return; }
    if (rm && Number(rm[2]) > Number(rm[1]) && Number(rm[2]) - Number(rm[1]) <= 30) {
      closeRange(); cur = 0;
      range = { a: Number(rm[1]), b: Number(rm[2]), body: [] };
      if (rm[3] && rm[3].trim()) range.body.push(rm[3].trim());
      return;
    }
    const m = line.match(/^(?:[-*•]\s*)?(?:ch(?:ư[ơ]ng)?\.?\s*)?(\d{1,4})\s*[:.)\-–—]\s*(.+)$/i);
    if (m && m[2] && m[2].trim().length >= 8) { closeRange(); cur = Number(m[1]); map[cur] = m[2].trim(); return; }
    if (range) { if (line) range.body.push(line.replace(/^[•\-*–·▪◦●]\s*/, "")); return; }
    /* V14.4.1: dòng gạch đầu dòng (•, -, *, –, ·) nằm dưới tiêu đề chương là PHẦN CỦA chương đó. */
    if (cur && /^[•\-*–·▪◦●]\s*\S/.test(line)) {
      const piece = line.replace(/^[•\-*–·▪◦●]\s*/, "").trim();
      map[cur] += (/[.!?…;:]$/.test(map[cur]) ? " " : "; ") + piece;
    }
  });
  closeRange();
  ranges.forEach(r => {
    const n = r.b - r.a + 1, text = r.body.join(" ").replace(/\s+/g, " ").trim();
    for (let k = r.a; k <= r.b; k++) {
      if (map[k]) continue; // dòng chương riêng lẻ luôn thắng khối chặng
      if (n === 1) { map[k] = text; continue; }
      map[k] = "[Chặng " + r.a + "–" + r.b + ", chương này là phần " + (k - r.a + 1) + "/" + n + " — chỉ thực hiện bước thứ " + (k - r.a + 1) + " của chặng, các phần còn lại để dành cho chương sau; mỗi chương nên đổi địa điểm/tình huống/mức độ] " + text;
    }
  });
  return _outlineRemapLocal(map, ol);
}
/* V14.7.38: BƯỚC ARC TỰ ĐO. Không có Outline thì AI chỉ thấy 500 ký tự đầu của Arc. Tách Arc (viết theo thứ tự thời gian) thành các câu, so từ khóa
   (cặp âm tiết có trọng số hiếm) với tóm tắt các chương gần nhất để biết truyện thật sự đang ở câu nào; đưa "bước hiện tại" + "bước kế" cho kế hoạch chương.
   Phần trăm chương chỉ là mốc chặn (không cho nhảy quá xa) và đường lui khi độ khớp thấp. Phần Arc xa hơn KHÔNG đưa vào. */
function arcSentences(goal) {
  const raw = String(goal || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+/).filter(Boolean), out = [];
  raw.forEach(x => { if (out.length && out[out.length - 1].length < 45) out[out.length - 1] += ' ' + x; else out.push(x); });
  return out;
}
function _arcBigrams(text) {
  const w = _normWords(text), set = new Set();
  for (let i = 0; i + 2 <= w.length; i++) { if (w[i].length + w[i + 1].length >= 5) set.add(w[i] + ' ' + w[i + 1]); }
  return set;
}
function arcStageEstimate(st, n) {
  const arc = activeArcOf(st); if (!arc) return null;
  const sents = arcSentences(arc.goal); if (sents.length < 6) return null;
  const S = sents.length, start = Number(arc.startChapter) || 1, end = Number(arc.endChapterPlanned) || 0;
  const pctIdx = end > start ? Math.max(0, Math.min(S - 1, Math.floor(((n - start) / (end - start + 1)) * S))) : 0;
  const bg = sents.map(_arcBigrams), df = new Map();
  bg.forEach(set => set.forEach(b => df.set(b, (df.get(b) || 0) + 1)));
  /* Truyện luôn quay lại chủ đề cũ (cô thư ký, bảo vệ ca đêm...) nên câu khớp NHẤT của từng chương dao động; Arc lại theo thời gian → lấy mốc XA NHẤT đã chạm tới
     trong 6 chương gần nhất (mỗi chương cần độ khớp đủ cao), rồi chặn bằng phần trăm chương để một lần khớp nhầm không kéo AI nhảy xa. */
  const cap = Math.min(S - 1, pctIdx + Math.ceil(S * 0.3));
  const chs = ((st && st.chapters) || []).slice(0, Math.max(0, n - 1)).slice(-6);
  let best = -1;
  chs.forEach(ch => {
    const t = String((ch && (ch.summary || String(ch.text || '').slice(0, 1800))) || ''); if (!t) return;
    const cb = _arcBigrams(t); let top = -1, topS = 0;
    bg.forEach((set, k) => { let sc = 0; set.forEach(b => { if (cb.has(b)) sc += 1 / df.get(b); }); if (sc > topS || (sc === topS && sc > 0 && k > top)) { topS = sc; top = k; } });
    if (top >= 0 && topS >= 1.0 && top <= cap && top > best) best = top;   // khớp vượt mốc chặn = nhiều khả năng khớp nhầm → bỏ, không kẹp
  });
  let cur = best >= 0 ? Math.min(best, cap) : pctIdx, by = best >= 0 ? 'diễn biến' : 'tiến độ chương';
  return { sentences: sents, cur, by, pctIdx, S, ahead: cur - pctIdx >= Math.ceil(S * 0.15) };
}
function arcStageBlock(st, n) {
  let e = null; try { e = arcStageEstimate(st, n); } catch (_) { e = null; }
  if (!e) return '';
  const cut = (v, k) => v.length > k ? v.slice(0, k) + '…' : v;
  const now = e.sentences.slice(e.cur, e.cur + 2).join(' '), next = e.sentences.slice(e.cur + 2, e.cur + 4).join(' ');
  return 'BƯỚC ARC ƯỚC LƯỢNG (tự đo theo ' + e.by + '; chỉ là gợi ý nhịp, canon đã viết luôn ưu tiên hơn):\n- Đang ở: ' + cut(now, 520) + '\n- Bước kế (CHƯA làm hết ở chương này): ' + cut(next, 360) + '\n- ' + (e.ahead ? 'Truyện đang đi NHANH hơn nhịp trung bình của Arc: ưu tiên đào sâu bước hiện tại bằng diễn biến MỚI (biến cố, hệ quả, nhân vật phụ, leo thang khác kiểu) trước khi sang bước kế.' : '') + '\n- Nếu các chương trước đã làm xong "Đang ở" thì chuyển sang bước kế; KHÔNG nhảy quá một bước, KHÔNG dùng diễn biến xa hơn của Arc, KHÔNG lặp một bậc đã làm.';
}
function arcProgressPrompt(st, nOverride, opts) {
  const chapters = (st && Array.isArray(st.chapters)) ? st.chapters : [];
  const n = Number(nOverride) > 0 ? Number(nOverride) : chapters.length + 1;
  const arc = activeArcOf(st), lines = [];
  const cut = (v, k) => { v = String(v || "").replace(/\s+/g, " ").trim(); return v.length > k ? v.slice(0, k) + "…" : v; };
  if (arc) {
    const start = Number(arc.startChapter) || n, end = Number(arc.endChapterPlanned) || 0;
    lines.push("TIẾN ĐỘ ARC — ARC \"" + arc.name + "\": " + cut(arc.goal, 500));
    if (end && end >= start) {
      const total = end - start + 1, idx = Math.max(1, n - start + 1), left = end - n;
      if (left < 0) lines.push("- Arc đã QUÁ chương kết dự kiến (" + end + "). Chương này PHẢI đưa Arc tới điểm kết/giải quyết hoặc chuyển hẳn sang bước thu Arc; không kéo thêm.");
      else {
        lines.push("- Đây là chương " + idx + "/" + total + " của Arc (đã đi khoảng " + Math.round(((idx - 1) / total) * 100) + "%, còn " + left + " chương sau chương này).");
        lines.push(left === 0 ? "- ĐÂY LÀ CHƯƠNG CUỐI DỰ KIẾN của Arc: phải đạt mục tiêu Arc hoặc có kết cục rõ ràng." : (idx / total >= 0.5 ? "- Arc đã qua nửa chặng: các việc chưa giải quyết phải được đẩy mạnh về phía mục tiêu, không lặp lại bước đã làm." : "- Mỗi chương phải đưa Arc tiến thêm một bước cụ thể về phía mục tiêu."));
      }
    } else lines.push("- Arc chưa có chương kết dự kiến: mỗi chương vẫn phải đưa Arc tiến thêm một bước cụ thể (không đứng yên ở bước vừa làm).");
  }
  const ol = outlineOf(st, n);
  if (ol) {
    const per = outlineChapterLines(ol.content, ol), total = ol.to - ol.from + 1, idx = n - ol.from + 1;
    lines.push("OUTLINE \"" + ol.name + "\" (chương " + ol.from + "–" + ol.to + "), chương này là " + idx + "/" + total + ":");
    if (per[n]) {
      lines.push("- VIỆC BẮT BUỘC CỦA CHƯƠNG " + n + " THEO OUTLINE: " + cut(per[n], 900));
      if (per[n + 1]) lines.push("- (Chương " + (n + 1) + " sẽ làm, CHƯA làm ở chương này; chỉ cài móc nối): " + cut(per[n + 1], 300));
    } else lines.push(cut(ol.content, 1500));
    if (ol.to - n <= 1) lines.push("- Giai đoạn Outline sắp kết: chương này phải tiến tới mốc kết giai đoạn.");
  }
  if (opts && opts.stage && !ol) { const sb = arcStageBlock(st, n); if (sb) lines.push(sb); }   // V14.7.38
  return lines.join("\n");
}

// --- V14.4.0: KIỂM TRA OUTLINE TRƯỚC KHI VIẾT ---
// Mỗi chi tiết ép buộc trong Outline thành một beat [R] cần "bằng chứng" trong văn bản; Outline quá dài còn bị cắt khi đưa vào hợp đồng chương.
// Hàm thuần cấu trúc (không đánh giá nội dung): đo độ dài, số mục nhỏ, câu thoại bắt buộc, ràng buộc số lần/thứ tự, chuỗi bước nối tiếp.
function lintChapterOutline(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const out = { level: 'ok', chars: t.length, findings: [] };
  if (!t) return out;
  const add = (sev, code, short, msg) => out.findings.push({ sev, code, short, msg });
  if (t.length > 1100) add('high', 'LENGTH', 'dài ' + t.length + ' ký tự', 'Outline dài ' + t.length + ' ký tự: phần cuối có thể bị cắt khi đưa vào hợp đồng chương nên không được kiểm tra. Nên gọn còn khoảng 500–700 ký tự.');
  else if (t.length > 700) add('warn', 'LENGTH', 'dài ' + t.length + ' ký tự', 'Outline dài ' + t.length + ' ký tự (khuyến nghị 500–700). Càng dài càng nhiều chi tiết bị coi là bắt buộc.');
  const labels = (t.match(/(?:^|[\s.;])(?:Sự kiện|Cảnh nóng|Cảnh chính|Cảnh|Kháng cự|Hậu quả|Móc kết|Mục tiêu|Bối cảnh|Kết quả|Lưu ý|Yêu cầu|Phản ứng|Kết)\s*:/gu) || []).length;
  if (labels >= 6) add('high', 'SECTIONS', labels + ' mục nhỏ', 'Outline chia ' + labels + ' mục nhỏ (Sự kiện/Hậu quả/Móc kết…). Mỗi mục là một beat riêng cần bằng chứng; thiếu một mục là bị báo lỗi nặng. Gộp còn 3–5 ý chính.');
  else if (labels >= 4) add('warn', 'SECTIONS', labels + ' mục nhỏ', 'Outline có ' + labels + ' mục nhỏ; mỗi mục là một beat cần bằng chứng. Cân nhắc gộp bớt.');
  const quotes = (t.match(/[“"«][^”"»]{10,}[”"»]/gu) || []).length;
  if (quotes >= 3) add('high', 'QUOTES', quotes + ' câu thoại bắt buộc', quotes + ' câu thoại/chuỗi chữ cụ thể bị buộc phải xuất hiện đúng nguyên văn. Chỉ giữ câu thật sự then chốt, còn lại mô tả ý.');
  else if (quotes >= 2) add('warn', 'QUOTES', quotes + ' câu thoại bắt buộc', quotes + ' câu thoại cụ thể bị buộc phải xuất hiện; nên giữ 1 câu then chốt.');
  const forced = (t.match(/(?<![\p{L}])(?:liên tục|từng câu|từng chút một|lần\s*\d|lần thứ|\d+\s*lần|một lần|hai lần|ba lần|bốn lần|vài vòng|nhiều lần|đúng\s+\d+|lặp lại)(?![\p{L}])/giu) || []).length;
  if (forced >= 5) add('high', 'FORCED', forced + ' ràng buộc số lần/thứ tự', 'Có ' + forced + ' ràng buộc về số lần hoặc thứ tự (liên tục, lần 1/lần 2, từng câu…). Model hay làm thiếu một chỗ và AI duyệt báo lỗi nặng. Chỉ ghi kết quả cần đạt, để AI tự quyết số lần.');
  else if (forced >= 3) add('warn', 'FORCED', forced + ' ràng buộc số lần/thứ tự', 'Có ' + forced + ' ràng buộc về số lần hoặc thứ tự; hãy giữ những cái thật sự bắt buộc.');
  const seq = (t.match(/(?<![\p{L}])(?:sau đó|rồi|tiếp theo|tiếp đến|sau khi|xong|cuối cùng|kế đó|trong khi|đồng thời)(?![\p{L}])/giu) || []).length;
  if (seq >= 7) add('high', 'SEQ', seq + ' bước nối tiếp', 'Outline là chuỗi ' + seq + ' bước nối tiếp (sau đó, rồi, xong…). Nên viết thành 1–2 sự kiện chính kèm kết quả, không liệt kê từng thao tác.');
  else if (seq >= 4) add('warn', 'SEQ', seq + ' bước nối tiếp', 'Outline có ' + seq + ' bước nối tiếp; nên gom thành ít sự kiện hơn.');
  const steps = t.split(/(?<=[.!?;])\s+|\s+\+\s+|\s*→\s*/u).filter(x => x.trim().length >= 6).length;
  if (steps >= 14) add('high', 'STEPS', steps + ' ý', 'Outline có ' + steps + ' ý/câu; chương chỉ nên 1–2 sự kiện chính (3–6 beat).');
  else if (steps >= 9) add('warn', 'STEPS', steps + ' ý', 'Outline có ' + steps + ' ý/câu; khuyến nghị 3–6 beat.');
  const highs = out.findings.filter(f => f.sev === 'high').length, warns = out.findings.length - highs;
  out.level = (highs || warns >= 3) ? 'high' : (warns >= 1 ? 'warn' : 'ok');
  return out;
}
function outlineLintShort(rep) { return ((rep && rep.findings) || []).map(f => f.short).join(' · '); }
function formatOutlineLint(rep, chapterNumber) {
  if (!rep || !rep.findings || !rep.findings.length) return '';
  const head = 'Outline chương ' + (chapterNumber || '?') + ' ' + (rep.level === 'high' ? 'có vẻ QUÁ CHI TIẾT / quá dài' : 'hơi nhiều ràng buộc') + ' — dễ bị báo thiếu beat, lặp cảnh hoặc Hard failure khi duyệt:';
  return head + '\n' + rep.findings.map(f => '• ' + f.msg).join('\n') + '\n\nGợi ý: mỗi chương 1–2 sự kiện chính, 3–6 beat, mỗi beat một ý; chỉ ghi số lần/thứ tự/câu thoại khi thật sự bắt buộc; chi tiết phụ để AI tự bổ sung.';
}
// Trạng thái Outline cho giao diện: còn bao nhiêu chương có Outline phủ.
function outlineCoverageLeft(st) {
  const n = ((st && st.chapters) || []).length + 1;
  const tos = ((st && st.outlinePlans) || []).map(o => Number(o.to) || 0);
  if (!tos.length) return null;
  return Math.max(...tos) - n + 1;
}

// --- V12.32.9: CHUYỂN CẢNH + NGƯỜI CÓ MẶT (chống nhân vật "tự xuất hiện" hoặc biến mất vô cớ) ---
function scenePresencePrompt() {
  return [
    "CẢNH & NGƯỜI CÓ MẶT — BẮT BUỘC:",
    "- Mỗi cảnh có một địa điểm và một danh sách người có mặt rõ ràng. Nhân vật chỉ được nói/hành động khi đang ở trong cảnh.",
    "- Người MỚI vào cảnh phải có câu cho thấy họ đến (gõ cửa, bước vào, gọi điện/nhắn tin, xuất hiện ở cửa…) và vì sao họ biết/đến đúng lúc đó. Người RỜI cảnh phải có câu cho thấy họ đi (ra ngoài, cúp máy, bị đưa đi…). Không để ai tự xuất hiện hay biến mất giữa chừng.",
    "- Người đã rời đi thì KHÔNG còn nói, nghe hay phản ứng trong cảnh đó cho tới khi có câu cho họ quay lại.",
    "- Chuyển sang địa điểm/thời điểm khác: dùng một câu chuyển cảnh tự nhiên trong mạch kể (di chuyển, thời gian trôi) hoặc dòng ngăn cảnh, và cho thấy ai có mặt ở cảnh mới. Không lẫn lời thoại/hành động của cảnh cũ vào cảnh mới.",
    "- MỌI lần đổi địa điểm hoặc nhảy thời gian phải có 1–2 câu cầu nối nêu: rời nơi cũ bằng cách nào, đến nơi mới (đi/lái xe/đến nơi), và thời điểm mới. Không mở cảnh bằng việc nhân vật đã ở sẵn chỗ mới; không để nhân vật chính thấy người khác 'đã ngồi sẵn' mà không có câu hắn đến và nhìn thấy.",
    "- Cảnh có ≥3 người: mỗi lượt lời thoại phải rõ ai nói; không để người không có mặt (hoặc đã đi) nói chen vào."
  ].join("\n");
}
// --- V12.32.7: THỜI GIAN TRUYỆN (chống "10 chương vẫn là một ngày") ---
const TIME_PACE_TEXT = {
  scene: "mỗi chương nằm trong khoảng vài giờ đến hết một ngày",
  day: "mỗi chương cách chương trước khoảng MỘT NGÀY (có thể nhảy sang ngày kế tiếp)",
  fewdays: "mỗi chương cách chương trước khoảng VÀI NGÀY",
  week: "mỗi chương cách chương trước khoảng MỘT TUẦN trở lên"
};
// Mốc thời gian hiện tại: ô Story Clock (nhập tay) ưu tiên, nếu trống dùng mốc Status tự trích từ chương.
/* V14.7.23: trước đây ô Story Clock (nhập tay) LUÔN thắng mốc tự trích và không bao giờ được app cập nhật → đã nhập một lần là đồng hồ đứng yên
   dù chương đã qua ngày, và prompt cứ báo "thời điểm hiện tại" cũ. Nay mặc định TỰ THEO chương (storyClockAuto ≠ false); chỉ khi tác giả ghim tay (storyClockAuto = false) mới ưu tiên ô nhập tay. */
function autoTimeMark(st) {
  const ss = (st && st.statusState && typeof st.statusState === "object") ? st.statusState : {};
  return String((ss.currentState && ss.currentState.time) || "").trim();
}
function currentTimeMark(st) {
  const manual = String((st && st.storyClock) || "").trim();
  if (st && st.storyClockAuto === false && manual) return manual;
  return autoTimeMark(st) || manual;
}
/* Kéo Story Clock theo mốc Status sau mỗi chương (chỉ khi không ghim tay). Trả true nếu có đổi. */
function syncStoryClockFromStatus(st) {
  if (!st || st.storyClockAuto === false) return false;
  const auto = autoTimeMark(st);
  if (!auto || auto === String(st.storyClock || "").trim()) return false;
  st.storyClock = auto; return true;
}
// Phát hiện nhiều chương liền không đổi mốc thời gian (so mốc chuẩn hóa trong statusState.timeLog).
function timeStallInfo(st) {
  const ss = (st && st.statusState && typeof st.statusState === "object") ? st.statusState : {};
  const log = Array.isArray(ss.timeLog) ? ss.timeLog.filter(x => x && x.time) : [];
  if (log.length < 3) return null;
  const norm = t => String(t).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
  const last = norm(log[log.length - 1].time);
  let run = 1;
  for (let i = log.length - 2; i >= 0 && norm(log[i].time) === last; i--) run++;
  const span = Math.max(1, (Number(log[log.length - 1].chapter) || 0) - (Number(log[log.length - run].chapter) || 0) + 1);
  return run >= 3 ? { run, span, time: log[log.length - 1].time } : null;
}
function timePrompt(st) {
  const sc = normalizeStoryControl(st);
  const mark = currentTimeMark(st), stall = timeStallInfo(st);
  return [
    "THỜI GIAN TRUYỆN — CHẢY THEO MẠCH KỂ, NHƯ VĂN XUÔI THUẦN TÚY:",
    mark ? "- Dòng thời gian hiện tại (chỉ để bạn giữ nhất quán; KHÔNG cần nhắc lại trong văn): " + mark + "." : "",
    "- Thời gian là một phần của câu chuyện, không phải nhãn. KHÔNG mở chương bằng dòng/câu báo ngày giờ kiểu tiêu đề (\"Chiều thứ Sáu, ...\", \"Ngày 3, 9 giờ sáng\"), KHÔNG kết chương bằng câu tổng kết thời điểm, không ghi \"Thời gian:\". Chỉ nêu giờ/ngày cụ thể khi nhân vật thực sự nhìn đồng hồ/lịch/điện thoại hoặc tình tiết cần (hạn chót, hẹn giờ, khẩn cấp).",
    "- Chương có thể mở thẳng bằng hành động, cảnh hoặc lời thoại (tiếp nối đoạn kết chương trước). Để người đọc tự nhận ra thời điểm qua chi tiết trong cảnh: ánh sáng, thời tiết, bữa ăn, tiếng phố, độ mệt, việc nhân vật đang làm. Chương không nêu giờ giấc rõ ràng vẫn hoàn toàn đúng.",
    "- Khi thời gian TRÔI hoặc NHẢY (qua đêm, vài ngày, vài tuần), thể hiện bằng một mệnh đề/câu nằm ngay trong mạch kể (\"Mãi tới sáng hôm sau, ...\", \"Ba hôm sau, khi vết bầm đã nhạt, ...\") hoặc qua hệ quả quan sát được; không dùng khối thông báo riêng. Nếu sự kiện chương trước ĐÃ KẾT THÚC TRỌN (không còn cảnh đang dở), chương mới ĐƯỢC PHÉP nhảy thời gian theo cách đó; việc dang dở thì phải tiếp nối đúng thời điểm đó.",
    "- Nội bộ phải nhất quán: thời gian chỉ trôi về phía trước; nhân vật ăn/ngủ/đi lại/hồi phục/thay đổi hợp với khoảng thời gian đã trôi; quan hệ, vết thương, kế hoạch, công việc tiến triển theo thời gian, không dồn nhiều chương liên tiếp vào cùng một buổi/một ngày nếu không có lý do cốt truyện.",
    sc.timePace ? "- NHỊP THỜI GIAN do tác giả chọn: " + TIME_PACE_TEXT[sc.timePace] + "." : "",
    stall ? "- CẢNH BÁO: " + stall.run + " chương liên tiếp (khoảng " + stall.span + " chương gần nhất) vẫn cùng một mốc \"" + String(stall.time).slice(0, 80) + "\". Chương này PHẢI cho thời gian trôi tiếp: khép việc đang dở rồi để thời gian chảy qua đêm/sang hôm sau/vài ngày bằng một câu chuyển tự nhiên trong mạch kể, không tiếp tục cùng một ngày." : ""
  ].filter(Boolean).join("\n");
}

function storyControlPrompt(st) {
  const sc = normalizeStoryControl(st);
  return [
    "STORY CONTROL LAYER — BẮT BUỘC:",
    `- Ngân sách sự kiện: tối đa ${sc.maxMainEvents} sự kiện trục chính. Được phép có biến cố lớn LỒNG BÊN TRONG một sự kiện khi nó là nguyên nhân, bước ngoặt, phản ứng hoặc hậu quả trực tiếp của sự kiện đó và thật sự cần cho mạch truyện; không tính thành sự kiện chính thứ ${sc.maxMainEvents + 1}. Không tự thêm biến cố lồng nếu chương đã đủ lực.`,
    `- Nhân vật có tên xuất hiện trực tiếp: tối đa ${sc.maxNamedCharacters}; ưu tiên nhân vật đã tồn tại.`,
    `- Thread mới: tối đa ${sc.maxNewThreads}; không mở tuyến mới chỉ để kéo dài chương.`,
    "- Continuity: nguyên nhân → hành động → phản ứng → hậu quả phải nhất quán với trạng thái hiện tại.",
    sc.noRetcon ? "- NO RETCON: không tự sửa lịch sử, canon hoặc ký ức đã xác nhận. Nếu phát hiện mâu thuẫn, giữ nguyên dữ liệu cũ và đánh dấu xung đột để xử lý sau." : "",
    `- STATE LOCK: không tự ý thay đổi các trường canon/quan trọng (${sc.lockedFields.join(", ")}). Muốn thay đổi phải có sự kiện trong truyện làm bằng chứng và cập nhật trạng thái sau chương.`,
    sc.agencyRequired ? "- CHARACTER AGENCY: nhân vật quan trọng phải có mục tiêu, động cơ, phản ứng và lựa chọn riêng; không biến nhân vật thành công cụ của plot." : "",
    "- NHÂN VẬT PHỤ CÓ ĐỜI RIÊNG: nhân vật phụ có tên không chỉ phản ứng với nhân vật chính; họ có việc riêng, mong muốn riêng, tự quyết định và hành động chủ động (kể cả khi nhân vật chính không có mặt). Ngôi 3 giới hạn nghĩa là mỗi cảnh/đoạn bám sát MỘT nhân vật (thường là nhân vật chính, nhưng cảnh khác có thể bám nhân vật phụ), không nhảy vào đầu nhiều người trong cùng một đoạn.",
    "- Không tự tạo nhân vật quan trọng mới nếu nhân vật hiện có có thể đảm nhiệm vai trò đó.",
    "- Không tạo năng lực, quy tắc thế giới hoặc vật phẩm quan trọng mới chỉ để giải quyết vấn đề tức thời.",
    "- Chapter Focus chỉ kiểm soát phạm vi chủ đề trưởng thành; không được dùng nó để mở rộng cốt truyện ngoài brief.",
    "- Nếu Directive/Story Bible/Current Status xung đột, không âm thầm sửa canon; ưu tiên dữ liệu canon và ghi nhận xung đột khi cần.",
    "- ĐƯỢC TỰ DO: thêm cảnh phụ, chuyển cảnh, hội thoại, nội tâm, giác quan, hành động nhỏ và cả biến cố lồng khi chúng phục vụ trực tiếp một trong các sự kiện trục. Biến cố lồng phải có quan hệ nhân-quả rõ, không mở arc độc lập, không thêm nhân vật quan trọng mới và không phải chương nào cũng cần. Quyền tự do này KHÔNG áp dụng cho địa vị, nghề, quyền hạn, tài sản, năng lực, tuổi, kiến thức và cách nói của nhân vật — các điều đó phải đúng HỒ SƠ.",
    "- TIẾN TRIỂN: chiều sâu KHÔNG có nghĩa là đứng yên — cuối chương phải có ít nhất một thay đổi thật (quan hệ, thông tin, quyền lực, mục tiêu hoặc hậu quả); không lặp cùng hành động/miêu tả để kéo dài.",
    "- Mục tiêu là chiều sâu và tính liên tục, không phải nhồi thêm biến cố lớn.",
    scenePresencePrompt(),
    timePrompt(st)
  ].filter(Boolean).join("\n");
}

// --- Kiểm tra cứng xác định (không gọi AI). Hai ngân sách sự kiện/nhân vật do Auditor đếm, evaluateReview áp ngưỡng. ---
function gateHardChecks(chapter) {
  const text = String((chapter && chapter.text) || "");
  const warns = (chapter && chapter.continuityWarnings) || [];
  // V14.5.9: Quality Gate KHÔNG chấm số từ — độ dài do bước viết/bù từ lo; Gate chỉ chặn bản rỗng.
  return [
    { id: "language", ok: !detectNonVietnamese(text), message: "Ngôn ngữ: tiếng Việt" },
    { id: "text_nonempty", ok: text.trim().length > 0, message: "Bản thảo có nội dung" },
    { id: "duplicate", ok: !warns.some(x => x && (x.severity === "high" || x.severity === "critical")), message: "Không có lỗi continuity mức cao đã phát hiện" }
  ];
}
// Tên nhân vật đã biết (hồ sơ NV chính + danh sách NV) — dùng để đếm tự động bằng chứng cho Auditor.
function gateKnownNames(st) {
  const out = [], seen = new Set();
  const add = n => { n = String(n || "").trim(); if (n.length >= 2 && !seen.has(n)) { seen.add(n); out.push(n); } };
  add(st && st.mainCharProfile && st.mainCharProfile.name);
  ((st && st.characters) || []).forEach(c => add(c && c.name));
  return out;
}
// Những tên đã biết thật sự xuất hiện trong văn bản (khớp nguyên từ, phân biệt hoa/thường để tránh nhầm từ thường như "lan", "hoa").
function knownNameMentions(text, names) {
  const t = String(text || ""), found = [];
  (names || []).forEach(n => {
    const esc = String(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp("(^|[^\\p{L}\\p{N}])" + esc + "(?![\\p{L}\\p{N}])", "u").test(t)) found.push(n);
  });
  return found;
}

// --- Prompt Auditor: phần khung/quy tắc/schema dùng chung; ngữ cảnh do client/worker tự truyền vào ---
const GATE_REVIEW_SCHEMA = '{"score":0,"verdict":"PASS|SOFT_FAIL|HARD_FAIL","dimensions":{"continuity":0,"characterConsistency":0,"canonConsistency":0,"plotDiscipline":0,"worldRules":0,"outlineCompliance":0,"style":0,"pacing":0,"knowledgeConsistency":0},"mainEventCount":0,"namedCharacterCount":0,"unauthorizedImportantCharacter":false,"knowledgeViolation":false,"retcon":false,"profileViolation":false,"profileViolations":[],"genderAnatomyMismatch":false,"genderAnatomyNotes":[],"stagnation":false,"stagnationNotes":[],"timeStagnation":false,"timeNotes":[],"sceneViolation":false,"sceneNotes":[],"arcStall":false,"arcNotes":[],"appearanceVague":false,"appearanceNotes":[],"outlineDeviation":false,"listLikeProse":false,"listLikeNotes":[],"weakHook":false,"hookNotes":[],"hardFailures":[],"warnings":[],"suggestions":[],"rewriteInstructions":[]}';
// p: { storyControl, contract, contractLabel, context, warnings, draft, hardChecks, knownNames, maxMainEvents, maxNamedCharacters }
/* V12.32.3: tiết kiệm token cho Review/Rewrite. Trước đây cắt cứng đầu 18000/15000 ký tự -> vừa tốn vừa dễ mất
   Current Status (nằm cuối ngữ cảnh). Nay: bỏ các khối không liên quan tới việc chấm/sửa (văn phong, mức miêu tả,
   độ khó, từ cấm...), rồi nếu vẫn dài thì giữ đầu 40% + cuối 60% (có Current Status/Threads). */
const GATE_CTX_DROP_ALWAYS = /^(MỨC MIÊU TẢ|MỨC 18\+|VĂN PHONG|ĐỘ KHÓ|TỪ MUỐN DÙNG|TỪ CẦN TRÁNH|CỤM ĐÃ LẶP|CÁCH GỌI BỘ PHẬN)/;
const GATE_CTX_DROP_REVIEW = /^(STYLE:|CẤM TỪ)/;
function compactGateContext(ctx, maxChars, forReview) {
  const blocks = String(ctx || "").split(/\n\n+/).filter(b => b && !GATE_CTX_DROP_ALWAYS.test(b.trim()) && !(forReview && GATE_CTX_DROP_REVIEW.test(b.trim())));
  const s = blocks.join("\n\n");
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.floor(maxChars * 0.4)) + "\n[...]\n" + s.slice(-Math.floor(maxChars * 0.6));
}
function buildQualityReviewPrompt(p) {
  const evN = Number(p.maxMainEvents) || 3, chN = Number(p.maxNamedCharacters) || 6;
  const known = (p.knownNames || []);
  return [
    "Bạn là QUALITY AUDITOR cho tiểu thuyết dài kỳ.",
    "Mục tiêu: kiểm tra bản thảo so với Chapter Contract, Story Bible và continuity. KHÔNG viết lại chương.",
    "Trả DUY NHẤT JSON object theo schema cuối.",
    "STORY CONTROL:", p.storyControl || "",
    p.characterLock || "",
    (p.contractLabel || "CHAPTER CONTRACT / OUTLINE") + ":", p.contract || "(không có)",
    p.arcProgress ? ("TIẾN ĐỘ ARC / OUTLINE (chương này phải thực hiện):\n" + p.arcProgress) : "",
    "BỐI CẢNH/CANON TÓM LƯỢC:", compactGateContext(p.context, 9000, true),
    "BEAT LEDGER AUDIT — ưu tiên mã [R1], [R2]... là BEAT BẮT BUỘC; chỉ đánh hard failure khi [R] thiếu bằng chứng cụ thể trong bản thảo (hành động/lời thoại/thông tin/hậu quả). Mã [S1], [S2]... là beat hỗ trợ do AI đề xuất, không được tự biến thành hard failure và có thể bỏ nếu gây gượng ép. Với kế hoạch cũ dùng [B1], chỉ coi là bắt buộc nếu chính dòng đó ghi rõ REQUIRED/BẮT BUỘC hoặc xuất phát trực tiếp từ brief/Outline; không coi mọi ý AI tự thêm là canon. Nếu [R] thiếu, ghi rõ mã, nguồn bắt buộc và vị trí hợp lý để chèn trước đoạn kết. Nếu đã có, trích dẫn bằng chứng ngắn để tránh sửa nhầm.",
    "CONTINUITY WARNINGS ĐÃ PHÁT HIỆN:", JSON.stringify(p.warnings || []).slice(0, 6000),
    p.prevEnding ? ("ĐOẠN KẾT CHƯƠNG TRƯỚC (để đối chiếu địa điểm/thời điểm/người có mặt ở cảnh mở đầu):\n" + String(p.prevEnding).slice(-1500)) : "",
    "BẢN THẢO CHƯƠNG:", String(p.draft || "").slice(0, 50000),
    "KIỂM TRA CỨNG ĐÃ CÓ:", JSON.stringify(p.hardChecks || []),
    known.length ? "TÊN NHÂN VẬT ĐÃ BIẾT XUẤT HIỆN TRONG VĂN BẢN (đếm tự động, chỉ để tham khảo khi đếm namedCharacterCount): " + known.join(", ") : "",
    "QUY TẮC:",
    "- mainEventCount phải là số sự kiện chính thực sự (tối đa " + evN + "), không đếm scene beat/hành động nhỏ.",
    "- namedCharacterCount chỉ đếm nhân vật có tên riêng xuất hiện trực tiếp; tối đa " + chN + ".",
    "- unauthorizedImportantCharacter=true nếu xuất hiện nhân vật mới quan trọng mà outline/brief không cho phép.",
    "- knowledgeViolation=true nếu nhân vật biết điều họ chưa thể biết.",
    "- retcon=true nếu mâu thuẫn canon đã xác nhận.",
    "- stagnation=true CHỈ KHI cuối chương hầu như không có thay đổi nào so với đầu chương (quan hệ/thông tin/quyền lực/mục tiêu/hậu quả) HOẶC một cảnh lặp lại cùng hành động/miêu tả nhiều lần chỉ để kéo dài. Ghi 1–2 ví dụ ngắn vào stagnationNotes. Cảnh trưởng thành đủ dài nhưng có đổi quan hệ/quyền lực/hậu quả thì KHÔNG phải stagnation.",
    p.arcProgress ? "- arcStall=true CHỈ KHI chương hoàn toàn không thực hiện việc bắt buộc/bước tiến nêu trong TIẾN ĐỘ ARC/OUTLINE (không có sự kiện nào đưa Arc hay giai đoạn Outline tới gần mục tiêu hơn so với đầu chương; chỉ tả thêm/lặp lại không tính). Ghi 1 dẫn chứng ngắn vào arcNotes. Nếu chương đã làm được việc bắt buộc của Outline hoặc có một bước tiến thật của Arc thì KHÔNG báo." : "",
    "- sceneViolation=true CHỈ KHI có CÂU CỤ THỂ trong bản thảo cho nhân vật nói/hành động/phản ứng khi họ KHÔNG có mặt trong cảnh (chưa được nói là đến, hoặc đã rời đi mà không quay lại), hoặc lời thoại/hành động của cảnh cũ lẫn sang cảnh mới không có chuyển cảnh. Ghi trích dẫn ngắn + tên nhân vật vào sceneNotes. Không báo nếu chỉ là nhân vật ở gần/đang nghe được hợp lý. THIẾU câu chuyển cảnh/nhảy địa điểm hay thời gian mà KHÔNG có nhân vật nào nói/làm khi vắng mặt thì KHÔNG phải sceneViolation: ghi vào warnings, không ghi vào hardFailures; và không ghi cùng một lỗi vừa vào hardFailures vừa bật sceneViolation.",
    "- timeStagnation=true CHỈ KHI có BẰNG CHỨNG CỤ THỂ thời gian trong truyện sai hoặc đứng yên: (a) thời gian đi lùi/mâu thuẫn (vừa tối đã lại là buổi sáng cùng ngày không lý do; vết thương, hạn chót, tuổi, ngày tháng không khớp), hoặc (b) chương mở lại đúng thời điểm chương trước dù sự kiện trước đã kết thúc trọn và không có lý do cốt truyện. Ghi 1 dẫn chứng ngắn vào timeNotes. TUYỆT ĐỐI KHÔNG báo chỉ vì chương không ghi ngày/giờ/mốc rõ ràng ở đầu hay cuối chương: văn xuôi tự nhiên để thời gian ngầm hiểu qua chi tiết, thiếu nhãn thời gian KHÔNG phải lỗi. Đây chỉ là CẢNH BÁO mềm, không chặn.",
    "- appearanceVague=true CHỈ KHI có nhân vật có tên xuất hiện lần đầu hoặc cảnh tả cơ thể mà chỉ dùng tính từ trống (đẹp, to, đầy đặn…) không kèm kích thước/hình dáng/so sánh cụ thể nào để hình dung. Ghi tên nhân vật vào appearanceNotes. Chỉ là CẢNH BÁO mềm.",
    p.characterLock ? "- profileViolation=true CHỈ KHI có câu/đoạn CỤ THỂ trong bản thảo trái rõ ràng với HỒ SƠ KHÓA (nhân vật nói hoặc hành xử như có địa vị/quyền/tài sản/năng lực/kiến thức cao hơn hồ sơ; xưng hô hoặc giọng nói sai thiết lập; đổi nghề). Ghi trích dẫn ngắn + mục hồ sơ bị vi phạm vào profileViolations; không báo nếu chỉ suy đoán hoặc thiếu thông tin." : "",
    p.characterLock ? "- genderAnatomyMismatch=true nếu bản thảo gán cho một nhân vật bộ phận, đặc điểm hoặc phản ứng sinh học không phù hợp giới tính ghi trong HỒ SƠ KHÓA. Ghi đúng tên nhân vật, trích dẫn ngắn và giới tính hồ sơ vào genderAnatomyNotes. Đây là HARD FAILURE, không được chấm PASS." : "",
    p.prevEnding ? "- ĐỊA ĐIỂM MỞ CHƯƠNG: nếu cảnh mở đầu của bản thảo KHÁC địa điểm/thời điểm/người có mặt so với ĐOẠN KẾT CHƯƠNG TRƯỚC mà không có đoạn chuyển cảnh hợp lý (ví dụ chương trước kết ở biệt thự của A nhưng chương này mở ở phòng trọ của B), phải ghi vào hardFailures (nêu rõ kết ở đâu, mở ở đâu) và đặt continuity thấp." : "",
    "- outlineDeviation=true nếu bỏ mốc bắt buộc hoặc mở tuyến lớn ngoài contract.",
    "- HƯỚNG SỬA (rewriteInstructions, suggestions) PHẢI bám Chapter Contract/Outline: KHÔNG đề xuất xoá, thay hoặc làm nhẹ beat/sự kiện/lời thoại bắt buộc [R] của Outline; KHÔNG đề xuất thêm cảnh phụ, tuyến mới hoặc nội dung ngoài Outline (vd 'thay bằng cảnh phụ đời thường'). Nếu có đoạn lặp: giữ MỘT bản đầy đủ nhất và bổ sung phần Outline còn thiếu bằng nội dung đúng beat đó. Mỗi hướng sửa ghi rõ phục vụ [R#] nào hoặc 'văn phong/chuyển cảnh'. Không chắc thì đề xuất sửa cách viết, không đổi nội dung.",
    /* V14.2: chấm theo phong cách "chậm – sâu – ít sự kiện" (1–2 việc chính/chương, một cảnh trọng tâm). */
    "- CÁCH ĐẾM SỰ KIỆN: phần dẫn dắt + cảnh nóng/cảnh cao trào chính + hậu quả trực tiếp của nó là MỘT sự kiện chính, không tách thành nhiều. Chương chỉ có 1–2 sự kiện nhưng viết chậm, dày, có một bước tiến rõ về quyền lực hoặc tu luyện (cảnh giới, công pháp, thực lực) hay tâm lý là ĐÚNG phong cách mong muốn — KHÔNG trừ điểm pacing, KHÔNG báo arcStall/stagnation chỉ vì ít sự kiện hay một cảnh dài. Chương nhồi nhiều sự kiện/địa điểm/nhiều cảnh nóng mới là lỗi nhịp.",
    "- listLikeProse=true CHỈ KHI một đoạn dài (từ ~6 câu) chủ yếu là chuỗi hành động nối nhau kiểu 'rồi… rồi… tiếp theo…' mà thiếu phản ứng cảm xúc, cảm giác cơ thể, nội tâm hoặc thế quyền lực đổi qua từng bước; hoặc cảnh nóng chỉ liệt kê tư thế/hành động. Ghi 1–2 trích dẫn ngắn vào listLikeNotes. Chỉ là CẢNH BÁO mềm, không đưa vào hardFailures.",
    "- weakHook=true nếu câu/đoạn cuối chương KHÔNG để lại móc nào: lệnh mới chưa thực hiện, nghi ngờ/nguy cơ bị phát hiện, ham muốn chưa được thỏa, hoặc nhân vật bắt đầu có ý nghĩ nguy hiểm/phụ thuộc hơn. Ghi 1 dẫn chứng ngắn vào hookNotes. Chỉ là CẢNH BÁO mềm.",
    "- LẶP: nếu cách hành hạ/tư thế/lời thoại/phản ứng giống hệt chương trước (theo bối cảnh/đoạn kết chương trước), ghi vào warnings và hạ điểm style; không đưa vào hardFailures trừ khi lặp nguyên cảnh.",
    "- hardFailures phải chứa mọi lỗi chặn Sync. Nếu có hard failure thì verdict phải HARD_FAIL dù score cao.",
    "SCHEMA: " + GATE_REVIEW_SCHEMA
  ].filter(x => x !== "").join("\n\n");
}
// p: { chapterNumber, storyControl, contract, contractLabel, context, review, draft }
function buildRewritePrompt(p) {
  const review = p.review || {};
  const stagnationFix = review.stagnation ? [
    "SỬA STAGNATION BẮT BUỘC:",
    "- Không lặp lại ý niệm/ẩn dụ 'vách ngăn vô hình', cô độc hoặc khinh miệt xã hội nếu không có thông tin mới.",
    "- Giữ nguyên phần đúng nhưng phải tạo ít nhất MỘT thay đổi cụ thể và không thể coi như chưa xảy ra: mục tiêu đổi, thông tin mới được xác nhận, quan hệ/quyền lực thay đổi, quyết định có hậu quả, hoặc hành động mở ra bước tiếp theo.",
    "- Thay đổi phải xuất hiện trong hành động/thoại/hậu quả ở cuối chương, không chỉ được tuyên bố trong nội tâm."
  ].join("\n") : "";
  return [
    "SỬA LẠI BẢN THẢO CHƯƠNG " + p.chapterNumber + " THEO QUALITY REVIEW.",
    "Chỉ sửa đúng các lỗi được nêu; giữ nguyên các sự kiện hợp lệ, nhân vật hợp lệ, POV, xưng hô và giọng văn.",
    "TUYỆT ĐỐI không thêm sự kiện chính mới, không tạo nhân vật quan trọng mới, không mở thread mới chỉ để làm bản sửa dài hơn.",
    "ƯU TIÊN TUYỆT ĐỐI: OUTLINE/CONTRACT luôn thắng HƯỚNG SỬA. Bỏ qua mọi gợi ý nào xoá/thay/làm nhẹ beat, sự kiện hoặc lời thoại bắt buộc của Outline, hoặc thêm cảnh/tuyến ngoài Outline; chỉ áp dụng phần sửa cách viết, lặp, chuyển cảnh, thiếu beat.",
    p.storyControl || "",
    p.characterLock || "",
    (p.contractLabel || "OUTLINE/CONTRACT") + ":\n" + (p.contract || ""),
    p.context ? "CANON CONTEXT:\n" + compactGateContext(p.context, 8000, false) : "",
    p.prevEnding ? "ĐOẠN KẾT CHƯƠNG TRƯỚC (cảnh mở đầu phải nối tiếp đúng địa điểm/thời điểm/người có mặt ở đây):\n" + String(p.prevEnding).slice(-1500) + unfinishedHotSceneNote(p.prevEnding) : "",
    (p.review && p.review.alreadyFixed && p.review.alreadyFixed.length) ? "LỖI ĐÃ SỬA Ở VÒNG TRƯỚC — giữ nguyên các chỗ đã sửa, không làm hỏng lại:\n- " + p.review.alreadyFixed.join("\n- ") : "",
    "QUALITY REVIEW:\n" + JSON.stringify(review),
    stagnationFix,
    "HƯỚNG SỬA ƯU TIÊN (chỉ áp dụng phần KHÔNG mâu thuẫn Outline/Contract; mâu thuẫn thì Outline thắng):\n" + rewriteInstructionsText(review),
    "BẢN THẢO HIỆN TẠI:\n" + (p.draft || ""),
    "CHỈ TRẢ VỀ VĂN XUÔI CHƯƠNG ĐÃ SỬA, KHÔNG tiêu đề, không giải thích, không markdown."
  ].filter(Boolean).join("\n\n");
}

// --- Vòng lặp Gate dùng chung. Không gọi AI trực tiếp: client/worker truyền các hàm vào qua `deps`. ---
// deps: { review(attempt)→{ok,review|reason}, rewrite(review,attempt)→{ok,stopped,reason}, selfCheck?(attempt), onStatus?(msg), onChange?(), shouldStop?() }
// opts: { enabled, allowRewrite, maxAttempts, forceWarnings }
function bypassReview() {
  return { status: "bypassed", score: null, verdict: "BYPASS", dimensions: {}, hardFailures: [], warnings: ["Quality Gate đang tắt"], suggestions: [], rewriteInstructions: [], attempt: 0, reviewedAt: Date.now() };
}
// Khi người dùng bấm AI tự sửa, cảnh báo Canon/continuity có hướng xử lý
// không được bị coi là "PASS nên bỏ qua". Cảnh báo style thuần túy vẫn không ép sửa.
function hasActionableCanonWarning(review) {
  const r = review || {};
  const text = [].concat(r.warnings || [], r.rewriteInstructions || []).map(gateItemText).join(" ");
  return /(canon|continuity|liên tục|beat|outline|required|\[r\d+\]|hồ sơ|giới tính|hôn nhân|thế giới|knowledge|retcon|địa điểm|thời gian|cảnh\/người|nhân vật có mặt|mâu thuẫn)/i.test(text);
}
// V12.36 → V14.0.16 (hoist để dùng chung với tự sửa sau chấm nhanh): verdict tốt hơn thắng (PASS > SOFT_FAIL > HARD_FAIL), rồi tới điểm, rồi ít lỗi nặng hơn.
function reviewVerdictRank(v) { return v === "PASS" ? 3 : (v === "SOFT_FAIL" ? 2 : 1); }
function reviewIsBetter(a, b) {
  if (!b) return true;
  const vr = reviewVerdictRank(a && a.verdict) - reviewVerdictRank(b && b.verdict);
  if (vr !== 0) return vr > 0;
  const sd = Number(a && a.score || 0) - Number(b && b.score || 0);
  if (sd !== 0) return sd > 0;
  const ha = (a && a.hardFailures || []).length, hb = (b && b.hardFailures || []).length;
  if (ha !== hb) return ha < hb;
  // V14.1.6: điểm bằng nhau nhưng ít chỗ thiếu chuyển cảnh hơn => bản vá chèn câu chuyển cảnh được giữ.
  return transitionWarnings(a).length < transitionWarnings(b).length;
}
async function runGateLoop(chapter, deps, opts) {
  opts = opts || {}; deps = deps || {};
  const notify = () => { if (deps.onChange) deps.onChange(); };
  const stopped = () => !!(deps.shouldStop && deps.shouldStop());
  if (opts.enabled === false) { chapter.status = "APPROVED"; chapter.review = bypassReview(); notify(); return { approved: true }; }
  const maxAttempts = opts.allowRewrite === false ? 1 : gateMaxAttempts(opts.maxAttempts);
  const seenHard = []; // lỗi nặng của từng vòng đã chấm, để vòng sau không làm hỏng lại chỗ đã sửa
  // V12.36: không được để một lần tự sửa làm tụt chất lượng rồi ghi đè bản tốt hơn.
  // Ưu tiên verdict tốt hơn (PASS > SOFT_FAIL > HARD_FAIL), sau đó mới so điểm.
  const isBetterReview = reviewIsBetter;
  let bestReview = null, bestText = String(chapter.text || ""), bestWordCount = chapter.wordCount;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (stopped()) return { approved: false, stopped: true };
    if (deps.selfCheck) { chapter.status = "SELF_CHECKING"; notify(); await deps.selfCheck(attempt); }
    chapter.status = "REVIEWING"; chapter.review = Object.assign({}, chapter.review || {}, { attempt }); notify();
    const rr = await deps.review(attempt);
    if (!rr || !rr.ok) {
      const reason = (rr && rr.reason) || "review_error";
      chapter.review = Object.assign({}, chapter.review, { status: "error", verdict: "REVIEW_ERROR", warnings: ["Không đọc được kết quả Quality Review: " + reason] });
      chapter.status = "REVISION_REQUIRED"; notify();
      return { approved: false, error: reason };
    }
    chapter.review = Object.assign({}, chapter.review, rr.review, { status: "completed", attempt, reviewedAt: Date.now() });
    if (isBetterReview(rr.review, bestReview)) {
      bestReview = Object.assign({}, rr.review);
      bestText = String(chapter.text || "");
      bestWordCount = chapter.wordCount;
    }
    const forceActionableWarning = opts.forceWarnings === true && hasActionableCanonWarning(rr.review);
    if (rr.review.verdict === "PASS" && !forceActionableWarning) { chapter.status = "APPROVED"; notify(); return { approved: true, review: rr.review }; }
    if (forceActionableWarning && deps.onStatus) deps.onStatus("Quality Gate: phát hiện cảnh báo Canon cần xử lý — đang gửi cho AI tự sửa...");
    // V12.32.12: chỉ còn cảnh báo nhẹ (điểm ≥ ngưỡng mềm, KHÔNG có hard failure) → duyệt kèm cảnh báo, không chạy thêm vòng.
    if (opts.acceptSoft !== false && rr.review.verdict === "SOFT_FAIL" && !(rr.review.hardFailures || []).length) {
      chapter.review.softAccepted = true;
      chapter.review.warnings = (chapter.review.warnings || []).concat(["Duyệt kèm cảnh báo: điểm " + rr.review.score + " chưa tới ngưỡng PASS nhưng không có lỗi nặng."]);
      chapter.status = "APPROVED"; notify(); return { approved: true, softAccepted: true, review: chapter.review };
    }
    seenHard.push((rr.review.hardFailures || []).map(gateItemText));
    chapter.status = "REVISION_REQUIRED"; notify();
    if (attempt >= maxAttempts) break;
    if (deps.onStatus) deps.onStatus("Quality Gate: " + rr.review.verdict + " — đang sửa lần " + (attempt + 1) + "/" + maxAttempts + "...");
    const normKey = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
    const nowKeys = new Set((rr.review.hardFailures || []).map(gateItemText).map(normKey));
    const alreadyFixed = [].concat(...seenHard.slice(0, -1)).filter((s, i, a) => !nowKeys.has(normKey(s)) && a.findIndex(x => normKey(x) === normKey(s)) === i).slice(-6);
    const rw = await deps.rewrite(alreadyFixed.length ? Object.assign({}, rr.review, { alreadyFixed }) : rr.review, attempt);
    if (rw && rw.stopped) return { approved: false, stopped: true };
    if (!rw || !rw.ok) {
      chapter.review.warnings = (chapter.review.warnings || []).concat(["Bản sửa bị từ chối: " + ((rw && rw.reason) || "không rõ") + " — giữ nguyên bản thảo."]);
      notify(); break;
    }
    chapter.review.revisionTrace = (chapter.review.revisionTrace || []).concat([{
      attempt,
      patched: Number(rw.patched || 0),
      trace: rw.trace || [],
      skippedReasons: rw.skippedReasons || []
    }]);
    chapter.review.warnings = (chapter.review.warnings || []).concat(["AI tự sửa: đã áp dụng " + Number(rw.patched || 0) + " thao tác vá; bản sửa sẽ được chấm lại. Không có thao tác nào bị coi là đã sửa nếu chưa ghép được vào văn bản."]);
    notify();
  }
  // Nếu các vòng sửa sau làm điểm tụt, khôi phục bản tốt nhất đã được chấm.
  if (bestReview && String(chapter.text || "") !== bestText) {
    chapter.text = bestText;
    chapter.wordCount = bestWordCount;
    chapter.review = Object.assign({}, bestReview, {
      status: "completed",
      attempt: Math.max(Number(bestReview.attempt) || 0, Number(chapter.review && chapter.review.attempt) || 0),
      regressionGuard: true,
      warnings: (bestReview.warnings || []).concat(["Best Draft Guard: bản sửa sau có điểm thấp hơn nên đã khôi phục bản tốt hơn (" + bestReview.score + "/100)."])
    });
    if (deps.onChange) deps.onChange();
  }
  chapter.status = "REVISION_REQUIRED";
  return { approved: false, review: chapter.review };
}


/* ===== V14.0.16 — TỰ SỬA SAU CHẤM NHANH (dùng chung client + worker) =====
   Sau khi chấm nhanh một bản nháp: nếu có lỗi nặng (hoặc cảnh báo Canon/continuity/Beat hành động được) thì sửa tối đa `maxRounds` vòng
   (deps.rewrite = vá cục bộ → sửa theo vùng → viết lại cả chương, tùy chương dài), chấm lại, và KHÔNG BAO GIỜ giữ bản kém hơn
   (Best Draft Guard) hay bản làm chương tụt dưới số từ tối thiểu. Cảnh báo văn phong nhẹ không bị ép sửa.
   deps: { rewrite(review, round) -> {ok, patched?, reason?, stopped?}, review() -> {ok, review}, timeLeft()?, onStatus(msg)? }
   opts: { maxRounds (1..3, mặc định 1), minRoundMs (mặc định 120000), minWords? }
   Trả: { attempted, rounds, improved, restored, reason, before, after, review } — `review` là review tốt nhất; chapter.text đã là bản tốt nhất. */
function quickFixNeeded(review) {
  const r = review || {};
  if (!r.verdict || r.verdict === "PASS") return false;
  if (r.verdict === "HARD_FAIL" || (r.hardFailures || []).length) return true;
  return hasActionableCanonWarning(r) || transitionWarnings(r).length > 0;
}
// V14.1.6: cảnh báo THIẾU CÂU CHUYỂN CẢNH (nhảy địa điểm/thời gian) — sửa được bằng vài câu chèn, không cần viết lại.
function transitionWarnings(review) {
  return ((review && review.warnings) || []).map(gateItemText).filter(t => /thiếu câu chuyển cảnh|câu chuyển cảnh|chuyển cảnh|không có mô tả (di chuyển|thời gian)|nhảy (từ|sang)|đột ngột/i.test(t));
}
// Review "giả" chỉ chứa các chỗ thiếu chuyển cảnh + hướng sửa chỉ-chèn-câu, để vá cục bộ (không replace/delete, không viết lại chương). null nếu còn lỗi nặng hoặc không có cảnh báo chuyển cảnh.
function transitionFixReview(review) {
  const r = review || {};
  if ((r.hardFailures || []).length) return null;
  const tw = transitionWarnings(r);
  if (!tw.length) return null;
  return {
    verdict: r.verdict, score: r.score, dimensions: r.dimensions || {}, hardFailures: [], warnings: tw.slice(0, 6),
    rewriteInstructions: [
      "CHỈ CHÈN câu chuyển cảnh: dùng insert_after / insert_before để thêm 1–2 câu cầu nối ngay tại các chỗ nhảy địa điểm/thời gian đã nêu (rời nơi cũ bằng cách nào, đến nơi mới, thời điểm mới, ai có mặt).",
      "KHÔNG dùng replace/delete, KHÔNG đổi nội dung khác, KHÔNG thêm sự kiện hay nhân vật mới, KHÔNG viết nhãn ngày giờ; câu chèn là văn xuôi thuần nối mượt với đoạn trước và sau."
    ]
  };
}
// Gợi ý hành động cho người dùng từ một review: { level: ok|read|fix|split|rewrite, action, issues:[{kind,text}] }. null nếu chưa có review.
function reviewActionAdvice(review) {
  const r = review || {};
  if (!r.verdict) return null;
  const clip = (t, n) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; };
  const kindOf = t => /vượt ngân sách sự kiện/i.test(t) ? "events" : /vượt số nhân vật có tên|nhân vật mới quan trọng/i.test(t) ? "cast" : /lỗi cảnh|người có mặt|sceneviolation/i.test(t) ? "scene"
    : /vượt thiết lập|hồ sơ|địa vị|quyền hạn/i.test(t) ? "profile" : /knowledge|biết thông tin|chưa thể biết/i.test(t) ? "knowledge" : /retcon/i.test(t) ? "retcon"
    : /dậm chân|stagnation/i.test(t) ? "stall" : /arc\/outline|không đưa arc/i.test(t) ? "arc" : /giải phẫu|đặc điểm sinh học/i.test(t) ? "anatomy" : "other";
  const issues = (r.hardFailures || []).map(gateItemText).map(t => ({ kind: kindOf(t), text: clip(t.replace(/^\s*sceneViolation:\s*/i, ""), 140) }));
  if (r.verdict === "PASS" && !issues.length) return { level: "ok", action: "Có thể bấm ☁ Chạy hậu kỳ luôn.", issues };
  if (!issues.length) {
    const tw = transitionWarnings(r).length;
    return { level: "read", action: "Chỉ có cảnh báo" + (tw ? " (" + tw + " chỗ thiếu câu chuyển cảnh)" : "") + ": đọc lướt rồi bấm ☁ Chạy hậu kỳ, không cần viết lại.", issues };
  }
  const kinds = new Set(issues.map(i => i.kind));
  if (["knowledge", "retcon", "stall", "arc"].some(k => kinds.has(k))) return { level: "rewrite", action: "Lỗi nội dung (nhân vật biết điều chưa thể biết / retcon / dậm chân / lệch Arc) — nên ↻ Viết lại, vá vài câu không đủ.", issues };
  if (kinds.has("events") || kinds.has("cast")) return { level: "split", action: "Chương nhồi quá nhiều sự kiện/nhân vật — rút bớt trong Outline (chia sang chương sau) rồi ↻ Viết lại, hoặc nâng giới hạn nếu cố ý.", issues };
  if (kinds.has("scene") || kinds.has("profile") || kinds.has("anatomy")) return { level: "fix", action: "Lỗi vá được: bấm 🔍 Duyệt lại (tự sửa cục bộ). Nếu đọc thấy mạch ổn có thể duyệt tay rồi chạy hậu kỳ" + (kinds.has("profile") ? "; kiểm tra hồ sơ nhân vật nếu hồ sơ mới là chỗ sai" : "") + ".", issues };
  return { level: "fix", action: "Đọc kỹ lỗi bên dưới: sửa tay hoặc 🔍 Duyệt lại; nếu nặng thì ↻ Viết lại.", issues };
}
function _reviewBrief(r) { return r ? { verdict: r.verdict, score: r.score == null ? null : r.score, hard: (r.hardFailures || []).length, warn: (r.warnings || []).length } : null; }
async function runQuickAutoFix(chapter, startReview, deps, opts) {
  opts = opts || {}; deps = deps || {};
  const timeLeft = typeof deps.timeLeft === "function" ? deps.timeLeft : () => Infinity;
  const maxRounds = Math.max(1, Math.min(3, Number(opts.maxRounds) || 1)), minRoundMs = opts.minRoundMs || 120000, minWords = Number(opts.minWords) || 0;
  const out = { attempted: false, rounds: 0, improved: false, restored: false, reason: "", before: _reviewBrief(startReview), after: _reviewBrief(startReview), review: startReview, patched: 0 };
  if (!quickFixNeeded(startReview)) { out.reason = "không cần sửa"; return out; }
  let best = { review: startReview, text: String(chapter.text || ""), wc: chapter.wordCount }, cur = startReview;
  const restoreBest = () => { chapter.text = best.text; chapter.wordCount = best.wc; };
  while (out.rounds < maxRounds && quickFixNeeded(cur)) {
    if (timeLeft() < minRoundMs) { out.reason = "hết thời gian job"; break; }
    out.attempted = true; out.rounds++;
    if (deps.onStatus) deps.onStatus("Tự sửa sau chấm nhanh: vòng " + out.rounds + "/" + maxRounds + "...");
    let rw;
    try { rw = await deps.rewrite(cur, out.rounds); } catch (e) { rw = { ok: false, reason: (e && e.message) || "lỗi khi sửa" }; }
    if (rw && rw.stopped) { restoreBest(); out.reason = "đã dừng"; break; }
    if (!rw || !rw.ok) { restoreBest(); out.reason = "bản sửa bị từ chối: " + String((rw && rw.reason) || "không rõ").slice(0, 160); break; }
    out.patched += Number(rw.patched || 0);
    if (minWords && countWords(chapter.text) < minWords && countWords(best.text) >= minWords) { restoreBest(); out.restored = true; out.reason = "bản sửa làm chương dưới " + minWords + " từ — giữ bản cũ"; break; }
    let rr;
    try { rr = await deps.review(); } catch (e) { rr = { ok: false, reason: (e && e.message) || "review_error" }; }
    if (!rr || !rr.ok) { restoreBest(); out.restored = true; out.reason = "không chấm lại được bản sửa — giữ bản cũ"; break; }
    if (reviewIsBetter(rr.review, best.review)) { best = { review: rr.review, text: String(chapter.text || ""), wc: chapter.wordCount }; cur = rr.review; out.improved = true; }
    else { restoreBest(); out.restored = true; out.reason = "bản sửa không tốt hơn (" + (rr.review.score == null ? "—" : rr.review.score) + " ≤ " + (best.review.score == null ? "—" : best.review.score) + ") — đã khôi phục"; break; }
  }
  out.review = best.review; out.after = _reviewBrief(best.review);
  if (!out.reason) out.reason = quickFixNeeded(best.review) ? "đã sửa nhưng vẫn còn lỗi" : "đã sửa xong";
  return out;
}

// --- Canon version / đánh dấu Sync / kết quả job nền ---
function nextCanonVersion(st) {
  const ex = Math.max(0, ...(((st && st.chapters) || []).map(c => Number(c && c.sync && c.sync.canonVersion) || 0)));
  return Math.max(ex, Number(st && st.canonVersion) || 0) + 1;
}
function applyCanonSync(st, chapter, now) {
  const cv = nextCanonVersion(st);
  st.canonVersion = cv; chapter.canonVersion = cv;
  const warn = !!(chapter.autoUpdateIssues && chapter.autoUpdateIssues.length);
  chapter.sync = Object.assign({ changes: [] }, chapter.sync || {}, { status: warn ? "SYNCED_WITH_WARNINGS" : "SYNCED", canonVersion: cv, syncedAt: now || Date.now() });
  chapter.status = chapter.sync.status;
  return cv;
}
function mergeCanonVersion(local, incoming) { return Math.max(Number(local) || 0, Number(incoming) || 0); }
// Kết quả job nền có phải "trượt Quality Gate" (chương nháp, chưa Sync) không?
function isGateFailedResult(d) {
  if (!d) return false;
  if (d.qualityGateFailed) return true;
  if (d.resultChapter && d.resultChapter.status === "REVISION_REQUIRED") return true;
  const chs = d.storyState && d.storyState.chapters;
  const last = Array.isArray(chs) && chs.length ? chs[chs.length - 1] : null;
  return !!(last && last.status === "REVISION_REQUIRED");
}

/* ===== V12.18 — NHÂN VẬT TRÙNG: nhận diện nhãn chung / tên ngắn, gộp an toàn (dùng chung client + worker) ===== */

const _GENERIC_MC_LABELS = ["nhan vat chinh", "nvc", "main character", "the main character", "protagonist", "the protagonist", "mc", "nhan vat chinh cua truyen"];
const _TIER_ORDER = ["background", "minor", "supporting", "important", "major"];
const _DUP_STOP = new Set(["ba", "ong", "co", "chu", "anh", "chi", "em", "me", "cha", "bo", "thay", "nguoi", "ke", "gia", "cau", "mo", "di", "duong"]);

/* "nhân vật chính", "main character", "protagonist", "nhân vật chính (tên chưa rõ)"... — nhãn chung, KHÔNG phải tên riêng. */
function isGenericMainLabel(name, mcName) {
  const n = normalizeName(name).replace(/[()\[\]{}"'“”‘’.,:;]/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return false;
  if (_GENERIC_MC_LABELS.includes(n)) return true;
  const m = n.match(/^(nhan vat chinh|main character|protagonist)\s+(.+)$/);
  if (!m) return false;
  if (/^(ten chua ro|chua ro ten|chua dat ten|vo danh)$/.test(m[2])) return true;
  const mc = normalizeName(mcName || "");
  return !!mc && (m[2].includes(mc) || mc.includes(m[2]));
}

/* Tên (do AI trích xuất) trỏ tới đâu: hồ sơ Nhân Vật Chính / một nhân vật có sẵn (kể cả theo bí danh) / chưa có. */
function resolveCharacterTarget(state, name) {
  const n = normalizeName(name);
  if (!n) return { kind: "none" };
  const mc = state && state.mainCharProfile, mcName = (mc && mc.name) || "";
  if (mcName && normalizeName(mcName) === n) return { kind: "main" };
  if (mc && Array.isArray(mc.aliases) && mc.aliases.some(a => normalizeName(a) === n)) return { kind: "main", via: "alias" };
  if (mcName && isGenericMainLabel(name, mcName)) return { kind: "main", via: "generic" };
  const list = (state && state.characters) || [];
  let c = list.find(x => normalizeName(x.name) === n);
  if (c) return { kind: "character", character: c };
  c = list.find(x => Array.isArray(x.aliases) && x.aliases.some(a => normalizeName(a) === n));
  if (c) return { kind: "character", character: c, via: "alias" };
  /* V14.7.20: "chị Linh", "anh Hùng", "Linh" (gọi tắt) → bỏ danh xưng rồi khớp tên đầy đủ/bí danh; chỉ nhận khi DUY NHẤT một người khớp. */
  const stripped = stripNameHonorific(name), ns = normalizeName(stripped);
  if (!ns || NAME_PRONOUN_TAILS.includes(ns)) return { kind: "none" };   // chỉ là danh xưng / đại từ ("chị", "anh ấy")
  if (isGenericAddressName(name)) return { kind: "none" };   // V14.7.37: "Gã hàng xóm", "Giám đốc vận hành" không phải tên riêng
  if (ns.length < 2) return { kind: "new" };
  const hits = [];
  const matches = nm => { const x = normalizeName(nm); return !!x && (x === ns || x.endsWith(" " + ns) || (x.length >= 3 && ns.endsWith(" " + x))); };
  if (mc && (matches(mcName) || (Array.isArray(mc.aliases) && mc.aliases.some(matches)))) hits.push({ kind: "main", label: mcName });
  list.forEach(x => { if (x && (matches(x.name) || (Array.isArray(x.aliases) && x.aliases.some(matches)))) hits.push({ kind: "character", character: x, label: x.name }); });
  if (hits.length === 1) return Object.assign({}, hits[0], { via: ns === n ? "short" : "honorific" });
  if (hits.length > 1) return { kind: "ambiguous", names: hits.map(h => h.label) };
  return { kind: "new" };
}
const NAME_HONORIFIC_WORDS = ["anh", "chi", "em", "co", "chu", "bac", "ong", "ba", "thim", "cau", "mo", "di", "duong", "thay", "cu", "sep"];
const NAME_PRONOUN_TAILS = ["ay", "ta", "kia", "do", "no", "nay"];
/* Bỏ danh xưng đứng đầu ("chị Linh" → "Linh"); "anh ấy" → "ấy" (đại từ, xử lý riêng). */
function stripNameHonorific(name) {
  const w = String(name || "").trim().split(/\s+/).filter(Boolean);
  while (w.length && NAME_HONORIFIC_WORDS.includes(normalizeName(w[0]))) w.shift();
  return w.join(" ");
}
/* Ghi nhớ cách gọi ("chị Linh") thành bí danh của NV đã nhận diện duy nhất, để lần sau khớp thẳng. */
function learnCharacterAlias(c, surface) {
  if (!c || !surface) return false;
  const s = String(surface).trim(), ns = normalizeName(stripNameHonorific(s));
  if (!s || !ns || NAME_PRONOUN_TAILS.includes(ns) || normalizeName(s) === normalizeName(c.name)) return false;
  if (!Array.isArray(c.aliases)) c.aliases = [];
  if (c.aliases.length >= 6 || c.aliases.some(a => normalizeName(a) === normalizeName(s))) return false;
  c.aliases.push(s.slice(0, 40)); return true;
}

/* AI báo thêm về nhân vật chính: chỉ cập nhật các trường trạng thái (không đụng hồ sơ do người dùng nhập). */
function applyMainCharUpdate(profile, u, sourceText, st) {
  if (!profile || !u) return false;
  let changed = false;
  ["currentLocation", "physicalState", "mentalState", "secret"].forEach(k => { if (u[k] && String(u[k]).trim()) { profile[k] = u[k]; changed = true; } });
  // V14.1: trường tu luyện (cảnh giới đổi cần explicitCoreChange + bằng chứng trích từ chương, như nghề/chức vụ).
  const explicit = u.explicitCoreChange === true && String(u.changeEvidence || "").trim().length >= 12 && (sourceText == null || evidenceInText(u.changeEvidence, sourceText));
  const before = JSON.stringify(profile);
  applyCultivationUpdate(profile, u, { explicit, evidence: u.changeEvidence, state: st || (typeof state !== "undefined" ? state : null) });
  /* V14.7.19: nhân vật chính cũng nhận cập nhật 18+ (kinh nghiệm/ranh giới/sở thích) — nối ý mới, không ghi đè; chặn nếu < 18 tuổi. */
  { const ag = profileAgeNum(profile, u);
    if (ag === null || ag >= 18) ["sexualExperience", "boundaries", "preferences"].forEach(k => {
      if (u[k] && String(u[k]).trim()) { const m = mergeTextSegments(profile[k], String(u[k]).trim(), 2500); if (m !== String(profile[k] || "")) { profile[k] = m; changed = true; } }
    }); }
  if (JSON.stringify(profile) !== before) changed = true;
  return changed;
}

/* V14.7.21: hồ sơ nhân vật bị lặp một ý hàng chục lần vì AI DIỄN ĐẠT LẠI mỗi chương ("mâu thuẫn giữa sự kiêu kỳ... và sự yếu đuối...") —
   cách cũ chỉ bỏ đoạn trùng NGUYÊN VĂN. Nay so từ khóa: đoạn có phần lớn từ trùng đoạn đã có là diễn đạt lại → bỏ. */
const _SEG_STOP = new Set(["va", "la", "cua", "cho", "voi", "mot", "nhung", "cac", "da", "dang", "se", "thi", "ma", "nay", "do", "kia", "duoc", "bi", "boi", "tai", "trong", "ngoai", "tren", "duoi", "den", "tu", "rat", "hon", "nhu", "khi", "neu", "vi", "nen", "de", "co", "khong", "cung", "van", "con", "ra", "vao", "len", "xuong", "nhieu", "it", "luon", "thuong", "hay", "moi", "nao", "gi", "ai", "sau", "truoc", "giua", "qua", "lai"]);
function _segTokens(s) { return new Set(normalizeName(s).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w.length >= 2 && !_SEG_STOP.has(w))); }
function segmentsNearDuplicate(a, b) {
  const A = _segTokens(a), B = _segTokens(b); if (!A.size || !B.size) return false;
  let i = 0; A.forEach(w => { if (B.has(w)) i++; });
  const u = A.size + B.size - i, mn = Math.min(A.size, B.size);
  return i / u >= 0.5 || (mn >= 4 && i / mn >= 0.8);
}
/* Giữ đoạn xuất hiện TRƯỚC (bản gốc/cũ nhất); bỏ đoạn sau nếu gần trùng đoạn đã giữ. */
function dedupeTextSegments(text, max) {
  const parts = String(text || "").split(/;\s*/).map(p => p.trim()).filter(Boolean), kept = [];
  parts.forEach(p => { if (!kept.some(k => normalizeName(k) === normalizeName(p) || segmentsNearDuplicate(k, p))) kept.push(p); });
  const out = kept.join("; ");
  return max && out.length > max ? out.slice(-max) : out;
}
const CHAR_ACCUM_TEXT_FIELDS = ["appearance", "personality", "goals", "secret", "weakness", "fear", "knowledge", "independentPlot", "strength", "speech", "sexualExperience", "boundaries", "taboos", "preferences", "attractionToMC", "tensionWithMC", "consentNotes", "newDetails", "currentState"];
/* Dọn hồ sơ đã bị lặp: nhân vật phụ + nhân vật chính. Trả số ô được rút gọn và số ký tự giảm. */
function cleanCharacterRepeats(st) {
  const out = { fields: 0, chars: 0, saved: 0 };
  const people = [st && st.mainCharProfile].concat((st && st.characters) || []).filter(Boolean);
  people.forEach(c => {
    let hit = false;
    CHAR_ACCUM_TEXT_FIELDS.forEach(k => {
      const v = c[k]; if (typeof v !== "string" || v.length < 40) return;
      const d = dedupeTextSegments(v); if (d.length < v.trim().length) { out.saved += v.length - d.length; c[k] = d; out.fields++; hit = true; }
    });
    if (hit) out.chars++;
  });
  return out;
}
function mergeTextSegments(a, b, max) {
  max = max || 2500;
  const x = String(a || "").trim(), y = String(b || "").trim();
  if (!y) return x;
  if (!x) return y.slice(0, max);
  const nx = normalizeName(x), ny = normalizeName(y);
  if (nx === ny || nx.includes(ny)) return x;
  if (ny.includes(nx)) return y.slice(0, max);
  const base = dedupeTextSegments(x);
  const fresh = []; y.split(/;\s*/).forEach(seg => { const s = seg.trim(); if (s && !nx.includes(normalizeName(s)) && !fresh.some(f => segmentsNearDuplicate(f, s)) && !base.split(/;\s*/).some(k => segmentsNearDuplicate(k, s))) fresh.push(s); });
  if (!fresh.length) return base;
  const parts = base.split(/;\s*/).concat(fresh);
  while (parts.length > 1 && parts.join("; ").length > max) parts.shift();
  return parts.join("; ").slice(-max);
}

/* Gộp hồ sơ `source` vào `target` (target là bản giữ lại). Không mất thông tin: trường trống thì điền, trường chữ thì nối ý mới. */
function mergeCharacterRecords(target, source) {
  const SKIP = ["id", "name", "relationships", "history", "aliases", "coreIdentity", "tier", "firstAppearance", "lastAppearance", "dead", "deathChapter", "locked", "coreLocked"];
  const TEXT = ["appearance", "personality", "goals", "secret", "weakness", "fear", "knowledge", "independentPlot", "speech", "strength", "role", "relevanceToMC", "arts", "fortune", "grudges", "innerDemon", "karma"];
  Object.keys(source).forEach(k => {
    if (SKIP.includes(k)) return;
    const v = source[k];
    if (v == null || v === "") return;
    if (TEXT.includes(k)) target[k] = mergeTextSegments(target[k], v, (k === "role" || k === "relevanceToMC") ? 400 : 2500);
    else if (target[k] == null || target[k] === "") target[k] = v;
  });
  if (_TIER_ORDER.indexOf(source.tier) > _TIER_ORDER.indexOf(target.tier)) target.tier = source.tier;
  const nums = (p, q, pick) => { const a = target[p], b = source[q]; return a == null ? b : (b == null ? a : pick(a, b)); };
  target.firstAppearance = nums("firstAppearance", "firstAppearance", Math.min);
  target.lastAppearance = nums("lastAppearance", "lastAppearance", Math.max);
  if (source.dead && !target.dead) { target.dead = true; target.deathChapter = source.deathChapter != null ? source.deathChapter : target.deathChapter; }
  const seenRel = new Set(), rels = [];
  (target.relationships || []).concat(source.relationships || []).forEach(r => {
    const k = normalizeName(r && r.withName);
    if (!k || seenRel.has(k) || k === normalizeName(target.name)) return;
    seenRel.add(k); rels.push(r);
  });
  target.relationships = rels;
  target.history = (Array.isArray(target.history) ? target.history : []).concat(Array.isArray(source.history) ? source.history : []).slice(-100);
  const aliases = [];
  (target.aliases || []).concat(source.aliases || [], [source.name]).forEach(a => {
    const k = normalizeName(a);
    if (k && k !== normalizeName(target.name) && !aliases.some(x => normalizeName(x) === k)) aliases.push(String(a).trim());
  });
  target.aliases = aliases;
  return target;
}

/* Gợi ý các mục có thể trùng (CHỈ gợi ý — người dùng quyết định). state.ignoredDupPairs: các cặp "Giữ riêng". */
function findDuplicateCharacterGroups(state) {
  const out = [], seen = new Set();
  const chars = (state && state.characters) || [], mc = state && state.mainCharProfile, mcName = (mc && mc.name) || "";
  const mcN = normalizeName(mcName), ignored = new Set((state && state.ignoredDupPairs) || []);
  const push = (src, targetId, targetName, type, reason, confidence) => {
    const key = src.id + "|" + (targetId || "");
    if (seen.has(key) || ignored.has(key)) return;
    seen.add(key);
    out.push({ key, sourceId: src.id, sourceName: src.name, targetId: targetId || null, targetName: targetName || "", type, reason, confidence });
  };
  const cands = chars.filter(c => /protagonist|nhan vat chinh|nam chinh|nu chinh/.test(normalizeName(c.role)) && !isGenericMainLabel(c.name, mcName));
  const flagged = new Set();
  chars.forEach(c => {
    const n = normalizeName(c.name);
    if (!n) return;
    if (mcN && n === mcN) { push(c, "MAIN", mcName, "main_name", "Trùng tên với hồ sơ Nhân Vật Chính", "high"); flagged.add(c.id); return; }
    if (!isGenericMainLabel(c.name, mcName)) return;
    flagged.add(c.id);
    if (mcN) push(c, "MAIN", mcName, "main_generic", "Nhãn chung “nhân vật chính” — chính là " + mcName, "high");
    else if (cands.length === 1) push(c, cands[0].id, cands[0].name, "main_generic", "Nhãn chung “nhân vật chính” — có vẻ là " + cands[0].name, "medium");
    else push(c, null, "", "generic_unresolved", "Nhãn chung “nhân vật chính” nhưng chưa khai báo Nhân Vật Chính", "medium");
  });
  const toks = c => normalizeName(c.name).split(" ").filter(Boolean);
  chars.forEach(a => {
    if (flagged.has(a.id)) return;
    const ta = toks(a);
    if (!ta.length || (ta.length === 1 && (_DUP_STOP.has(ta[0]) || ta[0].length < 2))) return;
    if (mcN) {
      const tm = mcN.split(" ").filter(Boolean);
      if (ta.length < tm.length && ta.every(t => tm.includes(t))) { push(a, "MAIN", mcName, "alias", "Tên ngắn trùng một phần với nhân vật chính " + mcName, "medium"); return; }
    }
    const longer = chars.filter(b => b !== a && !flagged.has(b.id) && (() => { const tb = toks(b); return ta.length < tb.length && ta.every(t => tb.includes(t)); })());
    if (longer.length === 1) push(a, longer[0].id, longer[0].name, "alias", "“" + a.name + "” trùng một phần với “" + longer[0].name + "” — có thể cùng một người", "medium");
  });
  return out;
}

/* Gộp nhân vật `sourceId` vào `targetId` ("MAIN" = hồ sơ Nhân Vật Chính: chỉ điền ô còn trống, không ghi đè nội dung người dùng đã nhập). */
/* V14.7.25: xóa/gộp nhân vật chỉ xóa khỏi Character Database; thẻ trong Current Status (statusState.characterStates) và dòng
   "• Tên: …" trong văn bản Current Status vẫn còn → nhân vật đã xóa/gộp vẫn hiện ở Status. Dọn theo tên/bí danh/id.
   intoChar ({id,name}): khi GỘP, thẻ của nhân vật nguồn được chuyển cho nhân vật đích nếu đích chưa có thẻ, ngược lại bỏ. */
function purgeCharacterFromStatus(st, names, ids, intoChar) {
  const ss = st && st.statusState; if (!ss || !Array.isArray(ss.characterStates)) return 0;
  const ns = new Set((names || []).map(normalizeName).filter(Boolean)), idset = new Set((ids || []).filter(Boolean).map(String));
  const nameOf = x => normalizeName((x && (x.name || x.characterName)) || "");
  const hit = x => !!x && ((x.characterId && idset.has(String(x.characterId))) || ns.has(nameOf(x)));
  let hasTargetCard = !!intoChar && ss.characterStates.some(x => x && !hit(x) && ((x.characterId && String(x.characterId) === String(intoChar.id)) || nameOf(x) === normalizeName(intoChar.name)));
  let changed = 0;
  ss.characterStates = ss.characterStates.map(x => {
    if (!hit(x)) return x; changed++;
    if (intoChar && !hasTargetCard) { hasTargetCard = true; return Object.assign({}, x, { characterId: intoChar.id, name: intoChar.name, characterName: intoChar.name }); }
    return null;
  }).filter(Boolean);
  if (changed && typeof st.currentStatus === "string" && st.currentStatus.includes("- Thông tin nhân vật cập nhật:")) st.currentStatus = replaceStatusCharacterBlock(st.currentStatus, ss.characterStates);
  return changed;
}
function mergeCharacterIntoState(state, sourceId, targetId) {
  const chars = state.characters || [], src = chars.find(c => c.id === sourceId);
  if (!src) return { ok: false, reason: "không thấy mục nguồn" };
  let targetName;
  if (targetId === "MAIN") {
    const p = state.mainCharProfile;
    if (!p || !String(p.name || "").trim()) return { ok: false, reason: "chưa khai báo Nhân Vật Chính" };
    Object.keys(src).forEach(k => {
      const pk = k === "strength" ? "skills" : k, v = src[k];
      if (typeof v !== "string" || !v.trim() || !(pk in p) || pk === "name") return;
      if (!String(p[pk] || "").trim()) p[pk] = v;
    });
    const al = Array.isArray(p.aliases) ? p.aliases.slice() : [];
    if (normalizeName(src.name) !== normalizeName(p.name) && !al.some(x => normalizeName(x) === normalizeName(src.name))) al.push(String(src.name).trim());
    p.aliases = al; targetName = p.name;
  } else {
    const tgt = chars.find(c => c.id === targetId && c.id !== sourceId);
    if (!tgt) return { ok: false, reason: "không thấy mục đích" };
    mergeCharacterRecords(tgt, src); targetName = tgt.name;
  }
  purgeCharacterFromStatus(state, [src.name].concat(Array.isArray(src.aliases) ? src.aliases : []), [src.id], targetId === "MAIN" ? null : { id: targetId, name: targetName });
  state.characters = chars.filter(c => c.id !== sourceId);
  const sn = normalizeName(src.name);
  state.characters.forEach(c => {
    if (!Array.isArray(c.relationships)) return;
    c.relationships.forEach(r => { if (r && normalizeName(r.withName) === sn) r.withName = targetName; });
    const seenR = new Set();
    c.relationships = c.relationships.filter(r => { const k = normalizeName(r && r.withName); if (!k || k === normalizeName(c.name) || seenR.has(k)) return false; seenR.add(k); return true; });
  });
  return { ok: true, from: src.name, into: targetName };
}

const SCENE_PLAN_SYSTEM_PROMPT = "Lập kế hoạch scene cho tiểu thuyết dài kỳ tiếng Việt. Trả đúng JSON được yêu cầu, không viết văn xuôi, không thêm biến cố lớn ngoài brief/canon.";
const EROTIC_SCENE_LOCK = "QUY TẮC CẢNH NÓNG (bắt buộc khi scene là cảnh nóng giữa người trưởng thành; viết thẳng, không tự kiểm duyệt, không fade-to-black): lúc đang làm tình dùng từ thô tục đời thường (cặc, lồn, địt, nứng, nước lồn, tinh trùng…), không thay bằng ẩn dụ hoa mỹ; mỗi đoạn nóng đủ 4 lớp: cơ thể theo hồ sơ + cảm giác thể xác (căng, ướt, nóng, run) + nội tâm (xấu hổ↔dục, kháng cự↔cơ thể phản ứng) + âm thanh/nhịp (da chạm, hơi thở, rên, thoại); tăng thoại theo vai và quyền lực; chậm từng nhịp, không tóm tắt cao trào trong 1–2 câu, không chuyển cảnh trước khi hoàn tất; nhịp dẫn vào ~25% / diễn biến + cao trào ~50% / sau cảnh ~25%; không bịa số đo ngoài hồ sơ; trừ khi mệnh lệnh người dùng chỉ định dừng ở mốc khác.";
const SCENE_SYSTEM_PROMPT = "Viết văn xuôi tiểu thuyết tiếng Việt tự nhiên, 100% tiếng Việt có dấu. Đây là scene nối tiếp: giữ liên tục nhân vật, thời gian, địa điểm, quan hệ, xưng hô và trạng thái; không lặp đoạn trước, không meta, không tiêu đề, chỉ trả văn xuôi. Show, don't tell; câu có nhịp dài ngắn; không lặp sáo ngữ hoặc cụm cảm giác đã dùng ở đoạn trước; lời thoại đúng giọng từng người. Với cảnh người lớn: chỉ nhân vật từ 18 tuổi trở lên theo RÀO_CHẮN_TUỔI trong STYLE LOCK; quy tắc này không bao giờ bị chỉ dẫn khác ghi đè. Khi STYLE LOCK có mức_18+ và scene là cảnh nóng giữa người trưởng thành: viết đúng mức đó, trực tiếp, không tự kiểm duyệt, không fade-to-black, không tóm tắt thay cho cảnh.";

/* V14.0.6: VÒNG ĐIỀU PHỐI ADAPTIVE SCENE DÙNG CHUNG client + worker nền.
   Mọi thứ phụ thuộc môi trường (gọi AI, state, định tuyến model, đồng hồ) được truyền qua `deps`:
     deps.state, deps.callAI(prompt, opts) -> {text}, deps.buildContract(st, n, prior), deps.requiredBeats(st, n),
     deps.style(nsfw) -> string, deps.route(scene, o, tail) -> {model, nsfw}, deps.onNsfw(scene, route)?,
     deps.timeLeft()? -> ms còn lại (worker nền), deps.minSceneMs?/deps.minTopUpMs? ngưỡng dừng sớm.
   Trả: {rejected, reason} | {text, plan, underTarget, usedNsfw, timedOut?} | null (lỗi API ở scene). */
/* ===== V14.5.0 — CÁCH 3: MỖI CẢNH GẮN VỚI MỤC OUTLINE, APP KIỂM TRA KẾ HOẠCH TRƯỚC KHI VIẾT =====
   Outline dạng "Chương N — Tiêu đề Sự kiện: …" + các dòng gạch đầu dòng (+ Kháng cự/Hậu quả/Móc kết) được tách thành các MỤC đánh số.
   AI lập kế hoạch cảnh phải khai báo scene nào thực hiện mục nào; app kiểm tra (0 token) mọi mục đều có cảnh, đúng thứ tự, không dồn/trùng.
   Sai -> lập lại; vẫn sai -> dựng cảnh theo từng mục Outline (1 mục = 1 cảnh) từ chính kế hoạch AI (nhân vật/nơi/giờ). Chỉ áp dụng khi chương có 3–10 mục. */
function outlineChapterItems(content, ol) {
  const out = {}; let cur = 0;
  const META_RE = /(?=(?:Kháng cự|Hậu quả|Móc kết)\s*:)/u;
  const parseMeta = (txt, meta) => {
    const m = String(txt).match(/^(Kháng cự|Hậu quả|Móc kết)\s*:\s*([\s\S]*)$/u);
    if (!m) return;
    meta[m[1] === 'Kháng cự' ? 'resistance' : (m[1] === 'Hậu quả' ? 'consequence' : 'hook')] = m[2].trim().replace(/[.;\s]+$/u, '');
  };
  let bodyMode = false; // V14.7.12: "Chương N" đứng riêng, mỗi dòng bên dưới là một ý
  outlineNormalizeText(content).split(/\n+/).forEach(l => {
    const line = l.trim(); if (!line) return;
    const hm = line.match(/^(?:[-*•]\s*)?(?:chương|chuong|chapter|chap|ch)\.?\s*(\d{1,4})\s*[:.)\-–—]?\s*$/i);
    if (hm) { cur = Number(hm[1]); out[cur] = { title: '', items: [], meta: {} }; bodyMode = true; return; }
    if (bodyMode && cur && out[cur] && !/^(?:[-*•]\s*)?(?:chương|chuong|chapter|chap|ch)\.?\s*\d{1,4}\s*[–—-]\s*\d/i.test(line) && !/^(?:[-*•]\s*)?(?:ch(?:ư[ơ]ng)?\.?\s*)?\d{1,4}\s*[:.)]\s*\S{3}/i.test(line)) {
      const pieces = line.replace(/^[•\-*–·▪◦●]\s*/, '').trim().split(META_RE);
      const item = (pieces[0] || '').replace(/[.;\s]+$/u, '').trim();
      if (item.length >= 4 && !/^(Kháng cự|Hậu quả|Móc kết)\s*:/u.test(item)) out[cur].items.push(item);
      pieces.slice(/^(Kháng cự|Hậu quả|Móc kết)\s*:/u.test(pieces[0] || '') ? 0 : 1).forEach(x => parseMeta(x, out[cur].meta));
      return;
    }
    bodyMode = false;
    const m = line.match(/^(?:[-*•]\s*)?(?:ch(?:ư[ơ]ng)?\.?\s*)?(\d{1,4})\s*[:.)\-–—]\s*(.+)$/i);
    if (m && m[2] && m[2].trim().length >= 8) {
      cur = Number(m[1]);
      const body = m[2].trim(), k = body.search(/Sự kiện\s*:/u);
      const title = k > 0 ? body.slice(0, k).trim() : '';
      const pieces = (k >= 0 ? body.slice(k).replace(/^Sự kiện\s*:\s*/u, '') : body).split(META_RE);
      const event = (pieces[0] || '').replace(/[.;\s]+$/u, '').trim();
      out[cur] = { title, items: event ? [event] : [], meta: {} };
      pieces.slice(1).forEach(x => parseMeta(x, out[cur].meta));
      return;
    }
    if (cur && out[cur] && /^[•\-*–·▪◦●]\s*\S/.test(line)) {
      const pieces = line.replace(/^[•\-*–·▪◦●]\s*/, '').trim().split(META_RE);
      const item = (pieces[0] || '').replace(/[.;\s]+$/u, '').trim();
      if (item.length >= 4) out[cur].items.push(item);
      pieces.slice(1).forEach(x => parseMeta(x, out[cur].meta));
    }
  });
  Object.keys(out).forEach(k => { if (out[k] && out[k].meta) out[k].meta = dedupeOutlineMeta(out[k].meta, out[k].items); }); // V14.5.14: Hậu quả trùng mục -> bỏ
  return _outlineRemapLocal(out, ol);
}
function validateOutlineMapping(plan, items) {
  const errs = [], N = Array.isArray(items) ? items.length : 0, scenes = (plan && plan.scenes) || [];
  if (!N) return errs;
  const owner = {}; let bridges = 0, lastMax = 0;
  scenes.forEach(s => {
    const idx = Array.from(new Set((Array.isArray(s.outlineItems) ? s.outlineItems : []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= N))).sort((a, b) => a - b);
    if (!idx.length) { bridges++; return; }
    if (idx.length > 3 || idx[idx.length - 1] - idx[0] + 1 !== idx.length) errs.push((s.id || 'scene') + ' gom mục ' + idx.join(',') + ': mỗi scene chỉ thực hiện 1–3 mục LIỀN KỀ.');
    if (idx[0] <= lastMax) errs.push((s.id || 'scene') + ' đảo/lặp thứ tự mục Outline (mục ' + idx[0] + ' đã nằm ở scene trước).');
    lastMax = Math.max(lastMax, idx[idx.length - 1]);
    idx.forEach(n => { owner[n] = (owner[n] || 0) + 1; });
  });
  for (let n = 1; n <= N; n++) { if (!owner[n]) errs.push('Mục Outline ' + n + ' chưa có scene thực hiện: «' + String(items[n - 1]).slice(0, 90) + '»'); else if (owner[n] > 1) errs.push('Mục Outline ' + n + ' bị ' + owner[n] + ' scene cùng thực hiện.'); }
  if (bridges > 1) errs.push('Có ' + bridges + ' scene không gắn mục Outline nào (chỉ được tối đa 1 scene nối/chuyển).');
  return errs.slice(0, 8);
}
function buildOutlineGraph(candidate, items, meta, limits, contract) {
  const n = items.length, groups = [];
  const size = n <= 6 ? 1 : Math.ceil(n / 6);
  for (let i = 0; i < n; i += size) groups.push(items.slice(i, i + size).map((t, k) => ({ idx: i + k + 1, text: t })));
  const cs = (candidate && candidate.scenes) || [];
  const fallbackCast = ((contract && contract.allowedCharacters) || []).slice(0, 3);
  /* V14.7.14: nhóm beat là cảnh nóng được chia ngân sách từ x1,6 (tổng chương không đổi) để đủ chỗ tả từng hành động. */
  const weights = groups.map(g => Math.max(200, g.reduce((a, x) => a + x.text.length, 0)) * (textHasNsfwKeyword(g.map(x => x.text).join(' ')) ? 1.6 : 1));
  const wSum = weights.reduce((a, b) => a + b, 0);
  const scenes = groups.map((g, i) => {
    const ref = cs.length ? cs[Math.min(cs.length - 1, Math.floor(i * cs.length / groups.length))] : {};
    const nextText = groups[i + 1] ? groups[i + 1][0].text : ((meta && meta.hook) || '');
    return {
      id: 'S' + (i + 1),
      purpose: 'Thực hiện mục Outline ' + g.map(x => x.idx).join(', '),
      beats: g.map(x => String(x.text).slice(0, 500)),
      characters: (ref.characters && ref.characters.length) ? ref.characters.slice() : fallbackCast.slice(),
      location: ref.location || '', time: ref.time || '',
      targetWords: Math.max(350, Math.round((weights[i] / wSum) * ((limits && limits.target) || 5000) / 50) * 50),
      mustChange: g.map(x => x.text).join('; ').slice(0, 400),
      handoff: (nextText ? 'Dẫn sang: ' + String(nextText).slice(0, 220) : 'Kết chương theo Outline').slice(0, 400),
      outlineItems: g.map(x => x.idx)
    };
  });
  return { chapterGoal: (candidate && candidate.chapterGoal) || String(items[0] || '').slice(0, 300), endingAnchor: (meta && meta.hook) || (candidate && candidate.endingAnchor) || '', scenes };
}
async function runAdaptiveChapterPipeline(o, deps) {
  const st = deps.state, callAI = deps.callAI, t0 = Date.now();
  const priorChapters = acceptedStoryChapters(o.priorChapters || []);
  const limits = adaptiveChapterWordLimits(st);
  const timeLeft = typeof deps.timeLeft === 'function' ? deps.timeLeft : () => Infinity;
  const minSceneMs = deps.minSceneMs || 70000, minTopUpMs = deps.minTopUpMs || 70000;
  const recent = buildRecentBlocks(priorChapters).recentFullText;
  const chapterNumber = priorChapters.length + 1;
  let chapterContract = deps.buildContract(st, chapterNumber, priorChapters);
  const requiredBeats = deps.requiredBeats(st, chapterNumber);
  const outlineItems = (deps.outlineMap !== false && Array.isArray(chapterContract.outlineItems) && chapterContract.outlineItems.length >= 3 && chapterContract.outlineItems.length <= 10) ? chapterContract.outlineItems : null;
  let outlineMap = '';
  const planPrompt = buildAdaptiveScenePlanPrompt({
    outlineItems, outlineMeta: chapterContract.outlineMeta || null,
    state: st, context: o.context, recent, matureBlock: matureScenePlanBlock(st, chapterNumber, priorChapters),
    directive: st.directive, hint: (chapterHintVerification(st, chapterNumber).text || ""), requiredBeats,
    arcProgress: arcProgressPrompt(st, chapterNumber, { stage: true }),
    allowedCast: chapterContract.allowedCharacters.join(', '),
    forbiddenDrift: chapterContract.forbiddenDrift.join(' '), chapterContract
  });
  let graph = null, planError = '', lastCandidate = null, lastChecked = null, strippedCast = [];
  for (let planAttempt = 1; planAttempt <= 2 && !graph; planAttempt++) {
    try {
      const correction = planAttempt > 1 ? "\nPLAN BỊ TỪ CHỐI. Sửa đúng lỗi Contract sau, không mở tuyến mới:\n" + planError : "";
      const planRes = await callAI(planPrompt + correction, { maxTokens: planAttempt > 1 ? 7800 : 5000, temperature: planAttempt > 1 ? 0.15 : 0.25, modelOverride: o.model, systemPrompt: SCENE_PLAN_SYSTEM_PROMPT });
      const rawPlan = String(planRes && planRes.text || '');
      const candidate = normalizeAdaptiveScenePlan(rawPlan, st);
      if (!candidate) {
        const snippet = rawPlan.replace(/\s+/g, ' ').trim().slice(0, 140);
        planError = 'Không parse được JSON Scene Graph; trả duy nhất JSON object, không markdown/lời dẫn.'
          + (rawPlan.trim() ? ' [model trả ' + rawPlan.length + ' ký tự' + (planRes && planRes.finishReason ? ', finish=' + planRes.finishReason : '') + ': "' + snippet + '"]' : ' [model trả RỖNG' + (planRes && planRes.finishReason ? ', finish=' + planRes.finishReason : '') + ']');
      } else {
        const checked = validateAdaptiveScenePlan(candidate, chapterContract);
        lastCandidate = candidate; lastChecked = checked;
        if (checked.ok && outlineItems) { const om = validateOutlineMapping(candidate, outlineItems); if (om.length) { checked.ok = false; checked.mappingOnly = true; checked.errors = om.map(x => 'OUTLINE: ' + x); } }
        if (checked.ok && chapterNeedsHeat(st) && !planHasHotBeat(candidate)) { checked.ok = false; checked.heatOnly = true; checked.errors = ['THIẾU CẢNH NÓNG: Trọng tâm PRIMARY bắt buộc có ít nhất một scene ghi đúng cụm "cảnh nóng" trong beats, nêu 2 nhân vật trưởng thành, targetWords ≥ 1100.']; }
        lastChecked = checked;
        if (checked.ok) { graph = candidate; if (outlineItems) outlineMap = 'ai'; } else planError = checked.errors.join(' | ');
      }
    } catch (e) { planError = e && e.message || 'plan failed'; }
  }
  // V14.0.11: sau 2 lượt vẫn CHỈ sai ở chỗ có tên người ngoài Canon Cast (vai phụ thoáng qua: phục vụ, bảo vệ, bác sĩ…) -> gỡ tên đó khỏi
  // danh sách nhân vật của scene thay vì làm hỏng cả job. Mọi lỗi khác (drift tuyến, thiếu mustChange…) vẫn bị từ chối như cũ.
  if (!graph && lastCandidate && lastChecked && lastChecked.outsiders && lastChecked.outsiders.length && lastChecked.errors.length === 1) {
    const out = new Set(lastChecked.outsiders.map(normalizeName));
    // Chỉ gỡ nếu tên CHỈ nằm ở danh sách characters (vai thoáng qua). Tên xuất hiện trong beats/purpose/mustChange/handoff/goal = tình tiết mang tên đó -> từ chối.
    const plotText = normalizeName(JSON.stringify({ g: lastCandidate.chapterGoal, e: lastCandidate.endingAnchor, s: (lastCandidate.scenes || []).map(sc => Object.assign({}, sc, { characters: undefined })) }));
    const plotBearing = [...out].some(n => plotText.includes(n));
    if (!plotBearing) {
    (lastCandidate.scenes || []).forEach(sc => { sc.characters = (sc.characters || []).filter(n => !out.has(normalizeName(n))); });
    const rechecked = validateAdaptiveScenePlan(lastCandidate, chapterContract);
    if (rechecked.ok) { graph = lastCandidate; strippedCast = lastChecked.outsiders.slice(0, 8); }
    }
  }
  if (!graph && outlineItems && lastCandidate && lastChecked && lastChecked.mappingOnly) { graph = buildOutlineGraph(lastCandidate, outlineItems, chapterContract.outlineMeta, limits, chapterContract); outlineMap = 'fallback'; }
  if (!graph && lastCandidate && lastChecked && lastChecked.heatOnly) { graph = injectHotBeat(lastCandidate, st, chapterContract); }
  if (!graph) return { rejected: true, reason: 'PLAN_REJECTED: ' + (planError || 'Scene Graph không hợp lệ') };
  if (chapterNeedsHeat(st) && !planHasHotBeat(graph)) graph = injectHotBeat(graph, st, chapterContract);

  // V14.0.12: nhân vật có tên trong Outline/chương trước (chưa vào Character Database) được thêm vào cast cho từng scene,
  // để prompt scene không cấm đúng người mà Outline yêu cầu.
  let addedCast = [];
  { const nameSet = _contractNameSet(chapterContract);
    graph.scenes.forEach(sc => (sc.characters || []).forEach(n => { if (_looksLikeNamedCharacter(n) && !_nameInCast(n, nameSet) && !addedCast.includes(String(n).trim())) addedCast.push(String(n).trim()); }));
    if (addedCast.length) chapterContract = Object.assign({}, chapterContract, { allowedCharacters: (chapterContract.allowedCharacters || []).concat(addedCast), canonicalCharacters: (chapterContract.canonicalCharacters || []).concat(addedCast) });
  }

  // Rebalance ngân sách mềm về khoảng 5.000 từ, không áp vai trò cố định cho scene.
  const rawSum = graph.scenes.reduce((n, x) => n + Math.max(1, Number(x.targetWords) || 1), 0);
  let remaining = limits.target;
  graph.scenes.forEach((scene, i) => {
    if (i === graph.scenes.length - 1) scene.targetWords = Math.max(350, remaining);
    else {
      scene.targetWords = Math.max(350, Math.round((scene.targetWords / rawSum) * limits.target / 50) * 50);
      remaining -= scene.targetWords;
    }
  });

  const pieces = [], sceneStates = [], sceneTelemetry = [];
  let dupDropped = 0, sceneRetries = 0, sceneAiReviews = 0, ratioSum = 0, ratioN = 0;
  const danglingTrimmed = [];
  const sceneRewritten = [], sceneWarnings = [], sceneKept = [], scenePatched = [];
  const pushSceneWarn = (w, force) => { if (force || sceneWarnings.length < 40) sceneWarnings.push(w); };
  /* V14.5.9: sổ bằng chứng sự kiện Outline. itemsAll = mục đánh số của Outline (hoặc các ý tách từ dòng Outline nếu không đánh số). */
  const itemsAll = (outlineItems && outlineItems.length ? outlineItems : outlineBeatSegments(chapterContract.chapterOutline || '').slice(0, 10)).map(x => String(x));
  const beatLedger = {}, pieceScene = [], beatRepaired = [];
  let beatChecks = 0;
  const beatCheckOn = deps.sceneBeatCheck !== false && deps.outlineComplete === true && !!outlineMap && itemsAll.length > 0;
  const sceneOwnItems = sc => beatCheckOn ? (Array.isArray(sc && sc.outlineItems) ? sc.outlineItems : []).filter(n => n >= 1 && n <= itemsAll.length).map(n => ({ n, text: itemsAll[n - 1] })) : [];
  const checkBeats = async (items, txt, model, scope) => {
    try {
      const r = await callAI(buildBeatEvidencePrompt({ items, text: txt, scope }), { maxTokens: Math.min(1400, 160 + 130 * items.length), temperature: 0.1, modelOverride: deps.sceneReviewModel || model, streaming: false });
      const pr = parseBeatEvidence(r && r.text, items.map(x => x.n), txt); beatChecks++;
      return pr;
    } catch (e) { if (deps.warn) deps.warn('[AdaptiveScene] beat evidence failed', e && e.message); return null; }
  };
  const recordLedger = (pr, sceneId) => { (pr && pr.results || []).forEach(x => { beatLedger[x.n] = { done: x.done, evidence: x.evidence, sceneId }; }); };
  const maxSceneRetries = deps.sceneRetries == null ? 1 : Math.max(0, Math.min(2, Number(deps.sceneRetries) || 0));
  let usedNsfw = !!o.usingNsfw, lastRoute = { model: o.model, nsfw: !!o.usingNsfw }, timedOut = false;
  let previousTail = priorChapters.length
    ? String(priorChapters[priorChapters.length - 1].text || '').slice(-900)
    : '';
  const prevUnfinished = priorChapters.length > 0 && endsMidScene(String(priorChapters[priorChapters.length - 1].text || ''));   // V14.7.50
  for (let i = 0; i < graph.scenes.length; i++) {
    let scene = graph.scenes[i];
    if (i === 0 && prevUnfinished) scene = Object.assign({}, scene, { targetWords: Math.max(Number(scene.targetWords) || 0, Math.min(2200, Math.round(limits.target * 0.4))) });   // V14.7.50: cảnh bỏ dở được trọn nhịp, không bị chốt vài trăm từ
    if (countWords(pieces.join('\n\n')) >= limits.maxAccept) break;
    if (pieces.length && timeLeft() < minSceneMs) { timedOut = true; break; }
    const route = deps.route(scene, o, previousTail);
    const _own = sceneOwnItems(scene);
    lastRoute = route;
    if (route.nsfw && !usedNsfw) { usedNsfw = true; if (deps.onNsfw) { try { deps.onNsfw(scene, route); } catch (_) {} } }
    // V14.0.16: KIỂM TRA TỪNG SCENE ngay sau khi viết. Lỗi nặng -> viết lại ĐÚNG scene này (tối đa sceneRetries lần), không ghép scene sai vào chương.
    /* V14.3.8: model viết scene ngắn hơn ngân sách (thường chỉ 75–90%) nên chương luôn phải bù từ SAU câu kết. Nâng mục tiêu trong PROMPT theo tỉ lệ đạt được của các scene trước (tối đa x1,35); kiểm tra vẫn dùng mục tiêu gốc. */
    const _boost = (deps.sceneTargetBoost !== false && ratioN) ? Math.min(1.35, Math.max(1, 1 / Math.max(0.6, ratioSum / ratioN))) : 1;
    const pScene = _boost > 1.05 ? Object.assign({}, scene, { targetWords: Math.round(scene.targetWords * _boost) }) : scene;
    const sceneT0 = Date.now(), sceneMetric = { sceneId: scene.id, outlineItems: Array.isArray(scene.outlineItems) ? scene.outlineItems.slice() : [], targetWords: Number(scene.targetWords) || 0, attempts: 0, retries: 0, inputChars: 0, outputWords: 0, status: 'running', errors: [], patched: false, aiReviews: 0 };
    let correction = '', degenFallback = false, degenSalvaged = false, degenTries = 0, degenKindRunOn = false, maxTr = maxSceneRetries, accepted = null, skipScene = false, lastErrors = [], sceneTries = 0, lastText = '', lastAiOnly = false, bestAiOnly = null, beatChecked = false;
    for (let sa = 0; sa <= maxTr; sa++) {
      if (sa > 0 && timeLeft() < minSceneMs) break;
      sceneTries++;
      sceneMetric.attempts = sceneTries; sceneMetric.retries = Math.max(0, sceneTries - 1);
      const prompt = buildAdaptiveSceneWritePrompt({
        state: st, scene: pScene, chapterGoal: graph.chapterGoal,
        endingAnchor: graph.endingAnchor, previousTail,
        isOpeningScene: i === 0 && !!priorChapters.length, prevUnfinished: i === 0 && prevUnfinished,
        stateDelta: sceneStates.length ? sceneStates[sceneStates.length - 1] : null,
        requiredBeats,
        sceneScope: deps.sceneScope === false ? null : sceneScopeOf(graph.scenes, i, chapterContract.outlineMeta, itemsAll),
        prevScene: i > 0 && deps.sceneBridge !== false ? graph.scenes[i - 1] : null,
        allowedCast: chapterContract.allowedCharacters.join(', '),
        forbiddenDrift: chapterContract.forbiddenDrift.join(' '), chapterContract,
        isFinalScene: i === graph.scenes.length - 1,
        style: deps.style(route.nsfw),
        correction
      });
      sceneMetric.inputChars += prompt.length;
      let text, rawDg = { bad: false, reasons: [] };
      try {
        const r = await callAI(prompt, {
          maxTokens: Math.min(3600, Math.max(1100, Math.ceil(pScene.targetWords * (degenTries ? 1.5 : 1.9)))),   // V14.7.41: sau khi sụp → giới hạn ngắn hơn, nhiệt thấp, phạt lặp mạnh hơn
          temperature: degenTries ? 0.55 : Math.max(0.5, (route.nsfw ? 0.78 : 0.72) - (sa ? 0.1 : 0)),
          modelOverride: (degenFallback && deps.fallbackModel) ? deps.fallbackModel : route.model,   // V14.7.39: lượt viết lại sau khi model sụp → dùng model chính
          systemPrompt: SCENE_SYSTEM_PROMPT,
          frequency_penalty: degenTries ? (degenKindRunOn ? 0.08 : 0.4) : 0.22,   // V14.7.46: lan man = phạt lặp cao ép model đi tìm từ lạ → hạ phạt; lặp cụm → tăng phạt
          presence_penalty: degenTries ? (degenKindRunOn ? 0.04 : 0.3) : 0.18,
          streaming: false
        });
        let rawTxt = String(r && r.text || '');
        rawDg = degenerationCheck(rawTxt);
        if (rawDg.bad) { const sv = salvageBeforeDegeneration(rawTxt); if (countWords(sv) >= Math.max(200, Math.round((Number(scene.targetWords) || 0) * 0.5)) && !degenerationCheck(sv).bad) { rawTxt = sv; rawDg = { bad: false, reasons: [] }; degenSalvaged = true; pushSceneWarn(scene.id + ': model sụp giữa chừng — đã cắt phần hỏng, giữ ' + countWords(sv) + ' từ đầu còn sạch', true); } }
        if (rawDg.bad && !degenSalvaged && sa >= maxTr) { const tr0 = trimRunOnDrift(rawTxt); if (tr0.trimmed && !degenerationCheck(tr0.text).bad) { rawTxt = tr0.text; rawDg = { bad: false, reasons: [] }; degenSalvaged = true; pushSceneWarn(scene.id + ': model lan man — đã cắt ' + tr0.trimmed + ' câu lê thê/lạc giọng ở lượt cuối, nên đọc lại', true); } }   // V14.7.46
        text = formatParagraphs(stripForeign(stripSceneLeaks(stripThinkingOutput(rawTxt)))).trim();   // V14.7.39: kiểm trên văn BẢN GỐC (trước bước dọn)
        sceneMetric.outputWords = Math.max(sceneMetric.outputWords, countWords(text));
        if (detectNonVietnamese(text)) text = stripForeign(text);
        // V14.0.8: scene viết LẠI đoạn đã có (model mở đầu lại cùng một cảnh) -> cắt phần lặp, giống đường viết tiếp của writer cũ.
        if (pieces.length) { const d = dropRepeatedParagraphs(pieces.join('\n\n'), text); if (d.length < text.length) { dupDropped++; text = d.trim(); if (countWords(text) < 80) { skipScene = true; break; } } }
        { const tr = trimDanglingSceneEnd(text); if (tr !== text && countWords(tr) >= 80) { if (!danglingTrimmed.includes(scene.id)) danglingTrimmed.push(scene.id); text = tr; } }
      } catch (e) {
        sceneMetric.errors.push(String(e && e.message || 'scene API error').slice(0, 240));
        if (deps.warn) deps.warn('[AdaptiveScene] scene failed', scene.id, e && e.message);
        // V14.5.5: giữ thông báo lỗi API thật; lỗi tạm thời (timeout/5xx/429...) -> thử lại CHÍNH scene này thay vì hủy cả job.
        if (deps.onSceneError) { try { deps.onSceneError(scene.id, e && e.message); } catch (_) {} }
        if (sa < maxSceneRetries && timeLeft() > minSceneMs) continue;
        return null;
      }
      const chk = checkSceneQuality(text, scene, { contract: chapterContract, isFinal: i === graph.scenes.length - 1, endingAnchor: graph.endingAnchor });
      let errors = chk.errors.slice(), warns = chk.warnings.slice();
      { const dg = rawDg.bad ? rawDg : degenerationCheck(text); if (dg.bad) { errors.unshift('VĂN SUY BIẾN: ' + dg.reasons.join('; ') + ' — viết lại sạch, câu đủ dấu, không lặp.'); degenFallback = true; degenKindRunOn = dg.reasons.some(r => /lan man|bản tin|quảng cáo/.test(r)) && !dg.reasons.some(r => /lặp \d+ lần|bị lặp/.test(r)); degenTries++; if (degenTries === 1 && maxTr === maxSceneRetries) maxTr++; } }  // V14.7.41: model sụp → thêm 1 lượt viết (tổng 3) }   // V14.7.39
      lastText = text; lastAiOnly = !errors.length;
      /* V14.3.2: scene kể LẠI sự kiện của scene trước (khác câu chữ) -> viết lại. Không phải lỗi cứng: hết lượt thì giữ bản cuối + cảnh báo (như lỗi chỉ do AI rà), không hủy job. */
      let overlapErr = '';
      if (!errors.length && pieces.length && deps.sceneOverlapCheck !== false) {
        const ov = sceneParaphraseOverlap(pieces.join('\n\n'), text);
        if (ov.hit >= 3 && ov.hit / Math.max(1, ov.total) >= 0.3) overlapErr = 'LẶP SCENE TRƯỚC: ' + ov.hit + '/' + ov.total + ' đoạn kể lại sự kiện đã có ở scene trước (chỉ khác cách diễn đạt). Viết lại: chỉ làm checklist riêng của scene này và tiến sang diễn biến MỚI, không nhắc lại chi tiết cũ.';
      }
      /* V14.3.3: scene < 60% ngân sách -> viết lại (mềm, không hủy job; lượt cuối nhận bản đó và để bước bù từ lo). Trước đây phần thiếu bị bù bằng top-up NỐI SAU CÂU KẾT chương. */
      let shortErr = '';
      { const sT = Number(scene.targetWords) || 0, sW = countWords(text);
        if (!errors.length && !overlapErr && deps.sceneShortRetry !== false && sT >= 600 && sW >= 80 && sW < sT * 0.6 && sa < maxSceneRetries && timeLeft() > minSceneMs)
          shortErr = 'scene quá ngắn (' + sW + '/' + sT + ' từ). Viết lại dài ít nhất ' + Math.round(sT * 0.85) + ' từ: mỗi mục trong checklist là một cảnh đầy đủ (hành động, lời thoại, phản ứng, chi tiết giác quan), không tóm tắt, không dồn vào vài câu.'; }
      if (overlapErr || shortErr) errors = [overlapErr || shortErr];
      /* V14.5.9: BƯỚC 2 — AI trích câu bằng chứng cho từng mục Outline được giao cho scene này; mục thiếu -> lỗi vá-được (chèn cục bộ). */
      if (!errors.length && _own.length && timeLeft() > minSceneMs / 2) {
        const bc = await checkBeats(_own, text, route.model, 'scene');
        if (bc) {
          beatChecked = true; recordLedger(bc, scene.id);
          if (bc.missing.length) errors = [beatMissingError(bc.missing.map(n => itemsAll[n - 1]))];
        } else warns.push('kiểm tra bằng chứng sự kiện Outline không đọc được — để bước chốt cuối chương xử lý');
      }
      if (!errors.length && deps.sceneAiReview && timeLeft() > minSceneMs / 2) {
        try {
          const rv = await callAI(buildSceneReviewPrompt({ scene, text, chapterContract, nextScene: graph.scenes[i + 1] }), {
            maxTokens: 500, temperature: 0.1, modelOverride: deps.sceneReviewModel || route.model, streaming: false
          });
          const parsed = parseSceneReviewResponse(rv && rv.text);
          sceneAiReviews++;
          sceneMetric.aiReviews++;
          if (parsed) {
            errors = parsed.errors.slice(); warns = warns.concat(parsed.warnings);
            if (parsed.ok === false && !parsed.errors.length && !parsed.warnings.length) warns.push('rà AI báo ok=false nhưng không nêu lý do — scene được coi là đạt, nên đọc lại');
          } else warns.push('rà AI trả phản hồi không đọc được (JSON hỏng/rỗng) — scene này CHƯA được rà');
        } catch (e) { if (deps.warn) deps.warn('[AdaptiveScene] scene review failed', scene.id, e && e.message); }
      }
      if (!errors.length) { accepted = text; warns.forEach(w => pushSceneWarn(scene.id + ': ' + w)); break; }
      lastErrors = errors;
      if (lastAiOnly && errors.length) bestAiOnly = { text, errors: errors.slice() }; // bản vượt kiểm tra cứng, chỉ bị AI rà chê: dự phòng nếu lượt viết lại sau đó hỏng kiểm tra cứng
      /* V14.3.7: lỗi chỉ do AI rà và vá-được (MUST_CHANGE/LOCATION_TIME) -> VÁ CỤC BỘ NGAY (1 lời gọi, chèn ≤320 từ) thay vì viết lại cả scene (viết lại tốn 3–5 lời gọi và hay sinh lỗi mới). */
      if (deps.scenePatchFirst !== false && lastAiOnly && deps.sceneAiPatch !== false && sceneErrorsPatchable(errors) && sa < maxSceneRetries && countWords(text) >= 80) break;
      if (sa < maxSceneRetries) { sceneRetries++; if (!sceneRewritten.includes(scene.id)) sceneRewritten.push(scene.id); }
      correction = errors.join(' | ');
    }
    if (skipScene) continue;
    /* V14.3: scene hết lượt viết lại mà CHỈ bị AI rà báo lỗi vá-được (MUST_CHANGE / LOCATION_TIME) -> thử VÁ CỤC BỘ (chèn vài câu), rà lại một lần.
       Vá xong qua rà -> nhận; vá được nhưng AI vẫn chê -> giữ bản đã vá + cảnh báo; không vá được -> giữ bản viết cuối như V14.2.4. */
    let patchNote = '', rollbackNote = '';
    // V14.3: lượt viết lại làm scene HỎNG kiểm tra cứng (vd lẫn nhân vật ngoài cast) trong khi bản trước chỉ bị AI rà chê -> quay về bản trước (kèm cảnh báo) thay vì hủy cả job.
    if (accepted === null && !skipScene && !lastAiOnly && bestAiOnly && deps.keepAiOnlyRejected !== false) {
      rollbackNote = 'lượt viết lại sau hỏng: ' + String(lastErrors[0] || '').slice(0, 80) + ' → dùng lại bản trước';
      lastText = bestAiOnly.text; lastErrors = bestAiOnly.errors; lastAiOnly = true;
    }
    if (accepted === null && lastText && lastAiOnly && deps.sceneAiPatch !== false && (deps.sceneAiReview || beatChecked) && countWords(lastText) >= 80 && sceneErrorsPatchable(lastErrors) && timeLeft() > minSceneMs / 2) {
      try {
        const _beatFix = lastErrors.some(e => /SỰ KIỆN BẮT BUỘC/.test(String(e)));
        const pr = await callAI(buildSceneFixPrompt({ scene, text: lastText, errors: lastErrors, maxAdd: _beatFix ? 520 : undefined, profile: sceneProfileBlock(st, scene, chapterContract.allowedCharacters) }), {
          maxTokens: _beatFix ? 1500 : 900, temperature: 0.3, modelOverride: route.model, streaming: false
        });
        const fx = applySceneFixInserts(lastText, stripThinkingOutput(String(pr && pr.text || '')), _beatFix ? 520 : undefined);
        if (!fx.ok) patchNote = 'vá cục bộ không thành: ' + fx.reason;
        else {
          const chk2 = checkSceneQuality(fx.text, scene, { contract: chapterContract, isFinal: i === graph.scenes.length - 1, endingAnchor: graph.endingAnchor });
          if (chk2.errors.length) patchNote = 'bản vá bị loại: ' + chk2.errors[0];
          else {
            let errs2 = [];
            if (beatChecked && _own.length && timeLeft() > minSceneMs / 2) {
              const bc2 = await checkBeats(_own, fx.text, route.model, 'scene');
              if (bc2) { recordLedger(bc2, scene.id); if (bc2.missing.length) errs2 = [beatMissingError(bc2.missing.map(n => itemsAll[n - 1]))]; }
            } else if (timeLeft() > minSceneMs / 2) {
              try {
                const rv2 = await callAI(buildSceneReviewPrompt({ scene, text: fx.text, chapterContract, nextScene: graph.scenes[i + 1] }), { maxTokens: 500, temperature: 0.1, modelOverride: deps.sceneReviewModel || route.model, streaming: false });
                const p2 = parseSceneReviewResponse(rv2 && rv2.text); sceneAiReviews++;
                if (p2) errs2 = p2.errors.slice();
              } catch (e) { if (deps.warn) deps.warn('[AdaptiveScene] scene re-review failed', scene.id, e && e.message); }
            }
            scenePatched.push(scene.id);
            if (!errs2.length) { accepted = fx.text; pushSceneWarn(scene.id + ': ĐÃ VÁ CỤC BỘ (+' + fx.added + ' từ) sau ' + sceneTries + ' lượt viết' + (rollbackNote ? ' (' + rollbackNote + ')' : '') + ' — lỗi AI rà: ' + lastErrors.join(' | ').slice(0, 220), true); }
            else { accepted = fx.text; lastErrors = errs2; patchNote = 'đã vá (+' + fx.added + ' từ) nhưng AI vẫn báo: ' + errs2.join(' | ').slice(0, 420); }
          }
        }
      } catch (e) { patchNote = 'vá cục bộ lỗi: ' + (e && e.message || 'không rõ'); if (deps.warn) deps.warn('[AdaptiveScene] scene patch failed', scene.id, e && e.message); }
    }
    /* V14.2.4: scene hết lượt viết lại mà CHỈ bị AI rà báo (kiểm tra cứng cục bộ đã qua: đủ độ dài, không lặp, không lẫn ngoại ngữ) -> GIỮ bản viết cuối kèm cảnh báo,
       thay vì hủy cả job nháp (mất mọi scene đã viết). AI rà hay bắt lỗi quá chi tiết (vd thiếu một chi tiết cụ thể trong Contract); người dùng sửa tay hoặc 🔍 Duyệt lại sau. */
    if (accepted !== null && patchNote) {
      sceneKept.push(scene.id);
      pushSceneWarn(scene.id + ': GIỮ BẢN CUỐI dù AI rà báo (' + sceneTries + ' lượt, ' + patchNote + (rollbackNote ? '; ' + rollbackNote : '') + ')', true);
    } else if (accepted === null && lastText && lastAiOnly && deps.keepAiOnlyRejected !== false && countWords(lastText) >= 80) {
      accepted = lastText; sceneKept.push(scene.id);
      pushSceneWarn(scene.id + ': GIỮ BẢN CUỐI dù AI rà báo (' + sceneTries + ' lượt' + ([patchNote, rollbackNote].filter(Boolean).length ? ', ' + [patchNote, rollbackNote].filter(Boolean).join('; ') : '') + '): ' + (lastErrors.join(' | ') || 'scene không đạt rà AI').slice(0, 480), true);
    }
    if (accepted === null) { sceneMetric.status = 'rejected'; sceneMetric.errors = sceneMetric.errors.concat(lastErrors.map(x => String(x).slice(0, 240))).slice(0, 6); sceneMetric.durationMs = Date.now() - sceneT0; sceneTelemetry.push(sceneMetric); return { rejected: true, reason: 'SCENE_REJECTED ' + scene.id + (sceneTries > 1 ? ' (sau ' + sceneTries + ' lượt viết)' : '') + ': ' + (lastErrors.join(' | ') || 'scene không đạt kiểm tra') }; }
    /* V14.7.55: cảnh báo (không retry) khi giờ giấc/mã số dày đặc trong scene. */
    if (accepted) { const dn = timeCodeDensity(accepted); if (dn.times > Math.max(3, Math.ceil(dn.words / 350)) || dn.codes > 3) pushSceneWarn(scene.id + ': giờ giấc/mã số dày (' + dn.times + ' mốc giờ, ' + dn.codes + ' mã) — nên bớt khi đọc lại'); }
    /* V14.7.54: scene đã bị cắt sau khi sụp và còn quá ngắn → viết tiếp phần còn thiếu (1 lượt, model chính, nhiệt thấp, qua cổng văn suy biến). */
    if (deps.salvageContinue !== false && accepted && degenSalvaged && !skipScene && countWords(accepted) < (Number(scene.targetWords) || 0) * 0.8 && timeLeft() > minSceneMs) {
      try {
        const remaining = Math.max(300, Math.min(1300, Math.round((Number(scene.targetWords) || 900) - countWords(accepted))));
        const sr = await callAI(buildSalvageContinuePrompt({ text: accepted, scene, remaining }), { maxTokens: Math.min(3200, Math.ceil(remaining * 2.2)), temperature: 0.55, modelOverride: deps.fallbackModel || route.model, systemPrompt: SCENE_SYSTEM_PROMPT, frequency_penalty: 0.08, presence_penalty: 0.04, streaming: false });
        let add = formatParagraphs(stripForeign(stripSceneLeaks(stripThinkingOutput(String(sr && sr.text || ''))))).trim();
        if (add) add = dropRepeatedParagraphs(accepted, add).trim();
        if (add && degenerationCheck(add).bad) { const sv2 = salvageBeforeDegeneration(add); add = countWords(sv2) >= 120 && !degenerationCheck(sv2).bad ? sv2 : ''; }
        if (countWords(add) >= 120 && !isAssistantNotePara(add.split('\n')[0])) { accepted = accepted + '\n\n' + add; pushSceneWarn(scene.id + ': scene bị cắt sau khi model sụp → đã viết tiếp phần còn thiếu (+' + countWords(add) + ' từ)'); sceneMetric.salvageContinued = true; }
        else pushSceneWarn(scene.id + ': scene bị cắt sau khi model sụp và lượt viết tiếp không đạt — các mục nửa sau có thể thiếu, nên đọc lại');
      } catch (e) { pushSceneWarn(scene.id + ': scene bị cắt sau khi model sụp; lượt viết tiếp lỗi (' + String(e && e.message || '').slice(0, 80) + ')'); }
    }
    /* V14.7.53: cảnh nóng chưa tới cao trào/dư âm → MỘT lượt viết tiếp tại chỗ (không viết lại cả scene) thay vì để scene sau nhảy giờ. */
    if (deps.hotSceneFinish !== false && accepted && (route.nsfw || isHotSceneDef(scene)) && hotActOpen(accepted) && timeLeft() > minSceneMs) {
      try {
        const fr = await callAI(buildHotFinishPrompt({ text: accepted, scene }), { maxTokens: 1700, temperature: 0.7, modelOverride: route.model, systemPrompt: SCENE_SYSTEM_PROMPT, frequency_penalty: 0.22, presence_penalty: 0.18, streaming: false });
        let add = formatParagraphs(stripForeign(stripSceneLeaks(stripThinkingOutput(String(fr && fr.text || ''))))).trim();
        if (add) add = dropRepeatedParagraphs(accepted, add).trim();
        if (countWords(add) >= 120 && !degenerationCheck(add).bad && !isAssistantNotePara(add.split('\n')[0])) { accepted = accepted + '\n\n' + add; pushSceneWarn(scene.id + ': cảnh nóng đang dở → đã viết tiếp tới cao trào/dư âm (+' + countWords(add) + ' từ)'); sceneMetric.hotFinished = true; }
        else pushSceneWarn(scene.id + ': cảnh nóng có vẻ chưa khép (chưa thấy cao trào/dư âm) nhưng lượt viết tiếp không đạt — nên đọc lại');
      } catch (e) { pushSceneWarn(scene.id + ': cảnh nóng có vẻ chưa khép; lượt viết tiếp lỗi (' + String(e && e.message || '').slice(0, 80) + ')'); }
    }
    pieces.push(accepted); pieceScene.push(i);
    sceneMetric.status = sceneKept.includes(scene.id) ? 'kept_with_warning' : (scenePatched.includes(scene.id) ? 'patched' : 'accepted');
    sceneMetric.patched = scenePatched.includes(scene.id); sceneMetric.outputWords = countWords(accepted); sceneMetric.errors = lastErrors.slice(0, 6).map(x => String(x).slice(0, 240)); sceneMetric.durationMs = Date.now() - sceneT0; sceneTelemetry.push(sceneMetric);
    if (Number(scene.targetWords) > 0) { ratioSum += countWords(accepted) / Number(scene.targetWords); ratioN++; }
    previousTail = accepted.slice(-1200);
    sceneStates.push({
      sceneId: scene.id, location: scene.location, time: scene.time,
      characters: scene.characters, mustChange: scene.mustChange,
      handoff: scene.handoff
    });
  }
  const clean = typeof deps.clean === 'function' ? deps.clean : (t => t);
  let text = clean(pieces.join('\n\n').trim()).trim();
  let wc = countWords(text), topUpAttempts = 0, topUpFails = 0;
  const wordsAfterScenes = wc, wordsBeforeClean = countWords(pieces.join(' '));
  /* V14.5.9: BƯỚC 3 — chốt cuối chương bằng SỔ BẰNG CHỨNG (không dùng đối chiếu từ khóa). Mục chưa có bằng chứng -> hỏi AI một lần trên cả chương;
     mục vẫn thiếu -> chèn đúng vào scene được giao (trước đoạn kết) thay vì nối thêm sau câu kết. null = không dùng sổ (tắt/không có Outline/AI lỗi). */
  let ledgerMiss = null;
  if (deps.beatLedger !== false && deps.outlineComplete === true && itemsAll.length) {
    const unresolved = itemsAll.map((_, k) => k + 1).filter(n => !(beatLedger[n] && beatLedger[n].done));
    ledgerMiss = [];
    if (unresolved.length && timeLeft() > minTopUpMs / 2) {
      const cr = await checkBeats(unresolved.map(n => ({ n, text: itemsAll[n - 1] })), text, lastRoute.model, 'chapter');
      if (cr) { recordLedger(cr, 'chapter'); ledgerMiss = cr.missing.slice(); }
      else pushSceneWarn('chương: không đọc được kết quả kiểm tra bằng chứng sự kiện Outline — bỏ qua bước bù sự kiện');
    }
    if (ledgerMiss.length && deps.beatRepair !== false) {
      const groups = {};
      ledgerMiss.forEach(n => {
        let si = graph.scenes.findIndex(sc => Array.isArray(sc.outlineItems) && sc.outlineItems.includes(n));
        let pi = si >= 0 ? pieceScene.indexOf(si) : -1;
        if (pi < 0) { pi = pieces.length - 1; si = pi >= 0 ? pieceScene[pi] : -1; }
        if (pi >= 0) (groups[pi] = groups[pi] || { si, ns: [] }).ns.push(n);
      });
      for (const key of Object.keys(groups)) {
        const gr = groups[key], pi = Number(key), room = Math.min(520, limits.hardMax - 60 - countWords(pieces.join(' ')));
        if (room < 120 || timeLeft() < minTopUpMs / 2) break;
        try {
          const sceneObj = graph.scenes[gr.si] || {};
          const pr = await callAI(buildSceneFixPrompt({ scene: sceneObj, text: pieces[pi], errors: [beatMissingError(gr.ns.map(n => itemsAll[n - 1]))], maxAdd: room, profile: sceneProfileBlock(st, sceneObj, chapterContract.allowedCharacters) }), { maxTokens: 1500, temperature: 0.3, modelOverride: lastRoute.model, streaming: false });
          const fx = applySceneFixInserts(pieces[pi], stripThinkingOutput(String(pr && pr.text || '')), room);
          if (!fx.ok) { pushSceneWarn((sceneObj.id || 'scene') + ': chèn sự kiện thiếu không thành: ' + fx.reason); continue; }
          const chk3 = checkSceneQuality(fx.text, sceneObj, { contract: chapterContract });
          if (chk3.errors.length) { pushSceneWarn((sceneObj.id || 'scene') + ': bản chèn sự kiện bị loại: ' + chk3.errors[0]); continue; }
          const rc = await checkBeats(gr.ns.map(n => ({ n, text: itemsAll[n - 1] })), fx.text, lastRoute.model, 'scene');
          if (rc) recordLedger(rc, sceneObj.id || 'repair');
          pieces[pi] = fx.text; beatRepaired.push((sceneObj.id || 'scene') + ':' + gr.ns.join(','));
          pushSceneWarn((sceneObj.id || 'scene') + ': ĐÃ CHÈN sự kiện Outline còn thiếu (mục ' + gr.ns.join(', ') + ', +' + fx.added + ' từ)', true);
        } catch (e) { if (deps.warn) deps.warn('[AdaptiveScene] beat repair failed', e && e.message); }
      }
      if (beatRepaired.length) { text = clean(pieces.join('\n\n').trim()).trim(); wc = countWords(text); }
      ledgerMiss = itemsAll.map((_, k) => k + 1).filter(n => !(beatLedger[n] && beatLedger[n].done) && ledgerMiss.includes(n));
    }
  }
  // V13.2: Adaptive Scene không được kết thúc dưới minAccept. Top-up chỉ gửi đuôi + state delta,
  // không gửi lại toàn bộ chương; chỉ kích hoạt khi các scene ban đầu bị model trả thiếu.
  // V14.0.9: (1) đếm từ SAU khi dọn (cắt lặp/rò tiếng Anh) để không "đủ 4.500" rồi tụt xuống 4.100 ở bước dọn cuối;
  // (2) nhắm minAccept + đệm (bước khép câu cuối/khóa độ dài có thể bớt vài chục từ); (3) lượt bù hỏng (quá ngắn/lặp/không tăng)
  // không làm dừng ngay — chỉ dừng sau 2 lượt hỏng LIÊN TIẾP; tối đa 8 lượt.
  const buffer = Math.min(200, Math.max(0, limits.maxAccept - limits.minAccept - 100));
  const goal = limits.minAccept + buffer;
  /* V14.4.4: sự kiện chính của Outline phải có ĐỦ trong chương. Nếu đối chiếu từ khóa thấy beat còn thiếu thì chạy tối đa 2 lượt bù RIÊNG cho beat đó, kể cả khi chương đã đủ từ. Bật bằng deps.outlineComplete === true. */
  const _castNames = [].concat(chapterContract.allowedCharacters || [], chapterContract.canonicalCharacters || []);
  let completionAttempts = 0;
  while (topUpAttempts < 8 && topUpFails < 2) {
    const miss = ledgerMiss ? ledgerMiss.map(n => itemsAll[n - 1]) : (deps.outlineComplete === true ? outlineMissingBeats(chapterContract.chapterOutline, text, _castNames) : []);
    const needLen = wc < goal, needBeats = miss.length > 0 && completionAttempts < 2 && wc + 300 <= limits.maxAccept;
    if (!needLen && !needBeats) break;
    if (timeLeft() < minTopUpMs) { timedOut = true; break; }
    if (needBeats) completionAttempts++;
    const needWords = needLen ? Math.min(1800, goal - wc) : Math.min(700, Math.max(350, limits.maxAccept - wc - 150));
    const topUpPrompt = buildAdaptiveSceneTopUpPrompt({
      state: st, currentWords: wc, needWords, missingBeats: needBeats ? miss : null, completeOnly: !needLen, chapterGoal: graph.chapterGoal,
      endingAnchor: graph.endingAnchor, previousTail: text.slice(-2400),
      stateDelta: sceneStates.length ? sceneStates[sceneStates.length - 1] : null,
      requiredBeats, doneList: deps.sceneScope === false ? null : sceneScopeOf(graph.scenes, graph.scenes.length).done, allowedCast: chapterContract.allowedCharacters.join(', '),
      forbiddenDrift: chapterContract.forbiddenDrift.join(' '), chapterContract, style: deps.style(lastRoute.nsfw)
    });
    topUpAttempts++;
    try {
      const r = await callAI(topUpPrompt, {
        maxTokens: Math.min(4200, Math.max(1800, Math.ceil(needWords * 2.1) + 450)),
        temperature: lastRoute.nsfw ? 0.76 : 0.70, modelOverride: lastRoute.model,
        frequency_penalty: 0.22, presence_penalty: 0.18, streaming: false
      });
      let extra = formatParagraphs(stripForeign(stripSceneLeaks(stripThinkingOutput(String(r && r.text || ''))))).trim();
      if (detectNonVietnamese(extra)) extra = stripForeign(extra);
      { const d = dropRepeatedParagraphs(text, extra); if (d.length < extra.length) { dupDropped++; extra = d.trim(); } }
      if (countWords(extra) < 80) { topUpFails++; continue; }
      if (needBeats) { const ov = sceneParaphraseOverlap(text, extra); if (ov.hit >= 3 && ov.hit / Math.max(1, ov.total) >= 0.3) { topUpFails++; continue; } }
      const extraCheck = validateSceneTextAgainstContract(extra, chapterContract);
      if (!extraCheck.ok) return { rejected: true, reason: 'TOPUP_REJECTED: ' + extraCheck.errors.join(' | ') };
      const before = wc;
      const merged = clean((text ? text + '\n\n' + extra : extra).trim()).trim();
      const mergedWc = countWords(merged);
      if (mergedWc <= before) { topUpFails++; continue; }
      text = merged; wc = mergedWc; topUpFails = 0;
      if (needBeats && ledgerMiss && ledgerMiss.length) { // kiểm tra lại đúng phần vừa viết; không đọc được -> coi như đã bù để khỏi lặp sự kiện
        const rc2 = await checkBeats(ledgerMiss.map(n => ({ n, text: itemsAll[n - 1] })), extra, lastRoute.model, 'scene');
        if (rc2) { recordLedger(rc2, 'topup'); ledgerMiss = ledgerMiss.filter(n => !(beatLedger[n] && beatLedger[n].done)); } else ledgerMiss = [];
      }
      previousTail = text.slice(-1200);
      sceneStates.push({ sceneId: 'TOPUP' + topUpAttempts, handoff: 'Đã bổ sung ' + (wc - before) + ' từ; tiếp tục nếu còn thiếu.' });
    } catch (e) {
      if (deps.warn) deps.warn('[AdaptiveScene] top-up failed', e && e.message);
      topUpFails++;
    }
  }
  const underTarget = wc < limits.minAccept;
  const outlineMissing = ledgerMiss ? ledgerMiss.map(n => itemsAll[n - 1].slice(0, 90)) : deps.outlineCheck === false ? [] : outlineMissingBeats(chapterContract.chapterOutline, text, [].concat(chapterContract.allowedCharacters || [], chapterContract.canonicalCharacters || []));
  const beatLedgerOut = {}; Object.keys(beatLedger).forEach(k => { beatLedgerOut[k] = { done: !!beatLedger[k].done, sceneId: beatLedger[k].sceneId, evidence: String(beatLedger[k].evidence || '').slice(0, 120) }; });
  const stats = { beatLedger: beatLedgerOut, beatChecks, beatRepaired, outlineMissing, outlineMap, scenes: pieces.length, plannedScenes: graph.scenes.length, topUpAttempts, dupDropped, sceneRetries, sceneRewritten, sceneWarnings, sceneKept, scenePatched, danglingTrimmed, sceneAiReviews, sceneTelemetry, strippedCast, addedCast, wordsAfterScenes, wordsBeforeClean, words: wc, seconds: Math.round((Date.now() - t0) / 1000) };
  return { text, plan: 'V14 CHAPTER CONTRACT\n' + JSON.stringify(promptChapterContract(chapterContract)) + '\nADAPTIVE SCENE GRAPH\n' + JSON.stringify(Object.assign({}, graph, { requiredBeats, topUpAttempts })), underTarget, usedNsfw, timedOut, stats };
}

/* ========== V14.0.15 — Canon Diff / Gợi ý nhân vật / Sức khỏe truyện / Rà mâu thuẫn / Telemetry ========== */
const CANON_DIFF_CHAR_FIELDS = ["tier","age","gender","maritalStatus","spouseName","role","position","occupation","faction","appearance","personality","goals","secret","weakness","fear","knowledge","speech","strength","independentPlot","currentLocation","physicalState","mentalState","height","bodyType","hair","eyes","skin","scars","tattoos","dead","lastAppearance","currentState","newDetails"];
function _cdVal(v) { if (v === undefined || v === null) return ""; if (typeof v === "boolean") return v ? "true" : ""; return String(v); }
function _cdClip(v, n) { v = _cdVal(v); return v.length > n ? v.slice(0, n) + "…" : v; }
/* So sánh Character/World trước & sau hậu kỳ. `from` giữ NGUYÊN GIÁ TRỊ CŨ (tối đa 3000 ký tự) để có thể hoàn tác từng trường. */
function computeCanonDiff(before, after) {
  const out = { characters: [], locations: [], items: [], threads: [], at: Date.now() };
  const key = (x, k) => (x && (x.id || normalizeName(x[k || "name"]))) || "";
  const byKey = (arr, k) => { const m = new Map(); (Array.isArray(arr) ? arr : []).forEach(x => { const kk = key(x, k); if (kk) m.set(kk, x); }); return m; };
  const bC = byKey(before && before.characters), aC = Array.isArray(after && after.characters) ? after.characters : [];
  aC.forEach(c => {
    if (!c || !c.name) return;
    const old = bC.get(key(c));
    if (!old) { out.characters.push({ kind: "added", id: c.id, name: c.name, tier: c.tier || "", changes: [] }); return; }
    const changes = [];
    CANON_DIFF_CHAR_FIELDS.forEach(f => {
      const a = _cdVal(c[f]), b = _cdVal(old[f]);
      if (a !== b && !(f === "lastAppearance" && !a)) changes.push({ field: f, from: b.length > 3000 ? b.slice(0, 3000) : b, to: _cdClip(a, 400), fromClipped: b.length > 3000 });
    });
    const relB = (old.relationships || []).length, relA = (c.relationships || []).length;
    if (relA !== relB) changes.push({ field: "relationships", from: String(relB), to: String(relA), info: true });
    const hB = (old.history || []).length, hA = (c.history || []).length;
    if (hA > hB) changes.push({ field: "history", from: String(hB), to: String(hA), info: true });
    const meaningful = changes.filter(x => x.field !== "lastAppearance" && !x.info);
    if (changes.length) out.characters.push({ kind: "updated", id: c.id, name: c.name, changes, meaningful: meaningful.length });
  });
  const listDiff = (bArr, aArr, k, target) => {
    const bm = byKey(bArr, k);
    (Array.isArray(aArr) ? aArr : []).forEach(x => {
      if (!x) return; const kk = key(x, k), old = bm.get(kk), nm = x[k || "name"];
      if (!old) target.push({ kind: "added", name: _cdClip(nm, 120) });
      else if (_cdVal(old.status) !== _cdVal(x.status) || _cdVal(old.description) !== _cdVal(x.description) || _cdVal(old.owner) !== _cdVal(x.owner)) target.push({ kind: "updated", name: _cdClip(nm, 120), from: _cdClip(old.status, 40), to: _cdClip(x.status, 40) });
    });
  };
  listDiff(before && before.locations, after && after.locations, "name", out.locations);
  listDiff(before && before.items, after && after.items, "name", out.items);
  listDiff(before && before.threads, after && after.threads, "desc", out.threads);
  out.counts = { charsAdded: out.characters.filter(x => x.kind === "added").length, charsUpdated: out.characters.filter(x => x.kind === "updated").length, locations: out.locations.length, items: out.items.length, threads: out.threads.length };
  return out;
}
/* Hoàn tác một mục trong canonDiff trên `st` (state). Trả {ok, msg}. */
function undoCanonDiffItem(st, item, field) {
  if (!st || !item) return { ok: false, msg: "thiếu dữ liệu" };
  const list = st.characters || [];
  const idx = list.findIndex(c => c && ((item.id && c.id === item.id) || normalizeName(c.name) === normalizeName(item.name)));
  if (item.kind === "added") {
    if (idx < 0) return { ok: false, msg: "nhân vật không còn trong Database" };
    list.splice(idx, 1); return { ok: true, msg: "Đã gỡ nhân vật “" + item.name + "”" };
  }
  if (idx < 0) return { ok: false, msg: "nhân vật không còn trong Database" };
  const ch = (item.changes || []).find(x => x.field === field);
  if (!ch || ch.info) return { ok: false, msg: "trường này không hoàn tác được" };
  if (ch.fromClipped) return { ok: false, msg: "giá trị cũ quá dài, không hoàn tác tự động" };
  const c = list[idx];
  if (field === "dead") c.dead = ch.from === "true";
  else if (field === "lastAppearance") c.lastAppearance = ch.from === "" ? null : Number(ch.from);
  else c[field] = ch.from;
  return { ok: true, msg: "Đã trả “" + field + "” của " + item.name + " về giá trị cũ" };
}

/* ----- Hộp thư nhân vật gợi ý: tên riêng lặp lại nhưng chưa có trong Database ----- */
const NAME_SUGGEST_STOP = new Set(["viet nam","ha noi","sai gon","ho chi minh","da nang","hai phong","can tho","hue","trung quoc","nhat ban","han quoc","my","thu hai","thu ba","thu tu","thu nam","thu sau","thu bay","chu nhat","tet nguyen dan","nguyen dan","giang sinh","ban than","bo gia","ngay hom"]);
const NAME_SUGGEST_HONORIFIC = /^(ong|ba|co|anh|chi|em|chu|di|bac|thay|cau|mo|cu|thim|duong|gi)$/;
// V14.0.20 post-audit: tên công pháp / cảnh giới / thuật ngữ tu luyện (tu tiên, huyền huyễn, võ hiệp) không phải tên người.
// Chỉ lọc khi truyện thật sự thuộc thể loại này (xem nameSuggestCultivationMode) để không làm mất tên người ở truyện khác (vd. "Nguyên Anh" là tên con gái).
const NAME_SUGGEST_REALMS = ["luyen khi","truc co","ket dan","kim dan","ngung dan","nguyen anh","hoa than","luyen hu","hop the","dai thua","do kiep","phan than","xuat khieu","ngung mach","khai mach","tich coc","tien thien","hau thien","dia tien","thien tien","chan tien","huyen tien","kim tien","dau ky","dau su","dai dau su","dau vuong","dau hoang","dau ton","dau thanh","dau de","tong su","dai tong su"];
const NAME_SUGGEST_CONCEPT_HEAD = ["canh gioi","cong phap","tam phap","phap quyet","bi kip","bi tich","than thong","tu vi","linh can","linh khi","linh luc","chan khi","chan nguyen","kiem phap","than phap","quyen phap","dan duoc","phap bao","linh thach","linh dan","dai dao"];
const NAME_SUGGEST_TECH_SUFFIX = new Set(["quyết","công","pháp","kinh","thuật","chưởng","quyền","kiếm","trảo","trận","điển","đạo","phù","đan"]);
// Họ phổ biến (kể cả họ kiểu Trung): cụm 3 chữ bắt đầu bằng họ + kết thúc bằng từ như "Quyết/Công" vẫn có thể là TÊN NGƯỜI (vd. "Nguyễn Văn Công") nên không lọc.
const NAME_SUGGEST_SURNAMES = new Set(["nguyễn","trần","lê","phạm","hoàng","huỳnh","phan","vũ","võ","đặng","bùi","đỗ","hồ","ngô","dương","lý","lâm","trương","vương","tiêu","diệp","sở","mộ","âu","tư","thượng","lục","đường","triệu","tào","chu","tống","hạ","giang","cố","mạc","từ","thẩm","bạch","hứa","tạ","lưu","mã","hàn","đinh","khương","tôn","trịnh","đào","phùng","kiều"]);
const NAME_SUGGEST_CULT_CUES = ["tu luyện","linh khí","cảnh giới","tu vi","công pháp","đan điền","tu tiên","tu sĩ","pháp bảo","linh thạch","đột phá","kinh mạch","tông môn","chân khí","linh căn"];
function nameSuggestCultivationMode(chapters, opts) {
  if (opts && /tu (tiên|chân|luyện|đạo)|tiên hiệp|huyền huyễn|kiếm hiệp|võ hiệp|xianxia|cultivation|wuxia/i.test(String(opts.genre || ""))) return true;
  let n = 0;
  (chapters || []).some(ch => {
    const t = String((ch && ch.text) || "").normalize("NFC").toLowerCase();
    for (const c of NAME_SUGGEST_CULT_CUES) { let i = -1; while ((i = t.indexOf(c, i + 1)) >= 0) { if (++n >= 6) return true; } }
    return false;
  });
  return n >= 4;
}
function nameSuggestIsConcept(raw, nk) {
  if (NAME_SUGGEST_REALMS.some(r => nk === r || nk.startsWith(r + " "))) return true;
  if (NAME_SUGGEST_CONCEPT_HEAD.some(r => nk === r || nk.startsWith(r + " "))) return true;
  const rw = String(raw || "").toLowerCase().split(" ");
  return rw.length >= 3 && NAME_SUGGEST_TECH_SUFFIX.has(rw[rw.length - 1]) && !NAME_SUGGEST_SURNAMES.has(rw[0]);
}
function suggestCharacterCandidates(chapters, knownNames, opts) {
  opts = opts || {};
  const minCount = opts.minCount || 3, maxOut = opts.max || 12;
  const known = (knownNames || []).map(normalizeName).filter(Boolean);
  const re = /\p{Lu}\p{Ll}+(?:[ \t]+\p{Lu}\p{Ll}+){1,3}/gu;
  const found = new Map();
  const cultivation = nameSuggestCultivationMode(chapters, opts);
  (chapters || []).forEach((ch, ci) => {
    const text = String((ch && ch.text) || "").normalize("NFC");
    let m; re.lastIndex = 0;
    while ((m = re.exec(text))) {
      const raw = m[0].replace(/[ \t]+/g, " ").trim(), nk = normalizeName(raw);
      if (NAME_SUGGEST_STOP.has(nk)) continue;
      const words = nk.split(" ");
      if (words.length < 2) continue;
      let rec = found.get(nk);
      if (!rec) { rec = { name: raw, count: 0, chapters: new Set(), first: ci + 1, last: ci + 1, sample: "" }; found.set(nk, rec); }
      rec.count++; rec.chapters.add(ci + 1); rec.last = ci + 1;
      if (!rec.sample) { const s = Math.max(0, m.index - 50), e = Math.min(text.length, m.index + raw.length + 70); rec.sample = text.slice(s, e).replace(/\s+/g, " ").trim(); }
    }
  });
  const out = [];
  found.forEach((rec, nk) => {
    if (rec.count < minCount && rec.chapters.size < 2) return;
    if (rec.count < 2) return;
    if (cultivation && nameSuggestIsConcept(rec.name, nk)) return;
    const covered = known.some(k => k === nk || (" " + nk + " ").includes(" " + k + " ") || (" " + k + " ").includes(" " + nk + " "));
    if (covered) return;
    const w = nk.split(" ");
    // Cụm toàn từ thường gặp ở đầu câu/tiêu đề (không có tiền tố xưng hô, không lặp qua nhiều chương) cần xuất hiện nhiều hơn.
    if (!NAME_SUGGEST_HONORIFIC.test(w[0]) && rec.chapters.size < 2 && rec.count < minCount + 2) return;
    out.push({ name: rec.name, count: rec.count, chapters: rec.chapters.size, first: rec.first, last: rec.last, sample: rec.sample });
  });
  out.sort((a, b) => (b.chapters - a.chapters) || (b.count - a.count));
  return out.slice(0, maxOut);
}

/* ----- Bảng sức khỏe truyện ----- */
function storyHealthReport(st) {
  st = st || {};
  const chapters = Array.isArray(st.chapters) ? st.chapters : [], n = chapters.length;
  const rep = { chapters: n, avgWords: 0, scores: [], absent: [], openThreads: [], staleForeshadowing: [], arc: null, castLoad: 0, alerts: [], dead: 0 };
  if (!n) return rep;
  rep.avgWords = Math.round(chapters.reduce((s, c) => s + (Number(c && c.wordCount) || countWords(c && c.text)), 0) / n);
  rep.scores = chapters.slice(-10).map((c, i) => ({ chapter: n - Math.min(10, n) + i + 1, score: c && c.review && Number.isFinite(Number(c.review.score)) ? Number(c.review.score) : null }));
  const chars = Array.isArray(st.characters) ? st.characters : [];
  rep.dead = chars.filter(c => c && c.dead).length;
  chars.forEach(c => {
    if (!c || !c.name || c.dead) return;
    if (!["major", "important", "supporting"].includes(c.tier)) return;
    const gap = c.lastAppearance == null ? null : n - Number(c.lastAppearance);
    const limit = c.tier === "supporting" ? 12 : 6;
    if (gap !== null && gap > limit) rep.absent.push({ name: c.name, tier: c.tier, gap, last: c.lastAppearance });
  });
  rep.absent.sort((a, b) => b.gap - a.gap);
  (Array.isArray(st.threads) ? st.threads : []).forEach(t => {
    if (!t || !t.desc || ["paid_off", "abandoned", "resolved"].includes(String(t.status || "").toLowerCase())) return;
    const since = Number(t.chapterIntroduced || t.firstChapter) || null, age = since ? n - since : null;
    rep.openThreads.push({ desc: String(t.desc).slice(0, 140), type: t.type || "", status: t.status || "", age });
  });
  rep.openThreads.sort((a, b) => (b.age || 0) - (a.age || 0));
  (Array.isArray(st.foreshadowing) ? st.foreshadowing : []).forEach(f => {
    if (!f || !f.description || ["paid_off", "abandoned", "resolved"].includes(String(f.status || "").toLowerCase())) return;
    const age = n - (Number(f.plantedChapter) || n);
    if (age >= 10) rep.staleForeshadowing.push({ desc: String(f.description).slice(0, 140), planted: f.plantedChapter, age });
  });
  rep.staleForeshadowing.sort((a, b) => b.age - a.age);
  const arc = (Array.isArray(st.arcs) ? st.arcs : []).find(a => a && a.status === "active");
  if (arc) {
    const start = Number(arc.startChapter) || 1, end = Number(arc.endChapterPlanned) || null, done = Math.max(0, n - start + 1);
    rep.arc = { name: arc.name || "", goal: arc.goal || "", start, end, done, pct: end && end >= start ? Math.min(150, Math.round(done / (end - start + 1) * 100)) : null };
    if (rep.arc.pct !== null && rep.arc.pct > 100) rep.alerts.push({ level: "warn", text: "Arc “" + rep.arc.name + "” đã quá kế hoạch " + (rep.arc.pct - 100) + "% — cân nhắc đóng Arc hoặc dời mốc kết." });
  } else if ((st.arcs || []).length) rep.alerts.push({ level: "info", text: "Không có Arc nào ở trạng thái active." });
  const last = chapters[n - 1], lastText = String((last && last.text) || "");
  rep.castLoad = chars.filter(c => c && c.name && !c.dead && containsNameWord(c.name, lastText)).length;
  const sc = rep.scores.filter(x => x.score !== null).map(x => x.score);
  if (sc.length >= 4) {
    const half = Math.floor(sc.length / 2), a = sc.slice(0, half), b = sc.slice(half);
    const avg = arr => arr.reduce((s, x) => s + x, 0) / arr.length;
    if (avg(b) + 4 < avg(a)) rep.alerts.push({ level: "warn", text: "Điểm chất lượng đang giảm (" + Math.round(avg(a)) + " → " + Math.round(avg(b)) + ") trong các chương gần đây." });
  }
  if (rep.absent.length) rep.alerts.push({ level: "info", text: rep.absent.length + " nhân vật quan trọng vắng mặt lâu: " + rep.absent.slice(0, 3).map(x => x.name + " (" + x.gap + " chương)").join(", ") + "." });
  if (rep.staleForeshadowing.length) rep.alerts.push({ level: "warn", text: rep.staleForeshadowing.length + " foreshadowing gieo ≥10 chương chưa trả." });
  const oldThreads = rep.openThreads.filter(t => (t.age || 0) >= 15);
  if (oldThreads.length) rep.alerts.push({ level: "warn", text: oldThreads.length + " thread mở ≥15 chương chưa đóng." });
  if (rep.avgWords && rep.avgWords < 4000) rep.alerts.push({ level: "warn", text: "Độ dài trung bình chỉ " + rep.avgWords + " từ/chương." });
  return rep;
}
function containsNameWord(name, text) {
  const hay = " " + normalizeName(text).replace(/[^\p{L}\p{N}]+/gu, " ") + " ", nd = normalizeName(name).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return !!nd && hay.includes(" " + nd + " ");
}

/* ----- Rà mâu thuẫn: kiểm tra bằng code (không tốn token) ----- */
function deterministicConsistencyCheck(st) {
  st = st || {};
  const issues = [], chapters = Array.isArray(st.chapters) ? st.chapters : [], chars = Array.isArray(st.characters) ? st.characters : [];
  const seen = new Map();
  chars.forEach(c => {
    if (!c || !c.name) return; const k = normalizeName(c.name);
    if (seen.has(k)) issues.push({ severity: "medium", type: "duplicate", description: "Trùng tên nhân vật “" + c.name + "” (2 hồ sơ) — nên gộp bằng 🧹 Dọn nhân vật trùng.", chapters: [] });
    seen.set(k, c);
    const age = parseFloat(String(c.age || "").replace(/[^\d.]/g, ""));
    if (c.age && Number.isFinite(age) && (age < 0 || age > 150)) issues.push({ severity: "low", type: "age", description: "Tuổi bất thường của " + c.name + ": “" + c.age + "”.", chapters: [] });
    if (c.dead) {
      const dc = Number(c.deathChapter) || 0;
      if (dc > 0) {
        const later = [];
        chapters.forEach((ch, i) => { if (i + 1 > dc && containsNameWord(c.name, String((ch && ch.text) || "")) && /\b(nói|cười|bước|nhìn|đứng|ngồi|hỏi|đáp|gật|lắc|mỉm|thở)\b/i.test(String(ch.text).slice(0, 200000))) later.push(i + 1); });
        if (later.length) issues.push({ severity: "high", type: "dead_appears", description: c.name + " đã chết ở chương " + dc + " nhưng tên vẫn xuất hiện ở chương " + later.slice(0, 6).join(", ") + " — kiểm tra hồi tưởng/nhầm lẫn.", chapters: later.slice(0, 6) });
      }
    }
    if (c.lastAppearance != null && Number(c.lastAppearance) > chapters.length && chapters.length) issues.push({ severity: "low", type: "appearance", description: c.name + " có lastAppearance " + c.lastAppearance + " > số chương hiện có.", chapters: [] });
    if (c.spouseName) {
      const sp = seen.get(normalizeName(c.spouseName)) || chars.find(x => x && normalizeName(x.name) === normalizeName(c.spouseName));
      if (sp && sp.spouseName && normalizeName(sp.spouseName) !== normalizeName(c.name)) issues.push({ severity: "medium", type: "spouse", description: c.name + " ghi người phối ngẫu là " + c.spouseName + ", nhưng " + sp.name + " lại ghi " + sp.spouseName + ".", chapters: [] });
      if (sp && /doc than/.test(normalizeName(sp.maritalStatus || ""))) issues.push({ severity: "medium", type: "spouse", description: c.name + " có người phối ngẫu/người yêu là " + sp.name + " nhưng " + sp.name + " đang ghi “độc thân”.", chapters: [] });
    }
  });
  return issues;
}
function buildChapterPostWriteAudit(st, chapterNumber) {
  st = st || {};
  const n = Math.max(1, Math.floor(Number(chapterNumber) || 1)), chapters = Array.isArray(st.chapters) ? st.chapters : [];
  const chapter = chapters[n - 1] || {}, limits = chapterWordLimits(st), words = countWords(chapter.text || "");
  const withinWordBounds = words >= limits.minAccept && words <= limits.maxAccept;
  const lengthStatus = words < limits.minAccept ? "below_min" : words > limits.maxAccept ? (words <= limits.hardMax ? "within_hard_cap" : "above_max") : "within";
  const issues = (Array.isArray(chapter.continuityWarnings) ? chapter.continuityWarnings : []).map(x => String(x && (x.description || x.message) || x).trim()).filter(Boolean);
  const consistency = deterministicConsistencyCheck(st).filter(x => !Array.isArray(x.chapters) || !x.chapters.length || x.chapters.includes(n));
  consistency.forEach(x => { const text = String(x.description || "").trim(); if (text && !issues.includes(text)) issues.push(text); });
  const statusState = st.statusState && typeof st.statusState === "object" ? st.statusState : {};
  const log = (Array.isArray(statusState.timeLog) ? statusState.timeLog : Array.isArray(st.timeLog) ? st.timeLog : [])
    .filter(x => x && x.time && (!Number(x.chapter) || Number(x.chapter) <= n));
  const norm = x => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
  let run = 0, mark = "";
  if (log.length) { mark = String(log[log.length - 1].time); const last = norm(mark); for (let i = log.length - 1; i >= 0 && norm(log[i].time) === last; i--) run++; }
  const timeStall = run >= 3 ? { repeatedMarks: run, time: mark, startChapter: Number(log[log.length - run].chapter) || null, endChapter: Number(log[log.length - 1].chapter) || n } : null;
  if (timeStall) issues.push(run + " chương liên tiếp cùng mốc thời gian: " + mark);
  const terminal = ["paid_off", "abandoned", "resolved", "completed"];
  const unresolvedThreads = (Array.isArray(st.threads) ? st.threads : []).filter(x => x && !terminal.includes(String(x.status || "").toLowerCase())).length;
  const unresolvedForeshadowing = (Array.isArray(st.foreshadowing) ? st.foreshadowing : []).filter(x => x && !terminal.includes(String(x.status || "").toLowerCase())).length;
  return { chapterNumber: n, checkedAt: Date.now(), wordCount: words, minWords: limits.minAccept, maxWords: limits.maxAccept, hardMax: limits.hardMax, withinWordBounds, lengthStatus, continuityIssues: issues.slice(0, 30), timeStall, unresolvedThreads, unresolvedForeshadowing };
}
/* ----- Rà mâu thuẫn bằng AI trên dữ liệu rút gọn ----- */
function buildConsistencyPrompt(st) {
  const chars = (st.characters || []).slice(0, 60).map(c => ({ name: c.name, tier: c.tier, age: c.age, gender: c.gender, role: c.role || c.occupation, married: c.maritalStatus, spouse: c.spouseName, dead: !!c.dead, deathChapter: c.deathChapter, loc: c.currentLocation, secret: String(c.secret || "").slice(0, 80) }));
  const sums = (st.chapters || []).map((c, i) => "Ch" + (i + 1) + ": " + String((c && c.summary) || "").replace(/\s+/g, " ").slice(0, 420)).join("\n");
  const tl = (st.timeline || []).slice(-40).map(x => "Ch" + x.chapter + ": " + String(x.summary || "").slice(0, 140)).join("\n");
  return [
    "RÀ MÂU THUẪN TOÀN TRUYỆN. Chỉ tìm mâu thuẫn CỤ THỂ giữa các chương/hồ sơ (tuổi, giới tính, quan hệ, ai còn sống, địa điểm, ai biết điều gì, thời gian, vật phẩm). Không phê bình văn phong, không đề xuất cốt truyện mới.",
    "Mỗi mục phải nêu rõ chương liên quan và dữ kiện đối chiếu. Không chắc thì bỏ qua. Tối đa 10 mục, ưu tiên nghiêm trọng.",
    "CHỈ trả JSON: {\"issues\":[{\"severity\":\"high|medium|low\",\"type\":\"age|gender|relationship|death|location|knowledge|timeline|item|other\",\"description\":\"\",\"chapters\":[1,2],\"evidence\":\"dữ kiện/đoạn tóm tắt đối chiếu\"}]}",
    "NHÂN VẬT:\n" + JSON.stringify(chars), "TÓM TẮT CHƯƠNG:\n" + sums, tl ? "TIMELINE GẦN ĐÂY:\n" + tl : ""
  ].filter(Boolean).join("\n\n");
}
function parseConsistencyResponse(raw) {
  let s = String(raw || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(), obj = null;
  try { obj = JSON.parse(s); } catch (_) { const a = s.indexOf("{"), b = s.lastIndexOf("}"); if (a >= 0 && b > a) { try { obj = JSON.parse(s.slice(a, b + 1)); } catch (_) {} } }
  const items = obj && Array.isArray(obj.issues) ? obj.issues : [];
  return items.filter(x => x && String(x.description || "").trim()).slice(0, 10).map(x => ({
    severity: ["high", "medium", "low"].includes(x.severity) ? x.severity : "medium", type: String(x.type || "other").slice(0, 20),
    description: String(x.description).slice(0, 400), chapters: Array.isArray(x.chapters) ? x.chapters.map(Number).filter(Number.isFinite).slice(0, 8) : [], evidence: String(x.evidence || "").slice(0, 300)
  }));
}

/* ----- Telemetry theo bước ----- */
const STEP_LABELS = { write: "Viết chương", scene: "Viết scene", plan: "Kế hoạch/Scene graph", gate: "Quality Gate", repair: "Sửa/vá", post: "Hậu kỳ", hint: "Gợi ý chương sau", check: "Kiểm tra nhanh", other: "Khác" };
function classifyStep(prompt) {
  const p = String(prompt || "").slice(0, 1500);
  const map = [
    [/SEMANTIC PROSE CHECK|RÀ MÂU THUẪN/i, "check"], [/GỢI Ý CHI TIẾT cho CHƯƠNG|NEXT HINT/i, "hint"],
    [/HẬU KỲ|CẬP NHẬT NHÂN VẬT|CHAPTER SUMMARY\/CONTENT/i, "post"], [/Quality Review|QUALITY REVIEW|chấm điểm chương|CHẤM CHƯƠNG/i, "gate"],
    [/VÁ CỤC BỘ|PATCH|SỬA THEO VÙNG|VIẾT LẠI CHƯƠNG|CHÈN THÊM DIỄN BIẾN|MỞ RỘNG CHƯƠNG|ĐỂ CHẠM ĐIỂM KẾT/i, "repair"],
    [/SCENE GRAPH|KẾ HOẠCH CHƯƠNG|CHAPTER CONTRACT/i, "plan"], [/SCENE\s*\d|VIẾT SCENE|Scene Contract/i, "scene"], [/Bạn đang viết CHƯƠNG THỨ|VIẾT TIẾP chương/i, "write"]
  ];
  for (const [re, k] of map) if (re.test(p)) return k;
  return "other";
}
function recordStepUsage(st, step, model, inTok, outTok, cost) {
  if (!st) return;
  if (!st.costByStep || typeof st.costByStep !== "object") st.costByStep = {};
  const k = STEP_LABELS[step] ? step : "other", r = st.costByStep[k] || (st.costByStep[k] = { calls: 0, tokIn: 0, tokOut: 0, cost: 0 });
  r.calls++; r.tokIn += inTok; r.tokOut += outTok; r.cost += cost;
  return r;
}
/* Model theo bước: cấu hình st.stepModels = {post:"...",gate:"...",check:"...",hint:"..."}; rỗng = dùng model chính. */
function modelForStep(st, step, fallback) {
  const m = st && st.stepModels && typeof st.stepModels[step] === "string" ? st.stepModels[step].trim() : "";
  return m || fallback;
}
/* ----- Memory phân tầng: range chương, arc và volume ----- */
function buildLayeredMemoryRanges(chapterCount, config) {
  const positiveInt = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 1 ? Math.min(1000000, Math.floor(n)) : fallback;
  };
  const rawCount = Number(chapterCount);
  const count = Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0;
  const cfg = config && typeof config === "object" ? config : {};
  const chunkSize = positiveInt(cfg.chunkSize, 4), chunksPerArc = positiveInt(cfg.chunksPerArc, 5), arcsPerVolume = positiveInt(cfg.arcsPerVolume, 3);
  const chunks = [], arcs = [], volumes = [];
  const chunkCount = Math.ceil(count / chunkSize), arcSize = chunkSize * chunksPerArc, volumeSize = arcSize * arcsPerVolume;
  const idFor = (prefix, index) => prefix + "-" + String(index).padStart(4, "0");
  for (let i = 0; i < chunkCount; i++) {
    const startChapter = i * chunkSize + 1, expectedEndChapter = startChapter + chunkSize - 1;
    const endChapter = Math.min(count, expectedEndChapter), arcIndex = Math.floor(i / chunksPerArc), volumeIndex = Math.floor(arcIndex / arcsPerVolume);
    chunks.push({ id: idFor("L2", i + 1), index: i + 1, startChapter, endChapter, expectedEndChapter, complete: endChapter === expectedEndChapter, arcId: idFor("L3", arcIndex + 1), volumeId: idFor("L4", volumeIndex + 1) });
  }
  const arcCount = Math.ceil(count / arcSize);
  for (let i = 0; i < arcCount; i++) {
    const startChapter = i * arcSize + 1, expectedEndChapter = startChapter + arcSize - 1, endChapter = Math.min(count, expectedEndChapter);
    const chunkIds = chunks.filter(x => x.arcId === idFor("L3", i + 1)).map(x => x.id);
    arcs.push({ id: idFor("L3", i + 1), index: i + 1, startChapter, endChapter, expectedEndChapter, complete: endChapter === expectedEndChapter, volumeId: idFor("L4", Math.floor(i / arcsPerVolume) + 1), chunkIds });
  }
  const volumeCount = Math.ceil(count / volumeSize);
  for (let i = 0; i < volumeCount; i++) {
    const startChapter = i * volumeSize + 1, expectedEndChapter = startChapter + volumeSize - 1, endChapter = Math.min(count, expectedEndChapter);
    const arcIds = arcs.filter(x => x.volumeId === idFor("L4", i + 1)).map(x => x.id);
    volumes.push({ id: idFor("L4", i + 1), index: i + 1, startChapter, endChapter, expectedEndChapter, complete: endChapter === expectedEndChapter, arcIds });
  }
  return { chunks, arcs, volumes };
}
function upsertFrozenLayerSummary(existing, incoming) {
  const result = Array.isArray(existing) ? existing.slice() : [];
  if (!incoming || typeof incoming.id !== "string" || !incoming.id.trim()) return result;
  const index = result.findIndex(item => item && item.id === incoming.id);
  if (index >= 0 && result[index].frozen === true) return result;
  const summary = Object.assign({}, incoming, { frozen: true });
  if (index >= 0) result[index] = summary;
  else result.push(summary);
  return result;
}
function organizationProfilesPromptBlock(st, maxChars) {
  st = st || {};
  const orgs = Array.isArray(st.organizations) ? st.organizations.filter(x => x && String(x.name || "").trim()).slice(-10) : [];
  const rawBudget = Number(maxChars), budget = Number.isFinite(rawBudget) && rawBudget >= 0 ? Math.floor(rawBudget) : 2200;
  if (!orgs.length || !budget) return "";
  const cut = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
  let out = "HỒ SƠ THẾ LỰC (trạng thái/lịch sử đã xác nhận; không tự đổi):\n";
  orgs.forEach(org => {
    if (out.length >= budget) return;
    const row = "- " + cut(org.name, 80) + " [" + cut(org.status || "active", 24) + "]" +
      (org.type ? " | loại: " + cut(org.type, 60) : "") + (org.leader ? " | thủ lĩnh: " + cut(org.leader, 60) : "") +
      (org.territory ? " | lãnh địa: " + cut(org.territory, 80) : "") + (org.description ? " | hồ sơ: " + cut(org.description, 200) : "") +
      (org.historyText ? " | lịch sử: " + cut(org.historyText, 160) : "") + "\n";
    const room = budget - out.length;
    out += row.length <= room ? row : (room > 1 ? row.slice(0, room - 1) + "…" : "");
  });
  return out.slice(0, budget).trimEnd();
}
function buildLayeredMemoryContextBlock(st, targetChapter, maxChars) {
  st = st || {};
  const memory = st.layeredMemory && typeof st.layeredMemory === "object" ? st.layeredMemory : {};
  const summaries = memory.summaries && typeof memory.summaries === "object" ? memory.summaries : {};
  const target = Math.max(1, Math.floor(Number(targetChapter) || ((st.chapters || []).length + 1)));
  const rawBudget = Number(maxChars), budget = Number.isFinite(rawBudget) && rawBudget >= 0 ? Math.floor(rawBudget) : 5200;
  if (!budget) return "";
  const labels = { L1: "L1 · TÓM TẮT CHƯƠNG GẦN", L5: "L5 · TỔNG QUAN TOÀN TRUYỆN", L4: "L4 · VOLUME", L3: "L3 · ARC", L2: "L2 · NHÓM CHƯƠNG" };
  const blocks = [];
  ["L1", "L5", "L4", "L3", "L2"].forEach(level => {
    const list = Array.isArray(summaries[level]) ? summaries[level] : [];
    const eligible = list.filter(x => {
      const end = Number(x && (x.endChapter != null ? x.endChapter : x.toChapter));
      return x && x.frozen === true && !x.stale && Number.isFinite(end) && end < target && String(x.summary || x.text || "").trim();
    }).sort((a, b) => Number(b.endChapter != null ? b.endChapter : b.toChapter) - Number(a.endChapter != null ? a.endChapter : a.toChapter));
    if (!eligible.length) return;
    const selected = level === "L1" ? eligible.slice(0, 2).reverse() : [eligible[0]];
    selected.forEach(item => {
      const start = Number(item.startChapter != null ? item.startChapter : item.fromChapter) || 0;
      const end = Number(item.endChapter != null ? item.endChapter : item.toChapter) || 0;
      let text = String(item.summary || item.text || "").trim();
      if (level === "L1" && text.length > 900) text = text.slice(0, 899).trimEnd() + "…";
      blocks.push({ heading: labels[level] + (start && end ? " (ch" + start + "–" + end + ")" : "") + ":\n", text });
    });
  });
  let out = "";
  for (const block of blocks) {
    if (out.length >= budget) break;
    const separator = out ? "\n\n" : "";
    const available = budget - out.length - separator.length;
    if (available <= 0) break;
    const heading = block.heading.slice(0, available);
    const contentBudget = Math.max(0, available - heading.length);
    const content = block.text.length > contentBudget && contentBudget > 1 ? block.text.slice(0, contentBudget - 1).trimEnd() + "…" : block.text.slice(0, contentBudget);
    out += separator + heading + content;
  }
  return out.slice(0, budget);
}

/* V14.7 pure helpers for per-story accuracy mode. */
function extractRequiredBeatItems(contractText) {
  const text = String(contractText == null ? "" : contractText), matches = [], re = /\[R(\d+)\]/g;
  let m;
  while ((m = re.exec(text))) matches.push({ code: "[R" + m[1] + "]", index: m.index, end: re.lastIndex });
  const out = [], seen = new Set();
  matches.forEach((item, i) => {
    if (seen.has(item.code)) return;
    seen.add(item.code);
    const lineStart = text.lastIndexOf("\n", item.index - 1) + 1;
    const nl = text.indexOf("\n", item.end), lineEnd = nl < 0 ? text.length : nl;
    let descStart = lineStart;
    for (let j = i - 1; j >= 0; j--) { if (matches[j].index < lineStart) break; descStart = matches[j].end; break; }
    let descEnd = lineEnd;
    for (let j = i + 1; j < matches.length; j++) {
      if (matches[j].index >= lineEnd) break;
      descEnd = matches[j].index;
    }
    let desc = text.slice(item.end, descEnd).replace(/^\s*(?:[-*•:]|\d+[.)])\s*/u, "").replace(/[.;,|\s]+$/u, "").replace(/\s+/g, " ").trim();
    const prefix = descStart === lineStart && item.index > lineStart ? text.slice(lineStart, item.index).replace(/^\s*(?:[-*•:]|\d+[.)])\s*/u, "").replace(/[;|,\s]+$/u, "").trim() : "";
    if (prefix && !/\[R#\]/.test(prefix)) desc = (prefix + (desc ? " " + desc : "")).replace(/\s+/g, " ").trim();
    out.push({ code: item.code, text: desc });
  });
  return out;
}
function auditRequiredBeatEvidence(requiredItems, draft, result) {
  const items = Array.isArray(requiredItems) ? requiredItems : [];
  const requiredCodes = Array.from(new Set(items.map(x => x && typeof x.code === "string" ? x.code : "").filter(x => /^\[R\d+\]$/.test(x))));
  const verifiedCodes = [], missingCodes = [], issues = [];
  if (!requiredCodes.length) return { status: "verified", requiredCodes, verifiedCodes, missingCodes, issues };
  const validResult = !!result && typeof result === "object" && !Array.isArray(result) && Array.isArray(result.items);
  if (!validResult) issues.push("Audit result is missing or malformed.");
  // V14.7.1: so khớp trích dẫn sau khi chuẩn hóa Unicode NFC + gộp khoảng trắng (tiếng Việt có thể ở dạng NFC hoặc NFD) và đòi trích dẫn đủ dài để có nghĩa.
  const normEv = x => String(x == null ? "" : x).normalize("NFC").replace(/\s+/gu, " ").trim();
  const evidenceUsable = x => x.length >= 12 && (x.match(/[\p{L}\p{N}]+/gu) || []).length >= 3;
  const rows = validResult ? result.items : [], source = normEv(typeof draft === "string" ? draft : "");
  requiredCodes.forEach(code => {
    const matches = rows.filter(x => x && typeof x === "object" && x.code === code);
    let ok = false;
    if (matches.length === 1) {
      const row = matches[0], evidence = row.evidence;
      const ev = typeof evidence === "string" ? normEv(evidence) : "";
      ok = row.status === "present" && evidenceUsable(ev) && source.indexOf(ev) >= 0;
      if (!ok) issues.push(code + ": missing, uncertain, invalid status, or non-verbatim evidence.");
    } else issues.push(code + (matches.length ? ": duplicate audit entries." : ": no audit entry."));
    (ok ? verifiedCodes : missingCodes).push(code);
  });
  return { status: missingCodes.length ? "failed" : "verified", requiredCodes, verifiedCodes, missingCodes, issues };
}
function accuracyModeQualityGateOptions(state, options) {
  const st = state && typeof state === "object" ? state : {}, opts = options && typeof options === "object" ? options : {};
  const strict = st.accuracyMode === true;
  return {
    enabled: strict || st.qualityGateEnabled !== false,
    allowRewrite: opts.rewrite !== false,
    maxAttempts: strict ? 3 : st.qualityMaxAttempts,
    acceptSoft: strict ? false : st.qualityAcceptSoft !== false,
    requiredBeatBarrier: strict || st.requiredBeatBarrier !== false,
    forceWarnings: strict || opts.forceWarnings === true
  };
}
function findRepeatedParagraphs(text, options) {
  const opts = options && typeof options === "object" ? options : {};
  const minTokens = Math.max(1, Math.floor(Number(opts.minTokens) || 12));
  const thresholdValue = Number(opts.threshold), threshold = Number.isFinite(thresholdValue) ? Math.max(0, Math.min(1, thresholdValue)) : 0.88;
  const paragraphs = String(text == null ? "" : text).split(/\n\s*\n+/).map((raw, i) => ({ index: i + 1, raw: raw.trim(), normalized: raw.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() })).filter(x => x.raw);
  const tokens = x => String(x && x.normalized != null ? x.normalized : x).split(/\s+/u).filter(Boolean);
  const levRatioT = (aa, bb) => {
    const prev = Array.from({ length: bb.length + 1 }, (_, i) => i);
    for (let i = 1; i <= aa.length; i++) {
      let diagonal = prev[0]; prev[0] = i;
      for (let j = 1; j <= bb.length; j++) { const old = prev[j]; prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (aa[i - 1] === bb[j - 1] ? 0 : 1)); diagonal = old; }
    }
    return 1 - prev[bb.length] / Math.max(aa.length, bb.length, 1);
  };
  /* V14.7.11: tách token + đếm từ MỘT lần mỗi đoạn; loại sớm cặp có số từ chung (đa tập) quá thấp — khoảng cách sửa ≥ max(la,lb) − số từ chung nên không thể đạt ngưỡng. Kết quả không đổi. */
  paragraphs.forEach(p => { p.tok = tokens(p); p.bag = new Map(); p.tok.forEach(w => p.bag.set(w, (p.bag.get(w) || 0) + 1)); });
  const out = [];
  for (let i = 0; i < paragraphs.length; i++) for (let j = i + 1; j < paragraphs.length; j++) {
    const a = paragraphs[i], b = paragraphs[j];
    const la = a.tok.length, lb = b.tok.length;
    if (la < minTokens || lb < minTokens) continue;
    const exact = a.normalized === b.normalized;
    if (!exact) {
      if (Math.min(la, lb) / Math.max(la, lb) < threshold) continue; // chênh độ dài quá lớn thì không thể đạt ngưỡng giống
      let common = 0; const small = a.bag.size <= b.bag.size ? a.bag : b.bag, big = small === a.bag ? b.bag : a.bag;
      small.forEach((n, w) => { const m = big.get(w); if (m) common += Math.min(n, m); });
      if (common / Math.max(la, lb) < threshold) continue;
    }
    const similarity = exact ? 1 : levRatioT(a.tok, b.tok);
    if (exact || similarity >= threshold) out.push({ paragraphs: [a.index, b.index], exact, similarity: Number(similarity.toFixed(4)), excerpt: a.raw.slice(0, 180) });
  }
  return out;
}
