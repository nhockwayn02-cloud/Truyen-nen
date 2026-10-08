import http.server, threading, socketserver, os, functools, json
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(("127.0.0.1",0),functools.partial(Q,directory=ROOT)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(); ctx.add_init_script("window.__XTA_TEST__=true")
    page=ctx.new_page(); errs=[]; page.on("pageerror",lambda e:errs.append(str(e)))
    page.goto(f"http://127.0.0.1:{port}/index.html"); page.wait_for_timeout(1200)
    page.evaluate("""()=>{const s=__xta.state;
      s.chapters=[1,2,3].map(i=>({id:'c'+i,title:'C'+i,text:'x'.repeat(50),wordCount:1}));
      s.characters=[{name:'A',firstAppearance:1,lastAppearance:3,relationships:[],history:[]},
                    {name:'B',firstAppearance:2,lastAppearance:2,relationships:[],history:[]},
                    {name:'D',firstAppearance:2,lastAppearance:3,relationships:[{withName:'B'}],history:[]},
                    {name:'M',firstAppearance:null,lastAppearance:null,relationships:[],history:[]}];
      s.locations=[{name:'Biệt thự',firstAppearance:2,lastAppearance:2},{name:'Phố',firstAppearance:1,lastAppearance:3},{name:'Quán',firstAppearance:3,lastAppearance:3}];
      s.items=[{name:'Nhẫn',firstAppearance:2,lastAppearance:2}];
      s.chapters[2].stateSnapshot={characters:JSON.parse(JSON.stringify(s.characters)),locations:JSON.parse(JSON.stringify(s.locations)),items:JSON.parse(JSON.stringify(s.items))};
      __xta.renderAll&&__xta.renderAll();}""")
    page.evaluate("()=>{const sel=document.getElementById('deleteChapterSelect'); sel.innerHTML='<option value=\"1\">2</option>'; sel.value='1';}")
    page.evaluate("()=>document.getElementById('deleteChapterBtn').click()")
    page.wait_for_timeout(300)
    page.evaluate("()=>{const bs=[...document.querySelectorAll('.modal-overlay button')]; bs.find(b=>b.textContent==='Xóa').click();}")
    page.wait_for_timeout(500)
    r=page.evaluate("""()=>{const s=__xta.state;return {ch:s.chapters.length,chars:s.characters.map(c=>[c.name,c.firstAppearance,c.lastAppearance,(c.relationships||[]).length]),
       locs:s.locations.map(l=>[l.name,l.firstAppearance,l.lastAppearance]),items:s.items.map(i=>i.name),
       snapChars:s.chapters[1].stateSnapshot.characters.map(c=>c.name),snapLocs:s.chapters[1].stateSnapshot.locations.map(l=>l.name)}}""")
    ok = (r["ch"]==2 and [c[0] for c in r["chars"]]==["A","D","M"] and [l[0] for l in r["locs"]]==["Phố","Quán"] and r["items"]==[]
          and r["snapChars"]==["A","D","M"] and r["snapLocs"]==["Phố","Quán"] and r["chars"][1][3]==0 and not errs)
    print(("PASS " if ok else "FAIL ")+"Xóa chương giữa: xóa kèm NV/địa điểm/vật phẩm chỉ có ở chương đó, giữ mục dùng lại, đánh lại số, dọn snapshot", json.dumps(r,ensure_ascii=False)[:200])
    b.close()
    raise SystemExit(0 if ok else 1)
