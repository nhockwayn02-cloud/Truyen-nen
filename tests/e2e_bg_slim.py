"""E2E: payload job nền không mang stateSnapshots/versions của chương cũ; khi hợp nhất thì khôi phục từ bản local.
Chạy: python3 tests/e2e_bg_slim.py"""
import http.server, threading, socketserver, os, json, functools
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Q, directory=ROOT)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
results = []
def check(n, c, extra=""):
    results.append(bool(c)); print(("PASS " if c else "FAIL ") + n + (f"  [{extra}]" if extra else ""))
seen = {"body": None, "raw_len": 0}
def create_job(route):
    seen["raw_len"] = len(route.request.post_data or ""); seen["body"] = json.loads(route.request.post_data or "{}")
    route.fulfill(status=200, content_type="application/json", body=json.dumps({"success": True, "jobId": "job_slim_123456", "accessToken": "tok"}))
def job_status(route):
    if "ack=1" in route.request.url:
        route.fulfill(status=200, content_type="application/json", body='{"deleted":true}'); return
    sent = (seen["body"] or {}).get("storyState", {}).get("chapters", [])
    new = {"title": "Chương 4", "text": "Mưa rơi trên mái ngói cũ. " * 30, "wordCount": 150, "summary": "x"}
    route.fulfill(status=200, content_type="application/json", body=json.dumps({"status": "completed", "jobId": "job_slim_123456", "baseChapterCount": 3,
        "resultChapter": new, "storyState": {"chapters": sent + [new], "characters": [], "locations": [], "items": [], "threads": []}}))
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(); ctx.add_init_script("window.__XTA_TEST__=true")
    page = ctx.new_page(); errs = []
    page.on("pageerror", lambda e: errs.append(str(e))); page.on("dialog", lambda d: d.accept())
    page.route("**/.netlify/functions/create-job", create_job); page.route("**/.netlify/functions/job-status**", job_status)
    page.goto(f"http://127.0.0.1:{port}/index.html"); page.wait_for_timeout(1000)
    page.evaluate("""()=>{ const s=__xta.state; s.apiKey='sk-test'; s.apiEndpoint='https://openrouter.ai/api/v1/chat/completions';
      const big=()=>({characters:Array.from({length:300},(_,i)=>({name:'NV'+i,desc:'x'.repeat(200)}))});
      s.chapters=[1,2,3].map(n=>({title:'Chương '+n,text:'Gió thổi qua con phố vắng. '.repeat(30),wordCount:150,summary:'s'+n,
        stateSnapshots:[big(),big(),big(),big(),big(),big(),big()], stateSnapshot:big(), versions:[{text:'cũ '.repeat(500)}]})); }""")
    page.click("#bgWriteBtn"); page.wait_for_timeout(1500)
    body = seen["body"] or {}; chs = (body.get("storyState") or {}).get("chapters", [])
    check("1. Payload gửi đủ 3 chương", len(chs) == 3, str(len(chs)))
    check("2. Payload KHÔNG chứa stateSnapshots/stateSnapshot/versions", all(not any(k in c for k in ("stateSnapshots","stateSnapshot","versions")) for c in chs))
    check("3. Payload nhỏ (< 300 KB thay vì hàng MB)", seen["raw_len"] < 300000, f"{seen['raw_len']//1024} KB")
    check("4. Text chương vẫn được gửi", all(len(c.get("text","")) > 100 for c in chs))
    n = page.evaluate("()=>__xta.state.chapters.length")
    check("5. Hợp nhất xong: có 4 chương", n == 4, str(n))
    keep = page.evaluate("()=>__xta.state.chapters.slice(0,3).every(c=>Array.isArray(c.stateSnapshots)&&c.stateSnapshots.length===7&&c.stateSnapshot&&Array.isArray(c.versions)&&c.versions.length===1)")
    check("6. Lịch sử snapshot/versions của chương cũ được khôi phục từ local", keep)
    check("7. Không có lỗi JS", not errs, "; ".join(errs)[:120])
    b.close()
print(f"{sum(results)}/{len(results)} PASS"); raise SystemExit(0 if all(results) else 1)
