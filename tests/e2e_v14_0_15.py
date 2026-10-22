"""E2E V14.0.15 — Canon Diff, hộp thư gợi ý, sức khỏe truyện, chi phí theo bước. Chạy: python3 tests/e2e_v14_0_15.py"""
import http.server, threading, socketserver, os, functools
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Q, directory=ROOT)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
res = []
def check(n, c, extra=""):
    res.append(bool(c)); print(("PASS " if c else "FAIL ") + n + (f"  [{extra}]" if extra else ""))
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(); ctx.add_init_script("window.__XTA_TEST__=true")
    page = ctx.new_page(); errs = []
    page.on("dialog", lambda d: d.accept()); page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if (m.type == "error" and "Failed to load resource" not in m.text) else None)
    page.goto(f"http://127.0.0.1:{port}/index.html"); page.wait_for_timeout(1200)
    check("1. Tải trang + module features không lỗi", not errs and page.evaluate("!!window.__XTA__ && !!window.__XTA_FEATURES__"), "; ".join(errs)[:200])
    check("2. Nút 🩺 Sức khỏe truyện có mặt", page.locator("#healthBtn").count() == 1)
    page.evaluate("""()=>{
      const s=window.__XTA__.state;
      const txt=(n)=>'Trần Thu Hà bước vào. Ông Bảy chào Trần Thu Hà. Ông Bảy cười. Lan nói với Minh Anh. ';
      s.chapters=[1,2,3].map(i=>({title:'Ch'+i,text:txt(i).repeat(3),wordCount:5000,summary:'Tóm tắt '+i,review:{score:90}}));
      s.currentChapterIndex=2;
      s.characters=[{id:'c1',name:'Minh Anh',tier:'major',mentalState:'lo lắng',lastAppearance:3,relationships:[],history:[]}];
      s.chapters[2].canonDiff={counts:{charsAdded:1,charsUpdated:1},at:Date.now(),skipped:['Trần Thu Hà (đã thêm với hạng supporting)'],locations:[],items:[],threads:[],
        characters:[{kind:'added',id:'c9',name:'Ông Hải',tier:'supporting',changes:[]},{kind:'updated',id:'c1',name:'Minh Anh',meaningful:1,changes:[{field:'mentalState',from:'bình tĩnh',to:'lo lắng'}]}]};
      s.characters.push({id:'c9',name:'Ông Hải',tier:'supporting',relationships:[],history:[]});
      window.__XTA__.renderCharacters();
      window.__XTA_FEATURES__.renderCanonDiff();
    }""")
    page.wait_for_timeout(300)
    box = page.locator("#canonDiffBox")
    check("3. Panel Canon Diff hiển thị NV mới + trường đổi", box.is_visible() and "Ông Hải" in box.inner_text() and "tâm lý" in box.inner_text(), box.inner_text()[:120])
    box.locator("button[data-cd-undo]").first.click(); page.wait_for_timeout(200)
    check("4. Hoàn tác trường trả về giá trị cũ", page.evaluate("window.__XTA__.state.characters.find(c=>c.id==='c1').mentalState") == "bình tĩnh")
    box.locator("button[data-cd-undo-add]").first.click(); page.wait_for_timeout(200)
    check("5. Gỡ NV mới khỏi Database", page.evaluate("!window.__XTA__.state.characters.some(c=>c.id==='c9')"))
    sug = page.locator("#charSuggestBox")
    check("6. Hộp thư gợi ý nhân vật có 'Trần Thu Hà'", "Trần Thu Hà" in sug.inner_text(), sug.inner_text()[:120])
    page.evaluate("document.querySelector('#charSuggestBox button[data-sg-add]').click()"); page.wait_for_timeout(200)
    check("7. Bấm ＋ Nhân vật thêm vào Database", page.evaluate("window.__XTA__.state.characters.some(c=>/Trần Thu Hà|Ông Bảy/.test(c.name))"))
    page.click("#healthBtn"); page.wait_for_timeout(200)
    check("8. Modal sức khỏe truyện + nút quét AI", page.locator("#consistencyScanBtn").count() == 1 and "Sức khỏe truyện" in page.inner_text(".modal-box"))
    page.click("#healthClose")
    page.evaluate("window.__XTA__.state.costByStep={post:{calls:3,tokIn:9000,tokOut:3000,cost:0.0123}}")
    page.click("#costBtn"); page.wait_for_timeout(300)
    check("9. Cost modal có bảng theo bước + ô model", page.locator("#stepCostBox").count() == 1 and page.locator("[data-step-model]").count() == 4)
    page.fill("[data-step-model=post]", "cheap/model"); page.dispatch_event("[data-step-model=post]", "change")
    check("10. Lưu model riêng cho bước hậu kỳ", page.evaluate("window.__XTA__.state.stepModels.post") == "cheap/model")
    check("11. Không lỗi JS suốt phiên", not errs, "; ".join(errs)[:200])
    b.close()
print(f"{sum(res)}/{len(res)} PASS"); raise SystemExit(0 if all(res) else 1)
