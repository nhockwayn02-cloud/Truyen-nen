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
  const target = Math.min(Math.max(Number(st && st.minChapterWords) || 5000, 500), 6000);
  return { target, hardMax: Math.ceil(target * 1.4) }; // V12.22: nới 1.15 -> 1.4 để chương tự do dài hơn mà không bị cắt mất Ending Anchor
}

// V12.23: ĐỒNG BỘ viết thường ↔ viết nền — các khối prompt dùng chung (cùng một bản chữ cho cả hai nơi).
function buildVocabularyBlockFrom(state) {
  const v = (state && state.vocabulary) || {};
  const parts = [];
  if (v.preferred) parts.push("TỪ MUỐN DÙNG: " + v.preferred.replace(/\n/g, ", "));
  if (v.banned) parts.push("TỪ CẦN TRÁNH: " + v.banned.replace(/\n/g, ", "));
  if (v.overused) parts.push("CỤM ĐÃ LẶP NHIỀU (tránh dùng lại): " + v.overused.replace(/\n/g, " · "));
  if (v.anatomy) parts.push("CÁCH GỌI BỘ PHẬN: " + v.anatomy);
  return parts.length ? parts.join("\n") : "";
}

function _clipChapterText(t, maxChars) {
  t = t || "";
  if (t.length <= maxChars) return t;
  return t.slice(0, Math.floor(maxChars * 0.3)) + "\n\n[...]\n\n" + t.slice(-Math.floor(maxChars * 0.6));
}
// V12.32: chỉ gửi tóm tắt ngắn của chương gần nhất + đoạn cuối để nối mạch.
// Không tự động gửi tóm tắt các chương xa; canon dài hạn lấy từ Story Bible/Memory có chọn lọc.
function buildRecentBlocks(priorChapters) {
  const pc = Array.isArray(priorChapters) ? priorChapters : [];
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
function buildChapterPlanPrompt(o) {
  const userDirective = String(o.directive || "").trim(), userHint = String(o.hint || "").trim();
  const hasUserBrief = !!(userDirective || userHint);
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
      userHint ? ("GỢI Ý:\n" + userHint) : "",
      "===== HẾT YÊU CẦU NGƯỜI DÙNG =====",
      "QUY TẮC ĐẶC BIỆT: Phải chuyển ĐẦY ĐỦ mọi chi tiết, hành động, mốc mở đầu, diễn biến và mốc kết thúc mà người dùng đã nêu thành kế hoạch. Không được bỏ sót, rút gọn, gộp nhịp hoặc thay thế chi tiết quan trọng.",
      "Không tự thêm tuyến truyện, mục tiêu, nhân vật quan trọng, địa điểm mới hoặc biến cố lớn không có trong yêu cầu người dùng. Nếu cần nối các mốc, chỉ dùng diễn biến cầu nối tối thiểu để giữ liền mạch.",
      "Nếu yêu cầu có ghi rõ bắt đầu tại A và kết thúc tại B, A và B là hai ANCHOR BẮT BUỘC; kế hoạch phải đi từ A đến B và không mở tuyến khác làm lệch trọng tâm.",
      "Nếu yêu cầu người dùng xung đột với bối cảnh cũ, ưu tiên yêu cầu người dùng mới nhất và đánh dấu phần xung đột trong kế hoạch thay vì tự sửa yêu cầu."
    ].filter(Boolean).join("\n") : "",
    hasUserBrief ? "Lập kế hoạch BÁM SÁT BRIEF — số nhịp bằng đúng số nhịp trong brief:" : "Lập kế hoạch theo NGÂN SÁCH SỰ KIỆN — không vượt quá 3 sự kiện chính:",
    "1. Mục tiêu chương", "2. Xung đột chính",
    hasUserBrief ? "3. DANH SÁCH CÁC NHỊP/SỰ KIỆN THEO ĐÚNG THỨ TỰ BRIEF (mỗi nhịp ghi: mục đích + diễn biến + hậu quả); KHÔNG gộp, KHÔNG bỏ nhịp nào"
                 : "3. DANH SÁCH 1-3 SỰ KIỆN CHÍNH (mỗi sự kiện ghi: mục đích + diễn biến + hậu quả)",
    "3a. BEAT LEDGER — đánh mã bắt buộc theo đúng thứ tự: [B1], [B2], [B3]... Mỗi beat phải ghi đủ: MỤC TIÊU | HÀNH ĐỘNG/THÔNG TIN BẮT BUỘC | NHÂN VẬT/ĐỊA ĐIỂM | BẰNG CHỨNG HOÀN THÀNH | HẬU QUẢ. Beat là việc phải xuất hiện trong văn xuôi bằng hành động, lời thoại, thông tin hoặc hậu quả cụ thể; không tính việc chỉ được nhắc trong kế hoạch.",
    "4. Nhân vật xuất hiện: BẮT BUỘC có nhân vật chính; TỐI ĐA 4 NHÂN VẬT CÓ TÊN RIÊNG xuất hiện trực tiếp trong cả chương; ưu tiên nhân vật đã có.",
    "5. Địa điểm + DÒNG THỜI GIAN (ghi chú NỘI BỘ để giữ nhất quán, KHÔNG phải để in thành nhãn trong văn): thời điểm tương đối khi mở chương, quãng đã trôi từ chương trước (nếu có nhảy), các beat nối nhau theo thời gian thế nào, cảnh nào thời gian thật sự quan trọng (hạn chót/khẩn cấp); nêu cách thể hiện tự nhiên trong văn (ánh sáng, việc đang làm, một câu chuyển trong mạch kể)",
    "5b. CẢNH & NGƯỜI CÓ MẶT: với MỖI beat ghi: địa điểm | ai có mặt | ai VÀO cảnh (cách vào) | ai RỜI cảnh (cách rời). Người không được ghi có mặt thì không được nói/hành động trong beat đó.",
    hasUserBrief ? "6. SCENE BEATS: MỖI nhịp của brief là MỘT beat (không giới hạn số beat), ghi gợi ý độ dài từng beat để cả chương đạt mục tiêu từ; KHÔNG tự sinh thêm sự kiện lớn ngoài brief"
                 : "6. SCENE BEATS (tối đa 5 beat) — chỉ triển khai 1-3 sự kiện trên, KHÔNG tự sinh thêm sự kiện lớn",
    "7. Kết chương — phải khớp mốc kết thúc người dùng yêu cầu nếu có",
    "7a. TIẾN ĐỘ ARC/OUTLINE: nếu bối cảnh có mục TIẾN ĐỘ ARC/OUTLINE, ghi rõ chương này thực hiện VIỆC BẮT BUỘC/bước tiến nào của Arc hoặc Outline (đúng dòng của chương nếu Outline có), và mỗi sự kiện chính phải là một BƯỚC TIẾN thật, không phải cảnh độn",
    "7b. THAY ĐỔI/TIẾN TRIỂN: ghi rõ điều gì ĐÃ ĐỔI giữa đầu và cuối chương (quan hệ/thông tin/quyền lực/mục tiêu/hậu quả); không được để trống",
    "9. DÒNG TỰ KIỂM TRA CUỐI KẾ HOẠCH: LEDGER_ORDER: B1 -> B2 -> ... -> END | STOP_AFTER: mã beat cuối cùng. Không được kết chương trước khi mọi beat bắt buộc đã có bằng chứng; nếu thiếu beat, phải tiếp tục viết beat đó trước điểm kết.",
    "8. Nếu có cảnh trưởng thành: mức intensity + structure + cảnh đó làm đổi điều gì (quan hệ/quyền lực/bí mật/hậu quả) và dẫn tới bước nào kế tiếp; không thay đổi phạm vi sự kiện người dùng đã chỉ định",
    "",
    hasUserBrief ? "QUY TẮC CỨNG: Không thêm sự kiện lớn ngoài brief. Không tạo nhân vật quan trọng mới nếu không có lý do cốt truyện rõ ràng. Nếu có thể dùng nhân vật hiện có thì phải dùng nhân vật hiện có."
                 : "QUY TẮC CỨNG: Không thêm sự kiện lớn thứ 4. Không tạo nhân vật quan trọng mới nếu không có lý do cốt truyện rõ ràng. Nếu có thể dùng nhân vật hiện có thì phải dùng nhân vật hiện có.",
    hasUserBrief ? "ƯU TIÊN ĐỘ TRUNG THÀNH VỚI BRIEF: Không 'sáng tạo thêm cho hay'. Nhiệm vụ là chuyển brief thành kế hoạch có thể viết được, không phải mở rộng phạm vi truyện." : "",
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

function stripForeign(text) {
  text = stripThinkingOutput(text); // V12.21
  if (!text) return text;
  return sanitizeChapterText(text);
}
// V12.32.6c: bước làm sạch thuần (không có stripThinkingOutput) — dùng cho nút Chuẩn hóa trên chương đã lưu.
function sanitizeChapterText(text) {
  // V12.10: dọn chữ Hán/Nhật/Hàn/Cyrillic/Thái/Ả Rập/Hindi còn sót (kể cả khi dưới ngưỡng viết lại).
  if (!text) return text;
  text = removeEnglishLeaks(text);   // V12.23
  let t = String(text)
    .replace(/，/g, ", ").replace(/。/g, ". ").replace(/！/g, "! ").replace(/？/g, "? ").replace(/：/g, ": ").replace(/、/g, ", ")
    .replace(/[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0400-\u04FF\u0E00-\u0E7F\u0600-\u06FF\u0900-\u097F]+/g, "");
  t = stripJunkSymbols(t);
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
  "cảnh nóng", "cảnh sex", "cảnh 18", "cảnh 18+", "làm tình", "ân ái", "giao hợp", "sex", "sexx", "sexy", "nsfw", "erotic", "erotica", "porn", "âu yếm", "vuốt ve", "mơn trớn", "ve vuốt", "hôn sâu", "hôn môi", "hôn cổ", "cởi đồ", "cởi áo", "cởi quần", "không mặc", "khỏa thân", "trần truồng", "nude", "sờ soạng", "sờ ngực", "sờ mông", "nắn bóp", "liếm", "thổi kèn", "dương vật", "âm đạo", "âm hộ", "núm vú", "háng", "cặc", "lồn", "thúc mạnh", "xuất tinh", "orgasm", "cao trào", "khoái cảm", "doggy", "missionary", "cowgirl", "oral", "blowjob", "handjob", "viết nóng", "viết 18", "tăng nhiệt", "nóng hơn", "cảnh ân ái", "đêm tân hôn", "mất trinh", "đoạt mất", "chiếm đoạt cơ thể", "ham muốn", "dục vọng", "nứng", "rên rỉ", "rên la", "rên ưỡn", "quan hệ tình dục", "quan hệ xác thịt", "bóp mông"
];

const _NSFW_RE = new RegExp("(?<![\\p{L}\\p{N}])(?:" + NSFW_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![\\p{L}\\p{N}])", "iu");

function textHasNsfwKeyword(text) {
  if (!text) return false;
  return _NSFW_RE.test(String(text).normalize("NFC"));
}

function parseAgeNum(a) { const m = String(a == null ? "" : a).match(/\d{1,4}/); return m ? parseInt(m[0], 10) : null; }

function underageNames(s) {
  const out = []; const chk = (n, a) => { const v = parseAgeNum(a); if (n && v !== null && v < 18) out.push(String(n)); };
  chk(s.mainCharProfile && s.mainCharProfile.name, s.mainCharProfile && s.mainCharProfile.age);
  (s.characters || []).forEach(c => chk(c && c.name, c && c.age));
  return out;
}

function ageGuardPrompt(s) {
  const u = underageNames(s);
  return "RÀO CHẮN TUỔI (bắt buộc): chỉ nhân vật đã trưởng thành (từ 18 tuổi trở lên) mới được tham gia cảnh tình dục/khiêu dâm. Tuyệt đối không viết nội dung tình dục với nhân vật dưới 18 tuổi hoặc được mô tả như trẻ em."
    + (u.length ? (" Nhân vật KHÔNG được xuất hiện trong cảnh 18+: " + u.join(", ") + ".") : "");
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
// Liệt kê từ lạ (không phải âm tiết tiếng Việt) chen trong văn bản. Chỉ để cảnh báo / làm đầu vào cho bước tự sửa.
// V12.20: bắt cả từ CÓ DẤU bị ghép lỗi (mươititude, bănnton, bọcampo); trước đây chỉ bắt từ không dấu.
function findStrayWords(text, allowNames, limit) {
  const out = []; const seen = new Set(); const max = Number(limit) || 12;
  const allow = new Set(_normWords((allowNames || []).join(" ")).map(w => w.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
  const allowExact = new Set(_normWords((allowNames || []).join(" ")));
  const toks = String(text || "").match(/\p{L}+/gu) || [];
  for (const t of toks) {
    const low = t.toLowerCase();
    if (seen.has(low)) continue;
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

// Chuẩn hoá kết quả Auditor → review có verdict cuối cùng. Trả null nếu obj không phải object JSON.
// opts: { maxMainEvents, maxNamedCharacters, passScore, softFailScore, extraHard: string[], now }
function evaluateReview(obj, opts) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  opts = opts || {};
  const maxEv = Number(opts.maxMainEvents) || 3, maxCh = Number(opts.maxNamedCharacters) || 4;
  const passScore = Number(opts.passScore) || 90, softScore = Number(opts.softFailScore) || 75;
  const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
  const hard = arr(obj.hardFailures, 20);
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
  if (obj.sceneViolation) {
    const sn2 = (Array.isArray(obj.sceneNotes) ? obj.sceneNotes : []).slice(0, 3).map(x => typeof x === "string" ? x : (x && (x.description || x.problem)) || "").filter(Boolean).join(" | ");
    hard.push("Lỗi cảnh/người có mặt: nhân vật tự xuất hiện hoặc nói khi không có mặt/đã rời đi, hoặc lẫn cảnh" + (sn2 ? ": " + sn2 : "."));
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
    warnings: arr(obj.warnings, 20).concat(timeWarn, opts.extraWarnings || []), suggestions: arr(obj.suggestions, 20), rewriteInstructions: arr(obj.rewriteInstructions, 12),
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
    p.storyControl || "",
    p.characterLock || "",
    (p.contractLabel || "OUTLINE/CONTRACT") + ":\n" + (p.contract || ""),
    p.context ? "CANON CONTEXT:\n" + compactGateContext(p.context, 6000, false) : "",
    p.prevEnding ? "ĐOẠN KẾT CHƯƠNG TRƯỚC (cảnh mở đầu chương này PHẢI nối tiếp đúng địa điểm / thời điểm / người có mặt ở đây — đây là sự thật, không được tự bịa địa điểm khác):\n" + String(p.prevEnding).slice(-1500) : "",
    (rv.alreadyFixed && rv.alreadyFixed.length) ? "LỖI ĐÃ SỬA Ở VÒNG TRƯỚC — GIỮ NGUYÊN các chỗ đã sửa, tuyệt đối không làm hỏng hoặc hoàn tác:\n- " + rv.alreadyFixed.join("\n- ") : "",
    "LỖI CẦN SỬA:\n" + (rv.hardFailures || []).concat((rv.warnings || []).slice(0, 8)).map(gateItemText).join("\n"),
    "HƯỚNG SỬA ƯU TIÊN:\n" + rewriteInstructionsText(rv),
    "ĐỊNH DẠNG TRẢ VỀ — CHỈ MỘT JSON, không markdown, không giải thích:",
    '{"patches":[{"op":"replace|delete|insert_after|insert_before|insert_before_end|insert_start|insert_end","find":"...","from":"...","to":"...","which":1,"text":"..."}]}',
    "QUY TẮC:",
    "- find / from / to: chép NGUYÊN VĂN từ bản thảo, 6–25 từ liên tiếp, nằm trong một đoạn. Không sửa dấu, không đổi dấu câu.",
    "- Xoá/thay một đoạn dài: dùng from (6–12 từ đầu đoạn) + to (6–12 từ cuối đoạn), không chép cả đoạn. Xoá/thay một câu ngắn: dùng find.",
    '- Nếu find/from xuất hiện nhiều lần (đoạn bị lặp), thêm which = số thứ tự lần xuất hiện cần tác động (1, 2, 3...) hoặc "last" cho lần cuối. Muốn xoá bản lặp ở cuối chương thì which = "last".',
    "- replace: thay đoạn tìm được bằng text. delete: xoá, không có text. insert_after / insert_before: chèn text (câu chuyển cảnh tự nhiên, chi tiết bổ sung…) sau/trước find. insert_before_end: chèn một cảnh còn thiếu ngay trước đoạn kết cuối cùng, KHÔNG cần find — ưu tiên dùng cho beat/biến cố Outline bị bỏ sót. insert_start / insert_end: chèn ở đầu / cuối chương, không cần find.",
    "- Nếu QUALITY REVIEW nói thiếu một beat/sự kiện bắt buộc nhưng không có câu neo chắc chắn, dùng insert_before_end thay vì bịa find. Cảnh mới phải nối tự nhiên với đoạn trước và không viết lại đoạn kết.",
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
    maxNamedCharacters: Math.max(1, Math.min(6, Number(sc.maxNamedCharacters) || 4)),
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
    "- Cấm tính từ trống đứng một mình như \"đẹp\", \"quyến rũ\", \"to\", \"đầy đặn\", \"cao ráo\": phải kèm kích thước, hình dáng hoặc so sánh cụ thể để người đọc hình dung ra.",
    "- Hồ sơ có chiều cao/dáng/SỐ ĐO thì dùng ĐÚNG. Hồ sơ còn trống mục ngoại hình thì TỰ ĐẶT chi tiết hợp lý ngay lần tả đầu và giữ nhất quán ở các chương sau (chi tiết này sẽ được lưu vào hồ sơ).",
    mature ? "- Khi tả cơ thể của nhân vật ĐÃ ĐỦ 18 TUỔI trong cảnh người lớn: nêu kích thước cụ thể ít nhất ở lần tả đầu tiên (ngực: cỡ/cup hoặc so sánh vật thể kèm độ đầy, độ nảy; eo, mông, đùi; chiều cao, cân nặng; với nam: kích thước và hình dạng) theo mục SỐ ĐO trong hồ sơ; hồ sơ trống thì tự đặt số hợp lý và giữ nhất quán. Nhân vật dưới 18 tuổi hoặc không rõ tuổi: KHÔNG tả số đo hay đặc điểm tình dục của cơ thể." : ""
  ].filter(Boolean).join("\n");
}
// Tóm tắt truyện đến nay: mỗi chương cũ 1–2 câu (trừ chương gần nhất đã có khối riêng), tổng không quá maxChars.
function storySoFarPrompt(chapters, maxChars) {
  const cs = Array.isArray(chapters) ? chapters.slice(0, -1) : [];
  maxChars = Number(maxChars) || 2800;
  const clean = c => String((c && c.summary) || "").replace(/\*\*[^*]*\*\*:?/g, " ").replace(/\s+/g, " ").trim();
  const items = [];
  cs.forEach((c, i) => { const t = clean(c); if (t) items.push({ n: i + 1, t }); });
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
  const anatomyLock = [
    "GENDER ANATOMY LOCK — bắt buộc phân biệt nhân vật theo giới tính trong hồ sơ:",
    "- Trước mọi đoạn tả thân thể, đối chiếu đúng TÊN nhân vật với giới tính hồ sơ; không lấy mô tả của người này gán sang người khác.",
    "- Nhân vật nam không được nhận bộ phận, đặc điểm hoặc phản ứng sinh học đặc trưng của nhân vật nữ; nhân vật nữ không được nhận bộ phận, đặc điểm hoặc phản ứng sinh học đặc trưng của nhân vật nam.",
    "- Khi nhiều nhân vật cùng cảnh, mỗi câu tả thân thể phải có chủ thể rõ bằng tên hoặc đại từ đã khóa; không dùng đại từ mơ hồ.",
    "- Nếu giới tính hồ sơ trống hoặc mâu thuẫn, không suy đoán chi tiết nhạy cảm; dùng mô tả trung tính và giữ nguyên hồ sơ."
  ];
  if (short) return ["HỒ SƠ KHÓA — giữ đúng nghề/địa vị/quyền hạn/năng lực/cách nói của từng nhân vật, không tự nâng cấp hay vượt thiết lập:", ...anatomyLock, ...lines].join("\n");
  return [
    "HỒ SƠ KHÓA — NHÂN VẬT PHẢI ĐÚNG THIẾT LẬP (ưu tiên hơn sự hấp dẫn của cảnh):",
    "- Mỗi nhân vật chỉ được nói, nghĩ và hành xử trong phạm vi nghề, địa vị, quyền hạn, tài sản, năng lực, tuổi, hiểu biết và tính cách ghi dưới đây. Không tự nâng cấp (quyền lực, giàu có, võ công, quan hệ, chức danh) và không tự hạ cấp.",
    "- Lời thoại và cách xưng hô phải hợp địa vị: người cấp thấp không ra lệnh như cấp trên, không nhận tài sản/tổ chức/quyền không có trong hồ sơ là của mình; người chưa biết một bí mật thì không được nói hay hành động như đã biết.",
    "- Muốn nhân vật vượt hồ sơ (thăng chức, lộ thân phận, có năng lực mới) thì phải có sự kiện RÕ RÀNG trong chính chương làm nguyên nhân (và brief cho phép); nếu không, giữ đúng hồ sơ.",
    "- Hồ sơ trống ở một mục nghề/địa vị/quyền hạn/tài sản/năng lực = chưa xác định: đừng bịa chi tiết quan trọng cho mục đó, dùng chi tiết trung tính hoặc để mở. (NGOẠI LỆ: ngoại hình/vóc dáng/số đo trống thì được tự đặt chi tiết cụ thể, hợp lý.)",
    "- Trước khi viết mỗi cảnh, tự hỏi: nhân vật này có THẬT SỰ được phép nói/làm điều này theo hồ sơ không? Nếu không, đổi cách viết.",
    ...anatomyLock,
    "HỒ SƠ:", ...lines
  ].join("\n");
}

// --- V12.32.18: TIẾN ĐỘ ARC + OUTLINE THEO CHƯƠNG (chống truyện đi quá chậm) ---
function activeArcOf(st) { return ((st && st.arcs) || []).find(a => a && a.status === "active") || null; }
function outlineOf(st, n) { return ((st && st.outlinePlans) || []).find(o => o && n >= o.from && n <= o.to) || null; }
// Tách nội dung outline thành dòng theo chương: "Ch12: ...", "Chương 12: ...", "12. ...", "12) ...", "12 - ...".
function outlineChapterLines(content) {
  const map = {};
  String(content || "").split(/\n+/).forEach(l => {
    const m = l.trim().match(/^(?:[-*•]\s*)?(?:ch(?:ư[ơ]ng)?\.?\s*)?(\d{1,4})\s*[:.)\-–—]\s*(.+)$/i);
    if (m && m[2] && m[2].trim().length >= 8) map[Number(m[1])] = m[2].trim();
  });
  return map;
}
function arcProgressPrompt(st, nOverride) {
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
    const per = outlineChapterLines(ol.content), total = ol.to - ol.from + 1, idx = n - ol.from + 1;
    lines.push("OUTLINE \"" + ol.name + "\" (chương " + ol.from + "–" + ol.to + "), chương này là " + idx + "/" + total + ":");
    if (per[n]) {
      lines.push("- VIỆC BẮT BUỘC CỦA CHƯƠNG " + n + " THEO OUTLINE: " + cut(per[n], 500));
      if (per[n + 1]) lines.push("- (Chương " + (n + 1) + " sẽ làm, CHƯA làm ở chương này; chỉ cài móc nối): " + cut(per[n + 1], 300));
    } else lines.push(cut(ol.content, 1500));
    if (ol.to - n <= 1) lines.push("- Giai đoạn Outline sắp kết: chương này phải tiến tới mốc kết giai đoạn.");
  }
  return lines.join("\n");
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
function currentTimeMark(st) {
  const manual = String((st && st.storyClock) || "").trim();
  if (manual) return manual;
  const ss = (st && st.statusState && typeof st.statusState === "object") ? st.statusState : {};
  return String((ss.currentState && ss.currentState.time) || "").trim();
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
    `- Ngân sách sự kiện: tối đa ${sc.maxMainEvents} sự kiện chính; không thêm biến cố lớn thứ ${sc.maxMainEvents + 1}.`,
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
    "- ĐƯỢC TỰ DO: thêm cảnh phụ, chuyển cảnh, hội thoại, nội tâm, giác quan, hành động nhỏ, chi tiết đời thường BÊN TRONG các sự kiện chính; không được dùng quyền này để mở arc lớn, thêm nhân vật quan trọng mới hay tiết lộ thông tin để dành cho chương sau. Quyền tự do này KHÔNG áp dụng cho địa vị, nghề, quyền hạn, tài sản, năng lực, tuổi, kiến thức và cách nói của nhân vật — các điều đó phải đúng HỒ SƠ.",
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
  return [
    { id: "language", ok: !detectNonVietnamese(text), message: "Ngôn ngữ: tiếng Việt" },
    { id: "text_nonempty", ok: countWords(text) > 100, message: "Bản thảo có đủ nội dung" },
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
const GATE_REVIEW_SCHEMA = '{"score":0,"verdict":"PASS|SOFT_FAIL|HARD_FAIL","dimensions":{"continuity":0,"characterConsistency":0,"canonConsistency":0,"plotDiscipline":0,"worldRules":0,"outlineCompliance":0,"style":0,"pacing":0,"knowledgeConsistency":0},"mainEventCount":0,"namedCharacterCount":0,"unauthorizedImportantCharacter":false,"knowledgeViolation":false,"retcon":false,"profileViolation":false,"profileViolations":[],"genderAnatomyMismatch":false,"genderAnatomyNotes":[],"stagnation":false,"stagnationNotes":[],"timeStagnation":false,"timeNotes":[],"sceneViolation":false,"sceneNotes":[],"arcStall":false,"arcNotes":[],"appearanceVague":false,"appearanceNotes":[],"outlineDeviation":false,"hardFailures":[],"warnings":[],"suggestions":[],"rewriteInstructions":[]}';
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
  const evN = Number(p.maxMainEvents) || 3, chN = Number(p.maxNamedCharacters) || 4;
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
    "BEAT LEDGER AUDIT — nếu CHAPTER CONTRACT có các mã [B1], [B2]...: kiểm tra từng beat theo đúng thứ tự. Beat chỉ được tính là HOÀN THÀNH khi bản thảo có bằng chứng cụ thể (hành động/lời thoại/thông tin/hậu quả), không tính việc chỉ nhắc lại trong kế hoạch. Beat bắt buộc bị thiếu là hard failure; ghi rõ mã beat, bằng chứng đang thiếu và vị trí hợp lý để chèn trước đoạn kết. Nếu beat đã có, trích dẫn ngắn bằng chứng trong rewriteInstructions để tránh sửa nhầm.",
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
    "- sceneViolation=true CHỈ KHI có CÂU CỤ THỂ trong bản thảo cho nhân vật nói/hành động/phản ứng khi họ KHÔNG có mặt trong cảnh (chưa được nói là đến, hoặc đã rời đi mà không quay lại), hoặc lời thoại/hành động của cảnh cũ lẫn sang cảnh mới không có chuyển cảnh. Ghi trích dẫn ngắn + tên nhân vật vào sceneNotes. Không báo nếu chỉ là nhân vật ở gần/đang nghe được hợp lý.",
    "- timeStagnation=true CHỈ KHI có BẰNG CHỨNG CỤ THỂ thời gian trong truyện sai hoặc đứng yên: (a) thời gian đi lùi/mâu thuẫn (vừa tối đã lại là buổi sáng cùng ngày không lý do; vết thương, hạn chót, tuổi, ngày tháng không khớp), hoặc (b) chương mở lại đúng thời điểm chương trước dù sự kiện trước đã kết thúc trọn và không có lý do cốt truyện. Ghi 1 dẫn chứng ngắn vào timeNotes. TUYỆT ĐỐI KHÔNG báo chỉ vì chương không ghi ngày/giờ/mốc rõ ràng ở đầu hay cuối chương: văn xuôi tự nhiên để thời gian ngầm hiểu qua chi tiết, thiếu nhãn thời gian KHÔNG phải lỗi. Đây chỉ là CẢNH BÁO mềm, không chặn.",
    "- appearanceVague=true CHỈ KHI có nhân vật có tên xuất hiện lần đầu hoặc cảnh tả cơ thể mà chỉ dùng tính từ trống (đẹp, to, đầy đặn…) không kèm kích thước/hình dáng/so sánh cụ thể nào để hình dung. Ghi tên nhân vật vào appearanceNotes. Chỉ là CẢNH BÁO mềm.",
    p.characterLock ? "- profileViolation=true CHỈ KHI có câu/đoạn CỤ THỂ trong bản thảo trái rõ ràng với HỒ SƠ KHÓA (nhân vật nói hoặc hành xử như có địa vị/quyền/tài sản/năng lực/kiến thức cao hơn hồ sơ; xưng hô hoặc giọng nói sai thiết lập; đổi nghề). Ghi trích dẫn ngắn + mục hồ sơ bị vi phạm vào profileViolations; không báo nếu chỉ suy đoán hoặc thiếu thông tin." : "",
    p.characterLock ? "- genderAnatomyMismatch=true nếu bản thảo gán cho một nhân vật bộ phận, đặc điểm hoặc phản ứng sinh học không phù hợp giới tính ghi trong HỒ SƠ KHÓA. Ghi đúng tên nhân vật, trích dẫn ngắn và giới tính hồ sơ vào genderAnatomyNotes. Đây là HARD FAILURE, không được chấm PASS." : "",
    p.prevEnding ? "- ĐỊA ĐIỂM MỞ CHƯƠNG: nếu cảnh mở đầu của bản thảo KHÁC địa điểm/thời điểm/người có mặt so với ĐOẠN KẾT CHƯƠNG TRƯỚC mà không có đoạn chuyển cảnh hợp lý (ví dụ chương trước kết ở biệt thự của A nhưng chương này mở ở phòng trọ của B), phải ghi vào hardFailures (nêu rõ kết ở đâu, mở ở đâu) và đặt continuity thấp." : "",
    "- outlineDeviation=true nếu bỏ mốc bắt buộc hoặc mở tuyến lớn ngoài contract.",
    "- hardFailures phải chứa mọi lỗi chặn Sync. Nếu có hard failure thì verdict phải HARD_FAIL dù score cao.",
    "SCHEMA: " + GATE_REVIEW_SCHEMA
  ].filter(x => x !== "").join("\n\n");
}
// p: { chapterNumber, storyControl, contract, contractLabel, context, review, draft }
function buildRewritePrompt(p) {
  return [
    "SỬA LẠI BẢN THẢO CHƯƠNG " + p.chapterNumber + " THEO QUALITY REVIEW.",
    "Chỉ sửa đúng các lỗi được nêu; giữ nguyên các sự kiện hợp lệ, nhân vật hợp lệ, POV, xưng hô và giọng văn.",
    "TUYỆT ĐỐI không thêm sự kiện chính mới, không tạo nhân vật quan trọng mới, không mở thread mới chỉ để làm bản sửa dài hơn.",
    p.storyControl || "",
    p.characterLock || "",
    (p.contractLabel || "OUTLINE/CONTRACT") + ":\n" + (p.contract || ""),
    p.context ? "CANON CONTEXT:\n" + compactGateContext(p.context, 8000, false) : "",
    p.prevEnding ? "ĐOẠN KẾT CHƯƠNG TRƯỚC (cảnh mở đầu phải nối tiếp đúng địa điểm/thời điểm/người có mặt ở đây):\n" + String(p.prevEnding).slice(-1500) : "",
    (p.review && p.review.alreadyFixed && p.review.alreadyFixed.length) ? "LỖI ĐÃ SỬA Ở VÒNG TRƯỚC — giữ nguyên các chỗ đã sửa, không làm hỏng lại:\n- " + p.review.alreadyFixed.join("\n- ") : "",
    "QUALITY REVIEW:\n" + JSON.stringify(p.review || {}),
    "HƯỚNG SỬA ƯU TIÊN:\n" + rewriteInstructionsText(p.review),
    "BẢN THẢO HIỆN TẠI:\n" + (p.draft || ""),
    "CHỈ TRẢ VỀ VĂN XUÔI CHƯƠNG ĐÃ SỬA, KHÔNG tiêu đề, không giải thích, không markdown."
  ].filter(Boolean).join("\n\n");
}

// --- Vòng lặp Gate dùng chung. Không gọi AI trực tiếp: client/worker truyền các hàm vào qua `deps`. ---
// deps: { review(attempt)→{ok,review|reason}, rewrite(review,attempt)→{ok,stopped,reason}, selfCheck?(attempt), onStatus?(msg), onChange?(), shouldStop?() }
// opts: { enabled, allowRewrite, maxAttempts }
function bypassReview() {
  return { status: "bypassed", score: null, verdict: "BYPASS", dimensions: {}, hardFailures: [], warnings: ["Quality Gate đang tắt"], suggestions: [], rewriteInstructions: [], attempt: 0, reviewedAt: Date.now() };
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
  const verdictRank = v => v === "PASS" ? 3 : (v === "SOFT_FAIL" ? 2 : 1);
  const isBetterReview = (a, b) => {
    if (!b) return true;
    const vr = verdictRank(a && a.verdict) - verdictRank(b && b.verdict);
    if (vr !== 0) return vr > 0;
    const sd = Number(a && a.score || 0) - Number(b && b.score || 0);
    if (sd !== 0) return sd > 0;
    return (a && a.hardFailures || []).length < (b && b.hardFailures || []).length;
  };
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
    if (rr.review.verdict === "PASS") { chapter.status = "APPROVED"; notify(); return { approved: true, review: rr.review }; }
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
  }
  // Nếu các vòng sửa sau làm điểm tụt, khôi phục bản tốt nhất đã được chấm.
  if (bestReview && String(chapter.text || "") !== bestText) {
    chapter.text = bestText;
    chapter.wordCount = bestWordCount;
    chapter.review = Object.assign({}, bestReview, {
      status: "completed",
      regressionGuard: true,
      warnings: (bestReview.warnings || []).concat(["Best Draft Guard: bản sửa sau có điểm thấp hơn nên đã khôi phục bản tốt hơn (" + bestReview.score + "/100)."])
    });
    if (deps.onChange) deps.onChange();
  }
  chapter.status = "REVISION_REQUIRED";
  return { approved: false, review: chapter.review };
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
  return { kind: "new" };
}

/* AI báo thêm về nhân vật chính: chỉ cập nhật các trường trạng thái (không đụng hồ sơ do người dùng nhập). */
function applyMainCharUpdate(profile, u) {
  if (!profile || !u) return false;
  let changed = false;
  ["currentLocation", "physicalState", "mentalState", "secret"].forEach(k => { if (u[k] && String(u[k]).trim()) { profile[k] = u[k]; changed = true; } });
  return changed;
}

function mergeTextSegments(a, b, max) {
  max = max || 2500;
  const x = String(a || "").trim(), y = String(b || "").trim();
  if (!y) return x;
  if (!x) return y.slice(0, max);
  const nx = normalizeName(x), ny = normalizeName(y);
  if (nx === ny || nx.includes(ny)) return x;
  if (ny.includes(nx)) return y.slice(0, max);
  const fresh = y.split(/;\s*/).filter(seg => seg.trim() && !nx.includes(normalizeName(seg)));
  if (!fresh.length) return x;
  const parts = x.split(/;\s*/).concat(fresh);
  while (parts.length > 1 && parts.join("; ").length > max) parts.shift();
  return parts.join("; ").slice(-max);
}

/* Gộp hồ sơ `source` vào `target` (target là bản giữ lại). Không mất thông tin: trường trống thì điền, trường chữ thì nối ý mới. */
function mergeCharacterRecords(target, source) {
  const SKIP = ["id", "name", "relationships", "history", "aliases", "coreIdentity", "tier", "firstAppearance", "lastAppearance", "dead", "deathChapter", "locked", "coreLocked"];
  const TEXT = ["appearance", "personality", "goals", "secret", "weakness", "fear", "knowledge", "independentPlot", "speech", "strength", "role", "relevanceToMC"];
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
