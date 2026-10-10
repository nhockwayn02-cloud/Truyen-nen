const { getStore, connectLambda } = require("@netlify/blobs");
const crypto = require("crypto");

/*
 * Xưởng Truyện AI v9.1 — Background Worker
 *
 * Mục tiêu của bản này:
 * - Không mất toàn bộ NV khi JSON array bị cắt.
 * - Không để Status rỗng ghi đè Status cũ.
 * - Tách cập nhật NV/Thế giới thành nhiều lô nhỏ thay vì 1 JSON khổng lồ.
 * - Có retry + repair JSON + checkpoint sau từng bước.
 * - API key được mã hóa khi lưu vào Blobs nếu JOB_SECRET được cấu hình.
 * - Job-status dùng accessToken, không trả secret/API key.
 */

const CREATIVE_TEMP = 0.7; // V12.20: hạ từ 0.82 để bớt từ lỗi
const DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MAX_JOB_AGE_MS = 24 * 60 * 60 * 1000;
let DEADLINE = Infinity; // đặt lại ở đầu handler
const timeLeft = () => DEADLINE - Date.now();

function getJobStore(event) {
  if (event) { try { connectLambda(event); } catch (_) {} }
  try { return getStore("story-jobs"); } catch (e) {
    const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID || process.env.BLOBS_SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) return getStore({ name: "story-jobs", siteID, token });
    throw new Error("Netlify Blobs chưa cấu hình. Hãy cấu hình NETLIFY_SITE_ID + NETLIFY_API_TOKEN hoặc dùng Netlify Blobs mặc định.");
  }
}

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Worker-Token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(obj)
  };
}

function genId(prefix = "x") {
  return prefix + Date.now().toString(36) + crypto.randomBytes(5).toString("hex");
}
function genSecret() { return crypto.randomBytes(32).toString("base64url"); }
function hashSecret(value) { return crypto.createHash("sha256").update(String(value || "")).digest("hex"); }
function secretsEqual(a, b) { return crypto.timingSafeEqual(Buffer.from(a || ""), Buffer.from(b || "")); }

function encryptionKey() {
  const secret = process.env.JOB_SECRET || process.env.NETLIFY_JOB_SECRET || process.env.NETLIFY_API_TOKEN || "";
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest();
}
function encryptText(text) {
  const key = encryptionKey();
  if (!key) return { encrypted: false, value: text };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  return { encrypted: true, value: `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${enc.toString("base64url")}` };
}
function decryptText(record) {
  if (!record) return "";
  if (!record.encrypted) return record.value || "";
  const key = encryptionKey();
  if (!key) throw new Error("JOB_SECRET đã được dùng để mã hóa API key nhưng runtime hiện tại không có JOB_SECRET.");
  const [ivS, tagS, dataS] = String(record.value || "").split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivS, "base64url"));
  decipher.setAuthTag(Buffer.from(tagS, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataS, "base64url")), decipher.final()]).toString("utf8");
}

// <<SHARED-CORE:BEGIN>> (tự sinh từ shared/core.js — KHÔNG sửa tay; chạy: node scripts/sync-shared.js)
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
// <<SHARED-CORE:END>>
// V12.3: hard cap để mục tiêu 5.000 từ không biến thành 8.000+ từ.

function stripFences(raw) {
  return String(raw || "")
    .replace(/```(?:json|JSON)?/g, "")
    .replace(/```/g, "")
    .replace(/\uFEFF/g, "")
    .trim();
}

/* ===== JSON parser v9.3 =====
 * Các lỗi cũ đã sửa:
 *  - Không còn đổi “ ” thành " toàn cục (làm hỏng JSON hợp lệ có thoại trong chuỗi).
 *  - Không còn "rơi" vào mảng/object con bên trong khi mảng/object ngoài bị hỏng hoặc bị cắt
 *    (trước đây trả về mảng relationships:[] rồi coi là thành công -> không cập nhật gì mà không báo lỗi).
 *  - Sửa lỗi cú pháp nhẹ: xuống dòng thô trong chuỗi, dấu phẩy thừa, dấu " lồng trong chuỗi.
 *  - Cứu phần JSON bị cắt bằng cách đóng ngoặc tại dấu phẩy hợp lệ gần nhất.
 *  - Kiểm tra khóa bắt buộc: JSON đúng cú pháp nhưng sai cấu trúc = thất bại (không còn im lặng bỏ qua).
 */
function fixJsonSyntax(s, healQuotes) {
  let out = "", inStr = false, esc = false;
  const nextSig = (k) => { while (k < s.length && /\s/.test(s[k])) k++; return s[k]; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) { out += c; esc = false; continue; }
      if (c === "\\") { out += c; esc = true; continue; }
      if (c === '"') {
        if (healQuotes) {
          const nx = nextSig(i + 1);
          if (!(nx === undefined || nx === "," || nx === ":" || nx === "}" || nx === "]")) { out += '\\"'; continue; }
        }
        inStr = false; out += c; continue;
      }
      if (c === "\n") { out += "\\n"; continue; }
      if (c === "\r") continue;
      if (c === "\t") { out += "\\t"; continue; }
      if (c.charCodeAt(0) < 32) continue;
      out += c; continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "}" || c === "]") out = out.replace(/,\s*$/, "");
    out += c;
  }
  return out;
}

function tryParse(s) {
  try { return { ok: true, value: JSON.parse(s), method: "direct" }; } catch (_) {}
  try { return { ok: true, value: JSON.parse(fixJsonSyntax(s, false)), method: "loose" }; } catch (_) {}
  try { return { ok: true, value: JSON.parse(fixJsonSyntax(s, true)), method: "loose+quote" }; } catch (_) {}
  try { return { ok: true, value: JSON.parse(fixJsonSyntax(s.replace(/[“”]/g, '"'), true)), method: "loose+curly" }; } catch (_) {}
  return { ok: false };
}

/* Chỉ trả các ứng viên NGOÀI CÙNG. Ứng viên chưa đóng (bị cắt) sẽ nuốt phần còn lại, không quét vào bên trong. */
function scanTop(s, open) {
  const close = open === "[" ? "]" : "}";
  const res = [];
  let i = 0;
  while (i < s.length) {
    const st = s.indexOf(open, i);
    if (st < 0) break;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let j = st; j < s.length; j++) {
      const c = s[j];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') { inStr = true; continue; }
      if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end < 0) { res.push({ text: s.slice(st), complete: false }); break; }
    res.push({ text: s.slice(st, end + 1), complete: true });
    i = end + 1;
  }
  return res;
}

function parseJsonLoose(raw, open) {
  const s = stripFences(raw);
  if (!s) return { value: null, method: "", truncated: "" };
  const whole = tryParse(s);
  if (whole.ok) return { value: whole.value, method: whole.method, truncated: "" };
  let truncated = "";
  for (const c of scanTop(s, open)) {
    if (c.complete) { const t = tryParse(c.text); if (t.ok) return { value: t.value, method: t.method + "-extract", truncated: "" }; }
    else truncated = c.text;
  }
  return { value: null, method: "", truncated };
}

/* JSON bị cắt: thử đóng ngoặc tại từng dấu phẩy (từ cuối ngược lên) tới khi parse được. */
function salvageTruncated(text) {
  const stack = []; let inStr = false, esc = false; const points = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") stack.pop();
    else if (c === "," && stack.length) points.push({ pos: i, closers: stack.slice().reverse().join("") });
  }
  for (let k = points.length - 1; k >= Math.max(0, points.length - 300); k--) {
    const p = points[k];
    const t = tryParse(text.slice(0, p.pos) + p.closers);
    if (t.ok) return t.value;
  }
  return null;
}

/* Cứu từng object hoàn chỉnh trong mảng; đếm object hỏng thay vì âm thầm bỏ. */
function repairTruncatedArray(raw) {
  const s = stripFences(raw);
  const start = s.indexOf("[");
  if (start < 0) return { items: [], dropped: 0 };
  const out = []; let dropped = 0;
  let i = start + 1;
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    if (s[i] !== "{") break;
    const objStart = i;
    let depth = 0, inStr = false, esc = false;
    for (; i < s.length; i++) {
      const c = s[i];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') { inStr = true; continue; }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          const t = tryParse(s.slice(objStart, i + 1));
          if (t.ok && t.value && typeof t.value === "object") out.push(t.value); else dropped++;
          i++;
          break;
        }
      }
    }
    if (depth !== 0) break;
  }
  return { items: out, dropped };
}

const isPlainObj = (x) => x && typeof x === "object" && !Array.isArray(x);

function parseArray(raw) {
  const r = parseJsonLoose(raw, "[");
  let v = r.value, method = r.method;
  if (v && !Array.isArray(v) && typeof v === "object") {
    const arr = Object.values(v).find(x => Array.isArray(x));
    if (arr) { v = arr; method += "+unwrap"; }
    else if (v.name || v.description) { v = [v]; method += "+single"; }
    else v = null;
  }
  if (Array.isArray(v)) {
    const items = v.filter(isPlainObj);
    return { items, valid: true, repaired: false, method, dropped: v.length - items.length, truncated: false };
  }
  let items = [], dropped = 0, method2 = "";
  if (r.truncated) {
    const sv = salvageTruncated(r.truncated);
    if (Array.isArray(sv)) { items = sv.filter(isPlainObj); method2 = "salvage"; }
  }
  if (!items.length) {
    const rp = repairTruncatedArray(r.truncated || raw);
    items = rp.items; dropped = rp.dropped; method2 = "object-by-object";
  }
  return { items, valid: items.length > 0, repaired: items.length > 0, method: items.length ? method2 : "", dropped, truncated: !!r.truncated };
}

function parseObjectDetailed(raw, keys) {
  const ok = (v) => isPlainObj(v) && (!keys || !keys.length || keys.some(k => k in v) || Object.keys(v).length === 0);
  const r = parseJsonLoose(raw, "{");
  let v = r.value;
  if (Array.isArray(v)) v = v.find(isPlainObj) || null;
  if (isPlainObj(v) && !ok(v)) { const inner = Object.values(v).find(ok); if (inner) v = inner; }
  if (ok(v)) return { obj: v, method: r.method };
  if (r.truncated) { const sv = salvageTruncated(r.truncated); if (ok(sv)) return { obj: sv, method: "salvage" }; }
  return { obj: null, method: "" };
}

function chunkText(text, maxChars = 14000, overlap = 900) {
  const s = String(text || "");
  if (s.length <= maxChars) return [s];
  const chunks = [];
  let start = 0;
  while (start < s.length) {
    let end = Math.min(s.length, start + maxChars);
    if (end < s.length) {
      const cut = s.lastIndexOf("\n", end);
      if (cut > start + maxChars * 0.65) end = cut;
    }
    chunks.push(s.slice(start, end));
    if (end >= s.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}
function representativeText(text, maxChars = 42000) {
  const s = String(text || "");
  if (s.length <= maxChars) return s;
  const part = Math.floor(maxChars / 3);
  return s.slice(0, part) + "\n\n[...ĐOẠN GIỮA... ]\n\n" + s.slice(Math.floor((s.length - part) / 2), Math.floor((s.length + part) / 2)) + "\n\n[...ĐOẠN CUỐI... ]\n\n" + s.slice(-part);
}

const SYSTEM_PROMPT = [
  "Bạn là tiểu thuyết gia Việt Nam chuyên viết tiểu thuyết dài kỳ.",
  "Khi viết văn xuôi, ưu tiên tuyệt đối tiếng Việt tự nhiên, mạch câu mượt và nhất quán; không viết theo kiểu dịch máy.",
  "Giữ continuity: nhân vật, xưng hô, POV, thì kể, thời gian, địa điểm, kiến thức, quan hệ, vật phẩm, năng lực và nguyên nhân-hệ quả phải nhất quán.",
  "Ưu tiên cảnh cụ thể, hành động, giác quan, đối thoại tự nhiên và nội tâm thể hiện qua hành vi; tránh sáo ngữ, giải thích dài dòng, lặp cấu trúc câu và lặp tính từ.",
  "Không cố thay từ chỉ để tránh lặp khi việc lặp là tự nhiên. Tính tự nhiên của tiếng Việt quan trọng hơn việc né một từ.",
  "ĐƯỢC TỰ DO thêm cảnh phụ, hội thoại, nội tâm, giác quan, chi tiết đời thường để chương tự nhiên và dài hơn; KHÔNG tự tạo biến cố lớn, lore, nhân vật quan trọng, arc mới hay thông tin để dành cho chương sau.",
  "CHARACTER DATABASE là nguồn sự thật: không tự đổi thân phận, vai trò, tính cách, quan hệ hoặc lịch sử đã được xác nhận; nếu chưa biết thì để mở thay vì bịa.",
  "Mệnh lệnh/gợi ý trực tiếp của người dùng cho chương hiện tại phải được triển khai đầy đủ; không thay thế bằng một tuyến truyện khác chỉ vì AI thấy tuyến đó thú vị hơn.",
  "Trước khi viết, phải lập kế hoạch nội bộ theo Story Control Layer: khóa canon, giới hạn 1–3 sự kiện, kiểm tra nhân vật và hậu quả; không xuất kế hoạch nội bộ ra văn bản.",

  "Khi viết tiếp, giữ đúng giọng, nhịp câu, POV, thì kể và xưng hô của phần trước; không đổi phong cách giữa chừng.",
  "BỐ CỤC BẮT BUỘC: chia thành nhiều đoạn ngắn 2–4 câu, các đoạn cách nhau một dòng trống; mỗi lượt thoại nằm trên một đoạn riêng (mở bằng dấu “ hoặc —); đổi cảnh/người nói thì xuống đoạn mới; không viết khối văn liền dài.",
  "Khi viết văn xuôi, chỉ trả tác phẩm, không nói về prompt, AI hay quy trình."
].join(" ");

const DESCRIPTION_PROMPTS = {
  light: "Miêu tả nhẹ, tập trung diễn biến.",
  balanced: "Miêu tả cân bằng, có giác quan và chi tiết vừa đủ.",
  rich: "Miêu tả phong phú, chú ý ngoại hình và không khí cảnh.",
  deep: "Miêu tả sâu, giàu giác quan nhưng không lặp."
};
// Đồng bộ nguyên văn với EXPLICIT_PROMPTS trong index.html (bản viết trực tiếp) để 2 luồng ra văn phong giống nhau.
// Đồng bộ nguyên khối EROTIC_STYLE_PROMPT từ index.html.
const EROTIC_STYLE_PROMPT = [
  "PHONG CÁCH REDQUILL / 18+ CỰC NẶNG (BẮT BUỘC khi cảnh nóng — đủ lớp, không bỏ):",
  "",
  "HAI LỚP (không trộn trong CÙNG MỘT CÂU):",
  "- Lớp văn/tâm lý: không khí, quyền lực, nội tâm, xã hội — có thể văn hơn.",
  "- Lớp erotic: khi đang sex/sỉ nhục/lên đỉnh → từ THÔ TỤC đường phố chiếm ưu thế (cặc, lồn, địt, nứng, nước lồn, tinh trùng, đĩ, nô lệ…). Không ẩn dụ hoa mỹ thay thế.",
  "",
  "4 LỚP MỖI ĐOẠN NÓNG:",
  "1) CƠ THỂ: kích thước/màu/hình thái theo hồ sơ NV (cặc, lồn, ngực, mông, mép, hạt le, dịch).",
  "2) CẢM GIÁC: căng, ướt, đau rát, no đầy, tê, run, nóng — trong da thịt, không chỉ nhìn từ ngoài.",
  "3) NỘI TÂM đa lớp: xấu hổ ↔ dục, kháng cự ↔ cơ thể phản bội, tự nhục ↔ nghiện (nữ); tính toán/chiếm hữu (nam nếu có).",
  "4) ÂM THANH + NHỊP: da đập, dịch, giường, thở, rên (ư, ahh, hah…), thoại van xin — đồng bộ nhịp đút.",
  "",
  "THOẠI (khi nhân vật đã quy phục / cảnh huấn luyện):",
  "- Tăng mật độ thoại: van xin thô tục, tự sỉ nhục, mô tả lồn/cặc đang nứng, cầu xin được địt/xuất.",
  "- Nam chính (nếu thống trị): thoại ngắn, lạnh, ra lệnh; nữ đáp dài hơn, thô hơn khi cao trào.",
  "- Thoại xen hành động + biểu cảm (mắt, môi, nước dãi, run).",
  "",
  "NHỊP CẢNH 3 PHẦN (BẮT BUỘC khi chương có cảnh nóng — KHÔNG chỉ dồn vào cao trào):",
  "- DẪN VÀO (~25% cảnh): dựng không khí và căng thẳng trước khi chạm nhau — ánh mắt, khoảng cách, lời nói/mệnh lệnh, nội tâm, từng bước cởi bỏ/áp sát, phản ứng cơ thể đầu tiên. Không nhảy thẳng vào quan hệ.",
  "- DIỄN BIẾN + CAO TRÀO (~50%): như các quy tắc trên.",
  "- SAU CẢNH (~25%): không cắt ngang ngay sau cao trào — hơi thở, cơ thể kiệt sức/dư chấn, dịch và dấu vết, cảm xúc sau đó (xấu hổ, thỏa mãn, hối hận, chiếm hữu), thoại sau cảnh, và hậu quả với quan hệ giữa hai người; rồi mới chuyển cảnh hoặc kết chương.",
  "- Mỗi phần phải có đoạn văn đầy đủ riêng (nhiều đoạn, không gói trong 1-2 câu).",
  "- NGOẠI LỆ: nếu gợi ý/mệnh lệnh của người dùng chỉ nêu 1–2 trong 3 phần (ví dụ chỉ dẫn vào, hoặc chỉ tới trước cao trào), CHỈ viết đúng các phần đó và dừng ở mốc kết chương người dùng đã ghi; tuyệt đối không tự thêm phần còn lại.",
  "",
  "KỸ THUẬT:",
  "- Chậm từng nhịp; không tóm tắt cao trào trong 1-2 câu.",
  "- Nhiều bộ phận cùng lúc (tay + miệng + cặc…).",
  "- 5 giác quan khi phù hợp; mùi/dịch/nhiệt độ.",
  "- Bám hồ sơ NV — cấm bịa số đo khác.",
  "- 100% tiếng Việt có dấu. Không meta, không spoiler chương sau."
].join("\n");

// v11 — Rào chắn tuổi (đồng bộ nguyên văn với index.html).

const EXPLICIT_PROMPTS = {
  subtle: "CẢNH 18+: Nhẹ nhàng — fade-to-black sau khi hôn, gợi ý chứ không tả. Cảm xúc chiếm ưu thế.",
  sensual: "CẢNH 18+: Gợi cảm — tả cảm xúc, hơi thở, ánh mắt, da chạm da; hạn chế tả bộ phận sinh dục chi tiết. Vẫn giàu sức gợi.",
  explicit: "CẢNH 18+: Rõ ràng — mô tả cơ thể và hành động cụ thể (hôn, sờ, cởi, tư thế). Có thể dùng từ trực tiếp khi cần. Show cảm giác qua da thịt và phản ứng.",
  strong: "CẢNH 18+: MẠNH — mỗi đoạn nóng cần: (1) bộ phận + hình thái/màu/số đo hồ sơ; (2) cảm giác thể xác cụ thể; (3) một nhịp nội tâm (xấu hổ/dục/kháng cự); (4) động tác + âm thanh. Ít ẩn dụ.",
  wild: "CẢNH 18+: CỰC MẠNH. Đủ 4 lớp (cơ thể+cảm giác+nội tâm+âm thanh/thoại). Không tóm tắt, không fade-to-black. Bám hồ sơ số đo."
};

/* ===== NSFW KEYWORD DETECT — đồng bộ với index.html, thay cho danh sách 6 từ cũ (quá hẹp) ===== */

// V12.14: khớp theo TỪ nguyên vẹn (Unicode), không khớp chuỗi con — tránh "cà phê", "cây bút", "phản kháng"... bị nhận nhầm là 18+.

/* v10.2.2: worker trước đây chỉ ép NSFW khi bắt được từ khóa trong directive/hint/tiêu đề —
 * không có bước "chấm nhiệt độ" như bản viết trực tiếp (index.html detectHeatLevel()).
 * Hệ quả: nếu cảnh nóng phát sinh tự nhiên từ mạch truyện (không có từ khóa tường minh
 * trong Mệnh lệnh/Định hướng), job nền âm thầm dùng model thường thay vì model NSFW dù
 * chế độ đang để "auto". Hàm dưới đây đồng bộ với client: chấm 0-10, so với ngưỡng đã cấu hình. */

async function detectHeatLevel(job, tail, hint, directive) {
  try {
    const prompt = [
      "Bạn là bộ phân loại nhiệt độ cảnh cho tiểu thuyết.",
      "Chấm mức 18+ của CẢNH SẮP VIẾT theo thang 0-10:",
      "0-2 bình thường | 3-4 cảm xúc nhẹ | 5-6 hôn/ôm | 7-8 cởi đồ/sờ | 9-10 quan hệ",
      "CHỈ TRẢ VỀ 1 SỐ DUY NHẤT. KHÔNG giải thích.",
      "",
      matureFocusPrompt(job.storyState),
      "MỆNH LỆNH: " + (directive || "(không)"),
      "ĐỊNH HƯỚNG CHO CHƯƠNG NÀY: " + (hint || "(không)"),
      "DIỄN BIẾN GẦN:",
      (tail || "(chưa có)").slice(-2000)
    ].join("\n");
    const r = await callExtract({ endpoint: job.apiEndpoint, apiKey: job.apiKey, model: job.model, messages: [{ role: "user", content: prompt }], maxTokens: 10, temperature: 0 }, 1);
    const m = String(r.text || "").match(/\d+/);
    return m ? Math.max(0, Math.min(10, parseInt(m[0], 10))) : 0;
  } catch (_) { return 0; }
}

// v9.2: dùng streaming + idle-timeout thay vì abort cứng sau 170s.
// Chương dài (5000+ từ, ~12-16k token) thường chạy >170s nên bản cũ bị "This operation was aborted".
// Nếu bị ngắt giữa chừng nhưng đã có nội dung, trả phần đã nhận (finishReason="length") để vòng "viết tiếp" xử lý.
async function callOpenRouter({ endpoint, apiKey, model, messages, maxTokens = 4000, temperature = 0.3, totalMs = 400000, firstTokenMs = 150000, idleMs = 60000, creative = false, frequencyPenalty, presencePenalty, noReasoning = !creative, _noReasoningParam = false }) {
  if (timeLeft() < 15000) throw new Error("Hết thời gian job nền (giới hạn 15 phút của Netlify)");
  totalMs = Math.min(totalMs, Math.max(15000, timeLeft() - 25000));
  firstTokenMs = Math.min(firstTokenMs, totalMs);
  const controller = new AbortController();
  const startedAt = Date.now();
  let timer = null, abortReason = "";
  const arm = (ms, reason) => {
    clearTimeout(timer);
    timer = setTimeout(() => { abortReason = reason; controller.abort(); }, ms);
  };
  arm(firstTokenMs, `Model không phản hồi sau ${Math.round(firstTokenMs / 1000)}s`);
  let text = "", reasoning = "", finishReason = null, gotAny = false;
  try {
    const res = await fetch(endpoint || DEFAULT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.URL || "https://xuong-truyen-ai.netlify.app",
        "X-Title": "Xuong Truyen AI v9"
      },
      body: JSON.stringify(Object.assign({ model, messages, max_tokens: maxTokens, temperature, stream: true },
        // V12.20: siết lấy mẫu khi viết văn để giảm từ lỗi ghép (mươititude, bănnton...). top_k chỉ gửi cho OpenRouter.
        creative ? { top_p: 0.88 } : {},
        (creative && /openrouter\.ai/i.test(endpoint || DEFAULT_ENDPOINT)) ? { top_k: 40 } : {},
        // Penalty chỉ dùng khi VIẾT VĂN. Với JSON, penalty làm model né lặp key/dấu ngoặc -> JSON hỏng.
        // V12.23: viết chương chính dùng cùng frequency/presence penalty như viết thường (chống lặp). Chỉ gửi khi được truyền.
        (creative && typeof frequencyPenalty === "number") ? { frequency_penalty: frequencyPenalty } : {},
        (creative && typeof presencePenalty === "number") ? { presence_penalty: presencePenalty } : {},
          // Model có "thinking" sẽ ăn hết max_tokens vào reasoning -> content rỗng/bị cắt. Tắt cho trích xuất (chỉ OpenRouter).
          (noReasoning && !_noReasoningParam && /openrouter\.ai/i.test(endpoint || DEFAULT_ENDPOINT)) ? { reasoning: { enabled: false } } : {})),
      signal: controller.signal
    });
    if (!res.ok) {
      const err = await res.text();
      if (res.status === 400 && noReasoning && !_noReasoningParam && /reasoning/i.test(err)) {
        clearTimeout(timer);
        return callOpenRouter({ endpoint, apiKey, model, messages, maxTokens, temperature, totalMs, firstTokenMs, idleMs, creative, noReasoning, _noReasoningParam: true });
      }
      const e = new Error(`API ${res.status}: ${err.slice(0, 500)}`);
      e.status = res.status;
      throw e;
    }
    const ctype = res.headers.get("content-type") || "";
    if (!ctype.includes("text/event-stream")) {
      // Provider không hỗ trợ stream -> đọc JSON thường
      const data = await res.json();
      const choice = data.choices?.[0];
      return { text: choice?.message?.content || choice?.text || (creative ? (choice?.message?.reasoning || choice?.message?.reasoning_content) : "") || "", finishReason: choice?.finish_reason || null, reasoningLen: String(choice?.message?.reasoning || choice?.message?.reasoning_content || "").length };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      gotAny = true;
      if (Date.now() - startedAt > totalMs) { abortReason = `Quá ${Math.round(totalMs / 1000)}s cho một lần gọi`; controller.abort(); break; }
      arm(idleMs, `Model đứng im ${Math.round(idleMs / 1000)}s giữa chừng`);
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line || line.startsWith(":") || !line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          if (j.error) { const e = new Error(`API stream: ${String(j.error.message || JSON.stringify(j.error)).slice(0, 300)}`); e.status = j.error.code; throw e; }
          const ch = j.choices?.[0];
          const piece = ch?.delta?.content ?? ch?.text ?? "";
          if (piece) text += piece;
          const rp = ch?.delta?.reasoning ?? ch?.delta?.reasoning_content ?? "";
          if (rp) reasoning += rp;
          if (ch?.finish_reason) finishReason = ch.finish_reason;
        } catch (e) { if (e.status) throw e; /* dòng JSON dở dang: bỏ qua */ }
      }
    }
    if (creative && !text.trim() && reasoning.trim()) text = reasoning; // chỉ khi viết văn
    return { text, finishReason, reasoningLen: reasoning.length };
  } catch (e) {
    const aborted = e.name === "AbortError" || /aborted/i.test(e.message || "");
    if (aborted) {
      // Có nội dung đủ dài -> giữ lại, coi như bị cắt để vòng viết tiếp nối tiếp
      if (text.trim().length > 800) return { text, finishReason: "length", partial: true, partialReason: abortReason, reasoningLen: reasoning.length };
      const err = new Error(abortReason || "Kết nối tới model bị ngắt");
      err.retryable = true;
      throw err;
    }
    if (!e.status && gotAny && text.trim().length > 800) return { text, finishReason: "length", partial: true, partialReason: e.message, reasoningLen: reasoning.length };
    if (!e.status) e.retryable = true; // lỗi mạng
    throw e;
  } finally { clearTimeout(timer); }
}

async function callWithRetry(args, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await callOpenRouter(args); }
    catch (e) {
      last = e;
      const retryable = e.retryable || [408, 425, 429, 500, 502, 503, 504, 524].includes(e.status);
      if (!retryable) break;
      if (i < tries - 1) await new Promise(r => setTimeout(r, Math.min(8000, 900 * Math.pow(2, i))));
    }
  }
  throw last || new Error("API thất bại");
}

/* Gọi trích xuất: nếu content rỗng (thường do reasoning ăn hết token) thì gọi lại với ngân sách gấp đôi. */
async function callExtract(args, tries = 2) {
  let r = await callWithRetry(args, tries);
  const empty = !String(r.text || "").trim();
  const base = args.maxTokens || 3000;
  // Rỗng hoặc bị cắt (finish=length) -> gọi lại với ngân sách gấp đôi (tối đa 16000)
  if ((empty || r.finishReason === "length") && base < 16000 && timeLeft() > 120000) {
    try {
      const r2 = await callWithRetry({ ...args, maxTokens: Math.min(16000, base * 2) }, tries);
      const has2 = String(r2.text || "").trim();
      if (has2 && (empty || r2.finishReason !== "length" || r2.text.length > r.text.length)) r = { ...r2, retriedBigger: true };
    } catch (e) { if (empty) throw e; }
  }
  return r;
}
function fin(r) { return `finish=${r.finishReason || "?"}, ${String(r.text || "").length} ký tự${r.reasoningLen ? `, reasoning ${r.reasoningLen}` : ""}`; }

async function repairJsonWithAI(job, raw, shape, keys, maxTokens = 6900) {
  const clipped = String(raw || "").slice(0, 24000);
  if (!clipped.trim()) return "";
  const instruction = shape === "array"
    ? 'Chuyển nội dung sau thành JSON array hợp lệ gồm các object. Giữ lại mọi object có thể xác định. Không thêm dữ liệu. Chỉ trả JSON array.'
    : `Chuyển nội dung sau thành một JSON object hợp lệ${keys && keys.length ? " với các khóa: " + keys.join(", ") : ""}. Giữ nguyên thông tin có thể xác định. Không thêm dữ liệu. Chỉ trả JSON object.`;
  try {
    const r = await callExtract({
      endpoint: job.apiEndpoint, apiKey: job.apiKey, model: job.model,
      messages: [
        { role: "system", content: "Bạn là bộ sửa JSON. Tuyệt đối không viết giải thích ngoài JSON." },
        { role: "user", content: instruction + "\n\nDỮ LIỆU LỖI:\n" + clipped }
      ],
      maxTokens, temperature: 0
    }, 2);
    return r.text || "";
  } catch (_) { return ""; }
}

async function parseArrayWithRepair(job, raw) {
  const p = parseArray(raw);
  if (p.valid) return { ...p, repairedByAI: false };
  if (timeLeft() < 90000) return { ...p, repairedByAI: false }; // không đủ giờ cho 1 lượt gọi sửa JSON nữa
  const fixed = await repairJsonWithAI(job, raw, "array", null, 8000);
  const again = parseArray(fixed);
  return { ...again, repairedByAI: again.valid, method: again.valid ? "AI-repair" : "" };
}

async function parseObjectWithRepair(job, raw, keys) {
  const p = parseObjectDetailed(raw, keys);
  if (p.obj) return { obj: p.obj, method: p.method, repairedByAI: false };
  if (timeLeft() < 90000) return { obj: null, method: "", repairedByAI: false };
  const fixed = await repairJsonWithAI(job, raw, "object", keys, 6900);
  const again = parseObjectDetailed(fixed, keys);
  return { obj: again.obj, method: again.obj ? "AI-repair" : "", repairedByAI: !!again.obj };
}

function sampleOf(text, n = 140) { return String(text || "").replace(/\s+/g, " ").slice(0, n); }

function buildContext(state) {
  const p = [];
  const loreTxt = buildLoreBlock(state); if (loreTxt) p.push(loreTxt);
  if (state.mainPlot) p.push("CỐT TRUYỆN:\n" + state.mainPlot);
  if (state.genre) p.push("THỂ LOẠI: " + state.genre);
  if (state.worldSetting) p.push("THẾ GIỚI:\n" + state.worldSetting);
  if (state.worldRules) p.push("LUẬT THẾ GIỚI:\n" + state.worldRules);
  if (state.worldDescription) p.push("KHÔNG KHÍ:\n" + state.worldDescription);
  if (state.pronounRules) p.push("XƯNG HÔ:\n" + state.pronounRules);
  if (state.femaleCharacterDefinition) p.push("ĐỊNH NGHĨA CHUNG NHÂN VẬT NỮ — ÁP DỤNG CHO MỌI NHÂN VẬT NỮ:\n" + String(state.femaleCharacterDefinition).trim() + "\nAI tự xây dựng từng nhân vật nữ theo diễn biến truyện; không gán nguyên xi một nhân vật cho nhân vật khác; không tự đổi thông tin đã được truyện xác nhận.");
  if (state.currentStatus) p.push("CURRENT STATUS:\n" + state.currentStatus);
  if (state.directive) p.push("MỆNH LỆNH:\n" + state.directive);
  if (state.nextChapterHint) p.push("KẾ HOẠCH CHƯƠNG NÀY (người dùng viết — bám đúng thứ tự, không thêm tuyến khác; ý cuối là điểm kết chương; nếu mâu thuẫn MỆNH LỆNH thì MỆNH LỆNH thắng):\n" + state.nextChapterHint);
  if (state.advancedRules) p.push("QUY TẮC:\n" + state.advancedRules);
  if (state.mainCharProfile?.name) p.push("NHÂN VẬT CHÍNH (BẮT BUỘC xuất hiện, là trung tâm mọi chương, không đổi tên/nhầm sang NV khác):\n" + JSON.stringify(state.mainCharProfile));
  else if (state.mainPlot || state.worldSetting) p.push("⚠ CHƯA khai báo Nhân Vật Chính. Nếu Cốt Truyện/Bối Cảnh có nhắc tên nhân vật chính, PHẢI dùng đúng tên đó xuyên suốt, không tự đặt tên khác.");
  const chars = (state.characters || []).filter(c => !c.dead).slice(0, 18);
  if (chars.length) {
    p.push("CHARACTER DATABASE — CANON + TRẠNG THÁI:\n" + chars.map(c => {
      const core = c.coreIdentity && Object.keys(c.coreIdentity).length ? Object.entries(c.coreIdentity).filter(([,v])=>String(v||"").trim()).map(([k,v])=>k+":"+String(v)).join(" | ") : "";
      return `- ${c.name} [${c.tier || "supporting"}] | CANON:${core || "chưa xác lập"} | vai trò:${c.role || ""} | ở:${c.currentLocation || "?"} | thể:${c.physicalState || ""} | tâm:${c.mentalState || ""} | biết:${c.knowledge || ""}`;
    }).join("\n"));
  }
  if (Array.isArray(state.threads) && state.threads.length) {
    p.push("PLOT THREADS ĐANG MỞ:\n" + state.threads.filter(t => !["paid_off","abandoned","completed"].includes(t.status)).slice(0, 20).map(t => `- ${t.type}: ${t.desc} [${t.status}]`).join("\n"));
  }
  if (Array.isArray(state.foreshadowing) && state.foreshadowing.length) {
    p.push("伏イ / FORESHADOWING CHƯA GIẢI:\n" + state.foreshadowing.filter(f => !["paid_off","abandoned","resolved"].includes(f.status)).slice(-20).map(f => `- ${f.description} [${f.status}] từ ch${f.plantedChapter || "?"}`).join("\n"));
  }
  if (Array.isArray(state.timeline) && state.timeline.length) {
    p.push("TIMELINE GẦN ĐÂY:\n" + state.timeline.slice(-12).map(e => `- Ch${e.chapter}: ${e.summary}`).join("\n"));
  }
  return p.join("\n\n");
}
function recentContext(chapters) {
  if (!chapters.length) return "Đây là chương đầu tiên.";
  const last = chapters[chapters.length - 1];
  const prev = chapters.length > 1 ? chapters[chapters.length - 2] : null;
  return `${prev ? `CHƯƠNG TRƯỚC NỮA:\n${(prev.summary || prev.text || "").slice(0, 900)}\n\n` : ""}ĐOẠN CUỐI CHƯƠNG GẦN NHẤT:\n${(last.text || "").slice(-5000)}`;
}

/* ===== v10 Lorebook (đồng bộ với client) ===== */
function buildLoreBlock(state) {
  const cards = Array.isArray(state.lorebook) ? state.lorebook : [];
  if (!cards.length) return "";
  const text = (state.chapters || []).slice(-2).map(c => c.text || "").join("\n\n").slice(-12000) + "\n" + (state.directive || "") + "\n" + String(state.currentStatus || "").slice(0, 1500);
  const budget = Math.max(200, Number(state.loreBudgetTokens) || 2000);
  const hits = cards.filter(c => {
    if (c.enabled === false || !String(c.content || "").trim()) return false;
    if (c.always) return true;
    return String(c.keys || "").split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).some(k => { const re = loreCompileKey(k); return re && re.test(text); });
  }).sort((a, b) => (Number(b.priority) || 50) - (Number(a.priority) || 50));
  const parts = []; let used = 0;
  for (const c of hits) {
    const block = "• " + (c.name || "?") + ": " + String(c.content).trim();
    const t = Math.ceil(block.length / 3.2);
    if (used + t > budget) continue;
    used += t; parts.push(block);
  }
  return parts.length ? "THẺ TRI THỨC (Lorebook — bắt buộc tuân thủ khi nhân vật/đối tượng xuất hiện):\n" + parts.join("\n") : "";
}

// Dành riêng cho bước viết văn (chương mới + viết tiếp): không được ăn hết ngân sách 13.5 phút,
// phải để lại thời gian cho NV/Thế giới/Status/Memory chạy sau đó — đây là nguyên nhân gốc của
// "7/7 lô không đọc được" + "Status/Memory bỏ qua vì hết thời gian" khi chương dài phải viết-tiếp nhiều lần.
// V12.2: không để hậu xử lý cắt ngắn lượt viết. Nhánh trưởng thành cần nhiều lượt
// continuation hơn; vẫn giữ một khoảng đệm tối thiểu cho việc lưu kết quả và cập nhật state.
const NORMAL_POST_PROCESS_RESERVE_MS = 5 * 60 * 1000;
// V12.9: 90s cũ quá ngắn -> NV/Thế giới ăn gần hết, khiến Status/Memory/Scene/Gợi ý
// chương sau bị "BỎ QUA vì hết thời gian" gần như mỗi lần với chương 18+. Nâng lên 210s.
const MATURE_POST_PROCESS_RESERVE_MS = 210 * 1000;
// V12.23: bước "mở rộng cuối" viết lại cả chương (~9–10k token) nên cần ~4–5 phút; vòng viết tiếp phải dừng sớm để chừa thời gian đó,
// nếu không (như job vừa rồi) mở rộng cuối luôn bị "bỏ qua vì hết ngân sách thời gian".
const EXPAND_RESERVE_MS = 270 * 1000, EXPAND_MIN_START_MS = 150 * 1000;
const writeTimeLeft = (isMature = false) => timeLeft() - (isMature ? MATURE_POST_PROCESS_RESERVE_MS : NORMAL_POST_PROCESS_RESERVE_MS);

/* ===== V12.23: viết nền dùng ĐÚNG code dựng ngữ cảnh/prompt của viết thường =====
   Các hàm bên dưới (khối CLIENT-MIRROR) được sao nguyên văn từ index.html và đọc biến `state` toàn cục;
   worker gán bằng __setMirrorState(job.storyState) trước khi gọi. Phần liên quan giao diện chỉ là stub. */
let state = null;
function __setMirrorState(s) {
  // Client luôn có sẵn các danh sách này (state mặc định); worker bổ sung nếu job cũ/thiếu để code của viết thường không vỡ.
  ["arcs", "outlinePlans", "banWords", "glossaryLock", "characters", "locations", "items", "threads", "foreshadowing", "timeline", "knowledgeLedger", "characterCards", "lorebook", "chapters", "plotArchive"]
    .forEach(k => { if (s && !Array.isArray(s[k])) s[k] = []; });
  if (s && (!s.statusState || typeof s.statusState !== "object")) s.statusState = {};
  if (s && (!s.characterStateTracker || typeof s.characterStateTracker !== "object")) s.characterStateTracker = {};
  state = s;
}
let lastLoreInfo = null;
const $ID = () => null;
function renderLoreStatus() {}
// <<CLIENT-MIRROR:BEGIN>> (tự sinh từ index.html — KHÔNG sửa tay; chạy: node scripts/sync-shared.js)
function buildContextBlock(options){
  const contextOptions = options || {};
  const includeChapterInstructions = contextOptions.includeChapterInstructions !== false;
  /* Ngân sách ngữ cảnh — ưu tiên: status mới nhất + NV chính + đoạn nối; brief được chèn riêng đúng một lần khi viết chương. */
  const lines = [];
  const clip = (s, n) => {
    s = String(s || "");
    if(s.length <= n) return s;
    return s.slice(0, Math.floor(n*0.4)) + "\n[...]\n" + s.slice(-Math.floor(n*0.5));
  };

  /* Story bible — ngắn */
  const bible = buildStoryBibleSummary({ includeOtherRules:false });
  if(bible) lines.push(clip(bible, 1800));
  const rulesBlock = buildEffectiveRuleBlock();
  if(rulesBlock) lines.push(clip(rulesBlock, 2400));
  const contextConflicts = auditPromptInstructions();
  if(contextConflicts.length) lines.push("KIỂM TRA XUNG ĐỘT QUY TẮC TRƯỚC KHI GỌI AI:\n" + contextConflicts.map((x,i)=>(i+1)+". "+x).join("\n") + "\nGiữ nguyên canon/quan hệ/trạng thái đã xác nhận. Nếu không thể dung hòa mà không sửa canon, không tự bịa dữ kiện.");
  const loreTxt = loreForPrompt(); if(loreTxt) lines.push(loreTxt);

  const style = buildStyleBlock();
  if(style) lines.push("STYLE:\n" + clip(style, 900));

  const vocab = buildVocabularyBlock();
  if(vocab) lines.push(clip(vocab, 600));

  const arc = currentArc();
  if(arc) lines.push("ARC: " + arc.name + " — " + clip(arc.goal || "", 200));

  const outline = currentOutline();
  if(outline) lines.push("OUTLINE (" + outline.from + "–" + outline.to + "):\n" + clip(outline.content, 800));

  if(state.storyClock) lines.push("THỜI ĐIỂM: " + state.storyClock);

  /* Chỉ 3 summary gần — đủ chống lặp, không phình prompt */
  if(state.chapters.length){
    const recent = state.chapters.slice(-3);
    const startNum = state.chapters.length - recent.length + 1;
    const sumLines = recent.map((c,i)=>{
      const n = startNum + i;
      return "- Ch" + n + " (" + (c.title||"") + "): " + clip(c.summary || "(chưa tóm tắt)", 280);
    }).join("\n");
    lines.push("TÓM TẮT 3 CHƯƠNG GẦN:\n" + sumLines);
  }
  /* NV: bóc thẻ tự động, tối đa 5 thẻ cho mỗi prompt */
  const cardText = characterCardsForPromptV102((state.chapters.slice(-1)[0]?.text||"") + "\n" + (state.directive||""));
  if(cardText) lines.push("THẺ NHÂN VẬT KÍCH HOẠT (tối đa 5):\n" + clip(cardText, 2400));

  /* QUAN TRỌNG: danh sách nhân vật đã có trong truyện — nếu không liệt kê ở đây,
     model không biết họ tồn tại nên sẽ tự bịa nhân vật mới dù prompt cấm. */
  const rosterChars = relevantCharacters(22);
  if(rosterChars.length) lines.push("NHÂN VẬT ĐÃ CÓ TRONG TRUYỆN (BẮT BUỘC ưu tiên dùng lại, KHÔNG tạo mới nếu chưa cần):\n" + characterSummaryForPrompt(rosterChars));

  if(state.mainCharProfile && state.mainCharProfile.name){
    const mc = state.mainCharProfile;
    const mcParts = ["NHÂN VẬT CHÍNH (BẮT BUỘC xuất hiện và là trung tâm mọi chương): " + mc.name];
    if(mc.personality) mcParts.push("tính:"+clip(mc.personality, 120));
    if(mc.goals) mcParts.push("mục tiêu:"+clip(mc.goals, 120));
    if(mc.currentLocation) mcParts.push("ở:"+mc.currentLocation);
    if(mc.mentalState) mcParts.push("tâm lý:"+clip(mc.mentalState, 100));
    if(mc.physicalState) mcParts.push("thể trạng:"+clip(mc.physicalState, 100));
    lines.push(mcParts.join(" | "));
  } else if(state.mainPlot || state.worldSetting) {
    lines.push("⚠ CHƯA khai báo Nhân Vật Chính (tab Nhân Vật Chính) — nếu Cốt Truyện/Bối Cảnh có nhắc tên nhân vật chính, PHẢI dùng đúng tên đó xuyên suốt, không tự đặt tên khác.");
  }

  const activeLocs = state.locations.filter(l=>l.status === 'active').slice(-4);
  if(activeLocs.length) lines.push("ĐỊA ĐIỂM:\n" + activeLocs.map(l=>"- "+l.name+": "+clip(l.description, 100)).join("\n"));

  const activeItems = state.items.filter(it=>it.status === 'active').slice(-5);
  if(activeItems.length) lines.push("VẬT PHẨM:\n" + activeItems.map(it=>"- "+it.name+(it.owner?" (của "+it.owner+")":"")+": "+clip(it.description, 80)).join("\n"));

  const openThreads = state.threads.filter(t=>t.status!=='paid_off' && t.status!=='abandoned').slice(0, 6);
  if(openThreads.length) lines.push("THREADS:\n" + openThreads.map(t=>"- ["+t.type+"] "+clip(t.desc, 120)).join("\n"));

  const openForeshadowing = (state.foreshadowing||[]).filter(f=>!['paid_off','abandoned','resolved'].includes(f.status)).slice(-8);
  if(openForeshadowing.length) lines.push("FORESHADOWING CHƯA GIẢI:\n" + openForeshadowing.map(f=>"- "+clip(f.description,160)+" ["+(f.status||"seeded")+"]").join("\n"));
  const timeline = (state.timeline||[]).slice(-8);
  if(timeline.length) lines.push("TIMELINE GẦN:\n" + timeline.map(e=>"- Ch"+e.chapter+": "+clip(e.summary,160)).join("\n"));
  const knownFacts = (state.knowledgeLedger||[]).slice(-12);
  if(knownFacts.length) lines.push("KIẾN THỨC NHÂN VẬT:\n" + knownFacts.map(k=>"- "+k.character+" biết: "+clip(k.fact,140)).join("\n"));

  const sceneBlock = buildSceneHistoryBlock(4);
  if(sceneBlock) lines.push(clip(sceneBlock, 700));

  const consentBlock = buildConsentBlock();
  if(consentBlock) lines.push(clip(consentBlock, 400));

  if(state.currentStatus){
    const knownStatusChapter = Math.max(0, Number(state.lastStatusChapter) || 0);
    const latestCompletedChapter = (state.chapters || []).length;
    const statusIsStale = latestCompletedChapter > 0 && knownStatusChapter < latestCompletedChapter;
    const statusLabel = "CURRENT STATUS — mốc đã xác nhận: Ch" + (knownStatusChapter || "không rõ") + "; chương đã lưu: " + latestCompletedChapter + (statusIsStale ? " (CHƯA CẬP NHẬT ĐẾN CHƯƠNG MỚI NHẤT)" : " (đã khớp chương đã lưu)");
    lines.push(statusLabel + ":\n" + clip(state.currentStatus, 2800) + (statusIsStale ? "\nCẢNH BÁO ĐỘ MỚI: Đây là trạng thái tại mốc cũ, không được coi là hiện trạng tuyệt đối. Nếu khác với tóm tắt/đoạn kết của các chương mới hơn, ưu tiên diễn biến có bằng chứng trong chương mới hơn; không tự đoán các thay đổi chưa được xác nhận." : ""));
  } else if((state.chapters || []).length){
    lines.push("CURRENT STATUS: Chưa có bản trạng thái được xác nhận. Dựa vào tóm tắt và đoạn kết các chương đã lưu; không bịa trạng thái không có bằng chứng.");
  }
  const trackers=Object.values(state.characterStateTracker||{}).slice(-20);
  if(trackers.length) lines.push("CHARACTER STATE TRACKER:\n"+trackers.map(x=>"- "+x.name+" | Ch"+x.chapter+" | cấp:"+(x.powerLevel||"?")+" | vị trí:"+(x.location||"?")+" | sức khỏe:"+(x.health||"?")+" | vật phẩm:"+(x.itemsHeld||"?")+" | "+(x.dead?"đã chết":"còn sống")).join("\n"));
  if((state.glossaryLock||[]).length) lines.push("GLOSSARY LOCK:\n"+state.glossaryLock.map(x=>"- "+x).join("\n"));
  if((state.banWords||[]).length) lines.push("CẤM TỪ / ANTI-AI TROPES:\n"+state.banWords.slice(0,80).map(x=>"- "+x).join("\n"));
  if(includeChapterInstructions){
    if(state.directive) lines.push("CHỈ ĐẠO ĐANG ÁP DỤNG CHO CHƯƠNG NÀY (chèn nguyên văn một lần ở đây):\n" + String(state.directive).trim());
    if(state.nextChapterHint) lines.push("GỢI Ý ĐANG ÁP DỤNG CHO CHƯƠNG NÀY (chèn nguyên văn một lần ở đây):\n" + String(state.nextChapterHint).trim());
  }
  // Không tự động đưa autoNextChapterHint cũ vào prompt: trường này không có mã chương để xác nhận còn phù hợp hay không.

  const diffMap = { de:"Dễ thở.", vua:"Cân bằng.", kho:"Khó.", tan_khoc:"Tàn khốc." };
  lines.push("ĐỘ KHÓ: " + (diffMap[state.difficulty] || diffMap.vua));
  lines.push(matureFocusPrompt());
  if(state.mature && normalizeChapterMatureFocus(state.chapterMatureFocus) !== "none") lines.push("VĂN PHONG: nội dung trưởng thành chỉ xuất hiện trong phạm vi được chỉ định, không tự mở tuyến mới.");
  const descLevel = state.descriptionLevel || "balanced";
  lines.push("MỨC MIÊU TẢ: " + (DESCRIPTION_PROMPTS[descLevel] || DESCRIPTION_PROMPTS.balanced));
  if(state.mature) lines.push("MỨC 18+: " + (EXPLICIT_PROMPTS[state.explicitLevel] || EXPLICIT_PROMPTS.sensual));
  if(state.mature) lines.push(ageGuardPrompt(state));
  return lines.filter(Boolean).join("\n\n");
}

function buildEffectiveRuleBlock(){
  const sources = [
    { label: "Quy Tắc Nâng Cao", text: state.advancedRules || "" },
    { label: "Quy Tắc Khác", text: state.antagonist || "" }
  ];
  const seen = new Set(), kept = [];
  let removedDuplicates = 0, skippedDisabled = 0;
  for(const source of sources){
    const lines = String(source.text || "").split(/\r?\n/);
    for(const raw of lines){
      const line = String(raw || "").trim();
      if(!line) continue;
      if(promptRuleIsDisabled(line)){ skippedDisabled++; continue; }
      const key = normalizePromptRuleText(line);
      if(!key) continue;
      if(seen.has(key)){ removedDuplicates++; continue; }
      seen.add(key);
      kept.push("- [" + source.label + "] " + line);
    }
  }
  if(!kept.length) return "";
  const notes = [];
  if(removedDuplicates) notes.push("đã bỏ " + removedDuplicates + " dòng trùng sau chuẩn hóa");
  if(skippedDisabled) notes.push("đã bỏ " + skippedDisabled + " dòng được đánh dấu TẮT/OFF");
  return "QUY TẮC ĐANG ÁP DỤNG" + (notes.length ? " (" + notes.join("; ") + ")" : "") + ":\n" + kept.join("\n");
}

function normalizePromptRuleText(text){
  return String(text || "").normalize("NFC").toLocaleLowerCase("vi-VN")
    .replace(/^[\s>*•\-\d.)]+/, "")
    .replace(/[“”"'‘’`]/g, "")
    .replace(/[.,;:!?()[\]{}]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

function promptRuleIsDisabled(line){
  return /^\s*(?:\[\s*(?:tắt|off|disabled)\s*\](?:\s*[:：\-]|\s+|$)|(?:tắt|off|disabled)\s*[:：\-])/i.test(String(line || ""));
}

function _foldPromptAuditText(text){
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").toLocaleLowerCase("vi-VN").replace(/\s+/g, " ").trim();
}

function _promptConstraint(line){
  const raw = String(line || "").trim();
  if(!raw) return null;
  const f = _foldPromptAuditText(raw);
  // Điều kiện/ngoại lệ được giữ lại, không bị gắn nhãn xung đột máy móc.
  if(/ngoai brief|neu.{0,35}(brief|nguoi dung|menh lenh)|tru khi|unless|only if|tu tien|qua nhieu|thuc su can|co ly do|neu can|khi can|khong can thiet/.test(f)) return null;
  let topic = "";
  if(/nhan vat/.test(f) && /(moi|tao|them|gioi thieu|xuat hien)/.test(f)) topic = "nhân vật mới";
  else if(/(su kien|bien co|tuyen moi|arc moi|tuyen truyen moi)/.test(f) && /(moi|tao|them|mo|phat sinh|khong|cam|tranh|dung)/.test(f)) topic = "sự kiện/tuyến truyện mới";
  if(!topic) return null;
  const denied = /(?:^|[\s([{,:;])(?:không|cấm|đừng|tránh)(?=$|[\s,.;:!?)}\]])|\b(?:never|do not|must not)\b/i.test(raw);
  const mandatory = /\b(phai|bat buoc|hay|tuyet doi|must|add|create|introduce)\b/.test(f);
  if(denied) return {topic, polarity:"deny", text:raw};
  if(mandatory) return {topic, polarity:"allow", text:raw};
  return null;
}

function auditPromptInstructions(){
  const sources = [
    {label:"Quy Tắc Nâng Cao", text:state.advancedRules || ""},
    {label:"Quy Tắc Khác", text:state.antagonist || ""},
    {label:"Chỉ đạo chương", text:state.directive || ""},
    {label:"Gợi ý chương hiện tại", text:state.nextChapterHint || ""}
  ];
  const entries=[];
  for(const source of sources){
    const parts=String(source.text || "").split(/\r?\n|(?<=[.!?。！？])\s+/).map(x=>x.trim()).filter(Boolean);
    for(const part of parts){
      const c=_promptConstraint(part);
      if(c) entries.push({...c, source:source.label});
    }
  }
  const warnings=[], seen=new Set();
  for(let i=0;i<entries.length;i++) for(let j=i+1;j<entries.length;j++){
    const a=entries[i], b=entries[j];
    if(a.source===b.source || a.topic!==b.topic || a.polarity===b.polarity) continue;
    const key=[a.topic,a.source,b.source,a.text,b.text].sort().join("|");
    if(seen.has(key)) continue; seen.add(key);
    warnings.push("Có thể xung đột về " + a.topic + ": [" + a.source + "] “" + a.text.slice(0,220) + (a.text.length>220?"…":"") + "” ↔ [" + b.source + "] “" + b.text.slice(0,220) + (b.text.length>220?"…":"") + "”. Giữ nguyên canon/quan hệ/trạng thái đã xác nhận; chỉ thực hiện chỉ đạo cụ thể nếu không làm sai dữ kiện canon.");
  }
  return warnings;
}

function characterSummaryForPrompt(list){
  const cut = (s, n) => {
    s = String(s || "").trim();
    if(!s) return "";
    return s.length > n ? s.slice(0, n) + "…" : s;
  };
  return list.map(c=>{
    const parts = [c.name || "?"];
    if(c.dead) parts.push("[ĐÃ CHẾT]");
    if(c.tier) parts.push("["+c.tier+"]");
    if(c.role) parts.push("vai trò:"+cut(c.role, 50));
    if(c.relevanceToMC) parts.push("liên quan NVC:"+cut(c.relevanceToMC, 60));
    if(c.age) parts.push("tuổi:"+c.age);
    if(c.gender) parts.push(c.gender);
    if(c.occupation) parts.push("nghề:"+cut(c.occupation, 40));
    if(c.faction) parts.push("phe:"+cut(c.faction, 40));
    /* Ngoại hình / số đo — ƯU TIÊN (để cảnh 18+ bám hồ sơ) */
    if(c.height) parts.push("cao:"+cut(c.height, 30));
    if(c.bodyType) parts.push("dáng:"+cut(c.bodyType, 40));
    if(c.appearance) parts.push("ngoại hình:"+cut(c.appearance, 160));
    if(c.hair) parts.push("tóc:"+cut(c.hair, 40));
    if(c.eyes) parts.push("mắt:"+cut(c.eyes, 40));
    if(c.skin) parts.push("da:"+cut(c.skin, 40));
    if(c.scars) parts.push("sẹo:"+cut(c.scars, 40));
    if(c.tattoos) parts.push("xăm:"+cut(c.tattoos, 40));
    if(c.sexualExperience) parts.push("18+:"+cut(c.sexualExperience, 100));
    if(c.preferences) parts.push("kink:"+cut(c.preferences, 80));
    if(c.boundaries) parts.push("ranh:"+cut(c.boundaries, 60));
    if(c.personality) parts.push("tính:"+cut(c.personality, 70));
    if(c.goals) parts.push("mục tiêu:"+cut(c.goals, 60));
    if(c.secret) parts.push("bí mật:"+cut(c.secret, 60));
    if(c.weakness) parts.push("điểm yếu:"+cut(c.weakness, 40));
    if(c.fear) parts.push("sợ:"+cut(c.fear, 40));
    if(c.knowledge) parts.push("biết:"+cut(c.knowledge, 60));
    if(c.currentLocation) parts.push("ở:"+cut(c.currentLocation, 40));
    if(c.mentalState) parts.push("tâm:"+cut(c.mentalState, 50));
    if(c.physicalState) parts.push("thể:"+cut(c.physicalState, 50));
    if(c.attractionToMC) parts.push("cảmMC:"+cut(c.attractionToMC, 40));
    if(c.tensionWithMC) parts.push("căngMC:"+cut(c.tensionWithMC, 40));
    if(Array.isArray(c.relationships) && c.relationships.length){
      const relTxt = c.relationships.filter(r=>r.withName).slice(0,4).map(r=>
        r.withName + (r.stage ? "("+cut(r.stage,20)+")" : "") + (r.notes ? ":"+cut(r.notes,40) : "")
      ).join("; ");
      if(relTxt) parts.push("quan hệ:"+relTxt);
    }
    if(c.notes) parts.push("note:"+cut(c.notes, 50));
    if(c.lastAppearance != null) parts.push("ch"+c.lastAppearance);
    return "- " + parts.join(" | ");
  }).join("\n");
}

function buildStoryBibleSummary(options){
  const lines = [];
  const p = state.mainCharProfile;
  if(p && p.name){
    const parts = [p.name];
    if(p.age) parts.push("tuổi:"+p.age);
    if(p.gender) parts.push(p.gender);
    if(p.occupation) parts.push("nghề:"+p.occupation);
    if(p.height) parts.push("cao:"+p.height);
    if(p.bodyType) parts.push("dáng:"+p.bodyType);
    if(p.appearance) parts.push("ngoại hình:"+String(p.appearance).slice(0,200));
    if(p.hair) parts.push("tóc:"+p.hair);
    if(p.eyes) parts.push("mắt:"+p.eyes);
    if(p.skin) parts.push("da:"+p.skin);
    if(p.sexualExperience) parts.push("18+:"+String(p.sexualExperience).slice(0,120));
    if(p.preferences) parts.push("kink:"+String(p.preferences).slice(0,80));
    if(p.skills) parts.push("kỹ năng:"+p.skills);
    if(p.currentLocation) parts.push("ở:"+p.currentLocation);
    if(p.goals) parts.push("mục tiêu:"+p.goals);
    if(p.physicalState) parts.push("thể trạng:"+p.physicalState);
    if(p.mentalState) parts.push("tâm lý:"+p.mentalState);
    lines.push("NHÂN VẬT CHÍNH (BÁM HỒ SƠ — số đo/ngoại hình KHÔNG được bịa khác): " + parts.join(" | "));
  }
  if(state.mainPlot) lines.push("CỐT TRUYỆN: " + state.mainPlot);
  if(state.genre) lines.push("THỂ LOẠI: " + state.genre);
  if(state.worldSetting) lines.push("THẾ GIỚI: " + state.worldSetting);
  if(state.worldRules) lines.push("QUY TẮC THẾ GIỚI: " + state.worldRules);
  if(!(options && options.includeOtherRules === false) && state.antagonist) lines.push("QUY TẮC KHÁC: " + state.antagonist);
  if(state.worldDescription) lines.push("MIÊU TẢ THẾ GIỚI: " + state.worldDescription);
  if(state.pronounRules) lines.push("QUY TẮC XƯNG HÔ:\n" + state.pronounRules);
  if(state.storyBibleLocked) lines.push("(Story Bible đã KHÓA.)");
  return lines.join("\n");
}

function relevantCharacters(limit){
  limit = limit || 22;
  const recentText = normalizeName(state.chapters.slice(-4).map(c=> (c.text||"") + " " + (c.summary||"")).join(" "));
  const scored = state.characters.map(c=>{
    let score = 0;
    if(c.locked) score += 8;
    if(c.dead) score -= 15;
    if(c.tier === 'major') score += 7;
    if(c.tier === 'important') score += 5;
    if(c.tier === 'supporting') score += 2;
    if(c.tier === 'minor') score += 0.5;
    const nName = normalizeName(c.name);
    if(nName && recentText.includes(nName)) score += 10;
    if(c.lastAppearance!=null){
      const gap = state.chapters.length - c.lastAppearance;
      if(gap <= 1) score += 5;
      else if(gap <= 3) score += 3;
      else score += Math.max(0, 2 - gap*0.15);
    }
    if(c.attractionToMC || c.tensionWithMC) score += 1.5;
    return { c, score };
  });
  scored.sort((a,b)=> b.score - a.score);
  return scored.slice(0, limit).map(s=>s.c);
}

function extractCharacterCardsV102(text){
  const hay=normalizeName(text||"");
  const chars=state.characters||[];
  const scored=chars.map(c=>{
    const name=normalizeName(c.name);
    if(!name) return {c,score:-999};
    let score=0;
    if(hay.includes(name)) score+=20;
    if(c.tier==="major")score+=7; else if(c.tier==="important")score+=5; else if(c.tier==="supporting")score+=2;
    if(c.lastAppearance!=null && state.chapters.length-c.lastAppearance<=2)score+=5;
    return {c,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,Math.min(5,Number(state.tokenCapPerPrompt)||5));
  const cards=scored.map(({c})=>({
    id:c.id,name:c.name,keys:[c.name,c.alias,c.role,c.faction,c.currentLocation].filter(Boolean).join(", "),
    state:{location:c.currentLocation||"",physical:c.physicalState||"",mental:c.mentalState||"",dead:!!c.dead},
    profile:{appearance:c.appearance||"",personality:c.personality||"",goals:c.goals||""},
    updatedAt:Date.now()
  }));
  state.characterCards=cards;
  return cards;
}

function buildStyleBlock(){
  const s = state.styleBible || {};
  const parts = [];
  const povMap = { third_limited: "Ngôi 3 giới hạn", third_omniscient: "Ngôi 3 toàn tri", first: "Ngôi 1" };
  const tenseMap = { past: "Quá khứ", present: "Hiện tại" };
  if(s.pov) parts.push("NGÔI: " + (povMap[s.pov] || s.pov));
  if(s.tense) parts.push("THÌ: " + (tenseMap[s.tense] || s.tense));
  if(s.tone) parts.push("TÔNG: " + s.tone);
  if(s.extra) parts.push("VĂN PHONG: " + s.extra);
  if(s.sample) parts.push("ĐOẠN VĂN MẪU (bắt chước):\n\"\"\"\n" + s.sample + "\n\"\"\"");
  return parts.length ? parts.join("\n") : "";
}

function loreBuild(cards, text, budget){
  const hits = loreScan(cards, text).sort((a,b)=> (Number(b.c.priority)||50) - (Number(a.c.priority)||50));
  const parts = [], active = [], dropped = []; let used = 0;
  for(const h of hits){
    if(active.length >= 5){ dropped.push(h.c.name||"?"); continue; }
    const block = "• " + (h.c.name||"?") + ": " + String(h.c.content).trim();
    const t = estimateTokens(block);
    if(used + t > budget){ dropped.push(h.c.name||"?"); continue; }
    used += t; parts.push(block); active.push(h.c.name||"?");
  }
  return { text: parts.length ? "THẺ TRI THỨC (Lorebook — bắt buộc tuân thủ khi nhân vật/đối tượng xuất hiện):\n" + parts.join("\n") : "", active, dropped, used, total: cards.length, budget };
}

function loreScan(cards, text){
  const hits = [];
  for(const c of cards){
    if(c.enabled === false || !String(c.content||"").trim()) continue;
    if(c.always){ hits.push({ c, why:"luôn bật" }); continue; }
    for(const k of loreKeyList(c)){
      const re = loreCompileKey(k);
      if(re && re.test(text)){ hits.push({ c, why:k }); break; }
    }
  }
  return hits;
}

function loreScanText(){
  const recent = (state.chapters||[]).slice(-2).map(c=>c.text||"").join("\n\n").slice(-12000);
  return recent + "\n" + (state.directive||"") + "\n" + (state.currentStatus||"").slice(0,1500);
}

function loreCards(){ if(!Array.isArray(state.lorebook)) state.lorebook = []; return state.lorebook; }

function loreKeyList(c){ return String(c.keys||"").split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean); }

function loreCompileKey(k){
  const m = k.match(/^\/(.+)\/([a-z]*)$/i);
  try{
    if(m) return new RegExp(m[1], Array.from(new Set((m[2].replace(/[gy]/g,"")+"iu").split(""))).join(""));
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\s+/g,"\\s+");
    return new RegExp("(?:^|[^\\p{L}\\p{N}_])" + esc + "(?![\\p{L}\\p{N}_])", "iu");
  }catch(e){ return null; }
}

function loreForPrompt(){
  const budget = Math.max(200, Number(state.loreBudgetTokens) || 2000);
  lastLoreInfo = loreBuild(loreCards(), loreScanText(), budget);
  renderLoreStatus();
  return lastLoreInfo.text;
}

function buildSceneHistoryBlock(maxScenes){
  maxScenes = maxScenes || 5;
  if(!state.includeScenesInPrompt) return "";
  const scenes = (state.scenes || []).slice(-(Math.min(maxScenes || 6, 6)));
  if(!scenes.length) return "";
  const lines = scenes.map(s=>{
    const p = (s.participants||[]).join("&");
    return "Ch" + (s.chapter||"?") + " [" + p + "] " + (s.title||"") + " — intensity " + (s.intensity||0) + "/10" + (s.structure ? ", structure: " + s.structure : "") + (s.aftermath ? " → " + s.aftermath : "");
  });
  return "LỊCH SỬ CẢNH 18+ (KHÔNG lặp cấu trúc / lời thoại / chi tiết):\n" + lines.join("\n");
}

function buildConsentBlock(){
  const log = state.consentLog || [];
  if(!log.length) return "";
  const lines = log.slice(-8).map(c=> "Ch" + (c.chapter||"?") + ": " + (c.charA||"?") + " & " + (c.charB||"?") + " — " + (c.action||"") + (c.boundary ? " (ranh giới: " + c.boundary + ")" : ""));
  return "CONSENT LOG:\n" + lines.join("\n");
}

function matureFocusPrompt(){
  const f=normalizeChapterMatureFocus(state.chapterMatureFocus);
  if(f === "primary") return "TRỌNG TÂM TRƯỞNG THÀNH: PRIMARY. Chủ đề trưởng thành là một trọng tâm được người dùng chỉ định cho chương này. Chỉ triển khai trong phạm vi brief/mạch truyện đã có; không tự mở tuyến mới.";
  if(f === "secondary") return "TRỌNG TÂM TRƯỞNG THÀNH: SECONDARY. Chỉ sử dụng nội dung trưởng thành khi brief hoặc diễn biến hiện tại yêu cầu rõ. Không biến nó thành trọng tâm và không tự chèn cảnh chỉ để tăng nhiệt.";
  return "TRỌNG TÂM TRƯỞNG THÀNH: NONE. Tuyệt đối không tự chèn hoặc kéo dài nội dung trưởng thành trong chương này, kể cả khi mạch truyện trước đó có nội dung trưởng thành.";
}

function characterCardsForPromptV102(text){
  const cards=extractCharacterCardsV102(text);
  return cards.map(c=>"- "+c.name+" | vị trí:"+ (c.state.location||"?") +" | thể trạng:"+ (c.state.physical||"?")
    +" | tâm lý:"+ (c.state.mental||"?") +" | "+String(c.profile.appearance||"").slice(0,180)).join("\n");
}

function currentOutline(){
  const nextCh = state.chapters.length + 1;
  return state.outlinePlans.find(o => nextCh >= o.from && nextCh <= o.to) || null;
}

function currentArc(){ return state.arcs.find(a=>a.status==='active') || null; }

function buildVocabularyBlock(){ return buildVocabularyBlockFrom(state); }

function estimateTokens(text){ return text ? Math.ceil(text.length / 3.2) : 0; }

function storyControlPromptClient(){ return storyControlPrompt(state); }

function buildMainWritePrompt(o){
  const { chapterNumber, isRegen, regenIndex, regenMode, descPrompt, explicitPrompt, vocabBlock, usingNsfw, context, lastChapterEnding, recentFullText, olderSummaries, plan } = o;
  const regenInstructions = {
      full: "Viết lại toàn bộ chương với văn phong tự nhiên, không lặp ý cũ.",
      continuity: "Chỉ sửa lỗi continuity, giữ nguyên cốt truyện và giọng văn.",
      depth: "Giữ sự kiện, đào sâu nội tâm và phản ứng cơ thể.",
      describe: "Giữ sự kiện, TĂNG CƯỜNG miêu tả: ngoại hình nhân vật, không khí, giác quan, chi tiết nhỏ. Không lặp lại.",
      world: "Giữ cốt truyện, bổ sung world-building qua giác quan.",
      pacing: "Giữ sự kiện, cải thiện nhịp.",
      nsfw_rewrite: "Viết lại với chi tiết 18+ táo bạo, giác quan, nội tâm."
    };

  return [
    "BẮT BUỘC NGÔN NGỮ: 100% TIẾNG VIỆT CÓ DẤU. Không tiếng Anh/Trung/Nhật/Hàn.",
    "GIỌNG VĂN: Tự nhiên như người viết thật. Câu có nhịp, có chỗ ngắn chỗ dài, có khoảng lặng.",
    "",
    "Bạn là tiểu thuyết gia chuyên viết truyện dài kỳ tiếng Việt.",
    "BẮT BUỘC: Bạn đang viết CHƯƠNG THỨ " + chapterNumber + ".",
    "Truyện hiện có " + o.priorCount + " chương trước đó.",
    "",
    "🎨 " + descPrompt,
    "",
    "Bối cảnh:", context || "(chưa có — tự sáng tạo hợp lý)", "",
    storyControlPromptClient(), "",
    lastChapterEnding ? ("===== ĐOẠN KẾT CHƯƠNG TRƯỚC (PHẢI TIẾP NỐI) =====\n" + lastChapterEnding + "\n===== HẾT =====\n\nChương mới PHẢI bắt đầu từ việc tiếp nối trực tiếp đoạn kết trên.\nĐỊA ĐIỂM MỞ CHƯƠNG — KHÓA CỨNG: đoạn mở đầu PHẢI diễn ra ĐÚNG địa điểm, thời điểm và với đúng những người đang có mặt như trong đoạn kết chương trước (ví dụ chương trước kết ở biệt thự của A thì chương này vẫn bắt đầu ở biệt thự của A). Chỉ được chuyển địa điểm khi đoạn kết đã nói rõ nhân vật sắp rời đi/đến nơi khác, hoặc sau một câu chuyển cảnh rõ ràng (di chuyển + mốc thời gian). Tuyệt đối không nhảy sang nhà/phòng trọ/nơi ở của nhân vật khác ngay từ câu đầu.") : "",
    recentFullText ? ("\nChương gần (tránh lặp sự kiện / cấu trúc):\n" + recentFullText) : "",
    olderSummaries ? ("\nTÓM TẮT CHƯƠNG XA:\n" + olderSummaries) : "",
    plan ? ("\nKẾ HOẠCH CHƯƠNG " + chapterNumber + ":\n" + plan) : "",
    "\nNGÂN SÁCH SỰ KIỆN — BẮT BUỘC:",
    "- Toàn chương chỉ có 1–3 SỰ KIỆN CHÍNH. Không thêm sự kiện lớn thứ 4 dù còn dung lượng từ.",
    "- Các cảnh/beat nhỏ chỉ là bước triển khai, phản ứng hoặc hậu quả của 1–3 sự kiện chính; không được biến thành tuyến sự kiện mới.",
    "- Nếu chương cần dài hơn, hãy đào sâu diễn biến, đối thoại, nội tâm, nguyên nhân–hậu quả và chi tiết cảnh thay vì nhồi thêm biến cố.",
    "\nNHÂN VẬT PHỤ — BẮT BUỘC:",
    "- GIỚI HẠN CỨNG: TỐI ĐA 4 NHÂN VẬT CÓ TÊN RIÊNG xuất hiện TRỰC TIẾP (có lời thoại hoặc hành động cụ thể) trong toàn chương, tính cả nhân vật chính. Đám đông/người qua đường không tên không tính vào số này.",
    "- Nếu chương 1 hoặc mở đầu một arc mới cần giới thiệu bối cảnh, KHÔNG dồn hết dàn nhân vật vào 1 chương — chỉ giới thiệu những ai TRỰC TIẾP tham gia 1-3 sự kiện chính của CHƯƠNG NÀY; người còn lại để dành cho chương sau.",
    "- Ưu tiên sử dụng nhân vật đã tồn tại trong hồ sơ truyện (xem mục NHÂN VẬT ĐÃ CÓ TRONG TRUYỆN ở Bối cảnh phía trên); không tùy tiện tạo nhân vật quan trọng mới.",
    "- Mỗi nhân vật xuất hiện phải có LÝ DO rõ ràng và VAI TRÒ cụ thể đối với một trong 1–3 sự kiện chính.",
    "- Nếu một nhân vật mới không thực sự cần cho cốt truyện, KHÔNG được tạo chỉ để lấp cảnh, đối thoại hoặc làm nền.",
    "- Nhân vật mới có vai trò quan trọng chỉ được xuất hiện khi kế hoạch đã chứng minh nhu cầu cốt truyện; nếu không có trong kế hoạch, không tự ý nâng một nhân vật mới thành nhân vật quan trọng.",
    "- TRƯỚC KHI VIẾT: tự đếm lại số nhân vật có tên riêng dự kiến xuất hiện; nếu quá 4, cắt bớt hoặc chuyển bớt sang không tên.",
    (relevantCharacters(1).length === 0) ? "- CHƯA CÓ NHÂN VẬT PHỤ NÀO ĐƯỢC KHAI BÁO TRƯỚC. Nếu cảnh cần người ngoài NVC, ưu tiên nhân vật KHÔNG TÊN RIÊNG (chức danh chung: 'người gác cổng', 'cô gái lạ mặt', 'một thương nhân'...). CHỈ đặt tên riêng cho một nhân vật mới khi họ thực sự sẽ quay lại các chương sau; nếu đặt tên, phải cho họ vai trò/lý do rõ ràng." : "",
    isRegen ? ("\nVIẾT LẠI chương " + chapterNumber + ". Chế độ: " + (regenInstructions[regenMode]||regenInstructions.full)) : "",
    vocabBlock ? ("\n" + vocabBlock) : "",
    "",
    "ĐỘ DÀI & TỰ DO SÁNG TÁC: mục tiêu " + (state.minChapterWords || 5000) + " từ, tối thiểu " + Math.round((state.minChapterWords || 5000) * 0.95) + " từ. GỢI Ý/BRIEF LÀ XƯƠNG SỐNG, không phải kịch bản từng câu: bạn được TỰ DO sáng tác phần thân chương — thêm cảnh phụ, chuyển cảnh, hội thoại, nội tâm, cảm xúc, phản ứng, giác quan, hành động nhỏ, nguyên nhân–hậu quả, các nhịp nhỏ bên trong sự kiện — để chương tự nhiên và dài. Mỗi ý/nhịp trong brief phải thành MỘT CẢNH ĐẦY ĐỦ (bối cảnh, hành động, thoại, phản ứng, hệ quả), không tóm tắt, không nhảy cóc thời gian. Mọi cảnh phụ phải mang thông tin/cảm xúc/quyết định/thế chủ động MỚI; không lặp ý, không độn chữ. GIỚI HẠN: chỉ các sự kiện chính có trong brief, không thêm biến cố lớn ngoài brief; không phá canon; không mở arc lớn, không thêm nhân vật quan trọng mới, không tiết lộ thông tin để dành chương sau, không đổi hướng truyện. ENDING ANCHOR (điểm kết của brief) là điểm đích DUY NHẤT bắt buộc: chỉ chạm tới ở ĐOẠN CUỐI sau khi đã đủ độ dài; viết xong thì DỪNG HẲN.",
    "CHỐNG LẶP: Không lặp sự kiện, cách giải quyết, cấu trúc, cụm từ, hình ảnh đã dùng.",
    state.pronounRules ? ("\nQUY TẮC XƯNG HÔ:\n" + state.pronounRules) : "",
    usingNsfw ? ("\n" + EROTIC_STYLE_PROMPT) : "",
    usingNsfw ? ("\nMỨC 18+ BẮT BUỘC: " + explicitPrompt) : "",
    state.mature && !usingNsfw ? "Văn phong trưởng thành được phép." : "",
    "",
    o.proseOnly ? "QUY TẮC ĐẦU RA: CHỈ viết văn xuôi của chương; tên chương do hệ thống quản lý riêng." : "QUY TẮC TIÊU ĐỀ: Chỉ TÊN CHƯƠNG tiếng Việt, KHÔNG chữ 'Chương', KHÔNG số.",
    "",
    "===== NHẮC LẠI =====",
    "1. 100% TIẾNG VIỆT CÓ DẤU.",
    o.proseOnly ? "2. Chỉ văn xuôi của chương, không tiêu đề." : "2. Tiêu đề tiếng Việt, không chữ 'Chương', không số.",
    "3. Tiếp nối liền mạch từ đoạn kết chương trước.",
    "4. Xưng hô nhất quán.",
    "5. Không lặp ý, không lặp câu.",
    ((state.directive || state.nextChapterHint) ? "6. SỰ KIỆN: đúng các nhịp trong brief, mỗi nhịp phải viết đủ dài; không thêm biến cố lớn ngoài brief." : "6. MỖI CHƯƠNG CHỈ 1–3 SỰ KIỆN CHÍNH; không nhồi biến cố mới ngoài ngân sách."),
    "7. MỖI NHÂN VẬT XUẤT HIỆN PHẢI CÓ LÝ DO + VAI TRÒ; ưu tiên nhân vật đã có ở danh sách NHÂN VẬT ĐÃ CÓ TRONG TRUYỆN phía trên, không tùy tiện tạo nhân vật quan trọng mới.",
    "8. MIÊU TẢ: khi nhân vật mới xuất hiện hoặc cảnh mới mở, TẢ ngoại hình + không khí qua chi tiết cụ thể.",
    "9. BỐ CỤC: chia thành nhiều đoạn ngắn 2–4 câu (tối đa ~90 từ/đoạn), các đoạn cách nhau MỘT DÒNG TRỐNG. Mỗi lượt thoại nằm trên MỘT ĐOẠN RIÊNG (mở bằng dấu “ hoặc —). Đổi cảnh/đổi người nói/đổi nhịp thì xuống đoạn mới. TUYỆT ĐỐI không viết một khối văn liền dài.",
    state.directive ? ("===== BRIEF NGƯỜI DÙNG — ƯU TIÊN CAO NHẤT =====\nMỆNH LỆNH TOÀN VẸN (KHÔNG ĐƯỢC CẮT):\n" + String(state.directive) + "\n===== HẾT MỆNH LỆNH =====") : "",
    state.nextChapterHint ? ("===== GỢI Ý NGƯỜI DÙNG — PHẢI BÁM ĐẦY ĐỦ =====\n" + String(state.nextChapterHint) + "\n===== HẾT GỢI Ý =====") : "",
    (state.directive || state.nextChapterHint) ? [
      "QUY TẮC BÁM BRIEF NGƯỜI DÙNG:",
      "- Phải thực hiện ĐẦY ĐỦ từng yêu cầu, chi tiết, hành động và mốc mà người dùng đã ghi; không được bỏ qua chỉ vì kế hoạch tự tạo khác.",
      "- Nếu người dùng nêu KHÚC ĐẦU và KHÚC KẾT của cùng một cảnh, hai điểm đó là ANCHOR BẮT BUỘC. Viết cầu nối giữa chúng nhưng không được đổi điểm bắt đầu hoặc điểm kết thúc.",
      "- Được thêm cảnh phụ, thoại, nội tâm, chi tiết đời thường bên trong các sự kiện của brief. Không tự mở tuyến truyện mới, không thêm mục tiêu phụ lớn, không thêm biến cố lớn, không đưa nhân vật mới quan trọng vào nếu brief không yêu cầu.",
      "- Không dùng phần bối cảnh/threads/foreshadowing để lấn át brief. Những thứ đó chỉ dùng để giữ continuity khi không mâu thuẫn.",
      "- Đạt độ dài bằng cách đào sâu diễn biến bên trong brief (không bơm tuyến khác, không kéo dài hậu cảnh sau điểm kết). Chỉ kết khi đã đủ độ dài VÀ đã tới Ending Anchor; viết xong anchor thì dừng.",
      "- Trước khi kết thúc, tự kiểm tra: (1) đã triển khai đủ các điểm người dùng yêu cầu chưa; (2) đã đi tới mốc kết thúc chưa; (3) có tự thêm tuyến/nhân vật/biến cố ngoài brief không."
    ].join("\n") : "",
    buildLengthPlan(state.nextChapterHint || state.directive, (state.minChapterWords || 5000)),
    (state.mainCharProfile && state.mainCharProfile.name) ? ("10. NHÂN VẬT CHÍNH BẮT BUỘC LÀ TRUNG TÂM CHƯƠNG NÀY: " + state.mainCharProfile.name + (state.mainCharProfile.appearance ? (" — " + String(state.mainCharProfile.appearance).slice(0,150)) : "") + ". TUYỆT ĐỐI không viết chương mà thiếu hẳn nhân vật này, và không đổi tên/nhầm sang nhân vật khác.") : "",
    usingNsfw ? "7. CẢNH 18+ ƯU TIÊN CAO NHẤT — đủ 4 lớp: cơ thể (số đo hồ sơ) + cảm giác thể xác + nội tâm đa lớp + âm thanh/nhịp. Cấm chỉ kể hành động bên ngoài. Cấm bỏ cảm giác và nội tâm." : "7. (không có yêu cầu 18+ đặc biệt)",
    ...(o.proseOnly ? ["8. Định dạng: CHỈ văn xuôi của chương — KHÔNG xuất 'TIÊU ĐỀ:', 'NỘI DUNG:', markdown, ghi chú hay lời giải thích."] : ["8. Định dạng:", "TIÊU ĐỀ: <tên chương>", "NỘI DUNG:", "<toàn bộ chương>"])
  ].filter(Boolean).join("\n");
}
// <<CLIENT-MIRROR:END>>

// ===== V12 Writing Engine =====

/* V12.20 — Tự sửa từ lỗi ghép: gửi các CÂU chứa từ lỗi cho model, nhận lại câu đã sửa, chỉ nhận nếu bỏ từ lỗi và giữ phần lớn từ còn lại. */
async function fixStrayWordsWithAI(job, text, allowNames, model, isNsfw) {
  const res = { text, fixed: 0, samples: [] };
  try {
    let cur = String(text || "");
    for (let round = 0; round < 2; round++) {
      if (writeTimeLeft(isNsfw) < 45000) break;
      const stray = findStrayWords(cur, allowNames, 40).filter(w => _hasVnDiacritic(w) || w[0] === w[0].toLowerCase());
      if (!stray.length) break;
      const items = locateWordSentences(cur, stray).slice(0, 30);
      if (!items.length) break;
      const lines = items.map((it, i) => `${i + 1}) Từ lỗi: "${it.word}"${it.extra ? " + " + it.extra.map(x => '"' + x + '"').join(", ") : ""}\n   Ngay trước đó: ${it.before || "(đầu đoạn)"}\n   Câu lỗi: ${it.sentence.replace(/\n+/g, " ")}`);
      const prompt = [
        "Đây là các câu trong một truyện tiếng Việt. Mỗi câu có một từ bị LỖI SINH CHỮ (model ghép nhầm âm tiết tiếng Việt với chữ tiếng Anh/ký tự lạ, ví dụ \"mươititude\", \"bănnton\").",
        "NHIỆM VỤ: viết lại ĐÚNG câu đó, CHỈ thay từ lỗi bằng từ/cụm tiếng Việt tự nhiên đúng ý câu (suy từ ngữ cảnh). Giữ nguyên mọi chữ khác, tên riêng, dấu câu, giọng văn. Không thêm ý, không bỏ ý, không giải thích.",
        "Trả về mỗi câu một dòng đúng định dạng:  số|câu đã sửa   (một dòng cho mỗi câu, giữ nguyên số thứ tự).",
        "", lines.join("\n")
      ].join("\n");
      const r = await callExtract({ endpoint: job.apiEndpoint, apiKey: job.apiKey, model, messages: [{ role: "user", content: prompt }], maxTokens: Math.min(4000, 400 + items.length * 220), temperature: 0.2 }, 1);
      const map = new Map();
      String(r.text || "").split(/\n+/).forEach(l => { const m = l.match(/^\s*(\d+)\s*[|)\]:.]\s*(.+)$/); if (m) map.set(Number(m[1]), m[2].trim()); });
      let out = cur, any = 0;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i], fixed = map.get(i + 1);
        if (!fixed) continue;
        const bads = [it.word].concat(it.extra || []);
        if (!acceptWordFix(it.sentence, fixed, bads)) continue;
        out = out.slice(0, it.start) + fixed + out.slice(it.end);
        any++; res.fixed++; if (res.samples.length < 3) res.samples.push(it.word);
      }
      cur = out;
      if (!any) break;
    }
    res.text = cur;
  } catch (e) { /* sửa lỗi chữ là phần phụ: lỗi thì giữ nguyên văn bản */ }
  return res;
}


/* V12.20 — Khép câu cuối bị cụt: nhờ model viết nốt 1–3 câu; nếu không được thì lùi về câu hoàn chỉnh gần nhất. */
async function closeDanglingEnding(job, text, closingBeat, model, isNsfw) {
  const base = String(text || "").replace(/\s+$/, "");
  if (writeTimeLeft(isNsfw) > 40000) {
    try {
      const prompt = [
        "Đoạn cuối của chương truyện dưới đây bị CỤT giữa câu (hết dung lượng/đứt kết nối).",
        "Viết NỐT đúng từ chỗ cụt: bắt đầu bằng phần còn thiếu của chính câu đang dở (KHÔNG chép lại phần đã có), hoàn tất câu rồi khép chương trong tổng cộng 1–3 câu ngắn. Không thêm sự kiện, nhân vật hay cảnh mới; không tóm tắt; không giải thích.",
        closingBeat ? ("Người dùng muốn chương kết ở: " + closingBeat + "\n(Chỉ dùng nếu câu dở đang dẫn tới đó; nếu ý đó đã được viết rồi thì chỉ hoàn tất câu và dừng.)") : "",
        "ĐOẠN CUỐI:", base.slice(-1800),
        "Chỉ trả về phần viết nốt."
      ].filter(Boolean).join("\n\n");
      const r = await callWithRetry({ endpoint: job.apiEndpoint, apiKey: job.apiKey, model, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }], maxTokens: 500, temperature: 0.5, totalMs: 60000, creative: true }, 1);
      let add = stripForeign(stripThinkingOutput(String(r.text || "").trim()));
      add = add.replace(/^\s*(?:\.\.\.|…)\s*/, "").trim();
      if (add && add.length < 900 && !detectNonVietnamese(add)) {
        const sep = /\s$/.test(text) || /^[,.!?…;:”"’')]/.test(add) ? "" : " ";
        const joined = base + sep + add;
        if (endsCleanly(joined)) return { text: joined, how: "ai" };
        const tr = trimToLastSentence(joined, 0.6);
        if (tr.cut || endsCleanly(tr.text)) return { text: tr.text, how: "ai" };
      }
    } catch (_) {}
  }
  const tr = trimToLastSentence(base, 0.5);
  return { text: tr.text, how: tr.cut ? "trim" : "none" };
}

// V8-inspired prose path: temperature 0.82, no repetition penalties, prose-only output, style-lock continuation.
async function generateOneChapter(job) {
  const state = job.storyState;
  const chapters = Array.isArray(state.chapters) ? state.chapters : [];
  const chapterNumber = chapters.length + 1;
  const { target: minWords, hardMax: maxWords } = chapterWordLimits(state);
  const lastTail = ((chapters[chapters.length - 1] && chapters[chapters.length - 1].text) || "").slice(-1800);
  const nsfwSources = [
    state.directive || "",
    state.nextChapterHint || "",
    lastTail,
    (chapters[chapters.length - 1] && chapters[chapters.length - 1].title) || ""
  ].join("\n");
  const hotKeyword = textHasNsfwKeyword(nsfwSources);
  // V12.1 FIX: model NSFW là cấu hình job, không phụ thuộc việc client có giữ
  // modelNsfw trong storyState hay không. Điều này đặc biệt quan trọng với background job.
  const routingNsfwModel = String(job.modelNsfw || state.modelNsfw || "").trim();
  const matureFocus = normalizeChapterMatureFocus(state.chapterMatureFocus);
  // NONE luôn thắng mọi auto-detect: không được tự chèn nội dung trưởng thành.
  let isNsfw = matureFocus !== "none" && !!job.forceNsfw && !!routingNsfwModel;
  if (!isNsfw && matureFocus !== "none" && state.mature && state.nsfwMode !== "never" && routingNsfwModel && hotKeyword) {
    isNsfw = true;
  }
  // SECONDARY chỉ chuyển model khi có tín hiệu rõ từ brief/mệnh lệnh; PRIMARY mới dùng thêm heat detection.
  if (!isNsfw && matureFocus === "primary" && state.nsfwMode === "auto" && state.mature && routingNsfwModel && timeLeft() > 90000) {
    const heat = await detectHeatLevel(job, lastTail, state.nextChapterHint, state.directive);
    const threshold = Number(state.nsfwAutoThreshold) || 6;
    if (heat >= threshold) isNsfw = true;
  }
  const model = isNsfw ? (routingNsfwModel || job.model) : job.model;
  const hasBrief = !!(String(state.directive || "").trim() || String(state.nextChapterHint || "").trim());
  const closingBeat = extractClosingBeat(state.nextChapterHint) || extractClosingBeat(state.directive);
  // V12.23: GIỐNG VIẾT THƯỜNG — cùng hàm dựng ngữ cảnh (buildContextBlock), tóm tắt/đoạn gần (buildRecentBlocks),
  // bước lập kế hoạch chương (buildChapterPlanPrompt) và prompt chính (buildMainWritePrompt, chế độ proseOnly) của index.html.
  __setMirrorState(state);
  const mirrorContext = buildContextBlock({includeChapterInstructions:false});
  const recentBlocks = buildRecentBlocks(chapters);
  let chapterPlan = "";
  if (writeTimeLeft(isNsfw) > 150000) {
    try {
      const planPrompt = buildChapterPlanPrompt({ chapterNumber, context: mirrorContext, recent: recentBlocks.recentFullText, directive: state.directive, hint: state.nextChapterHint,
        mainCharName: state.mainCharProfile && state.mainCharProfile.name, storyControl: storyControlPrompt(state) });
      const pr = await callExtract({ endpoint: job.apiEndpoint, apiKey: job.apiKey, model: job.model, messages: [{ role: "user", content: planPrompt }], maxTokens: 1400, temperature: 0.45 }, 1);
      chapterPlan = String(pr.text || "").trim();
    } catch (_) { chapterPlan = ""; }
  }
  const mainPromptCore = buildMainWritePrompt({
    chapterNumber, isRegen: false, regenIndex: 0, regenMode: "full",
    descPrompt: DESCRIPTION_PROMPTS[state.descriptionLevel] || DESCRIPTION_PROMPTS.balanced,
    explicitPrompt: EXPLICIT_PROMPTS[state.explicitLevel] || EXPLICIT_PROMPTS.sensual,
    vocabBlock: buildVocabularyBlock(), usingNsfw: isNsfw,
    context: mirrorContext, lastChapterEnding: chapters.length ? String(chapters[chapters.length - 1].text || "").slice(-1000) : "",
    recentFullText: recentBlocks.recentFullText, olderSummaries: recentBlocks.olderSummaries, plan: chapterPlan,
    priorCount: chapters.length, proseOnly: true
  });
  const prompt = [
    mainPromptCore,
    (isNsfw && !state.mature) ? ageGuardPrompt(state) : "",   // buildContextBlock (như viết thường) đã tự thêm rào chắn tuổi khi state.mature
    closingBeat ? ("CÚ CHỐT BẮT BUỘC LÀ CÂU/CẢNH CUỐI CÙNG CỦA CHƯƠNG: " + closingBeat + "\nCâu cuối chương phải là câu hoàn chỉnh, kết thúc bằng dấu câu.") : ""
  ].filter(Boolean).join("\n\n");

  // V12.2: nhánh trưởng thành có ngân sách output lớn hơn để không bị cụt sau một đoạn.
  const writeLeft = writeTimeLeft(isNsfw);
  const mainMaxTokens = isNsfw ? 24000 : 16000;
  const mainCallBudget = Math.max(60000, Math.min(480000, writeLeft - 15000));
  let result = await callWithRetry({ endpoint: job.apiEndpoint, apiKey: job.apiKey, model, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }], maxTokens: mainMaxTokens, temperature: 0.85, frequencyPenalty: isNsfw ? 0.25 : 0.45, presencePenalty: isNsfw ? 0.25 : 0.35, totalMs: mainCallBudget, creative: true }, 2);
  // V12: prose-only output; strip legacy labels if a model still emits them.
  let text = String(result.text || "").trim();
  text = text.replace(/^\s*(?:TIÊU ĐỀ|TITLE)\s*:\s*[^\n]+\n+/i, "");
  text = text.replace(/^\s*NỘI DUNG\s*:\s*/i, "").trim();

  // V12.3: nếu model chèn chữ Hán/Nhật/Hàn/Cyrillic, yêu cầu viết lại bằng tiếng Việt.
  if (detectNonVietnamese(text) && writeTimeLeft(isNsfw) > 60000) {
    try {
      const retry = await callWithRetry({
        endpoint: job.apiEndpoint, apiKey: job.apiKey, model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt + "\n\nCẢNH BÁO NGÔN NGỮ: Bản nháp vừa rồi có ngôn ngữ ngoài tiếng Việt. Viết lại toàn bộ, BẮT BUỘC 100% TIẾNG VIỆT CÓ DẤU; không dùng chữ Hán/Nhật/Hàn/Cyrillic; giữ nguyên cốt truyện và sự kiện." }],
        maxTokens: mainMaxTokens, temperature: 0.72, totalMs: Math.max(45000, Math.min(240000, writeTimeLeft(isNsfw) - 10000)), creative: true
      }, 1);
      if (retry.text && retry.text.trim()) text = String(retry.text).trim();
    } catch (_) {}
  }
  { const dd = dedupeRepeatedScene(text); if (dd.length < text.length) { text = dd; } }
  const initialCap = trimToWordLimit(text, maxWords);
  text = initialCap.text;
  const title = String(state.chapterTitle || state.currentChapterTitle || `Chương ${chapterNumber}`).trim() || `Chương ${chapterNumber}`;
  let truncated = result.finishReason === "length";
  const issues = [];
  let attempts = 0;
  const _sc = normalizeStoryControl(state);
  const control = { focus: matureFocus, maxMainEvents: _sc.maxMainEvents, maxNamedCharacters: _sc.maxNamedCharacters, noRetcon: _sc.noRetcon };

  // V12.2: nếu là nhánh trưởng thành, cho phép tối đa 8 lượt nối tiếp bất kể cấu hình cũ
  // chỉ đặt 4. Mỗi lượt vẫn dùng chính model đã route ở trên.
  const configuredAttempts = Number(state.autoContinueMax) || 4;
  // V12.23: số lượt viết thêm = ĐÚNG số Auto-continue người dùng đặt (không còn ép tối thiểu 4 cho 18+).
  const maxAttempts = Math.max(0, Math.min(8, configuredAttempts));
  // V12.20: có gợi ý/mệnh lệnh thì CHỈ viết tiếp khi model bị cắt giữa chừng (hết token/đứt kết nối).
  // Trước đây bản nền thấy chưa đủ số từ là tự gọi "Viết TIẾP" không kèm gợi ý -> model hết ý nên bịa cảnh mới.
  const loopGoal = hasBrief ? Math.round(minWords * 0.95) : minWords;
  let insertUsed = 0;
  const failAttempt = (why) => issues.push(`Viết tiếp #${attempts}: ${why}`);
  while ((countWords(text) < loopGoal || (closingBeat && !endingAnchorReached(text, closingBeat))) && countWords(text) < maxWords) {
    if (attempts >= maxAttempts) { issues.push(`Auto-continue dừng vì đã dùng hết ${maxAttempts}/${maxAttempts} lượt (còn ${countWords(text)}/${minWords} từ)`); break; }
    // V12.22: có gợi ý + model đã kết (không bị cắt) mà còn ngắn -> CHÈN thêm diễn biến vào TRƯỚC đoạn kết, giữ nguyên Ending Anchor.
    const insertMode = hasBrief && !truncated;
    if (attempts >= 1 && countWords(text) >= minWords * 0.6 && writeTimeLeft(isNsfw) < EXPAND_RESERVE_MS) { issues.push(`Dừng viết tiếp sớm ở ${countWords(text)}/${minWords} từ (còn ${Math.round(writeTimeLeft(isNsfw) / 1000)}s) để dành thời gian cho bước mở rộng cuối`); break; }
    if (writeTimeLeft(isNsfw) < 30000) { issues.push("Dừng viết tiếp vì hết ngân sách thời gian của job"); break; }
    attempts++;
    const current = countWords(text);
    const tail = text.slice(-5000);
    const _short = Math.min(minWords - current, maxWords - current);
    const need = Math.max(insertMode ? 400 : 800, Math.ceil(_short / Math.max(1, maxAttempts - attempts + 1)));
    let ins = null;
    if (insertMode) {
      insertUsed++;
      const ps = String(text).split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
      let k = ps.length, ew = 0;
      while (k > 1 && ew < 150 && ps.length - k < 4) { k--; ew += countWords(ps[k]); }
      if (k < 1) k = 1;
      ins = { body: ps.slice(0, k).join("\n\n"), ending: ps.slice(k).join("\n\n") };
      if (!ins.body || !ins.ending) { failAttempt("không tách được đoạn kết để chèn diễn biến"); break; }
    }
    const insertPrompt = ins ? [
      `CHÈN THÊM DIỄN BIẾN vào GIỮA chương ${chapterNumber}. Chương hiện ${current} từ, cần thêm khoảng ${need} từ. Mục tiêu ${minWords} từ, tuyệt đối không vượt ${maxWords} từ.`,
      "Bản nháp hiện đã đi tới đoạn kết quá nhanh. Hãy viết PHẦN NỐI nằm GIỮA 'ĐOẠN TRƯỚC' và 'ĐOẠN KẾT': thêm cảnh phụ, chuyển cảnh, hội thoại, nội tâm, phản ứng, giác quan, hành động nhỏ, nguyên nhân–hậu quả; mỗi nhịp phải mang thông tin/cảm xúc/quyết định MỚI, không lặp ý, không độn chữ.",
      "CẤM: viết lại hoặc tóm tắt nội dung đã có; viết nội dung của đoạn kết; kết chương; thêm biến cố lớn, nhân vật quan trọng mới, arc mới, thông tin để dành chương sau. Câu cuối của phần nối phải dẫn tự nhiên vào câu đầu của đoạn kết.",
      storyControlPrompt(state),
      (state.directive || state.nextChapterHint) ? ("KẾ HOẠCH CỦA NGƯỜI DÙNG:\n" + [state.directive ? ("MỆNH LỆNH: " + String(state.directive).trim()) : "", state.nextChapterHint ? ("GỢI Ý: " + String(state.nextChapterHint).trim()) : ""].filter(Boolean).join("\n") + (closingBeat ? ("\nENDING ANCHOR: " + closingBeat) : "")) : "",
      "ĐOẠN TRƯỚC (đã viết; giữ giọng văn, nhịp câu, POV, thì kể, xưng hô):", ins.body.slice(-3500),
      "ĐOẠN KẾT (đã viết, sẽ nằm NGAY SAU phần bạn viết; KHÔNG viết lại):", ins.ending,
      "Chỉ trả văn xuôi của phần nối, bắt đầu ngay sau câu cuối của ĐOẠN TRƯỚC."
    ].filter(Boolean).join("\n\n") : "";
    try {
      const cont = await callWithRetry({
        endpoint: job.apiEndpoint, apiKey: job.apiKey, model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: ins ? insertPrompt : [
          `Viết TIẾP chương ${chapterNumber}. Hiện ${current} từ, cần thêm khoảng ${need} từ. Mục tiêu ${minWords} từ, tuyệt đối không vượt ${maxWords} từ.`,
          endingGateInstruction(closingBeat),
          "Bắt đầu ngay sau câu cuối. Không tóm tắt, không mở chương mới, không lặp.",
          closingBeat && !endingAnchorReached(text, closingBeat)
            ? "QUAN TRỌNG: số từ hiện tại đã có thể đủ nhưng Ending Anchor CHƯA đạt. Không được tự kết chương; phải tiếp tục tới đúng mốc kết."
            : "Nếu Ending Anchor đã hoàn thành thì dừng ngay, không viết hậu cảnh thêm.",
          isNsfw
            ? "Đây là continuation của cùng một cảnh trưởng thành đã được chọn đúng model. Giữ nguyên mạch, nhịp, POV, xưng hô và trạng thái nhân vật; không tự chuyển sang cảnh mới chỉ vì đã viết được một đoạn. Tiếp tục cho đến khi đạt mục tiêu độ dài hoặc model thực sự hết output."
            : (current < minWords * 0.85
              ? `Chương còn THIẾU NHIỀU (${current}/${minWords} từ): hãy viết tiếp diễn biến mới hợp lý, liền mạch (cảnh, hội thoại, nội tâm, hành động, hệ quả) để tiến tới khoảng ${minWords} từ; KHÔNG kết chương sớm.`
              : "Nếu diễn biến đã tự nhiên đi tới điểm dừng hợp lý gần đủ số từ, hãy kết thúc chương ở đó — KHÔNG cố nhồi thêm sự kiện/tình tiết mới chỉ để kéo dài."),
          storyControlPrompt(state),
          hasBrief ? ("KẾ HOẠCH CỦA NGƯỜI DÙNG (chỉ viết nốt các ý CHƯA được viết trong đoạn đã có, đúng thứ tự; ý cuối là điểm kết chương — viết xong thì DỪNG, không thêm gì sau đó):\n" + [state.directive ? ("MỆNH LỆNH: " + String(state.directive).trim()) : "", state.nextChapterHint ? ("GỢI Ý: " + String(state.nextChapterHint).trim()) : ""].filter(Boolean).join("\n") + (closingBeat ? ("\nCÚ CHỐT CUỐI CHƯƠNG: " + closingBeat) : "") + "\nNếu các ý trong kế hoạch đã được viết hết trong đoạn đã có thì chỉ khép chương bằng 1–2 câu rồi dừng.") : "",
          "ĐOẠN CUỐI (giữ giọng văn, nhịp câu, POV, thì kể, xưng hô của đoạn này):", tail,
          "Bắt đầu ngay sau câu cuối; TUYỆT ĐỐI không viết lại từ đầu chương và không nhắc lại phần đã viết. Nếu cảnh đã khép lại tự nhiên thì chỉ viết tiếp sang diễn biến kế tiếp, không chép lại.",
          "Chỉ trả văn xuôi tiếp theo. TUYỆT ĐỐI không xuất \"TIÊU ĐỀ:\", \"NỘI DUNG:\", không viết lại chương từ đầu dù dưới dạng diễn đạt khác."
        ].join("\n\n") }],
        maxTokens: isNsfw ? 12000 : 9000, temperature: CREATIVE_TEMP, totalMs: Math.max(45000, Math.min(420000, writeTimeLeft(isNsfw) - 12000)), creative: true
      }, 2);
      if (!cont.text || cont.text.trim().length < 50) { failAttempt("AI trả rỗng/quá ngắn"); continue; }
      let contText = String(cont.text).trim();
      if (detectNonVietnamese(contText) && writeTimeLeft(isNsfw) > 60000) {
        try {
          const retry = await callWithRetry({
            endpoint: job.apiEndpoint, apiKey: job.apiKey, model,
            messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: "Viết lại phần dưới đây bằng 100% tiếng Việt có dấu. Không dùng chữ Hán/Nhật/Hàn/Cyrillic. Giữ nguyên ý, không thêm sự kiện.\n\n" + contText }],
            maxTokens: Math.min(12000, Math.max(1800, Math.ceil(contText.length / 3))), temperature: 0.45, totalMs: Math.max(45000, Math.min(180000, writeTimeLeft(isNsfw) - 10000)), creative: true
          }, 1);
          if (retry.text && retry.text.trim()) contText = String(retry.text).trim();
        } catch (_) {}
      }
      const dedupedCont = dropRestartedContinuation(text, contText);  // với chế độ chèn: so với toàn bộ chương (gồm cả đoạn kết)
      if (!dedupedCont.trim() || countWords(dedupedCont) < 40) { failAttempt("phần viết tiếp lặp lại nội dung đã có nên bị bỏ"); continue; }
      if (dedupedCont.length < contText.length) issues.push(`Viết tiếp #${attempts}: đã lược đoạn lặp`);
      contText = dedupedCont;
      const remaining = maxWords - current;
      if (remaining <= 0) break;
      const capped = trimToWordLimit(contText, remaining);
      if (ins) {
        // chèn vào trước đoạn kết; câu cuối phần chèn bị cụt thì lùi về câu hoàn chỉnh để không dính vào đoạn kết
        const mid = trimToLastSentence(capped.text, 0.6).text;
        if (countWords(mid) < 120) { failAttempt("phần chèn diễn biến quá ngắn (<120 từ) nên bị bỏ"); continue; }
        text = ins.body.replace(/\s+$/, "") + "\n\n" + mid.trim() + "\n\n" + ins.ending;
        issues.push(`Đã chèn thêm ${countWords(mid)} từ diễn biến trước đoạn kết (giữ nguyên Ending Anchor)`);
        truncated = false;
        continue;
      }
      text = text.replace(/\s+$/, "") + "\n\n" + capped.text;
      truncated = cont.finishReason === "length" || capped.trimmed;
      if (capped.trimmed) break;
    } catch (e) { failAttempt("API lỗi — " + e.message); continue; }
  }
  { const dd = dedupeRepeatedScene(text); if (dd.length < text.length) { text = dd; issues.push("Đã cắt phần chương bị viết lặp lại từ đầu"); } }
  // V12.23: MỞ RỘNG CUỐI — hết lượt viết thêm mà vẫn thiếu từ -> viết lại toàn bộ chương dài hơn (tối đa 2 lần).
  for (let ex = 1; ex <= 2; ex++) {
    const w0 = countWords(text);
    if (w0 >= loopGoal || w0 >= maxWords || w0 < 800) break;
    if (writeTimeLeft(isNsfw) < EXPAND_MIN_START_MS) { issues.push(`Bỏ qua mở rộng cuối vì chỉ còn ${Math.round(writeTimeLeft(isNsfw) / 1000)}s (cần ≥ ${EXPAND_MIN_START_MS / 1000}s)`); break; }
    try {
      const exPrompt = buildExpandPrompt({
        text, wc: w0, goal: loopGoal, target: minWords, maxWords,
        directive: state.directive, hint: state.nextChapterHint, closing: closingBeat,
        style: [DESCRIPTION_PROMPTS[state.descriptionLevel] || DESCRIPTION_PROMPTS.balanced, isNsfw ? EROTIC_STYLE_PROMPT : "", isNsfw ? ("MỨC TRƯỞNG THÀNH: " + (EXPLICIT_PROMPTS[state.explicitLevel] || "")) : "", state.pronounRules ? ("QUY TẮC XƯNG HÔ:\n" + state.pronounRules) : ""].filter(Boolean).join("\n")
      });
      const rx = await callWithRetry({
        endpoint: job.apiEndpoint, apiKey: job.apiKey, model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: exPrompt }],
        maxTokens: isNsfw ? 24000 : 16000, temperature: 0.8, totalMs: Math.max(60000, Math.min(420000, writeTimeLeft(isNsfw) - 15000)), creative: true
      }, 2);
      let tx = String(rx.text || "");
      if (detectNonVietnamese(tx)) { issues.push(`Mở rộng cuối #${ex}: AI trả sai ngôn ngữ`); continue; }
      tx = formatParagraphs(stripForeign(stripThinkingOutput(tx)));
      const acc = acceptExpandedChapter(text, tx, maxWords);
      if (!acc.ok) { issues.push(`Mở rộng cuối #${ex}: ${acc.reason}`); continue; }
      text = acc.text; truncated = false;
      issues.push(`Mở rộng cuối #${ex}: ${w0} → ${acc.words} từ`);
    } catch (e) { issues.push(`Mở rộng cuối #${ex}: API lỗi — ${e.message}`); }
  }
  // V12.22: ĐÃ BỎ bước 'chia đoạn làm dày' (expandChapterInPlace). Độ dài đạt bằng prompt tự do + chèn diễn biến trước đoạn kết (ở vòng viết tiếp phía trên).
  { const _el = removeEnglishLeaksDetailed(text); if (_el.removed.length) { text = _el.text; issues.push(`Đã xóa ${_el.removed.length} câu/đoạn tiếng Anh lẫn vào truyện (vd: "${_el.removed[0].slice(0, 50)}…")`); } }
  text = formatParagraphs(stripForeign(stripThinkingOutput(text)));
  const _allowNames = (state.characters || []).map(x => x && x.name).filter(Boolean);
  // V12.20: tự sửa từ lỗi ghép (mươititude, bănnton, bọcampo...) bằng cách nhờ model chép lại ĐÚNG câu chứa từ đó.
  { const fx = await fixStrayWordsWithAI(job, text, _allowNames, model, isNsfw); text = fx.text; if (fx.fixed) issues.push(`Đã tự sửa ${fx.fixed} từ lỗi (vd: ${fx.samples.join(", ")})`); }
  { const stray = findStrayWords(text, _allowNames); if (stray.length) issues.push("Từ lạ cần kiểm tra: " + stray.slice(0, 8).join(", ")); }
  const finalCap = trimToWordLimit(text, maxWords);
  text = finalCap.text;
  if (finalCap.trimmed) issues.push(`Đã khóa độ dài: tối đa ${maxWords} từ`);
  // V12.20: câu cuối bị cụt giữa chừng -> nhờ model khép 1–3 câu; không được thì lùi về câu hoàn chỉnh gần nhất.
  if (!endsCleanly(text)) {
    const ce = await closeDanglingEnding(job, text, closingBeat, model, isNsfw);
    text = ce.text; truncated = false;
    issues.push(ce.how === "ai" ? "Câu cuối bị cụt — đã nhờ AI khép chương" : (ce.how === "trim" ? "Câu cuối bị cụt — đã lùi về câu hoàn chỉnh gần nhất" : "Câu cuối có thể còn cụt — hãy kiểm tra"));
  }
  const wordCount = countWords(text);
  if (wordCount < minWords * 0.95) issues.push(`Thiếu từ: ${wordCount}/${minWords}`);
  return { title, text, wordCount, truncated, plan: "", continuityWarnings: [], versions: [], modelUsed: model, isNsfw, routingModel: model, routingReason: job.forceNsfw ? "forced" : (hotKeyword ? "keyword" : (isNsfw ? "heat" : "normal")), polished: false, summary: "", versions: [], compressed: false, createdBy: "background-v12.3", createdAt: Date.now(), autoUpdateIssues: issues, minWordsTarget: minWords, control };
}

/* V12.10: chống tóm tắt bịa — kiểm tra tên/từ trong bản tóm tắt có thật trong chương không. */

function extractModelFor(job, chapter, state) {
  // V12.15: chương 18+ -> tóm tắt/gợi ý dùng model 18+ (model chính hay nói giảm nói tránh)
  const nm = String(job.modelNsfw || (state && state.modelNsfw) || "").trim();
  return (chapter && chapter.isNsfw && nm) ? nm : job.model;
}
async function generateSummary(job, chapter, n) {
  try {
    const full = String(chapter.text || "");
    const body = representativeText(full, 90000);
    const names = summaryNameList(full, (job.storyState && job.storyState.characters) || []);
    const _adult = !!chapter.isNsfw;
    const _mdl = extractModelFor(job, chapter, job.storyState);
    const fullPrompt = buildSummaryPrompt(body, n, names, _adult);
    const ask = async (content, temp, tries) => {
      const r = await callExtract({ endpoint: job.apiEndpoint, apiKey: job.apiKey, model: _mdl, messages: [{ role: "user", content }], maxTokens: 1400, temperature: temp }, tries);
      return (r.text || "").trim();
    };
    const looksMeta = s => !/\*\*Tóm tắt chương:?\*\*/i.test(s) || /^(Ngắn gọn|Súc tích|Đủ chi tiết|Cấu trúc rõ|Trung lập)\s*[:：]/im.test(s);
    let summary = await ask(fullPrompt, 0.2, 2);
    const g = summaryGrounded(summary, full);
    if (looksMeta(summary) || !g.ok) {
      try { const s2 = await ask(fullPrompt + summaryRetryNote(g), 0.1, 1); if (s2) summary = s2; } catch (_) {}
    }
    const _wc = t => (String(t).trim().match(/\S+/g) || []).length;
    if (_wc(summary) > 450) {
      // V12.29 COST: avoid a third model call only to shorten the summary.
      // Keep the chapter itself untouched; compact summary locally at sentence boundary.
      const words = summary.split(/\s+/).slice(0, 420).join(" ");
      const cut = Math.max(words.lastIndexOf(". "), words.lastIndexOf("! "), words.lastIndexOf("? "));
      summary = cut > words.length * 0.6 ? words.slice(0, cut + 1) : words;
    }
    if (!summaryGrounded(summary, full).ok) summary = extractiveSummary(full) || summary;
    return summary;
  } catch (_) { return ""; }
}

/* Tự động đề xuất định hướng ngắn cho (các) chương SAU — chỉ tham khảo,
   không ép chương kế phải theo ngay. Người dùng có thể sửa tay trong app. */
const HINT_STYLES = {"normal": "Diễn tiến tự nhiên, tiếp nối mạch hiện tại.", "resist": "Nhân vật bị khống chế/yếu thế PHẢN KHÁNG rõ rệt trong chương này (hành động chống cự cụ thể); bên kia đáp trả và siết chặt hơn, hệ quả làm quan hệ quyền lực nặng thêm.", "twist": "Có một bước ngoặt/đảo chiều bất ngờ (lộ bí mật, lợi thế đổi bên, kế hoạch bị phá) nhưng vẫn hợp lý với thông tin đã có.", "escalate": "Leo thang: mức độ căng thẳng, rủi ro hoặc mức nóng cao hơn chương trước, có cú chốt gây hồi hộp.", "slow": "Nhịp chậm hơn: đào sâu nội tâm, quan hệ và hệ quả cảm xúc; ít biến cố mới."};
async function generateNextChapterHint(job, chapter, summary, n, state) {
  try {
    const openThreads = (state.threads || []).filter(t => !["paid_off", "abandoned", "completed"].includes(t.status)).slice(0, 8).map(t => "- " + t.desc).join("\n");
    const openForeshadowing = (state.foreshadowing || []).filter(f => !["paid_off", "abandoned", "resolved"].includes(f.status)).slice(-8).map(f => "- " + f.description).join("\n");
    const _adult = !!chapter.isNsfw;
    const _mdl = extractModelFor(job, chapter, state);
    const prompt = [
      `Bạn vừa đọc xong CHƯƠNG ${n} (tóm tắt bên dưới). Hãy viết GỢI Ý CHI TIẾT cho CHƯƠNG ${n + 1}.`,
      job.hintFormat === "beats"
        ? ("YÊU CẦU ĐỊNH DẠNG GỌN THEO NHỊP: mở đầu bằng dòng \"**Gợi ý ngắn Chương " + (n + 1) + ":**\", sau đó 1–3 đoạn ngắn kể lần lượt các nhịp chính theo đúng thứ tự diễn ra, mỗi nhịp 1–2 câu (ai làm gì, ở đâu, với đạo cụ/thiết lập nào, hệ quả). Câu cuối là dòng riêng bắt đầu bằng \"→ Kết chương ở:\" nêu rõ khoảnh khắc chương dừng lại. Tổng 150–260 từ, không gạch đầu dòng, không bình luận.")
        : ("YÊU CẦU ĐỊNH DẠNG: mở đầu bằng dòng \"**Gợi ý ngắn Chương " + (n + 1) + ":**\", sau đó 4-6 đoạn văn ngắn, mỗi đoạn là một cảnh/nhịp truyện theo đúng thứ tự diễn ra: (1) mở chương, (2) cảnh chính, (3) cảnh phát triển/căng thẳng, (4) cú chốt cuối chương."),
      "Mỗi đoạn phải dùng TÊN NHÂN VẬT cụ thể, nêu rõ hành động, địa điểm, xung đột, cảm xúc và hệ quả — KHÔNG nói chung chung kiểu \"nên khai thác thêm tuyến X\".",
      "Bám sát giọng điệu, thể loại, mức độ nóng/18+ và cách xưng hô mà chính truyện này đang dùng; tiếp nối trực tiếp các thread và foreshadowing đang mở, không tự mở tuyến mới lạc đề. Mở chương phải nối trực tiếp từ đoạn kết chương trước; các mốc đã hẹn (giờ họp, lệnh, hạn chót) phải được xử lý.",
      _adult ? "ĐỘ TRỰC DIỆN (truyện 18+): mạch chính đang có cảnh người lớn/khống chế nên hãy mô tả các nhịp đó THẲNG và CỤ THỂ đúng như cách chương vừa viết đã làm — nêu rõ hành động, đạo cụ, tư thế/vị trí và diễn biến bằng đúng từ ngữ của truyện. KHÔNG nói giảm nói tránh, không lược bỏ, không thay bằng cụm chung chung như \"cảnh nóng\"/\"cảnh thân mật\", không nhắc nhở hay bình luận đạo đức. Mọi nhân vật liên quan đều là người trưởng thành." : "",
      "ĐỊA ĐIỂM MỞ CHƯƠNG: nhịp mở chương PHẢI ở cùng địa điểm, thời điểm và với những người đang có mặt ở ĐOẠN KẾT CHƯƠNG (chương kết ở biệt thự của A thì chương sau vẫn mở ở biệt thự của A). Chỉ chuyển địa điểm nếu đoạn kết đã báo trước, và phải ghi rõ cách chuyển.",
      _adult ? "NHỊP CẢNH 18+: nếu chương sau có cảnh nóng, gợi ý PHẢI tách 3 phần và dành chỗ cho từng phần — (a) DẪN VÀO: không khí, lời nói/mệnh lệnh, từng bước áp sát và phản ứng đầu tiên; (b) DIỄN BIẾN + cao trào; (c) SAU CẢNH: dư chấn cơ thể, cảm xúc, thoại và hậu quả với quan hệ. Mỗi phần ít nhất 2–3 câu. Độ dài gợi ý có thể tăng thêm khoảng 50%." : "",
      "HƯỚNG CHƯƠNG SAU: " + (HINT_STYLES[job.hintStyle] || HINT_STYLES.normal),
      "ĐOẠN KẾT CHƯƠNG (để nối mạch):", String(chapter.text || "").slice(-1500),
      "TÓM TẮT:", summary || representativeText(chapter.text, 2000),
      openThreads ? ("THREADS ĐANG MỞ:\n" + openThreads) : "",
      openForeshadowing ? ("FORESHADOWING CHƯA GIẢI:\n" + openForeshadowing) : "",
      "Chỉ trả về nội dung gợi ý theo định dạng trên, tiếng Việt."
    ].filter(Boolean).join("\n\n");
    const r = await callExtract({ endpoint: job.apiEndpoint, apiKey: job.apiKey, model: _mdl, messages: [{ role: "user", content: prompt }], maxTokens: _adult ? 2200 : 1400, temperature: 0.7 }, 2);
    return (r.text || "").trim();
  } catch (_) { return ""; }
}

function compactCharacterList(state) {
  // V12.10: NV bị khóa hồ sơ gốc -> không đổi appearance/personality/goals; NV đã mở khóa -> kèm hồ sơ hiện tại để AI chỉ bổ sung điểm MỚI.
  return (state.characters || []).slice(0, 80).map(c => {
    const locked = c.coreLocked !== false;
    let line = `- ${c.name} [${c.tier || "supporting"}]${c.dead ? " [ĐÃ CHẾT]" : ""}${locked ? " [KHÓA HỒ SƠ GỐC]" : " [MỞ KHÓA: được cập nhật ngoại hình/tính cách/mục tiêu]"}`;
    if (!locked) {
      const cur = ["appearance","personality","goals"].map(k => c[k] ? `${k}: ${String(c[k]).slice(-260)}` : "").filter(Boolean).join(" | ");
      if (cur) line += `\n    hiện có -> ${cur}`;
    }
    const missingF = ["age","gender","role","occupation","appearance","personality","goals"].filter(k => !String(c[k] || "").trim());
    if (missingF.length) line += `\n    CHƯA CÓ (hãy điền nếu chương nêu rõ) -> ${missingF.join(", ")}`;
    const jobInfo = ["role","occupation","position","faction"].map(k => c[k] ? `${k}: ${String(c[k]).slice(0, 80)}` : "").filter(Boolean).join(" | ");
    if (jobInfo) line += `\n    nghề/chức vụ GỐC (giữ nguyên) -> ${jobInfo}`;
    return line;
  }).join("\n") || "(chưa có)";
}

function mergeTextField(oldValue, newValue, max = 2500) {
  const a = String(oldValue || "").trim(), b = String(newValue || "").trim();
  if (!b) return a;
  if (!a) return b.slice(0, max);
  if (normalizeName(a) === normalizeName(b) || normalizeName(a).includes(normalizeName(b))) return a;
  if (normalizeName(b).includes(normalizeName(a))) return b.slice(0, max);
  // V12.10: bỏ các đoạn đã có ý y hệt; khi vượt giới hạn thì bỏ đoạn CŨ NHẤT (không cắt mất phần mới ở cuối).
  const na = normalizeName(a);
  const fresh = b.split(/;\s*/).filter(seg => seg.trim() && !na.includes(normalizeName(seg)));
  if (!fresh.length) return a;
  const parts = a.split(/;\s*/).concat(fresh);
  while (parts.length > 1 && parts.join("; ").length > max) parts.shift();
  return parts.join("; ").slice(-max);
}

/* V12.19: các trường trước đây hiển thị trong UI nhưng AI không bao giờ cập nhật. */
const CHAR_EXTRA_ACCUM = ["independentPlot","strength","speech","sexualExperience","boundaries","taboos","preferences","attractionToMC","tensionWithMC","consentNotes"];
const CHAR_ADULT_ONLY = ["sexualExperience","boundaries","taboos","preferences","attractionToMC","tensionWithMC","consentNotes"];
const CHAR_STABLE_FILL = ["voice","scent","style","scars","tattoos"];
function applyCharExtras(c, u) {
  const age = parseAgeNum(c.age || u.age);
  CHAR_EXTRA_ACCUM.forEach(k => {
    if (!u[k] || !String(u[k]).trim()) return;
    if (CHAR_ADULT_ONLY.includes(k) && age !== null && age < 18) return; // khớp rào chắn tuổi
    c[k] = mergeTextField(c[k], u[k]);
  });
  CHAR_STABLE_FILL.forEach(k => { if (u[k] && !String(c[k] || "").trim()) c[k] = u[k]; });
  if (u.schedule && String(u.schedule).trim()) c.schedule = u.schedule;
}
function mergeCharacter(state, u, chapterNumber, sourceText) {
  if (!u?.name) return { created: false, updated: false };
  const name = String(u.name).trim();
  if (!name) return { created: false, updated: false };
  /* v12.18: tên trùng hồ sơ Nhân Vật Chính / nhãn chung "nhân vật chính" / bí danh → KHÔNG tạo mục mới */
  const rt = resolveCharacterTarget(state, name);
  if (rt.kind === "main") { applyMainCharUpdate(state.mainCharProfile, u); return { created: false, updated: true }; }
  let c = rt.kind === "character" ? rt.character : null;
  let created = false;
  if (!c) {
    c = {
      id: genId("c"), name, tier: u.tier || "supporting", age: u.age || "", gender: u.gender || "", position: u.position || "", speech: u.speech || "", height: u.height || "", bodyType: u.bodyType || "", hair: u.hair || "", eyes: u.eyes || "", skin: u.skin || "", role: u.role || "", relevanceToMC: u.relevanceToMC || "",
      appearance: u.appearance || "", personality: u.personality || "", occupation: u.occupation || "", faction: u.faction || "",
      goals: u.goals || "", secret: u.secret || "", weakness: u.weakness || "", fear: u.fear || "", knowledge: u.knowledge || "",
      currentLocation: u.currentLocation || "", physicalState: u.physicalState || "", mentalState: u.mentalState || "", independentPlot: u.independentPlot || "", strength: u.strength || "", voice: u.voice || "", scent: u.scent || "", style: u.style || "", scars: u.scars || "", tattoos: u.tattoos || "", schedule: u.schedule || "",
      relationships: [], firstAppearance: chapterNumber, lastAppearance: chapterNumber, locked: false, dead: !!u.isDead,
      deathChapter: u.isDead ? chapterNumber : null, history: []
    };
    if (!Array.isArray(state.characters)) state.characters = [];
    state.characters.push(c); created = true;
    applyCharExtras(c, u);
  } else {
    const coreLocked = c.coreLocked !== false;
    const coreFields = ["name","age","gender","appearance","personality","goals","role","position","occupation","faction"];
    const accum = ["appearance","personality","goals","secret","weakness","fear","knowledge"];
    if(!c.coreIdentity || typeof c.coreIdentity !== "object") c.coreIdentity={};
    if(coreLocked){
      coreFields.forEach(k=>{ if(c.coreIdentity[k] === undefined) c.coreIdentity[k] = c[k] || ""; });
    }
    /* V12.19: khóa hồ sơ gốc chỉ chặn GHI ĐÈ giá trị đã có; trường còn trống vẫn được điền. */
    accum.forEach(k => {
      if (!u[k]) return;
      const emptyNow = !String(c[k] || "").trim();
      if (coreLocked && coreFields.includes(k) && !emptyNow) return;
      c[k] = mergeTextField(c[k], u[k]);
      if (coreFields.includes(k) && (!coreLocked || emptyNow)) c.coreIdentity[k] = c[k];
    });
    ["age","gender","position","speech","height","bodyType","hair","eyes","skin"].forEach(k => {
      if (u[k] && !String(c[k] || "").trim()) { c[k] = u[k]; if (coreFields.includes(k)) c.coreIdentity[k] = c[k]; }
    });
    /* V12.19: nghề/chức vụ đã có chỉ đổi khi có sự kiện + bằng chứng trích đúng từ chương (kể cả NV đã mở khóa). */
    const explicitRoleValueSupported = ["role","occupation","position","faction"].some(k => u[k] && evidenceSupportsValue(u[k], u.changeEvidence, 0.55));
    const explicitJobChange = u.explicitCoreChange === true && String(u.changeEvidence || "").trim().length >= 12 && (sourceText == null || evidenceInText(u.changeEvidence, sourceText)) && explicitRoleValueSupported;
    ["role","relevanceToMC","occupation","faction"].forEach(k => {
      if (!u[k]) return;
      const emptyNow = !String(c[k] || "").trim();
      if (coreLocked && coreFields.includes(k) && !explicitJobChange && !emptyNow) return;
      if (k !== "relevanceToMC" && !emptyNow && normalizeName(c[k]) !== normalizeName(u[k]) && !explicitJobChange) return;
      c[k] = u[k];
      if (coreFields.includes(k) && (emptyNow || explicitJobChange)) c.coreIdentity[k] = c[k];
    });
    ["currentLocation","physicalState","mentalState"].forEach(k => { if (u[k]) c[k] = u[k]; });
    applyCharExtras(c, u);
    if (u.tier && !c.locked && !String(c.tier || "").trim()) c.tier = u.tier;
    if (u.isDead === true && !c.dead) { c.dead = true; c.deathChapter = chapterNumber; }
    c.lastAppearance = chapterNumber;
  }
  if (!Array.isArray(c.relationships)) c.relationships = [];
  const _agR = parseAgeNum(c.age || u.age), minorAge = _agR !== null && _agR < 18;
  /* V12.19: quan hệ với nhân vật chính (bản chạy nền trước đây bỏ sót hoàn toàn). */
  if (u.relationshipWithMain && typeof u.relationshipWithMain === "object" && Object.values(u.relationshipWithMain).some(v => v)) {
    let rm = c.relationships.find(x => normalizeName(x.withName).includes("nhan vat chinh"));
    if (!rm) { rm = { withName: "Nhân vật chính", stage: "", trust: "", notes: "", history: [] }; c.relationships.push(rm); }
    Object.keys(u.relationshipWithMain).forEach(k => {
      const v = u.relationshipWithMain[k]; if (!v) return;
      if ((k === "attraction" || k === "boundaries") && minorAge) return;
      rm[k] = v;
    });
  }
  (Array.isArray(u.relationships) ? u.relationships : []).forEach(r => {
    if (!r?.withName) return;
    let rel = c.relationships.find(x => normalizeName(x.withName) === normalizeName(r.withName));
    if (!rel) { rel = { withName: r.withName, stage: "", trust: "", notes: "", history: [] }; c.relationships.push(rel); }
    ["stage","trust","respect","affection","attraction","suspicion","tension","boundaries","notes"].forEach(k => {
      if (!r[k]) return;
      if ((k === "attraction" || k === "boundaries") && minorAge) return; // khớp rào chắn tuổi
      rel[k] = r[k];
    });
    if (r.notes) { if (!Array.isArray(rel.history)) rel.history = []; rel.history.push({ chapter: chapterNumber, change: r.notes }); }
  });
  if (u.chapterEvent) { if (!Array.isArray(c.history)) c.history = []; c.history.push({ chapter: chapterNumber, event: u.chapterEvent }); }
  return { created, updated: true };
}

// v11.1 — chạy các lô trích xuất với độ song song giới hạn (mặc định 3). Merge vào state là ĐỒNG BỘ sau mỗi await
// nên an toàn; mergeCharacter/applyWorld gộp theo tên chuẩn hóa nên lô chạy song song không tạo trùng.
const EXTRACT_CONCURRENCY = Math.max(1, Math.min(6, parseInt(process.env.EXTRACT_CONCURRENCY, 10) || 3));
async function runPool(count, worker, limit = EXTRACT_CONCURRENCY) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, count) }, async () => {
    while (true) { const i = next++; if (i >= count) return; await worker(i); }
  });
  await Promise.all(runners);
}

async function updateCharacters(job, chapter, n, state) {
  if (!Array.isArray(state.characters)) state.characters = [];
  const chunks = chunkText(chapter.text, 12000, 400);
  const res = { ok: true, chunks: chunks.length, nNew: 0, nUpdated: 0, failed: 0, dropped: 0, cut: 0, notes: [], problems: [] };
  await runPool(chunks.length, async (i) => {
    const tag = `NV lô ${i + 1}/${chunks.length}`;
    if (timeLeft() < 360000) { res.failed++; res.notes.push(`${tag}: BỎ QUA vì còn dưới 6 phút — giữ thời gian an toàn cho Status/Memory`); return; }
    const prompt = [
      `CẬP NHẬT NHÂN VẬT — CHƯƠNG ${n}, PHẦN ${i + 1}/${chunks.length}.`,
      "Chỉ liệt kê nhân vật thực sự xuất hiện hoặc được nhắc tới có ý nghĩa trong PHẦN này. Không bịa.",
      (state.mainCharProfile && state.mainCharProfile.name) ? `Nhân vật chính tên là "${state.mainCharProfile.name}" — khi ghi nhân vật chính PHẢI dùng đúng tên này; KHÔNG tạo mục tên "nhân vật chính".` : "",
      "Tối đa 12 nhân vật; mỗi trường mô tả (appearance/personality/goals/knowledge) khoảng 30-60 từ, cụ thể (đặc điểm, hành vi, chi tiết mới lộ ra trong phần này); chỉ ghi điểm MỚI so với mục \"hiện có\", không lặp lại hồ sơ cũ; NV đang [KHÓA HỒ SƠ GỐC] thì để trống các trường ĐÃ CÓ giá trị (appearance/personality/goals...), nhưng trường nằm trong mục CHƯA CÓ thì phải điền nếu chương nêu rõ. Trường nằm trong mục \"CHƯA CÓ\" của nhân vật: hãy ĐIỀN nếu chương nêu rõ (ví dụ \"nữ thư ký\" → gender: nữ, occupation: thư ký; tuổi/chiều cao/tóc/mắt chỉ khi có con số hoặc mô tả trực tiếp). Trường đã có giá trị thì để trống, không ghi đè. Không đoán. Không dùng dấu \" bên trong giá trị chuỗi. Chỉ trả về JSON array.",
      "Nghề/chức vụ (role, occupation, position, faction) là DỮ LIỆU GỐC: KHÔNG đổi, KHÔNG suy diễn từ cách người khác xưng hô, từ việc nhân vật làm việc với giám đốc/sếp, hay từ cảnh nhân vật ngồi ghế/ở phòng của ai. Chỉ đổi khi chương KỂ RÕ một sự kiện thăng chức/bổ nhiệm/từ chức/đổi nghề đã xảy ra; khi đó đặt explicitCoreChange=true và changeEvidence phải TRÍCH NGUYÊN VĂN câu trong chương cho thấy sự kiện đó. Nếu không có, để trống role/occupation/position/faction.",
      "Giải thích thêm: speech = cách nói riêng (giọng, khẩu ngữ, câu cửa miệng); strength = điểm mạnh/kỹ năng thể hiện trong chương; independentPlot = TUYẾN TRUYỆN RIÊNG của NV (việc họ tự làm/âm mưu ngoài tuyến chính, chỉ ghi diễn biến MỚI); các trường 18+ (sexualExperience, boundaries, taboos, preferences, attractionToMC, tensionWithMC, consentNotes) CHỈ ghi khi chương thể hiện rõ về NV trưởng thành, nếu không thì để trống.",
      "Danh sách tên đã biết:", compactCharacterList(state),
      "NỘI DUNG PHẦN:", chunks[i],
      'JSON: [{"name":"","tier":"background|minor|supporting|important|major","age":"","gender":"","position":"","speech":"","height":"","bodyType":"","hair":"","eyes":"","skin":"","role":"","relevanceToMC":"","voice":"","scent":"","style":"","scars":"","tattoos":"","schedule":"","strength":"","independentPlot":"","sexualExperience":"","boundaries":"","taboos":"","preferences":"","attractionToMC":"","tensionWithMC":"","consentNotes":"","appearance":"","personality":"","occupation":"","faction":"","goals":"","secret":"","weakness":"","fear":"","knowledge":"","currentLocation":"","physicalState":"","mentalState":"","chapterEvent":"","relationshipWithMain":{"trust":"","respect":"","affection":"","attraction":"","suspicion":"","tension":"","boundaries":"","stage":"","notes":""},"relationships":[{"withName":"","stage":"","trust":"","respect":"","affection":"","attraction":"","suspicion":"","tension":"","boundaries":"","notes":""}],"isDead":false,"explicitCoreChange":false,"changeEvidence":""}]'
    ].join("\n\n");
    try {
      const r = await callExtract({ endpoint: job.apiEndpoint, apiKey: job.apiKey, model: job.model, messages: [{ role: "system", content: "Bạn là bộ máy trích xuất dữ liệu nhân vật. Không được viết văn xuôi. Chỉ trả JSON hợp lệ." }, { role: "user", content: prompt }], maxTokens: 11500, temperature: 0.15 }, 2);
      const parsed = await parseArrayWithRepair(job, r.text);
      if (!parsed.valid) {
        res.failed++;
        res.notes.push(`${tag}: KHÔNG đọc được JSON (${fin(r)}, đầu: "${sampleOf(r.text)}")`);
        return;
      }
      let created = 0, upd = 0, merr = 0;
      parsed.items.forEach(u => {
        try { const x = mergeCharacter(state, u, n, chunks[i]); if (x.created) created++; else if (x.updated) upd++; }
        catch (e) { merr++; }
      });
      res.nNew += created; res.nUpdated += upd; res.dropped += (parsed.dropped || 0) + merr;
      if (r.finishReason === "length" || parsed.truncated) {
        res.cut++;
        // V12.25: khi lô NV bị cắt, không chỉ salvage JSON — gọi một lượt bổ sung
        // để lấy các NV còn thiếu ở cuối lô. Dùng prompt siêu gọn và loại tên đã lấy.
        if (timeLeft() > 210000) {
          try {
            const knownNames = parsed.items.map(x => x && x.name).filter(Boolean).join(", ");
            const retryPrompt = [
              `TIẾP TỤC TRÍCH XUẤT NHÂN VẬT — CHƯƠNG ${n}, PHẦN ${i + 1}/${chunks.length}.`,
              "Lượt trước bị cắt giữa JSON. CHỈ trả các nhân vật còn thiếu chưa xuất hiện trong danh sách bên dưới.",
              "Không lặp lại nhân vật đã có. Chỉ tên + thay đổi thực sự được chứng minh trong đoạn. Mỗi nhân vật tối đa 5 trường, mỗi trường tối đa 20 từ.",
              "Nếu không còn nhân vật nào, trả []. Chỉ JSON array, không markdown.",
              "ĐÃ LẤY: " + (knownNames || "(chưa lấy được)"),
              "ĐOẠN NGUỒN:", chunks[i]
            ].join("\n\n");
            const rr = await callOpenRouter({
              endpoint: job.apiEndpoint, apiKey: job.apiKey, model: job.model,
              messages: [{ role: "system", content: "Chỉ trả JSON array nhân vật, không văn xuôi." }, { role: "user", content: retryPrompt }],
              maxTokens: 5000, temperature: 0.05, totalMs: Math.min(100000, Math.max(30000, timeLeft() - 30000))
            });
            const rp = parseArray(rr.text || "[]");
            if (rp.valid && rp.items.length) {
              let rc = 0, ru = 0, rm = 0;
              rp.items.forEach(u => { try { const x = mergeCharacter(state, u, n, chunks[i]); if (x.created) rc++; else if (x.updated) ru++; } catch (_) { rm++; } });
              res.nNew += rc; res.nUpdated += ru; res.dropped += (rp.dropped || 0) + rm;
              res.notes.push(`${tag}: bổ sung sau cắt +${rc} NV mới, ${ru} NV cập nhật (${fin(rr)})`);
            } else {
              res.notes.push(`${tag}: lượt bổ sung không tìm được NV còn thiếu (${fin(rr)})`);
            }
          } catch (e) {
            res.notes.push(`${tag}: không thể lấy phần NV còn thiếu — ${sampleOf(e.message, 140)}`);
          }
        }
      }
      res.notes.push(`${tag}: ${fin(r)}, parse=${parsed.method || "?"}, ${parsed.items.length} NV (+${created} mới, ${upd} cập nhật)${parsed.dropped ? `, ${parsed.dropped} object hỏng bị bỏ` : ""}${merr ? `, ${merr} lỗi merge` : ""}`);
    } catch (e) { res.failed++; res.notes.push(`${tag}: LỖI gọi model — ${sampleOf(e.message, 160)}`); }
  });
  res.ok = res.failed < chunks.length;
  if (res.failed) res.problems.push(`NV: ${res.failed}/${chunks.length} lô không đọc được`);
  if (res.cut) res.problems.push(`NV: model bị cắt cụt ở ${res.cut} lô (có thể thiếu NV cuối lô)`);
  if (res.dropped) res.problems.push(`NV: ${res.dropped} object NV hỏng bị bỏ`);
  return res;
}

function findThread(state, t) {
  const key = normalizeName(t.matchExistingDesc || t.desc).slice(0, 50);
  if (!key) return null;
  return (state.threads || []).find(x => normalizeName(x.desc).slice(0, 50) === key || normalizeName(x.desc).includes(key.slice(0, 28)) || key.includes(normalizeName(x.desc).slice(0, 28)));
}
function applyWorld(obj, n, state) {
  if (!Array.isArray(state.locations)) state.locations = [];
  if (!Array.isArray(state.items)) state.items = [];
  if (!Array.isArray(state.threads)) state.threads = [];
  (obj.locations || []).forEach(u => {
    if (!u?.name) return;
    let x = state.locations.find(a => normalizeName(a.name) === normalizeName(u.name));
    if (!x) { x = { id: genId("l"), name: u.name, description: "", status: "active", firstAppearance: n, lastAppearance: n }; state.locations.push(x); }
    if (u.description) x.description = mergeTextField(x.description, u.description, 1200);
    if (u.status) x.status = u.status;
    x.lastAppearance = n;
  });
  (obj.items || []).forEach(u => {
    if (!u?.name) return;
    let x = state.items.find(a => normalizeName(a.name) === normalizeName(u.name));
    if (!x) { x = { id: genId("i"), name: u.name, description: "", owner: "", status: "active", firstAppearance: n, lastAppearance: n }; state.items.push(x); }
    if (u.description) x.description = mergeTextField(x.description, u.description, 1000);
    if (u.owner) x.owner = u.owner;
    if (u.status) x.status = u.status;
    x.lastAppearance = n;
  });
  (obj.threads || []).forEach(t => {
    if (!t?.desc) return;
    let x = findThread(state, t);
    if (!x) state.threads.push({ id: genId("t"), type: t.type || "open_thread", status: t.status || "seeded", desc: t.desc, chapterIntroduced: n, lastUpdated: n, history: [] });
    else {
      const terminal = ["paid_off", "abandoned", "completed", "resolved"].includes(String(x.status || "").toLowerCase());
      if (t.status && (!terminal || String(t.status).toLowerCase() === String(x.status).toLowerCase())) x.status = t.status;
      x.lastUpdated = n; if (!Array.isArray(x.history)) x.history = []; x.history.push({ chapter: n, status: x.status, note: t.desc });
    }
  });
}
async function updateWorld(job, chapter, n, state) {
  if (!Array.isArray(state.locations)) state.locations = [];
  if (!Array.isArray(state.items)) state.items = [];
  if (!Array.isArray(state.threads)) state.threads = [];
  const chunks = chunkText(chapter.text, 13000, 400);
  const res = { ok: true, chunks: chunks.length, failed: 0, cut: 0, notes: [], problems: [] };
  const keys = ["locations", "items", "threads"];
  await runPool(chunks.length, async (i) => {
    const tag = `Thế giới lô ${i + 1}/${chunks.length}`;
    if (timeLeft() < 360000) { res.failed++; res.notes.push(`${tag}: BỎ QUA vì còn dưới 6 phút — giữ thời gian an toàn cho Status/Memory`); return; }
    const prompt = [
      `CẬP NHẬT THẾ GIỚI — CHƯƠNG ${n}, PHẦN ${i + 1}/${chunks.length}.`,
      "Chỉ trả địa điểm/vật phẩm/thread mới hoặc thay đổi rõ trong phần này. Không bịa. Mô tả ngắn (tối đa 25 từ). Không dùng dấu \" bên trong giá trị chuỗi.",
      "Địa điểm hiện có: " + state.locations.map(x => x.name).join(", "),
      "Vật phẩm hiện có: " + state.items.map(x => x.name).join(", "),
      "Thread hiện có (20 gần nhất; mô tả rút gọn để giảm token):\n" + state.threads.slice(-20).map(x => `${x.type}: ${String(x.desc || "").slice(0, 140)} [${x.status}]`).join("\n"),
      "NỘI DUNG:", chunks[i],
      'JSON: {"locations":[{"name":"","description":"","status":"active|destroyed|abandoned|locked"}],"items":[{"name":"","description":"","owner":"","status":"active|lost|destroyed|stored"}],"threads":[{"type":"open_thread|foreshadowing|consequence","desc":"","status":"seeded|developing|paid_off|abandoned","matchExistingDesc":""}]}'
    ].join("\n\n");
    try {
      const r = await callExtract({ endpoint: job.apiEndpoint, apiKey: job.apiKey, model: job.model, messages: [{ role: "system", content: "Bạn là bộ máy trích xuất world state. Chỉ trả JSON hợp lệ." }, { role: "user", content: prompt }], maxTokens: 9200, temperature: 0.15 }, 2);
      const parsed = await parseObjectWithRepair(job, r.text, keys);
      if (!parsed.obj) { res.failed++; res.notes.push(`${tag}: KHÔNG đọc được JSON (${fin(r)}, đầu: "${sampleOf(r.text)}")`); return; }
      const before = [state.locations.length, state.items.length, state.threads.length];
      applyWorld(parsed.obj, n, state);
      if (r.finishReason === "length") res.cut++;
      res.notes.push(`${tag}: ${fin(r)}, parse=${parsed.method || "?"}, +${state.locations.length - before[0]} địa điểm, +${state.items.length - before[1]} vật phẩm, +${state.threads.length - before[2]} thread`);
    } catch (e) { res.failed++; res.notes.push(`${tag}: LỖI — ${sampleOf(e.message, 160)}`); }
  });
  res.ok = res.failed < chunks.length;
  if (res.failed) res.problems.push(`Thế giới: ${res.failed}/${chunks.length} lô không đọc được`);
  if (res.cut) res.problems.push(`Thế giới: model bị cắt cụt ở ${res.cut} lô`);
  return res;
}

function normalizeStatusState(state, n) {
  const legacy = (state && state.statusState && typeof state.statusState === "object") ? state.statusState : {};
  const out = JSON.parse(JSON.stringify(legacy || {}));
  if (!out.schemaVersion) {
    out.schemaVersion = 2;
    if (state && state.currentStatus && !Object.keys(legacy || {}).length) out.legacyText = String(state.currentStatus);
  }
  if (!out.currentState || typeof out.currentState !== "object") out.currentState = {};
  if (!out.longTerm || typeof out.longTerm !== "object") out.longTerm = {};
  if (!Array.isArray(out.characterStates)) out.characterStates = [];
  if (!Array.isArray(out.changeLog)) out.changeLog = [];
  if (!Array.isArray(out.conflicts)) out.conflicts = [];
  if (!out.currentState.time && legacy.time) out.currentState.time = legacy.time;
  if (!out.currentState.situation && legacy.currentSituation) out.currentState.situation = legacy.currentSituation;
  if (!out.currentState.location && legacy.locations) out.currentState.location = legacy.locations;
  if (!out.currentState.mainCharacter && legacy.mainCharacter) out.currentState.mainCharacter = legacy.mainCharacter;
  if (!out.currentState.power && legacy.power) out.currentState.power = legacy.power;
  if (!out.currentState.relationships && legacy.relationships) out.currentState.relationships = legacy.relationships;
  if (!out.currentState.knowledge && legacy.knowledge) out.currentState.knowledge = legacy.knowledge;
  if (!out.currentState.unresolved && legacy.unresolved) out.currentState.unresolved = legacy.unresolved;
  if (!out.currentState.nextHooks && legacy.nextHooks) out.currentState.nextHooks = legacy.nextHooks;
  if (!out.longTerm.secrets && legacy.knowledge) out.longTerm.secrets = legacy.knowledge;
  return out;
}

function statusCharacterRoster(state) {
  const list = [];
  const seen = new Set();
  const add = (c, fallbackName = "") => {
    if (!c || typeof c !== "object") return;
    const name = String(c.name || fallbackName || "").trim();
    if (!name) return;
    const id = String(c.id || "name:" + normalizeName(name));
    if (seen.has(id)) return;
    seen.add(id);
    list.push({
      id, name,
      tier: c.tier || "",
      role: c.role || "",
      age: c.age || "",
      appearance: c.appearance || "",
      currentLocation: c.currentLocation || "",
      physicalState: c.physicalState || "",
      mentalState: c.mentalState || "",
      occupation: c.occupation || "",
      goals: c.goals || "",
      weakness: c.weakness || "",
      strength: c.strength || "",
      personality: c.personality || "",
      relationships: c.relationships || []
    });
  };
  add(state.mainCharProfile, "Nhân vật chính");
  (Array.isArray(state.characters) ? state.characters : []).forEach(c => add(c));
  return list;
}

function formatStatusV2(status, n) {
  const cs = status.currentState || {};
  const lt = status.longTerm || {};
  const lines = [`Current Status Update - Sau Chương ${n}`];
  const add = (label, value) => {
    if (value == null) return;
    if (Array.isArray(value)) value = value.map(x => typeof x === "string" ? x : JSON.stringify(x)).join("; ");
    if (typeof value === "object") value = JSON.stringify(value);
    if (String(value).trim()) lines.push(`- ${label}: ${String(value).trim()}`);
  };
  add("Thời điểm hiện tại", cs.time);
  add("Sự kiện chính vừa xảy ra", cs.mainEvent || cs.situation);
  add("Địa điểm", cs.location);
  add("Tình trạng tổng thể", cs.overall);
  add("Nhân vật chính", cs.mainCharacter);
  add("Phát triển mối quan hệ", cs.relationships);
  add("Tiến triển sức mạnh / tu vi / kỹ năng", cs.power);
  add("Quy tắc do nhân vật chính đặt ra", cs.rules);
  add("Điểm nhấn / xung đột mới", cs.conflict);
  add("Mục tiêu / hướng chương sau", cs.nextGoal || cs.nextHooks);
  add("Thông tin / kiến thức mới", cs.knowledge);
  add("Vấn đề chưa giải quyết", cs.unresolved);
  add("Bí mật / lời hứa / sự kiện dài hạn", lt.secrets);
  add("Quy tắc / thỏa thuận đặc biệt", lt.rules);
  add("Điểm yếu / rủi ro", lt.weaknesses);

  if (Array.isArray(status.characterStates) && status.characterStates.length) {
    lines.push("- Thông tin nhân vật cập nhật:");
    status.characterStates.forEach(c => {
      const label = c.name || c.characterId || "Nhân vật";
      if (c.status === "unchanged" && (!c.changes || !Object.keys(c.changes).length)) {
        lines.push(`  • ${label}: Không có thay đổi đáng kể`);
        return;
      }
      const changes = c.changes || {};
      const parts = Object.keys(changes).map(k => `${k}: ${typeof changes[k] === "object" ? JSON.stringify(changes[k]) : changes[k]}`).filter(Boolean);
      lines.push(`  • ${label}: ${parts.length ? parts.join(" | ") : "Không có thay đổi đáng kể"}`);
    });
  }
  if (status.legacyText) {
    lines.push("- Current Status trước khi nâng cấp:");
    lines.push(String(status.legacyText).trim());
  }
  if (Array.isArray(status.conflicts) && status.conflicts.length) {
    lines.push("- XUNG ĐỘT CẦN GIỮ LẠI, CHƯA TỰ Ý GHI ĐÈ:");
    status.conflicts.slice(-20).forEach(c => {
      lines.push(`  • ${c.characterName || c.field || "Status"}: ${c.description || c.newValue || ""}${c.evidence ? ` [Bằng chứng: ${c.evidence}]` : ""}`);
    });
  }
  return lines.join("\n");
}

function mergeStatusChanges(state, n, extraction) {
  const status = normalizeStatusState(state, n);
  const changes = extraction && extraction.changes && typeof extraction.changes === "object" ? extraction.changes : {};
  const setIfValid = (target, key, item) => {
    if (!item || typeof item !== "object") return false;
    const statusName = String(item.status || "").toLowerCase();
    const value = item.value;
    const evidence = String(item.evidence || "").trim();
    if (!evidence || !["updated", "added", "resolved"].includes(statusName)) return false;
    if (value == null || String(value).trim() === "") return false;
    target[key] = value;
    return true;
  };

  const fieldMap = {
    time: "time", situation: "situation", mainEvent: "mainEvent", location: "location",
    overall: "overall", mainCharacter: "mainCharacter", relationships: "relationships",
    power: "power", rules: "rules", conflict: "conflict", nextGoal: "nextGoal",
    knowledge: "knowledge", unresolved: "unresolved"
  };
  let applied = 0;
  Object.keys(fieldMap).forEach(k => {
    if (setIfValid(status.currentState, fieldMap[k], changes[k])) applied++;
  });

  const ltMap = {
    secrets: "secrets", rules: "rules", weaknesses: "weaknesses"
  };
  Object.keys(ltMap).forEach(k => {
    if (setIfValid(status.longTerm, ltMap[k], changes[k])) applied++;
  });

  const roster = statusCharacterRoster(state);
  const rosterById = new Map(roster.map(c => [c.id, c]));
  const priorChars = Array.isArray(status.characterStates) ? status.characterStates : [];
  const priorById = new Map(priorChars.map(c => [String(c.characterId || c.id || ""), c]));
  const priorByName = new Map(priorChars.map(c => [normalizeName(c.name || c.characterName || ""), c]));
  const incomingChars = Array.isArray(changes.characterChanges) ? changes.characterChanges : [];
  const normalizedChars = [];
  incomingChars.forEach(c => {
    if (!c || typeof c !== "object") return;
    const id = String(c.characterId || "");
    const name = String(c.characterName || c.name || "").trim();
    const known = (id && rosterById.get(id)) || roster.find(x => normalizeName(x.name) === normalizeName(name));
    if (!known) return; // Không cho AI tự tạo nhân vật mới trong Current Status.
    const cleanChanges = {};
    if (c.changes && typeof c.changes === "object") {
      Object.keys(c.changes).forEach(k => {
        const v = c.changes[k];
        if (v != null && String(v).trim() !== "") cleanChanges[k] = v;
      });
    }
    const evidence = String(c.evidence || "").trim();
    const accepted = Object.keys(cleanChanges).length && evidence && String(c.status || "updated").toLowerCase() === "updated";
    const prior = priorById.get(known.id) || priorByName.get(normalizeName(known.name)) || null;
    const mergedChanges = Object.assign({}, prior && prior.changes && typeof prior.changes === "object" ? prior.changes : {}, accepted ? cleanChanges : {});
    const item = {
      characterId: known.id,
      name: known.name,
      status: accepted ? "updated" : ((prior && prior.status) || "unchanged"),
      changes: mergedChanges,
      evidence: accepted ? evidence : String((prior && prior.evidence) || "")
    };
    normalizedChars.push(item);
    if (accepted) applied++;
  });

  // Bắt buộc kiểm kê tất cả nhân vật hiện có; nếu không có cập nhật mới thì giữ
  // nguyên bản ghi trạng thái trước đó thay vì làm rơi thông tin đã tích lũy.
  const byId = new Map(normalizedChars.map(x => [x.characterId, x]));
  roster.forEach(c => {
    if (byId.has(c.id)) return;
    const prior = priorById.get(c.id) || priorByName.get(normalizeName(c.name)) || null;
    normalizedChars.push(prior
      ? Object.assign({}, prior, { characterId: c.id, name: c.name })
      : { characterId: c.id, name: c.name, status: "unchanged", changes: {}, evidence: "" });
  });
  // Character DB cleanup must not delete an older status/history record as a side effect.
  priorChars.forEach(prior => {
    if (!prior || typeof prior !== "object") return;
    const pid = String(prior.characterId || prior.id || "");
    const pname = normalizeName(prior.name || prior.characterName || "");
    if (normalizedChars.some(x => (pid && String(x.characterId || x.id || "") === pid) || (pname && normalizeName(x.name || x.characterName || "") === pname))) return;
    normalizedChars.push(prior);
  });
  status.characterStates = normalizedChars;

  const conflicts = Array.isArray(changes.conflicts) ? changes.conflicts : [];
  const validatedConflicts = conflicts.filter(c => c && typeof c === "object" && String(c.evidence || "").trim()).map(c => ({
    chapter: n,
    characterName: c.characterName || "",
    field: c.field || "",
    oldValue: c.oldValue || "",
    newValue: c.newValue || "",
    description: c.description || "",
    evidence: String(c.evidence).trim()
  }));
  if (validatedConflicts.length) status.conflicts.push(...validatedConflicts);

  const log = {
    chapter: n,
    appliedAt: Date.now(),
    appliedCount: applied,
    conflicts: validatedConflicts.length,
    changes: changes
  };
  status.changeLog.push(log);
  // Keep the full change log; older status history is part of long-term canon.
  status.conflicts = status.conflicts.slice(-50);
  status.schemaVersion = 2;
  return { status, applied, conflicts: validatedConflicts.length };
}

function formatStatus(obj, n) {
  // Giữ hàm cũ để dữ liệu legacy vẫn đọc được; dữ liệu mới dùng formatStatusV2.
  if (obj && obj.schemaVersion >= 2 && obj.currentState) return formatStatusV2(obj, n);
  const lines = [`Current Status Update - Sau Chương ${n}`];
  const map = [
    ["Tình hình chung", obj.currentSituation], ["Nhân vật chính", obj.mainCharacter], ["Nhân vật liên quan", obj.characters],
    ["Vị trí", obj.locations], ["Sức mạnh/cảnh giới", obj.power], ["Quan hệ", obj.relationships],
    ["Bí mật/kiến thức", obj.knowledge], ["Vấn đề chưa giải quyết", obj.unresolved], ["Hệ quả tiếp theo", obj.nextHooks]
  ];
  map.forEach(([k, v]) => { if (v) lines.push(`- ${k}: ${v}`); });
  return lines.join("\n");
}

async function updateCurrentStatus(job, chapter, n, state) {
  const res = { ok: false, notes: [], problems: [] };
  if (timeLeft() < 90000) { res.notes.push("Status: BỎ QUA vì còn dưới 90 giây"); res.problems.push("Status: bỏ qua vì không còn đủ thời gian an toàn"); return res; }

  const previous = state.currentStatus || "(chưa có)";
  const roster = statusCharacterRoster(state);
  const rosterText = roster.length ? roster.map(c => `- ${c.id} | ${c.name} | vai trò:${c.role} | tier:${c.tier}`).join("\n") : "(chưa có danh sách nhân vật)";
  const source = [
    "CURRENT STATUS HIỆN TẠI:", previous,
    "",
    "DANH SÁCH NHÂN VẬT ĐÃ TỒN TẠI (KHÔNG ĐƯỢC TỰ TẠO NHÂN VẬT MỚI):", rosterText,
    "",
    "TÓM TẮT CHƯƠNG:", chapter.summary || "",
    "",
    "ĐOẠN CUỐI CHƯƠNG:", chapter.text.slice(-9000)
  ].join("\n");

  const keys = ["changes"];
  try {
    const r = await callExtract({
      endpoint: job.apiEndpoint, apiKey: job.apiKey, model: job.model,
      messages: [{
        role: "user",
        content: [
          `CẬP NHẬT CURRENT STATUS SAU CHƯƠNG ${n} — CHỈ TRÍCH XUẤT THAY ĐỔI.`,
          "Đây là hệ thống CHANGE → VALIDATE → MERGE. TUYỆT ĐỐI không viết lại toàn bộ Current Status.",
          "1) Chỉ đánh dấu UPDATED/ADDED/RESOLVED khi chương có bằng chứng rõ ràng.",
          "2) Không được xóa dữ liệu cũ chỉ vì chương không nhắc lại.",
          "3) Không được tự tạo nhân vật mới. Chỉ cập nhật nhân vật có trong DANH SÁCH NHÂN VẬT.",
          "4) Mỗi thay đổi phải có evidence là mô tả ngắn, bám trực tiếp vào nội dung chương.",
          "5) Nếu thông tin mới mâu thuẫn với dữ liệu cũ mà chưa đủ căn cứ để ghi đè, đưa vào conflicts thay vì cập nhật.",
          "6) Nhân vật không thay đổi phải được ghi status=unchanged hoặc để hệ thống tự bổ sung; không xóa hồ sơ cũ.",
          "7) Tất cả output bằng TIẾNG VIỆT.",
          source,
          `Trả DUY NHẤT JSON theo schema:
{
  "changes": {
    "time":{"status":"updated|unchanged","value":"","evidence":""},
    "situation":{"status":"updated|unchanged","value":"","evidence":""},
    "mainEvent":{"status":"updated|unchanged","value":"","evidence":""},
    "location":{"status":"updated|unchanged","value":"","evidence":""},
    "overall":{"status":"updated|unchanged","value":"","evidence":""},
    "mainCharacter":{"status":"updated|unchanged","value":"","evidence":""},
    "relationships":{"status":"updated|unchanged","value":"","evidence":""},
    "power":{"status":"updated|unchanged","value":"","evidence":""},
    "rules":{"status":"added|updated|unchanged","value":"","evidence":""},
    "conflict":{"status":"added|updated|unchanged","value":"","evidence":""},
    "nextGoal":{"status":"updated|unchanged","value":"","evidence":""},
    "knowledge":{"status":"added|updated|unchanged","value":"","evidence":""},
    "unresolved":{"status":"added|resolved|updated|unchanged","value":"","evidence":""},
    "secrets":{"status":"added|resolved|updated|unchanged","value":"","evidence":""},
    "weaknesses":{"status":"added|updated|unchanged","value":"","evidence":""},
    "characterChanges":[
      {
        "characterId":"",
        "characterName":"",
        "status":"updated|unchanged",
        "changes":{"age":"","appearance":"","body":"","clothing":"","marks":"","cultivation":"","cultivationState":"","emotion":"","submission":"","ruleCompliance":"","socialStatus":"","occupation":"","residence":"","romance":"","weakness":"","goals":"","items":"","publicPersonality":"","privatePersonality":"","psychology":"","relationships":"","physicalState":"","mentalState":"","knowledge":""},
        "evidence":""
      }
    ],
    "conflicts":[
      {"characterName":"","field":"","oldValue":"","newValue":"","description":"","evidence":""}
    ]
  }
}`,
          "Không điền giá trị cho trường không thay đổi. Không dùng null cho thay đổi. Không markdown."
        ].join("\n\n")
      }],
      maxTokens: 5200, temperature: 0.10
    }, 2);

    const parsed = await parseObjectWithRepair(job, r.text, keys);
    const extraction = parsed.obj;
    if (!extraction || !extraction.changes || typeof extraction.changes !== "object") {
      res.notes.push(`Status: KHÔNG đọc được change JSON (${fin(r)}, đầu: "${sampleOf(r.text)}")`);
      res.problems.push("Status: change extraction lỗi; Status cũ được giữ nguyên");
      return res;
    }

    const merged = mergeStatusChanges(state, n, extraction);
    if (!merged.applied && !merged.conflicts) {
      // Không coi output rỗng là lý do để xóa/ghi đè Current Status.
      res.notes.push("Status: không có thay đổi có bằng chứng; giữ nguyên trạng thái cũ");
      state.statusState = merged.status;
      state.currentStatus = formatStatusV2(merged.status, n);
      state.lastStatusChapter = n;
      res.ok = true;
      return res;
    }

    state.statusState = merged.status;
    state.currentStatus = formatStatusV2(merged.status, n);
    state.lastStatusChapter = n;
    res.ok = true;
    res.notes.push(`Status: CHANGE→VALIDATE→MERGE, áp dụng ${merged.applied} thay đổi, ${merged.conflicts} xung đột; ${fin(r)}, parse=${parsed.method || "?"}`);
    if (r.finishReason === "length") res.problems.push("Status: model bị cắt cụt; chỉ merge thay đổi hợp lệ đã đọc được");
    return res;
  } catch (e) {
    res.notes.push(`Status: LỖI — ${sampleOf(e.message, 160)}`);
    res.problems.push("Status: lỗi gọi model; Status cũ được giữ nguyên");
    return res;
  }
}

async function updateLongMemory(job, chapter, n, state) {
  const res = { ok: false, notes: [], problems: [] };
  if (timeLeft() < 90000) { res.notes.push("Memory: BỎ QUA vì còn dưới 90 giây"); res.problems.push("Memory: bỏ qua vì không còn đủ thời gian an toàn"); return res; }
  if (!Array.isArray(state.timeline)) state.timeline = [];
  if (!Array.isArray(state.foreshadowing)) state.foreshadowing = [];
  if (!Array.isArray(state.knowledgeLedger)) state.knowledgeLedger = [];
  const source = [
    "TÓM TẮT:", chapter.summary || "",
    "ĐOẠN ĐẦU:", chapter.text.slice(0, 3500),
    "ĐOẠN CUỐI:", chapter.text.slice(-7500),
    "FORESHADOWING ĐANG MỞ:", state.foreshadowing.filter(x => !["paid_off", "abandoned", "resolved"].includes(x.status)).slice(-20).map(x => `${x.description} [${x.status}]`).join("\n")
  ].join("\n\n");
  const keys = ["events", "foreshadowing", "knowledge"];
  try {
    const r = await callExtract({ endpoint: job.apiEndpoint, apiKey: job.apiKey, model: job.model, messages: [{ role: "user", content: [
      `CẬP NHẬT LONG-TERM MEMORY SAU CHƯƠNG ${n}.`,
      "Chỉ ghi sự kiện có bằng chứng. Không bịa. Mỗi mục ngắn gọn (tối đa 30 từ). Không dùng dấu \" bên trong chuỗi.",
      source,
      'Trả DUY NHẤT JSON: {"events":[{"type":"event|consequence|reveal|death|power_change","summary":"","causes":"","consequences":""}],"foreshadowing":[{"description":"","status":"seeded|developing|paid_off|abandoned","match":"","characters":""}],"knowledge":[{"character":"","fact":"","confidence":"direct|inferred|reported"}]}'
    ].join("\n\n") }], maxTokens: 5200, temperature: 0.10 }, 2);
    const parsed = await parseObjectWithRepair(job, r.text, keys);
    const obj = parsed.obj;
    if (!obj) { res.notes.push(`Memory: KHÔNG đọc được JSON (${fin(r)}, đầu: "${sampleOf(r.text)}")`); res.problems.push("Memory: không đọc được JSON; dữ liệu cũ được giữ"); return res; }
    const b = [state.timeline.length, state.foreshadowing.length, state.knowledgeLedger.length];
    (Array.isArray(obj.events) ? obj.events : []).forEach(e => {
      if (!e?.summary) return;
      state.timeline.push({ id: genId("ev"), chapter: n, type: e.type || "event", summary: e.summary, causes: e.causes || "", consequences: e.consequences || "" });
    });
    (Array.isArray(obj.foreshadowing) ? obj.foreshadowing : []).forEach(f => {
      if (!f?.description) return;
      const key = normalizeName(f.match || f.description).slice(0, 60);
      let x = state.foreshadowing.find(a => normalizeName(a.description).slice(0, 60) === key || normalizeName(a.description).includes(key.slice(0, 30)));
      if (!x) state.foreshadowing.push({ id: genId("fs"), description: f.description, status: f.status || "seeded", plantedChapter: n, lastUpdated: n, characters: f.characters || "" });
      else { if (f.status) x.status = f.status; x.lastUpdated = n; if (f.characters) x.characters = f.characters; }
    });
    (Array.isArray(obj.knowledge) ? obj.knowledge : []).forEach(k => {
      if (!k?.character || !k?.fact) return;
      const key = normalizeName(k.character) + "|" + normalizeName(k.fact).slice(0, 80);
      let x = state.knowledgeLedger.find(a => normalizeName(a.character) + "|" + normalizeName(a.fact).slice(0, 80) === key);
      if (!x) state.knowledgeLedger.push({ id: genId("kl"), character: k.character, fact: k.fact, confidence: k.confidence || "direct", firstChapter: n, lastUpdated: n });
      else x.lastUpdated = n;
    });
    const added = [state.timeline.length - b[0], state.foreshadowing.length - b[1], state.knowledgeLedger.length - b[2]];
    // Keep all existing long-term memories. New entries are de-duplicated before append.
    state.lastMemorySyncChapter = n;
    res.ok = true;
    res.notes.push(`Memory: ${fin(r)}, parse=${parsed.method || "?"}, +${added[0]} sự kiện, +${added[1]} foreshadowing, +${added[2]} knowledge`);
    if (r.finishReason === "length") res.problems.push("Memory: model bị cắt cụt");
    return res;
  } catch (e) { res.notes.push(`Memory: LỖI — ${sampleOf(e.message, 160)}`); res.problems.push("Memory: lỗi gọi model; dữ liệu cũ được giữ"); return res; }
}

/* V12.30: one model request for the whole postprocess. Parsing and merging are deliberately
   deterministic: no JSON-repair model call, and a missing/invalid section never clears stored data. */
function unifiedPostprocessPrompt(job, chapter, n, state) {
  const source = representativeText(String(chapter.text || ""), 90000);
  const characters = (Array.isArray(state.characters) ? state.characters : []).slice(0, 70).map(c => ({
    id:c.id, name:c.name, tier:c.tier, age:c.age, gender:c.gender, role:c.role,
    position:c.position, occupation:c.occupation, faction:c.faction,
    appearance:String(c.appearance||"").slice(0,180), personality:String(c.personality||"").slice(0,180),
    goals:String(c.goals||"").slice(0,140), currentLocation:c.currentLocation,
    physicalState:c.physicalState, mentalState:c.mentalState, dead:!!c.dead,
    coreLocked:c.coreLocked !== false
  }));
  const world = {
    locations:(state.locations||[]).slice(-35).map(x=>({name:x.name,description:String(x.description||"").slice(0,100),status:x.status})),
    items:(state.items||[]).slice(-35).map(x=>({name:x.name,description:String(x.description||"").slice(0,100),owner:x.owner,status:x.status})),
    threads:(state.threads||[]).slice(-25).map(x=>({type:x.type,desc:String(x.desc||"").slice(0,150),status:x.status})),
    openForeshadowing:(state.foreshadowing||[]).filter(x=>!["paid_off","abandoned","resolved"].includes(x.status)).slice(-20).map(x=>({description:String(x.description||"").slice(0,150),status:x.status})),
    recentTimeline:(state.timeline||[]).slice(-12).map(x=>({chapter:x.chapter,summary:String(x.summary||"").slice(0,160)})),
    recentKnowledge:(state.knowledgeLedger||[]).slice(-20).map(x=>({character:x.character,fact:String(x.fact||"").slice(0,140)}))
  };
  const oldStatus = String(state.currentStatus || "").slice(-14000);
  const previousChapter = n > 1 ? (state.chapters || [])[n - 2] : null;
  const previousEnding = previousChapter && String(previousChapter.text || "").slice(-1800);
  const adult = !!chapter.isNsfw;
  return [
    `HẬU KỲ TỔNG HỢP CHO CHƯƠNG ${n}: thực hiện TẤT CẢ tác vụ dưới đây trong MỘT phản hồi JSON.`,
    "Bạn chỉ trích xuất/đồng bộ dữ liệu. Không viết lại chương, không suy diễn, không tạo canon mới nếu không có bằng chứng.",
    "NGUYÊN TẮC AN TOÀN: dữ liệu hiện có là canon. Chỉ trả các thay đổi được chương mới chứng minh. Không có thay đổi thì trả mảng rỗng/chuỗi rỗng; KHÔNG lặp lại hoặc thay thế dữ liệu cũ. Mọi mục cập nhật phải có evidence là một trích đoạn ngắn 5–18 từ lấy từ chính chương. Không dùng bằng chứng bịa.",
    "NHÂN VẬT: chỉ trả NV có xuất hiện/có diễn biến đáng kể trong chương; name phải khớp tên có trong chương. Hồ sơ gốc role/occupation/position/faction/identity không được đổi. Chỉ đổi nghề/vai trò khi có sự kiện trực tiếp nêu rõ + explicitCoreChange=true + changeEvidence là câu trích dẫn có thật và có nhắc chính vai trò mới. Với nhân vật cũ, chỉ điền điểm mới; trường rỗng nghĩa là không thay đổi. Không tự nâng tier hoặc đổi quan hệ chỉ từ cách xưng hô. Nếu người đã có trong danh sách, dùng đúng tên và id trong danh sách. Mọi trường trạng thái hiện tại (currentLocation/physicalState/mentalState/secret) bắt buộc có stateEvidence riêng; mọi trường hồ sơ khác có fieldEvidence riêng. Evidence phải trích đúng chương và phải chứa các từ khóa phản ánh chính giá trị được đề xuất; nếu không có bằng chứng riêng thì để trống trường đó. Với NV mới, không được cấp role/occupation/position/faction/age/gender hay hồ sơ suy đoán khi thiếu fieldEvidence. isDead=true bắt buộc deathEvidence trích đoạn thể hiện rõ cái chết.",
    "WORLD: chỉ thêm/cập nhật địa điểm, vật phẩm, thread đang diễn ra hoặc có kết quả rõ ràng; không xóa mục đã có. Không tự kết thúc thread nếu chương chưa thể hiện việc giải quyết.",
    "CURRENT STATUS: trả CHANGE→VALIDATE→MERGE. Mỗi thay đổi cần evidence. Không tự tạo nhân vật: characterChanges phải khớp characterId hoặc name trong roster. Xung đột chưa có căn cứ thì ghi conflicts, không ghi đè.",
    "LONG-TERM MEMORY: chỉ thêm sự kiện có ý nghĩa, tri thức của từng nhân vật và thay đổi foreshadowing có bằng chứng; không lặp lại mục hiện có. Giữ thông tin ai biết điều gì, không gán kiến thức cho nhân vật không biết.",
    "CONTINUITY: rà mâu thuẫn cụ thể với hồ sơ nhân vật, Current Status, world rules, tri thức đã biết và đoạn cuối chương trước. Chỉ cảnh báo mâu thuẫn thực sự; không báo chỉ vì thiếu thông tin. Mỗi cảnh báo phải có evidence trích từ chương hiện tại và canonReference nêu quy tắc/dữ kiện đối chiếu. Nếu không có, trả mảng []. Không tự sửa canon ở bước này.",
    "SUMMARY: tiếng Việt, mở đầu bằng **Tóm tắt chương:**, 250–400 từ, theo đúng thứ tự, giữ sự kiện/nhân vật thật, không bổ sung. " + (adult ? "Với cảnh trưởng thành, tóm tắt trung lập nhưng không bỏ qua sự kiện/quyết định/hệ quả quan trọng." : ""),
    "NEXT HINT: tiếng Việt, khoảng 150–260 từ, tiếp nối trực tiếp điểm kết; 1–3 sự kiện chính; dùng nhân vật/thread hiện có, không mở tuyến lớn mới, không tự thêm nhân vật quan trọng. Nêu điểm kết chương rõ ràng.",
    "Không trả markdown fence. Toàn bộ phản hồi phải là MỘT JSON object hợp lệ. Không dùng dấu nháy kép trong nội dung chuỗi trừ escaping JSON đúng chuẩn.",
    "NHÂN VẬT ĐÃ CÓ (nguồn sự thật):\n" + JSON.stringify(characters),
    "WORLD + MEMORY ĐÃ CÓ (chỉ để đối chiếu, không viết lại):\n" + JSON.stringify(world),
    "CURRENT STATUS CŨ (giữ toàn bộ phần không đổi):\n" + oldStatus,
    "MAIN CHARACTER PROFILE:\n" + JSON.stringify(state.mainCharProfile || {}),
    "ĐOẠN CUỐI CHƯƠNG TRƯỚC (đối chiếu continuity; có thể rỗng ở chương đầu):\n" + String(previousEnding || ""),
    "CHAPTER SUMMARY/CONTENT SOURCE — chỉ nguồn này chứng minh diễn biến:\n<chapter>\n" + source + "\n</chapter>",
    `JSON SCHEMA (điền chính xác các khóa): {"summary":"","characters":[{"name":"","evidence":"","fieldEvidence":{"age":"","gender":"","position":"","role":"","occupation":"","faction":"","appearance":"","personality":"","goals":"","secret":"","weakness":"","fear":"","knowledge":"","chapterEvent":"","speech":"","height":"","bodyType":"","hair":"","eyes":"","skin":"","relevanceToMC":"","voice":"","scent":"","style":"","scars":"","tattoos":"","schedule":"","strength":"","independentPlot":"","sexualExperience":"","boundaries":"","taboos":"","preferences":"","attractionToMC":"","tensionWithMC":"","consentNotes":""},"stateEvidence":{"currentLocation":"","physicalState":"","mentalState":"","secret":""},"relationshipWithMainEvidence":{"stage":"","trust":"","respect":"","affection":"","attraction":"","suspicion":"","tension":"","boundaries":"","notes":""},"deathEvidence":"","tier":"","age":"","gender":"","position":"","speech":"","height":"","bodyType":"","hair":"","eyes":"","skin":"","role":"","relevanceToMC":"","voice":"","scent":"","style":"","scars":"","tattoos":"","schedule":"","strength":"","independentPlot":"","sexualExperience":"","boundaries":"","taboos":"","preferences":"","attractionToMC":"","tensionWithMC":"","consentNotes":"","appearance":"","personality":"","occupation":"","faction":"","goals":"","secret":"","weakness":"","fear":"","knowledge":"","currentLocation":"","physicalState":"","mentalState":"","chapterEvent":"","relationshipWithMain":{},"relationships":[{"withName":"","evidence":"","fieldEvidence":{"stage":"","trust":"","respect":"","affection":"","attraction":"","suspicion":"","tension":"","boundaries":"","notes":""}}],"isDead":false,"explicitCoreChange":false,"changeEvidence":""}], "world":{"locations":[{"name":"","description":"","status":"","evidence":"","fieldEvidence":{"description":"","status":""}}],"items":[{"name":"","description":"","owner":"","status":"","evidence":"","fieldEvidence":{"description":"","owner":"","status":""}}],"threads":[{"type":"","desc":"","status":"","matchExistingDesc":"","evidence":"","fieldEvidence":{"desc":"","status":""}}]},"status":{"changes":{"time":{},"situation":{},"mainEvent":{},"location":{},"overall":{},"mainCharacter":{},"relationships":{},"power":{},"rules":{},"conflict":{},"nextGoal":{},"knowledge":{},"unresolved":{},"secrets":{},"weaknesses":{},"characterChanges":[{"characterId":"","characterName":"","status":"updated","changes":{},"changeEvidence":{},"evidence":""}],"conflicts":[{"characterName":"","field":"","oldValue":"","newValue":"","description":"","evidence":""}]}},"memory":{"events":[{"type":"event","summary":"","causes":"","consequences":"","evidence":""}],"foreshadowing":[{"description":"","status":"seeded","match":"","characters":"","evidence":""}],"knowledge":[{"character":"","fact":"","confidence":"direct","evidence":""}]},"continuityWarnings":[{"type":"","description":"","canonReference":"","severity":"warning","evidence":""}],"nextChapterHint":""}`,
    "Đối với mỗi thay đổi Status field, giá trị có dạng {\"status\":\"updated|added|resolved\",\"value\":\"...\",\"evidence\":\"trích đoạn\"}. Không tạo khóa lạ. Nếu không có thay đổi: mảng [] và value rỗng. Chỉ tiếng Việt."
  ].join("\n\n");
}

function labelsForUnifiedPostProcess() { return ["Summary", "NV", "Thế giới", "Status", "Memory", "Continuity", "Scene", "Gợi ý chương sau"]; }

function validEvidenceItems(items, source) {
  return (Array.isArray(items) ? items : []).filter(x => x && typeof x === "object" && String(x.evidence || "").trim() && evidenceInText(x.evidence, source));
}
function containsNamePhrase(name, source) {
  const hay = (" " + normalizeName(source).replace(/[^\p{L}\p{N}]+/gu, " ").trim() + " ");
  const needle = normalizeName(name).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return !!needle && hay.includes(" " + needle + " ");
}
function filterRelationshipObject(obj, evidenceMap, source) {
  if (!isPlainObj(obj)) return {};
  const out = {};
  Object.keys(obj).forEach(k => {
    const val = obj[k];
    if (typeof val === "string" && val.trim() && fieldEvidenceSupports(val, evidenceMap && evidenceMap[k], source, 0.45)) out[k] = val;
  });
  return out;
}

async function runUnifiedPostProcess(job, chapter, n, state) {
  const labels = ["Summary", "NV", "Thế giới", "Status", "Memory", "Continuity", "Scene", "Gợi ý chương sau"];
  const tasks = Object.fromEntries(labels.map(k => [k, {ok:false, notes:[], problems:[]} ]));
  const res = { ok:false, notes:[], problems:[], tasks, callCount:0 };
  const stateBefore = JSON.stringify(state);
  const chapterBefore = JSON.stringify(chapter);
  const summaryBefore = chapter.summary;
  const source = String(chapter.text || "");
  if (!source.trim()) {
    res.problems.push("Hậu kỳ: chương rỗng; không thay đổi dữ liệu.");
    return res;
  }
  try {
    // Chọn model chính cho toàn gói hậu kỳ (không thay cấu hình model/provider của người dùng).
    // Gộp tác vụ bắt buộc dùng chung một phản hồi, nên ưu tiên tính nhất quán canon.
    const r = await callWithRetry({
      endpoint: job.apiEndpoint, apiKey: job.apiKey, model: job.model,
      messages: [
        { role:"system", content:"Bạn là bộ đồng bộ canon và bộ nhớ tiểu thuyết dài kỳ tiếng Việt. Chỉ trả một JSON object hoàn chỉnh, không markdown. Ưu tiên dữ liệu cũ; chỉ đề xuất delta có evidence lấy từ chương." },
        { role:"user", content: unifiedPostprocessPrompt(job, chapter, n, state) }
      ],
      maxTokens:16000, temperature:0.1
    }, 1); // V12.30: không gọi lại AI lần 2; lỗi tạm thời thì fail-safe, giữ dữ liệu cũ.
    res.callCount = 1;
    if (r.finishReason === "length") throw new Error("Kết quả JSON bị cắt ở giới hạn token; đã giữ nguyên toàn bộ dữ liệu cũ để tránh cập nhật thiếu.");
    const parsed = tryParse(stripFences(String(r.text || "")));
    const data = parsed && parsed.ok && isPlainObj(parsed.value) ? parsed.value : null;
    if (!data) throw new Error("Không đọc được JSON tổng hợp hoàn chỉnh; đã giữ nguyên dữ liệu cũ.");

    // 1) Summary: grounded check + local cap only. Never clear a previous summary.
    if (typeof data.summary === "string" && data.summary.trim()) {
      let summary = data.summary.trim();
      const wc = summary.split(/\s+/).filter(Boolean).length;
      if (wc > 450) {
        const words = summary.split(/\s+/).slice(0, 420).join(" ");
        const cut = Math.max(words.lastIndexOf(". "), words.lastIndexOf("! "), words.lastIndexOf("? "));
        summary = cut > words.length * 0.6 ? words.slice(0, cut + 1) : words;
      }
      if (summaryGrounded(summary, source).ok) {
        chapter.summary = summary;
        tasks.Summary = {ok:true, notes:["Summary: đã cập nhật từ cùng phản hồi JSON."], problems:[]};
      } else {
        const fallback = extractiveSummary(source);
        if (!chapter.summary && fallback) chapter.summary = fallback;
        tasks.Summary = {ok:!!(chapter.summary || fallback), notes:["Summary: bản AI không vượt kiểm tra căn cứ; đã giữ/tạo tóm tắt trích xuất an toàn."], problems:[]};
      }
    } else {
      if (!chapter.summary) chapter.summary = extractiveSummary(source) || "";
      tasks.Summary = {ok:!!chapter.summary, notes:["Summary: phản hồi không có tóm tắt hợp lệ; không xóa tóm tắt cũ."], problems:[]};
    }

    // 2) Character database. Each row needs evidence from the real chapter.
    if (Array.isArray(data.characters)) {
      let created=0, updated=0, skipped=0;
      validEvidenceItems(data.characters, source).forEach(u => {
        const nm = String(u.name || "").trim();
        if (!nm || !containsNamePhrase(nm, source)) { skipped++; return; }
        const rosterNames = (state.characters || []).map(c => normalizeName(c.name));
        const isExisting = rosterNames.includes(normalizeName(nm)) || normalizeName(state.mainCharProfile && state.mainCharProfile.name) === normalizeName(nm);
        if (!isExisting) {
          // Chỉ tạo nhân vật phụ/minor khi có sự kiện xuất hiện cụ thể và evidence trong chương.
          // Tuyệt đối không cho một lượt trích xuất tự xếp nhân vật mới thành main/major.
          const tier = normalizeName(u.tier || "supporting");
          if (!String(u.chapterEvent || "").trim() || ["main", "major", "protagonist", "lead", "chinh", "chinh tuyen"].includes(tier)) { skipped++; return; }
          u = Object.assign({}, u, { tier: ["minor", "background", "cameo"].includes(tier) ? tier : "supporting" });
        }
        try {
          const safeU = Object.assign({}, u);
          const fe = safeU.fieldEvidence && typeof safeU.fieldEvidence === "object" ? safeU.fieldEvidence : {};
          const se = safeU.stateEvidence && typeof safeU.stateEvidence === "object" ? safeU.stateEvidence : {};
          const fieldNames = ["age","gender","position","role","occupation","faction","appearance","personality","goals","secret","weakness","fear","knowledge","chapterEvent","speech","height","bodyType","hair","eyes","skin","relevanceToMC","voice","scent","style","scars","tattoos","schedule","strength","independentPlot","sexualExperience","boundaries","taboos","preferences","attractionToMC","tensionWithMC","consentNotes"];
          fieldNames.forEach(field => { if (safeU[field] && !fieldEvidenceSupports(safeU[field], fe[field] || (field === "secret" ? se.secret : ""), source, 0.55)) safeU[field] = ""; });
          ["currentLocation","physicalState","mentalState"].forEach(field => { if (safeU[field] && !fieldEvidenceSupports(safeU[field], se[field], source, 0.55)) safeU[field] = ""; });
          if (safeU.secret && !fieldEvidenceSupports(safeU.secret, se.secret || fe.secret, source, 0.55)) safeU.secret = "";
          safeU.relationshipWithMain = filterRelationshipObject(safeU.relationshipWithMain, safeU.relationshipWithMainEvidence, source);
          safeU.relationships = (Array.isArray(safeU.relationships) ? safeU.relationships : []).filter(rel => rel && rel.withName && containsNamePhrase(rel.withName, source) && String(rel.evidence || "").trim() && evidenceInText(rel.evidence, source)).map(rel => Object.assign({}, rel, { fieldEvidence: rel.fieldEvidence || {} }));
          safeU.relationships.forEach(rel => {
            ["stage","trust","respect","affection","attraction","suspicion","tension","boundaries","notes"].forEach(field => { if (rel[field] && !fieldEvidenceSupports(rel[field], rel.fieldEvidence[field] || rel.evidence, source, 0.45)) rel[field] = ""; });
          });
          safeU.relationships = safeU.relationships.filter(rel => ["stage","trust","respect","affection","attraction","suspicion","tension","boundaries","notes"].some(k => String(rel[k] || "").trim()));
          if (safeU.isDead === true && !(/\b(chết|tử vong|mất mạng|thiệt mạng|qua đời|bị giết)\b/i.test(String(safeU.deathEvidence || "")) && evidenceInText(safeU.deathEvidence, source))) safeU.isDead = false;
          if (safeU.chapterEvent && !fieldEvidenceSupports(safeU.chapterEvent, fe.chapterEvent || safeU.evidence, source, 0.45)) safeU.chapterEvent = "";
          const m = mergeCharacter(state, safeU, n, source); if (m.created) created++; else if (m.updated) updated++;
        }
        catch (_) { skipped++; }
      });
      tasks.NV = {ok:true, notes:[`NV: +${created} mới, ${updated} cập nhật có bằng chứng, ${skipped} bỏ qua.`], problems:[]};
    } else tasks.NV = {ok:false, notes:["NV: thiếu mảng hợp lệ; giữ nguyên Character Database."], problems:["NV: output không có mảng characters."]};

    // 3) World updates, evidence-checked. Existing entities are never deleted.
    if (isPlainObj(data.world) && Array.isArray(data.world.locations) && Array.isArray(data.world.items) && Array.isArray(data.world.threads)) {
      const worldRows = (rows, kind) => validEvidenceItems(rows, source).filter(x => {
        if (kind === "threads") return String(x.desc || "").trim() && fieldEvidenceSupports(x.desc, (x.fieldEvidence || {}).desc || x.evidence, source, 0.35);
        return !!x.name && containsNamePhrase(x.name, source);
      }).map(x => {
        const fe = x.fieldEvidence && typeof x.fieldEvidence === "object" ? x.fieldEvidence : {};
        if (x.description && !fieldEvidenceSupports(x.description, fe.description || x.evidence, source, 0.35)) x.description = "";
        if (x.owner && !fieldEvidenceSupports(x.owner, fe.owner || x.evidence, source, 0.45)) x.owner = "";
        if (x.status && !fieldEvidenceSupports(x.status, fe.status || "", source, 0.55)) x.status = "";
        if (kind === "threads" && x.status && !fieldEvidenceSupports(x.status, fe.status, source, 0.55)) x.status = "";
        return x;
      });
      const wo = {
        locations: worldRows(data.world.locations, "locations"),
        items: worldRows(data.world.items, "items"),
        threads: worldRows(data.world.threads, "threads")
      };
      const before=[(state.locations||[]).length,(state.items||[]).length,(state.threads||[]).length];
      applyWorld(wo, n, state);
      tasks["Thế giới"]={ok:true,notes:[`Thế giới: +${state.locations.length-before[0]} địa điểm, +${state.items.length-before[1]} vật phẩm, +${state.threads.length-before[2]} thread (đã kiểm tra evidence).`],problems:[]};
    } else tasks["Thế giới"]={ok:false,notes:["Thế giới: thiếu object/mảng locations-items-threads hoàn chỉnh; giữ nguyên dữ liệu."],problems:["World output không hợp lệ hoặc bị thiếu mảng."]};

    // 4) Status: only accept changes whose evidence occurs in this chapter.
    if (isPlainObj(data.status) && isPlainObj(data.status.changes)) {
      const changes = JSON.parse(JSON.stringify(data.status.changes));
      const statusKeys=["time","situation","mainEvent","location","overall","mainCharacter","relationships","power","rules","conflict","nextGoal","knowledge","unresolved","secrets","weaknesses"];
      statusKeys.forEach(k=>{ const item=changes[k]; if(item && typeof item==="object" && !fieldEvidenceSupports(item.value,item.evidence,source,0.55)) delete changes[k]; });
      changes.characterChanges = validEvidenceItems(changes.characterChanges, source).map(item => {
        const clean = Object.assign({}, item, {changes:{}});
        const fieldEvidence = item.changeEvidence && typeof item.changeEvidence === "object" ? item.changeEvidence : {};
        Object.keys(item.changes && typeof item.changes === "object" ? item.changes : {}).forEach(field => {
          const value = item.changes[field]; const ev = fieldEvidence[field] || item.evidence;
          if (fieldEvidenceSupports(value, ev, source, 0.55)) clean.changes[field] = value;
        });
        return clean;
      }).filter(item => Object.keys(item.changes || {}).length > 0);
      changes.conflicts = validEvidenceItems(changes.conflicts, source);
      const merged=mergeStatusChanges(state,n,{changes});
      state.statusState=merged.status; state.currentStatus=formatStatusV2(merged.status,n); state.lastStatusChapter=n;
      tasks.Status={ok:true,notes:[`Status: ${merged.applied} thay đổi có evidence, ${merged.conflicts} xung đột được ghi; các mục cũ không được nhắc lại vẫn giữ nguyên.`],problems:[]};
    } else tasks.Status={ok:false,notes:["Status: thiếu object hợp lệ; giữ nguyên Current Status và statusState."],problems:["Status output không hợp lệ."]};

    // 5) Long-term memory: evidence-based adds only; never trim historic records.
    if (isPlainObj(data.memory) && Array.isArray(data.memory.events) && Array.isArray(data.memory.foreshadowing) && Array.isArray(data.memory.knowledge)) {
      ["timeline","foreshadowing","knowledgeLedger"].forEach(k=>{ if(!Array.isArray(state[k])) state[k]=[]; });
      const mem=data.memory;
      let evAdded=0, fsAdded=0, klAdded=0, skipped=0;
      validEvidenceItems(mem.events,source).forEach(e=>{
        if(!e.summary || !fieldEvidenceSupports(e.summary,e.evidence,source,0.45)) { skipped++; return; }
        const key=normalizeName(e.summary);
        if(state.timeline.some(x=>x.chapter===n && normalizeName(x.summary)===key)) return;
        state.timeline.push({id:genId("ev"),chapter:n,type:e.type||"event",summary:e.summary,causes:e.causes||"",consequences:e.consequences||""}); evAdded++;
      });
      validEvidenceItems(mem.foreshadowing,source).forEach(f=>{
        if(!f.description || !fieldEvidenceSupports(f.description,f.evidence,source,0.45)) { skipped++; return; }
        const key=normalizeName(f.match||f.description).slice(0,60);
        let x=state.foreshadowing.find(a=>normalizeName(a.description).slice(0,60)===key || (key.length>=24 && normalizeName(a.description).includes(key.slice(0,30))));
        if(!x) {state.foreshadowing.push({id:genId("fs"),description:f.description,status:f.status||"seeded",plantedChapter:n,lastUpdated:n,characters:f.characters||""});fsAdded++;}
        else {
          const terminal = ["paid_off", "abandoned", "resolved"].includes(String(x.status || "").toLowerCase());
          if(f.status && (!terminal || String(f.status).toLowerCase() === String(x.status).toLowerCase())) x.status=f.status;
          x.lastUpdated=n;if(f.characters)x.characters=f.characters;
        }
      });
      validEvidenceItems(mem.knowledge,source).forEach(k=>{
        if(!k.character||!k.fact || !fieldEvidenceSupports(k.fact,k.evidence,source,0.45)) {skipped++;return;}
        const key=normalizeName(k.character)+"|"+normalizeName(k.fact).slice(0,80);
        const exists=state.knowledgeLedger.some(a=>normalizeName(a.character)+"|"+normalizeName(a.fact).slice(0,80)===key);
        if(!exists){state.knowledgeLedger.push({id:genId("kl"),character:k.character,fact:k.fact,confidence:k.confidence||"direct",firstChapter:n,lastUpdated:n});klAdded++;}
      });
      state.lastMemorySyncChapter=Math.max(Number(state.lastMemorySyncChapter)||0,n);
      tasks.Memory={ok:true,notes:[`Memory: +${evAdded} timeline, +${fsAdded} foreshadowing, +${klAdded} knowledge; bỏ ${skipped} mục không hợp lệ. Không cắt lịch sử cũ.`],problems:[]};
    } else tasks.Memory={ok:false,notes:["Memory: thiếu object/mảng events-foreshadowing-knowledge hoàn chỉnh; giữ nguyên bộ nhớ đã có và không đánh dấu đã đồng bộ."],problems:["Memory output không hợp lệ hoặc bị thiếu mảng."]};

    // 6) Continuity warnings come from the same model response; preserve any older warnings.
    if (Array.isArray(data.continuityWarnings)) {
      const accepted = validEvidenceItems(data.continuityWarnings, source).filter(w => String(w.description || "").trim() && String(w.canonReference || "").trim());
      if (!Array.isArray(chapter.continuityWarnings)) chapter.continuityWarnings = [];
      let added = 0;
      accepted.forEach(w => {
        const key = normalizeName(w.description) + "|" + normalizeName(w.evidence);
        if (chapter.continuityWarnings.some(x => normalizeName(x.description || x.message || "") + "|" + normalizeName(x.evidence || "") === key)) return;
        chapter.continuityWarnings.push({type:w.type || "continuity", description:w.description, canonReference:w.canonReference, severity:w.severity || "warning", evidence:w.evidence, chapter:n}); added++;
      });
      tasks.Continuity={ok:true,notes:[`Continuity: ${added} cảnh báo có evidence được ghi; không xóa cảnh báo cũ.`],problems:[]};
    } else tasks.Continuity={ok:false,notes:["Continuity: thiếu mảng hợp lệ; giữ nguyên cảnh báo cũ."],problems:["Continuity output không hợp lệ."]};

    // Scene Tracker is intentionally disabled in this app version; don't silently re-enable it.
    tasks.Scene={ok:true,notes:["Scene: giữ cấu hình hiện tại (Scene Tracker đang tắt trong phiên bản này)."],problems:[]};

    // 6) Hint is optional. Empty/invalid output never clears an existing user hint.
    if (typeof data.nextChapterHint === "string" && data.nextChapterHint.trim()) {
      state.nextChapterHint=data.nextChapterHint.trim();
      tasks["Gợi ý chương sau"]={ok:true,notes:["Gợi ý chương sau: cập nhật bằng cùng phản hồi JSON."],problems:[]};
    } else tasks["Gợi ý chương sau"]={ok:false,notes:["Gợi ý chương sau: không có bản mới; giữ nguyên gợi ý hiện tại."],problems:[]};

    res.ok = true;
    res.notes.push(`Hậu kỳ hợp nhất: 1 phản hồi AI; JSON=${parsed.method || "strict"}; finish=${r.finishReason || "?"}.`);
    return res;
  } catch (e) {
    // Atomic rollback: if any deterministic merge step unexpectedly fails, restore
    // the complete pre-call story state and chapter summary rather than keep a half-merge.
    try {
      const restore = JSON.parse(stateBefore || "{}");
      Object.keys(state).forEach(k=>delete state[k]);
      Object.assign(state, restore);
      const restoreChapter = JSON.parse(chapterBefore || "{}");
      Object.keys(chapter).forEach(k=>delete chapter[k]);
      Object.assign(chapter, restoreChapter);
      chapter.summary = summaryBefore;
      if (Array.isArray(state.chapters) && Number(n) > 0 && state.chapters[n - 1]) state.chapters[n - 1] = chapter;
    } catch (_) {}
    res.callCount = Math.max(res.callCount, 1);
    const msg=sampleOf(e.message,220);
    labels.forEach(k=>{ tasks[k]={ok:false,notes:[`${k}: chưa cập nhật vì phản hồi tổng hợp lỗi; dữ liệu cũ được giữ.`],problems:[]}; });
    res.problems.push("Hậu kỳ tổng hợp thất bại: " + msg);
    res.notes.push("Hậu kỳ tổng hợp lỗi; đã hoàn tác mọi cập nhật hậu kỳ của lượt này.");
    return res;
  }
}

async function scanScenes(job, chapter, n, state) {
  const res = { ok: true, skipped: true, notes: [], problems: [] };
  return res; /* v10.1: bỏ Scene Tracker cho nhẹ */
  if (!state.mature) { res.skipped = true; res.notes.push("Scene: bỏ qua (chưa bật 'Cho phép trưởng thành')"); return res; }
  if (timeLeft() < 60000) { res.ok = false; res.notes.push("Scene: BỎ QUA vì sắp hết thời gian job"); res.problems.push("Scene: bỏ qua vì hết thời gian"); return res; }
  const source = representativeText(chapter.text, 24000);
  try {
    const r = await callExtract({ endpoint: job.apiEndpoint, apiKey: job.apiKey, model: job.model, messages: [{ role: "user", content: `Nếu chương có cảnh trưởng thành, trích xuất ngắn gọn (mô tả tối đa 30 từ, không dùng dấu " trong chuỗi). Nếu không có trả []. Chỉ JSON array.\n${source}\n[{"intensity":1,"participants":[],"description":"","structure":"kiss|foreplay|sex|other"}]` }], maxTokens: 4600, temperature: 0.1 }, 2);
    const parsed = await parseArrayWithRepair(job, r.text);
    if (!parsed.valid) { res.ok = false; res.notes.push(`Scene: KHÔNG đọc được JSON (${fin(r)}, đầu: "${sampleOf(r.text)}")`); res.problems.push("Scene: không đọc được dữ liệu cảnh"); return res; }
    if (!Array.isArray(state.scenes)) state.scenes = [];
    let added = 0;
    parsed.items.forEach(s => { if (!s?.description) return; added++; state.scenes.push({ id: genId("s"), chapter: n, intensity: Math.max(1, Math.min(10, Number(s.intensity) || 5)), participants: Array.isArray(s.participants) ? s.participants : [], description: s.description, structure: s.structure || "other", createdAt: Date.now() }); });
    res.notes.push(`Scene: ${fin(r)}, parse=${parsed.method || "?"}, +${added} cảnh`);
    return res;
  } catch (e) { res.ok = false; res.notes.push(`Scene: LỖI — ${sampleOf(e.message, 160)}`); res.problems.push("Scene: lỗi gọi model"); return res; }
}

function cleanJobForStore(job) {
  return { ...job, apiKey: job.apiKeyEncrypted ? null : (job.apiKey || null), apiKeyEncrypted: job.apiKeyEncrypted || null };
}

/* ========== QUALITY GATE / CANON PIPELINE V12.16 ========== */
function qualityReviewPromptWorker(state, chapter, n) {
  const sc = normalizeStoryControl(state || {});
  const hardChecks = gateHardChecks(chapter);
  return buildQualityReviewPrompt({
    storyControl: storyControlPrompt(state),
    contract: String(state.directive || "") + "\n" + String(state.nextChapterHint || ""), contractLabel: "CHAPTER BRIEF",
    context: buildContext(state), warnings: chapter.continuityWarnings, draft: chapter.text, prevEnding: (((state.chapters || [])[n - 2] || {}).text || "").slice(-1500), hardChecks,
    knownNames: knownNameMentions(chapter.text, gateKnownNames(state)),
    maxMainEvents: sc.maxMainEvents, maxNamedCharacters: sc.maxNamedCharacters
  });
}
async function qualityReviewWorker(job, chapter, n) {
  const prompt = qualityReviewPromptWorker(job.storyState, chapter, n);
  try {
    const r = await callWithRetry({
      endpoint: job.apiEndpoint, apiKey: job.apiKey, model: job.model,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }],
      maxTokens: 2200, temperature: 0.1, totalMs: Math.max(30000, Math.min(180000, writeTimeLeft(false) - 10000)), creative: false
    }, 1);
    const parsed = parseJsonLoose(r.text, "{");
    const sc = normalizeStoryControl(job.storyState || {});
    const review = evaluateReview(parsed.value, { maxMainEvents: sc.maxMainEvents, maxNamedCharacters: sc.maxNamedCharacters, passScore: job.storyState.qualityPassScore, softFailScore: job.storyState.qualitySoftFailScore, extraHard: gateHardChecks(chapter).filter(x => !x.ok).map(x => x.message) });
    if (!review) return { ok: false, reason: "review_parse" };
    return { ok: true, review };
  } catch (e) { return { ok: false, reason: e.message }; }
}
async function rewriteWorkerDraft(job, chapter, n, review) {
  const oldText = String(chapter.text || ""), oldWc = countWords(oldText);
  const st = job.storyState;
  const prompt = buildRewritePrompt({
    chapterNumber: n, storyControl: storyControlPrompt(st),
    contract: String(st.directive || "") + "\n" + String(st.nextChapterHint || ""), contractLabel: "BRIEF",
    context: buildContext(st), review, draft: chapter.text
  });
  try {
    const r = await callWithRetry({
      endpoint: job.apiEndpoint, apiKey: job.apiKey, model: chapter.modelUsed || job.model,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }],
      maxTokens: 16000, temperature: 0.55, totalMs: Math.max(45000, Math.min(240000, writeTimeLeft(false) - 10000)), creative: true
    }, 1);
    let text = String(r.text || "").trim().replace(/^\s*(?:TIÊU ĐỀ|TITLE)\s*:\s*[^\n]+\n+/i, "").replace(/^\s*NỘI DUNG\s*:\s*/i, "").trim();
    text = formatParagraphs(stripForeign(stripThinkingOutput(dedupeRepeatedScene(text))));
    const cap = trimToWordLimit(text, chapterWordLimits(st).hardMax);
    const newWc = countWords(cap.text);
    const acc = checkRewriteAcceptable(oldWc, cap.text, newWc);
    if (!acc.ok) return acc;
    backupBeforeRewrite(chapter, "Trước khi Quality Gate sửa");
    { const tl = trimToLastSentence(cap.text, 0.8); if (tl.cut) { cap.text = tl.text; } }
    chapter.text = cap.text; chapter.wordCount = countWords(cap.text); chapter.truncated = chapter.truncated || cap.trimmed;
    return { ok: true };
  } catch (e) { return { ok: false, reason: (e && e.message) || "lỗi gọi AI" }; }
}
async function runWorkerQualityGate(job, chapter, n) {
  return runGateLoop(chapter, {
    review: () => qualityReviewWorker(job, chapter, n),
    rewrite: (review) => rewriteWorkerDraft(job, chapter, n, review),
    onStatus: (m) => { job.progress = m; }
  }, { enabled: job.storyState.qualityGateEnabled !== false, maxAttempts: job.storyState.qualityMaxAttempts });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  DEADLINE = Date.now() + 13.5 * 60 * 1000; // Netlify background function tối đa 15 phút
  let jobId = null, job = null, store;
  try {
    store = getJobStore(event);
    const body = JSON.parse(event.body || "{}");
    jobId = body.jobId;
    if (!jobId) return jsonResponse(400, { error: "Thiếu jobId" });
    job = await store.get(jobId, { type: "json" });
    if (!job) return jsonResponse(404, { error: "Job not found" });
    if (Date.now() - Number(job.createdAt || 0) > MAX_JOB_AGE_MS) return jsonResponse(410, { error: "Job đã quá hạn" });

    const workerToken = body.workerToken || event.headers?.["x-worker-token"] || event.headers?.["X-Worker-Token"] || "";
    const tokenOk = () => { try { return secretsEqual(job.workerTokenHash, hashSecret(workerToken)); } catch (_) { return false; } };
    if (job.workerTokenHash) {
      if (!tokenOk()) return jsonResponse(403, { error: "Worker token không hợp lệ" });
    } else if (Number(job.schemaVersion || 0) >= 9) {
      return jsonResponse(403, { error: "Worker token không hợp lệ" });
    }
    if (["completed", "failed"].includes(job.status)) return jsonResponse(200, { success: true, jobId, status: job.status });
    if (job.status === "running") return jsonResponse(202, { success: true, jobId, status: "running" });

    job.status = "running";
    job.updatedAt = Date.now();
    job.apiKey = decryptText(job.apiKeyEncrypted);

    // V12.28: POSTPROCESS-ONLY mode. The chapter is written in the normal client flow;
    // this Background Function only updates Canon/state after the chapter is already saved.
    if (job.mode === "postprocess") {
      job.progress = "Đang chuẩn bị hậu kỳ...";
      if (!job.storyState || typeof job.storyState !== "object") throw new Error("Job không có storyState");
      ["chapters", "characters", "locations", "items", "threads", "scenes", "timeline", "foreshadowing", "knowledgeLedger", "memoryEvents"].forEach(k => { if (!Array.isArray(job.storyState[k])) job.storyState[k] = []; });
      const n = Number(job.chapterNumber || job.storyState.chapters.length || 0);
      if (!n || !job.storyState.chapters[n - 1]) throw new Error("Không tìm thấy chương cần hậu kỳ: " + n);
      const chapter = job.storyState.chapters[n - 1];
      const newState = JSON.parse(JSON.stringify(job.storyState));
      const targetChapter = newState.chapters[n - 1];
      if (!targetChapter) throw new Error("Không tìm thấy chương trong snapshot hậu kỳ");
      if (!Array.isArray(targetChapter.autoUpdateIssues)) targetChapter.autoUpdateIssues = [];
      targetChapter.updateDiagnostics = [];
      targetChapter.postProcess = Object.assign({}, targetChapter.postProcess || {}, {
        status: "RUNNING", serverSide: true,
        tasks: Object.assign({}, (targetChapter.postProcess && targetChapter.postProcess.tasks) || {})
      });

      // Status/Memory là hậu kỳ mềm: nếu AI/API thất bại, chương vẫn đã được viết + lưu.
      // Không đưa hai lỗi này vào autoUpdateIssues để chapter chip không hiện ⚠ Status/Memory.
      const SOFT_TASKS = new Set(["Status", "Memory", "Summary", "Continuity", "Scene", "Gợi ý chương sau"]);
      const absorb = (label, res) => {
        const soft = SOFT_TASKS.has(label);
        const ok = !!(res && res.ok);
        targetChapter.postProcess.tasks[label] = Object.assign({}, targetChapter.postProcess.tasks[label] || {}, {
          status: ok ? "DONE" : "FAILED",
          finishedAt: Date.now(),
          error: ok ? null : ((res && res.problems && res.problems[0]) || null)
        });
        (res && res.notes || []).forEach(t => targetChapter.updateDiagnostics.push(t));
        (res && res.problems || []).forEach(p => {
          if (soft) return;
          if (!targetChapter.autoUpdateIssues.includes(p)) targetChapter.autoUpdateIssues.push(p);
        });
      };
      const checkpoint = async (progress) => {
        job.progress = progress; job.updatedAt = Date.now(); job.storyState = newState;
        await store.setJSON(jobId, cleanJobForStore(job));
      };
      const runPar = async (label, fn) => {
        try {
          const t0 = Date.now(); const res = await fn();
          res.notes = res.notes || [];
          if (res.notes.length) res.notes[res.notes.length - 1] += ` [${Math.round((Date.now() - t0) / 1000)}s]`;
          absorb(label, res); return res;
        } catch (e) {
          const res = { ok:false, notes:[`${label}: LỖI không lường trước — ${sampleOf(e.message, 200)}`], problems:[`${label}: lỗi hệ thống`] };
          absorb(label, res); return res;
        }
      };

      await store.setJSON(jobId, cleanJobForStore(job));
      await checkpoint("Đang hậu kỳ hợp nhất bằng một lần gọi AI...");
      const unified = await runUnifiedPostProcess(job, targetChapter, n, newState);
      // Hiển thị trạng thái từng tác vụ mà không tạo thêm request. Các task mềm
      // (Status/Memory) không đánh dấu lỗi nặng; toàn bộ merge vẫn giữ dữ liệu cũ.
      labelsForUnifiedPostProcess().forEach(label => absorb(label, unified.tasks[label] || {ok:false,notes:[label+": không có kết quả"],problems:[]}));
      unified.notes.forEach(x=>targetChapter.updateDiagnostics.push(x));
      unified.problems.forEach(x=>targetChapter.updateDiagnostics.push(x));

      await checkpoint("Đang đồng bộ Canon + Snapshot...");
      try { applyCanonSync(newState, targetChapter); } catch (e) { absorb("Canon", {ok:false, notes:["Canon: " + sampleOf(e.message, 200)], problems:["Canon: lỗi hệ thống"]}); }
      try {
        // Server-side checkpoint snapshot: keep existing snapshot structure if the shared helper exists.
        if (typeof captureChapterSnapshot === "function") await captureChapterSnapshot(n, newState);
      } catch (_) {}
      targetChapter.postProcess = Object.assign({}, targetChapter.postProcess || {}, { status:"DONE", finishedAt:Date.now(), serverSide:true });
      targetChapter.review = Object.assign({}, targetChapter.review || {}, { status:"completed" });
      job.status = "completed";
      job.progress = "Hoàn thành hậu kỳ";
      job.resultChapter = targetChapter;
      job.storyState = newState;
      job.updatedAt = Date.now(); job.completedAt = Date.now();
      job.apiKey = null; job.apiKeyEncrypted = null;
      await store.setJSON(jobId, cleanJobForStore(job));
      return jsonResponse(200, { success:true, jobId, status:"completed", mode:"postprocess", chapterNumber:n, wordCount:targetChapter.wordCount });
    }

    job.progress = "Đang chuẩn bị viết chương...";
    job.apiKey = decryptText(job.apiKeyEncrypted);
    if (!job.storyState || typeof job.storyState !== "object") throw new Error("Job không có storyState");
    ["chapters", "characters", "locations", "items", "threads", "scenes", "timeline", "foreshadowing", "knowledgeLedger", "memoryEvents"].forEach(k => { if (!Array.isArray(job.storyState[k])) job.storyState[k] = []; });
    await store.setJSON(jobId, cleanJobForStore(job));

    const chapter = await generateOneChapter(job);
    const n = job.storyState.chapters.length + 1;
    chapter.status = "DRAFTED";
    job.progress = "Đang chạy Quality Gate..."; job.updatedAt = Date.now(); await store.setJSON(jobId, cleanJobForStore(job));
    const gate = await runWorkerQualityGate(job, chapter, n);
    if (!gate.approved) {
      chapter.status = "REVISION_REQUIRED";
      chapter.review = chapter.review || { status: "error" };
      const failedState = JSON.parse(JSON.stringify(job.storyState));
      failedState.chapters.push(chapter);
      failedState.currentChapterIndex = failedState.chapters.length - 1;
      job.status = "completed";
      job.progress = "Quality Gate chưa đạt — bản nháp được giữ lại, chưa Sync Canon.";
      job.resultChapter = chapter;
      job.storyState = failedState;
      job.qualityGateFailed = true;
      job.error = gate.error || "Quality Gate chưa đạt";
      job.updatedAt = Date.now(); job.completedAt = Date.now();
      job.apiKey = null; job.apiKeyEncrypted = null;
      await store.setJSON(jobId, cleanJobForStore(job));
      return jsonResponse(200, { success: true, jobId, status: "completed", qualityGateFailed: true, chapterTitle: chapter.title, wordCount: chapter.wordCount });
    }
    job.progress = "Quality PASS — đang cập nhật Canon..."; job.updatedAt = Date.now(); await store.setJSON(jobId, cleanJobForStore(job));
    // Chỉ sau Quality PASS mới chạy summary/state/memory và Sync.
    const newState = JSON.parse(JSON.stringify(job.storyState));
    newState.chapters.push(chapter);
    newState.currentChapterIndex = newState.chapters.length - 1;
    newState.chaptersSinceBackup = (newState.chaptersSinceBackup || 0) + 1;
    if (!Array.isArray(chapter.autoUpdateIssues)) chapter.autoUpdateIssues = [];
    chapter.updateDiagnostics = [];
    const absorb = (label, res) => {
      (res.notes || []).forEach(t => chapter.updateDiagnostics.push(t));
      (res.problems || []).forEach(p => { if (!chapter.autoUpdateIssues.includes(p)) chapter.autoUpdateIssues.push(p); });
    };

    const checkpoint = async (progress) => { job.progress = progress; job.updatedAt = Date.now(); job.storyState = newState; await store.setJSON(jobId, cleanJobForStore(job)); };
    const runStep = async (label, progress, fn) => {
      await checkpoint(progress);
      try { const t0 = Date.now(); const res = await fn(); res.notes = res.notes || []; if (res.notes.length) res.notes[res.notes.length - 1] += ` [${Math.round((Date.now() - t0) / 1000)}s]`; absorb(label, res); return res; }
      catch (e) { const res = { ok: false, notes: [`${label}: LỖI không lường trước — ${sampleOf(e.message, 200)}`], problems: [`${label}: lỗi hệ thống`] }; absorb(label, res); return res; }
    };

    // Các bước ghi vào các khóa state khác nhau nên chạy song song an toàn (JS đơn luồng, merge đồng bộ sau mỗi await).
    // Song song giúp tổng thời gian nằm trong giới hạn 15 phút của Netlify khi chia lô nhỏ.
    const runPar = async (label, fn) => {
      try { const t0 = Date.now(); const res = await fn(); res.notes = res.notes || []; if (res.notes.length) res.notes[res.notes.length - 1] += ` [${Math.round((Date.now() - t0) / 1000)}s]`; absorb(label, res); return res; }
      catch (e) { const res = { ok: false, notes: [`${label}: LỖI không lường trước — ${sampleOf(e.message, 200)}`], problems: [`${label}: lỗi hệ thống`] }; absorb(label, res); return res; }
    };
    await checkpoint("Đang hậu kỳ hợp nhất bằng một lần gọi AI...");
    const unified = await runUnifiedPostProcess(job, chapter, n, newState);
    labelsForUnifiedPostProcess().forEach(label => absorb(label, unified.tasks[label] || {ok:false,notes:[label+": không có kết quả"],problems:[]}));
    unified.notes.forEach(x=>chapter.updateDiagnostics.push(x));
    unified.problems.forEach(x=>chapter.updateDiagnostics.push(x));
    await checkpoint("Đang lưu kết quả...");
    applyCanonSync(newState, chapter);
    job.progress = "Đã Sync Canon v" + newState.canonVersion;

    job.status = "completed";
    job.progress = "Hoàn thành";
    job.resultChapter = chapter;
    job.storyState = newState;
    job.updatedAt = Date.now();
    job.completedAt = Date.now();
    job.apiKey = null;
    job.apiKeyEncrypted = null;
    await store.setJSON(jobId, cleanJobForStore(job));
    return jsonResponse(200, { success: true, jobId, chapterTitle: chapter.title, wordCount: chapter.wordCount });
  } catch (err) {
    console.error("Background v9 error:", err);
    if (job && jobId && store) {
      job.status = "failed";
      job.error = err.message || String(err);
      job.progress = "Lỗi: " + job.error;
      job.apiKey = null;
      job.updatedAt = Date.now();
      try { await store.setJSON(jobId, cleanJobForStore(job)); } catch (_) {}
    }
    return jsonResponse(500, { error: err.message || "Lỗi server", jobId });
  }
};
