"""E2E luồng job nền (client) với server giả — chạy: python3 tests/e2e_bg.py"""
import http.server, threading, socketserver, os, sys, json, functools
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Q, directory=ROOT)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
results = []
def check(n, c, extra=""):
    results.append(bool(c)); print(("PASS " if c else "FAIL ") + n + (f"  [{extra}]" if extra else ""))

seen = {"create_headers": None, "create_body": None, "status_calls": 0, "acks": 0}
mode = {"create": "ok", "status": "ok"}
def create_job(route):
    seen["create_headers"] = route.request.headers; seen["create_body"] = json.loads(route.request.post_data or "{}")
    if mode["create"] == "401":
        route.fulfill(status=401, content_type="application/json", body=json.dumps({"error": "Sai hoặc thiếu mã truy cập", "needPasscode": True})); return
    route.fulfill(status=200, content_type="application/json", body=json.dumps({"success": True, "jobId": "job_abc_123456", "accessToken": "tok", "warnings": ["Chưa đặt JOB_SECRET trên Netlify: test."]}))
def job_status(route):
    url = route.request.url
    if "ack=1" in url:
        seen["acks"] += 1; route.fulfill(status=200, content_type="application/json", body='{"deleted":true}'); return
    seen["status_calls"] += 1
    if seen["status_calls"] == 1:  # lần poll đầu: job còn đang chạy
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"status": "running", "progress": "Đang viết chương..."})); return
    if mode["status"] == "gatefail":  # job xong nhưng trượt Quality Gate: chương ở REVISION_REQUIRED, chưa Sync
        c1 = {"title": "Chương 1", "text": "Gió thổi qua con phố vắng. " * 30, "wordCount": 150, "summary": "x"}
        c2 = {"title": "Chương 2", "text": "Mưa rơi trên mái ngói cũ. " * 30, "wordCount": 150, "status": "REVISION_REQUIRED",
              "review": {"status": "completed", "verdict": "HARD_FAIL", "score": 60, "hardFailures": ["Vượt ngân sách sự kiện: 5 > 3"]}}
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"status": "completed", "jobId": "job_abc_123456", "baseChapterCount": 1,
            "qualityGateFailed": True, "resultChapter": c2, "storyState": {"canonVersion": 7, "chapters": [c1, c2], "characters": [], "locations": [], "items": [], "threads": []}})); return
    ch = {"title": "Chương 1", "text": "Gió thổi qua con phố vắng. " * 30, "wordCount": 150, "summary": "**Tóm tắt chương:** x"}
    route.fulfill(status=200, content_type="application/json", body=json.dumps({"status": "completed", "jobId": "job_abc_123456", "baseChapterCount": 0,
        "resultChapter": ch, "storyState": {"chapters": [ch], "characters": [], "locations": [], "items": [], "threads": []}}))

with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(); ctx.add_init_script("window.__XTA_TEST__=true")
    page = ctx.new_page(); errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("dialog", lambda d: d.accept())
    page.route("**/.netlify/functions/create-job", create_job)
    page.route("**/.netlify/functions/job-status**", job_status)
    page.goto(f"http://127.0.0.1:{port}/index.html"); page.wait_for_timeout(1000)
    page.fill("#apiKey", "sk-test"); page.fill("#apiEndpoint", "https://openrouter.ai/api/v1/chat/completions")
    page.evaluate("()=>{__xta.state.apiKey='sk-test'; __xta.state.apiEndpoint='https://openrouter.ai/api/v1/chat/completions';}")

    # 1) sai mã -> hiện lỗi thân thiện, không tạo record job
    mode["create"] = "401"
    page.fill("#appPasscode", "sai"); page.dispatch_event("#appPasscode", "change")
    page.click("#bgWriteBtn"); page.wait_for_timeout(800)
    txt = page.inner_text("#bgJobStatus")
    check("1. Server trả 401 -> hiện thông báo Mã truy cập", "Mã truy cập" in txt, txt[:80])
    check("2. Header X-App-Passcode được gửi", seen["create_headers"] and seen["create_headers"].get("x-app-passcode") == "sai")
    check("3. Không lưu record job khi bị 401", page.evaluate("()=>localStorage.getItem('aiStoryWorkshop_bgJobId_v9')") is None)

    # 2) đúng mã -> job chạy, hiện cảnh báo cấu hình, hợp nhất và ack
    mode["create"] = "ok"
    page.fill("#appPasscode", "dung"); page.dispatch_event("#appPasscode", "change")
    check("4. Mã truy cập được nhớ trên thiết bị (không nằm trong state)", page.evaluate("()=>localStorage.getItem('xta_passcode')") == "dung" and "dung" not in page.evaluate("()=>JSON.stringify(__xta.state)"))
    page.click("#bgWriteBtn"); page.wait_for_timeout(600)
    txt = page.inner_text("#bgJobStatus")
    check("5. Cảnh báo JOB_SECRET vẫn hiển thị khi job đang chạy", "JOB_SECRET" in txt and "Đang viết nền" in txt, txt[:140])
    check("6. Header đúng mã mới", seen["create_headers"].get("x-app-passcode") == "dung")
    check("7. Payload không chứa passcode trong storyState", "dung" not in json.dumps(seen["create_body"].get("storyState", {})))
    for _ in range(80):  # poll thứ 2 sau ~12s
        page.wait_for_timeout(300)
        if seen["acks"] >= 1: break
    n = page.evaluate("()=>__xta.state.chapters.length")
    check("8. Chương từ job nền được hợp nhất vào truyện", n == 1, str(n))
    check("9. Client gọi ack để xoá job trên server sau khi hợp nhất", seen["acks"] == 1, str(seen["acks"]))
    check("10. Record job được dọn khỏi localStorage", page.evaluate("()=>localStorage.getItem('aiStoryWorkshop_bgJobId_v9')") is None)
    # 3) job trượt Quality Gate: chương nháp được giữ ở REVISION_REQUIRED, canonVersion được hợp nhất, báo đúng cho người dùng
    mode["status"] = "gatefail"; seen["status_calls"] = 1; seen["acks"] = 0  # bỏ qua lần poll "running"
    page.click("#bgWriteBtn"); txt12 = ""
    for _ in range(90):
        page.wait_for_timeout(300)
        t = page.inner_text("#bgJobStatus")
        if "Quality Gate" in t and "chưa ghi Canon" in t: txt12 = t
        if seen["acks"] >= 1 and txt12: break
    check("11. Job trượt Gate: thông báo 'chưa vượt Quality Gate — chưa ghi Canon'", bool(txt12), txt12[:100])
    st = page.evaluate("()=>({n:__xta.state.chapters.length, s:(__xta.state.chapters[1]||{}).status, cv:__xta.state.canonVersion, v:((__xta.state.chapters[1]||{}).review||{}).verdict})")
    check("12. Chương trượt Gate được giữ ở REVISION_REQUIRED (không bị bỏ)", st["n"] == 2 and st["s"] == "REVISION_REQUIRED" and st["v"] == "HARD_FAIL", str(st))
    check("13. canonVersion của server được hợp nhất vào client", st["cv"] == 7, str(st["cv"]))
    check("14. Chương trượt Gate không được đánh dấu đã Sync", page.evaluate("()=>{const c=__xta.state.chapters[1]; return !c.sync || c.sync.status!=='SYNCED';}"))
    check("15. Không lỗi JS", not errs, "; ".join(errs)[:200])
    b.close()
srv.shutdown()
bad = results.count(False); print(f"\n{len(results)-bad}/{len(results)} PASS"); sys.exit(1 if bad else 0)
