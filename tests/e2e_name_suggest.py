# E2E: hộp "Gợi ý nhân vật chưa có trong Database" — truyện tu luyện không gợi ý công pháp/cảnh giới; nút "🎒 Vật phẩm/Công pháp" hoạt động.
import http.server, threading, socketserver, os, functools, json
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(("127.0.0.1",0),functools.partial(Q,directory=ROOT)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
chs=[
 "Bùi Lạc tu luyện Huyền Nguyên Quyết trong hang. Huyền Nguyên Quyết không trao sức mạnh. Hắn dừng ở Luyện Khí tầng một. Linh khí quanh hắn dày. Bùi Lạc đột phá. Tử Điện Hồ gầm lên. Tông môn im lặng.",
 "Sau bảy tháng Bùi Lạc vẫn ở Luyện Khí. Huyền Nguyên Quyết vận chuyển, tu vi tăng. Tử Điện Hồ rình mồi. Bùi Lạc cười.",
 "Luyện Khí đệ nhất trọng. Huyền Nguyên Quyết. Tử Điện Hồ biến mất. Bùi Lạc im lặng."]
ok_all=True
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(); ctx.add_init_script("window.__XTA_TEST__=true")
    page=ctx.new_page(); errs=[]; page.on("pageerror",lambda e:errs.append(str(e)))
    page.goto(f"http://127.0.0.1:{port}/index.html"); page.wait_for_timeout(1200)
    page.evaluate("""(chs)=>{const s=__xta.state; s.genre=''; s.characters=[]; s.locations=[]; s.items=[]; s.ignoredNameSuggestions=[];
      s.chapters=chs.map((t,i)=>({id:'c'+i,title:'C'+(i+1),text:t,wordCount:40})); __xta.renderCharacters();}""",chs)
    page.wait_for_timeout(300)
    NAMES="()=>[...document.querySelectorAll('#charSuggestBox details > div > b')].map(x=>x.textContent)"
    box=page.evaluate(NAMES)
    a=(sorted(box)==["Bùi Lạc","Tử Điện Hồ"])
    print(("PASS " if a else "FAIL ")+"A: hộp gợi ý chỉ còn tên người/sinh vật, không có công pháp & cảnh giới", json.dumps(box,ensure_ascii=False)); ok_all&=a
    # B) nút Vật phẩm/Công pháp
    page.evaluate("""()=>{const btns=[...document.querySelectorAll('#charSuggestBox [data-sg-item]')]; const row=btns.find(x=>x.closest('div').innerText.includes('Tử Điện Hồ')); row.click();}""")
    page.wait_for_timeout(300)
    r=page.evaluate("()=>({items:__xta.state.items.map(i=>i.name), box:[...document.querySelectorAll('#charSuggestBox details > div > b')].map(x=>x.textContent)})")
    bb=("Tử Điện Hồ" in r["items"] and r["box"]==["Bùi Lạc"])
    print(("PASS " if bb else "FAIL ")+"B: nút 🎒 đưa vào Vật phẩm và biến khỏi hộp gợi ý", json.dumps(r["items"],ensure_ascii=False)); ok_all&=bb
    if errs: print("FAIL lỗi trang:",errs[:2]); ok_all=False
    b.close()
raise SystemExit(0 if ok_all else 1)
