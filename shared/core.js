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
// Chương gần (đoạn rút) + tóm tắt chương xa — đúng như viết thường.
function buildRecentBlocks(priorChapters) {
  const pc = Array.isArray(priorChapters) ? priorChapters : [];
  let recentFullText = "";
  if (pc.length) {
    const last = pc[pc.length - 1], lastNum = pc.length;
    recentFullText = "--- Chương " + lastNum + " (đoạn gần, đã rút) ---\n" + _clipChapterText(last.text, 3500);
    if (pc.length >= 2) {
      const prev = pc[pc.length - 2];
      recentFullText = "--- Ch" + (lastNum - 1) + " " + (prev.title || "") + " ---\n" + (prev.summary || _clipChapterText(prev.text, 800)) + "\n\n" + recentFullText;
    }
  }
  let olderSummaries = "";
  if (pc.length > 2) {
    const older = pc.slice(0, -2), start = Math.max(0, older.length - 8);
    olderSummaries = older.slice(start).map((c, i) => "Ch" + (start + i + 1) + ": " + (c.summary || "(chưa tóm tắt)").slice(0, (older.length - start - i) <= 3 ? 900 : 350)).join("\n");
  }
  return { recentFullText, olderSummaries };
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
    o.mainCharName ? ("NHÂN VẬT CHÍNH BẮT BUỘC: " + o.mainCharName + " — PHẢI là nhân vật trung tâm của kế hoạch này.") : "",
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
    "4. Nhân vật xuất hiện: BẮT BUỘC có nhân vật chính; TỐI ĐA 4 NHÂN VẬT CÓ TÊN RIÊNG xuất hiện trực tiếp trong cả chương; ưu tiên nhân vật đã có.",
    "5. Địa điểm",
    hasUserBrief ? "6. SCENE BEATS: MỖI nhịp của brief là MỘT beat (không giới hạn số beat), ghi gợi ý độ dài từng beat để cả chương đạt mục tiêu từ; KHÔNG tự sinh thêm sự kiện lớn ngoài brief"
                 : "6. SCENE BEATS (tối đa 5 beat) — chỉ triển khai 1-3 sự kiện trên, KHÔNG tự sinh thêm sự kiện lớn",
    "7. Kết chương — phải khớp mốc kết thúc người dùng yêu cầu nếu có",
    "8. Nếu có cảnh trưởng thành: mức intensity + structure, nhưng không thay đổi phạm vi sự kiện người dùng đã chỉ định",
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
  // V12.10: dọn chữ Hán/Nhật/Hàn/Cyrillic/Thái/Ả Rập/Hindi còn sót (kể cả khi dưới ngưỡng viết lại).
  if (!text) return text;
  text = removeEnglishLeaks(text);   // V12.23
  let t = String(text)
    .replace(/，/g, ", ").replace(/。/g, ". ").replace(/！/g, "! ").replace(/？/g, "? ").replace(/：/g, ": ").replace(/、/g, ", ")
    .replace(/[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0400-\u04FF\u0E00-\u0E7F\u0600-\u06FF\u0900-\u097F]+/g, "");
  return t.replace(/[ \t]{2,}/g, " ").replace(/ +([,.!?;:])/g, "$1").replace(/\( *\)|“ *”|" *"/g, "");
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
  const src = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!src) return src;
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
        if (!nx || /[\p{Lu}“"«‘—–-]/u.test(nx)) { out.push(cur.trim()); cur = ""; }
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
  return paras.join("\n\n");
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
const GATE_MAX_ATTEMPTS = 3;          // tối đa số lần chấm (và sửa) cho một chương
const GATE_MAX_VERSIONS = 3;          // số bản gốc giữ lại trong chapter.versions
const GATE_MIN_REWRITE_RATIO = 0.6;   // bản sửa ngắn hơn 60% bản gốc bị từ chối

function gateItemText(x) { return typeof x === "string" ? x : ((x && (x.description || x.problem)) || JSON.stringify(x)); }

function gateMaxAttempts(v) { return Math.max(1, Math.min(GATE_MAX_ATTEMPTS, Number(v) || GATE_MAX_ATTEMPTS)); }

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
  const score = Math.max(0, Math.min(100, Number(obj.score) || 0));
  const verdict = hard.length ? "HARD_FAIL" : (score >= passScore ? "PASS" : (score >= softScore ? "SOFT_FAIL" : "HARD_FAIL"));
  return Object.assign({}, obj, {
    score, verdict, hardFailures: hard,
    dimensions: obj.dimensions && typeof obj.dimensions === "object" ? obj.dimensions : {},
    warnings: arr(obj.warnings, 20).concat(opts.extraWarnings || []), suggestions: arr(obj.suggestions, 20), rewriteInstructions: arr(obj.rewriteInstructions, 12),
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
    lockedFields: Array.isArray(sc.lockedFields) ? sc.lockedFields : ["identity","age","background","canon","relationships","cultivation","abilities","importantItems","secrets","promises","worldRules"],
    agencyRequired: sc.agencyRequired !== false
  };
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
    "- Không tự tạo nhân vật quan trọng mới nếu nhân vật hiện có có thể đảm nhiệm vai trò đó.",
    "- Không tạo năng lực, quy tắc thế giới hoặc vật phẩm quan trọng mới chỉ để giải quyết vấn đề tức thời.",
    "- Chapter Focus chỉ kiểm soát phạm vi chủ đề trưởng thành; không được dùng nó để mở rộng cốt truyện ngoài brief.",
    "- Nếu Directive/Story Bible/Current Status xung đột, không âm thầm sửa canon; ưu tiên dữ liệu canon và ghi nhận xung đột khi cần.",
    "- ĐƯỢC TỰ DO: thêm cảnh phụ, chuyển cảnh, hội thoại, nội tâm, giác quan, hành động nhỏ, chi tiết đời thường BÊN TRONG các sự kiện chính; không được dùng quyền này để mở arc lớn, thêm nhân vật quan trọng mới hay tiết lộ thông tin để dành cho chương sau.",
    "- Mục tiêu là chiều sâu và tính liên tục, không phải nhồi thêm biến cố lớn."
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
const GATE_REVIEW_SCHEMA = '{"score":0,"verdict":"PASS|SOFT_FAIL|HARD_FAIL","dimensions":{"continuity":0,"characterConsistency":0,"canonConsistency":0,"plotDiscipline":0,"worldRules":0,"outlineCompliance":0,"style":0,"pacing":0,"knowledgeConsistency":0},"mainEventCount":0,"namedCharacterCount":0,"unauthorizedImportantCharacter":false,"knowledgeViolation":false,"retcon":false,"outlineDeviation":false,"hardFailures":[],"warnings":[],"suggestions":[],"rewriteInstructions":[]}';
// p: { storyControl, contract, contractLabel, context, warnings, draft, hardChecks, knownNames, maxMainEvents, maxNamedCharacters }
function buildQualityReviewPrompt(p) {
  const evN = Number(p.maxMainEvents) || 3, chN = Number(p.maxNamedCharacters) || 4;
  const known = (p.knownNames || []);
  return [
    "Bạn là QUALITY AUDITOR cho tiểu thuyết dài kỳ.",
    "Mục tiêu: kiểm tra bản thảo so với Chapter Contract, Story Bible và continuity. KHÔNG viết lại chương.",
    "Trả DUY NHẤT JSON object theo schema cuối.",
    "STORY CONTROL:", p.storyControl || "",
    (p.contractLabel || "CHAPTER CONTRACT / OUTLINE") + ":", p.contract || "(không có)",
    "BỐI CẢNH/CANON TÓM LƯỢC:", String(p.context || "").slice(0, 18000),
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
    (p.contractLabel || "OUTLINE/CONTRACT") + ":\n" + (p.contract || ""),
    p.context ? "CANON CONTEXT:\n" + String(p.context).slice(0, 15000) : "",
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
    if (rr.review.verdict === "PASS") { chapter.status = "APPROVED"; notify(); return { approved: true, review: rr.review }; }
    chapter.status = "REVISION_REQUIRED"; notify();
    if (attempt >= maxAttempts) break;
    if (deps.onStatus) deps.onStatus("Quality Gate: " + rr.review.verdict + " — đang sửa lần " + (attempt + 1) + "/" + maxAttempts + "...");
    const rw = await deps.rewrite(rr.review, attempt);
    if (rw && rw.stopped) return { approved: false, stopped: true };
    if (!rw || !rw.ok) {
      chapter.review.warnings = (chapter.review.warnings || []).concat(["Bản sửa bị từ chối: " + ((rw && rw.reason) || "không rõ") + " — giữ nguyên bản thảo."]);
      notify(); break;
    }
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
