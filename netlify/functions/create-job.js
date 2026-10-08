const { getStore, connectLambda } = require("@netlify/blobs");
const crypto = require("crypto");
const sec = require("../../lib/security");

const DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

function getJobStore(event) {
  try { connectLambda(event); } catch (_) {}
  try { return getStore("story-jobs"); } catch (_) {
    const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID || process.env.BLOBS_SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (siteID && token) return getStore({ name: "story-jobs", siteID, token });
    throw new Error("Netlify Blobs chưa cấu hình. Hãy cấu hình Netlify Blobs hoặc NETLIFY_SITE_ID + NETLIFY_API_TOKEN.");
  }
}
function hashSecret(v) { return crypto.createHash("sha256").update(String(v || "")).digest("hex"); }
function jsonResponse(statusCode, obj) {
  // ALLOWED_ORIGIN (tuỳ chọn): đặt đúng địa chỉ site của bạn để chặn trang lạ gọi API từ trình duyệt.
  return { statusCode, headers: { "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*", "Access-Control-Allow-Methods":"POST, OPTIONS", "Access-Control-Allow-Headers":"Content-Type, X-App-Passcode", "Content-Type":"application/json" }, body: JSON.stringify(obj) };
}
function encryptApiKey(apiKey) {
  const secret = process.env.JOB_SECRET || process.env.NETLIFY_JOB_SECRET || process.env.NETLIFY_API_TOKEN || "";
  if (!secret) return { encrypted:false, value:apiKey };
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(apiKey,"utf8"), cipher.final()]);
  return { encrypted:true, value:`${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${enc.toString("base64url")}` };
}
function genSecret(){ return crypto.randomBytes(32).toString("base64url"); }

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error:"Method not allowed" });

  try {
    const body = JSON.parse(event.body || "{}");
    const storyState = body.storyState;
    const apiKey = String(body.apiKey || "").trim().replace(/^bearer\s+/i, "").replace(/^["']|["']$/g, "");
    const pass = sec.checkPasscode(event, body);
    if (!pass.ok) return jsonResponse(401, { error:"Sai hoặc thiếu mã truy cập (APP_PASSCODE).", needPasscode:true });
    if (!storyState || !apiKey) return jsonResponse(400, { error:"Thiếu storyState hoặc API key" });
    const ep = sec.validateEndpoint(body.apiEndpoint || DEFAULT_ENDPOINT);
    if (!ep.ok) return jsonResponse(400, { error: ep.error });
    if (JSON.stringify(storyState).length > 8_000_000) return jsonResponse(413, { error:"Story state quá lớn. Hãy backup/nén chương cũ trước khi gửi background." });

    const T0 = Date.now(); const timings = { payloadKB: Math.round((event.body || "").length / 1024) };
    const store = getJobStore(event);
    await sec.purgeOldJobs(store); // xoá job quá hạn (mặc định 48 giờ, chỉnh bằng JOB_TTL_HOURS)
    const jobId = "job_" + Date.now().toString(36) + "_" + crypto.randomBytes(6).toString("hex");
    const accessToken = genSecret();
    const workerToken = genSecret();
    const apiKeyEncrypted = encryptApiKey(apiKey);
    const now = Date.now();
    const job = {
      schemaVersion: 11.0,
      jobId,
      mode: body.mode === "postprocess" ? "postprocess" : "write",
      chapterNumber: Number(body.chapterNumber || 0) || null,
      storyId: storyState.storyId || null,
      baseChapterCount: Array.isArray(storyState.chapters) ? storyState.chapters.length : 0,
      status:"pending",
      createdAt:now,
      updatedAt:now,
      apiEndpoint:ep.url,
      model:body.model || "deepseek/deepseek-v3.2",
      modelNsfw:body.modelNsfw || "aion-labs/aion-2.0",
      forceNsfw:!!body.forceNsfw,
      hintStyle:String(body.hintStyle||"normal").slice(0,20),
      hintFormat:String(body.hintFormat||"detail").slice(0,20),
      apiKeyEncrypted,
      apiKey:null,
      accessTokenHash:hashSecret(accessToken),
      workerTokenHash:hashSecret(workerToken),
      storyState,
      resultChapter:null,
      error:null,
      progress: body.mode === "postprocess" ? "Đang chờ hậu kỳ..." : "Đang chờ bắt đầu..."
    };
    timings.purgeMs = Date.now() - T0;
    const T1 = Date.now();
    await store.setJSON(jobId, job);
    timings.saveMs = Date.now() - T1;

    // V12.23: thử URL site (env) trước; nếu 404 thì thử đúng host đã nhận request này (domain tùy chỉnh/branch deploy có thể khác env.URL).
    const hdrs = event.headers || {};
    const reqHost = String(hdrs["x-forwarded-host"] || hdrs.host || hdrs.Host || "").split(",")[0].trim();
    const envUrl = String(process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL || "").replace(/\/+$/, "");
    const bases = [envUrl, reqHost ? ("https://" + reqHost) : ""].filter((v, i, a) => v && a.indexOf(v) === i);
    if (!bases.length) throw new Error("Không xác định được URL Netlify để kích hoạt background function.");

    // Background Function trả 202 ngay; await ở đây chỉ đảm bảo request kích hoạt đã được gửi.
    let trigger = null, triedUrl = "", triggerSlow = false;
    const T2 = Date.now();
    for (const b of bases) {
      triedUrl = b + "/.netlify/functions/write-chapter-background";
      // Background Function bình thường trả 202 trong < 1 giây. Chờ tối đa 8 giây rồi trả lời app (job vẫn được theo dõi bằng job-status)
      // để người dùng không bị treo ở "Đang tạo job…" và có thể tắt máy.
      const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), Number(process.env.TRIGGER_TIMEOUT_MS) || 8000);
      try {
        trigger = await fetch(triedUrl, {
          method:"POST",
          headers:{"Content-Type":"application/json","X-Worker-Token":workerToken},
          body:JSON.stringify({jobId, workerToken}),
          signal: ac.signal
        });
      } catch (e) {
        if (e && e.name === "AbortError") { triggerSlow = true; trigger = { ok:true, status:202, text: async()=>"" }; }
        else throw e;
      } finally { clearTimeout(timer); }
      if (trigger.ok || trigger.status === 202 || trigger.status !== 404) break;
    }
    timings.triggerMs = Date.now() - T2;
    if (!trigger.ok && trigger.status !== 202) {
      const t = await trigger.text().catch(()=>"");
      const hint404 = trigger.status === 404 ? " — không tìm thấy hàm write-chapter-background ở " + triedUrl + ". Vào Netlify → Functions xem hàm này có được deploy không (thiếu thư mục netlify/functions hoặc build hàm bị lỗi)." : "";
      job.status="failed"; job.error=`Không kích hoạt được background (${trigger.status})${hint404}${t ? ": " + t.slice(0,300) : ""}`; job.updatedAt=Date.now();
      await store.setJSON(jobId, job);
      return jsonResponse(502, { error:job.error });
    }

    timings.totalMs = Date.now() - T0;
    console.log("[create-job] timings", JSON.stringify(timings));
    const warnList = sec.securityWarnings().slice();
    if (triggerSlow) warnList.push("Lệnh kích hoạt viết nền chưa phản hồi sau 8 giây — job vẫn được theo dõi; nếu sau vài phút vẫn 'pending' hãy kiểm tra Netlify → Functions → write-chapter-background.");
    return jsonResponse(200, {
      success:true,
      jobId,
      accessToken,
      timings,
      warnings: warnList,
      message:"Job đã được tạo. Có thể đóng/tắt iPhone; khi mở lại app sẽ tự kiểm tra và đồng bộ."
    });
  } catch (err) {
    console.error("create-job v9:", err);
    return jsonResponse(500, { error:err.message || "Lỗi server" });
  }
};
