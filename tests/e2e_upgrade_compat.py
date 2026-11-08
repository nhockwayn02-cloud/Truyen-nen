# V14.7.1: kiểm thử nâng cấp — bản lưu tạo bởi app V14.5.15 gốc (thư mục UPGRADE_OLD_DIR) phải đọc được ở bản hiện tại,
# và các trường mới (L0–L5, thế lực, min/max, Accuracy Mode) phải sống sót qua lưu → nạp lại. Dữ liệu hoàn toàn giả lập.
import http.server, threading, socketserver, os, functools, json, sys
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OLD=os.environ.get("UPGRADE_OLD_DIR")
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
def serve(d):
    s=socketserver.TCPServer(("127.0.0.1",0),functools.partial(Q,directory=d)); threading.Thread(target=s.serve_forever,daemon=True).start(); return s.server_address[1]
res=[]
def check(n,c,x=""):
    res.append(bool(c)); print(("PASS " if c else "FAIL ")+n+(f"  [{x}]" if x else ""))
SEED="""()=>{const s=__xta.state;
 s.chapters=[1,2,3].map(i=>({id:'c'+i,title:'Chương '+i,text:'Nội dung chương '+i+'. '.repeat(30),summary:'Tóm tắt '+i,wordCount:120,status:'SYNCED',sync:{status:'SYNCED'}}));
 s.characters=[{name:'Lâm Phong',firstAppearance:1,lastAppearance:3,relationships:[],history:[]}];
 s.locations=[{name:'Thành Bắc',firstAppearance:1,lastAppearance:2}];
 s.threads=[{id:'t1',title:'Bí mật cổng đá',status:'open'}];
 s.timeline=[{chapter:1,event:'Mở đầu'}];
 return true}"""
def run(page):
    return page.evaluate("()=>JSON.parse(JSON.stringify(__xta.serializeStoryRecord(Object.assign({},__xta.state,{storyId:'sim'}))))")
with sync_playwright() as p:
    b=p.chromium.launch(args=["--no-sandbox"]); newp=serve(ROOT); errs=[]
    ctx=b.new_context(); ctx.add_init_script("window.__XTA_TEST__=true")
    new=ctx.new_page(); new.on("pageerror",lambda e:errs.append(str(e))); new.goto(f"http://127.0.0.1:{newp}/index.html"); new.wait_for_timeout(1200)
    check("Bản mới tải không lỗi JS", not errs, "; ".join(errs)[:200])
    # A) bản lưu từ app cũ
    if OLD and os.path.isdir(OLD):
        oldp=serve(OLD); ctx2=b.new_context(); ctx2.add_init_script("window.__XTA_TEST__=true"); old=ctx2.new_page(); old.goto(f"http://127.0.0.1:{oldp}/index.html"); old.wait_for_timeout(1200)
        old.evaluate(SEED); rec=run(old)
        check("Bản cũ tạo được record", rec and rec.get("ChapterData"))
        out=new.evaluate("(r)=>{const h=__xta.hydrateFromRecord(r);return {n:h.chapters.length,t:h.chapters[2].text.length,ch:h.characters.map(c=>c.name),th:(h.threads||[]).length,am:h.accuracyMode,tl:(h.timeline||[]).length,sum:h.chapters[0].summary}}",rec)
        check("Nạp record V14.5.15: giữ 3 chương, nhân vật, thread, timeline", out["n"]==3 and out["ch"]==["Lâm Phong"] and out["th"]==1 and out["tl"]==1 and out["sum"]=="Tóm tắt 1", json.dumps(out,ensure_ascii=False))
        check("Truyện cũ: Accuracy Mode mặc định TẮT", out["am"] is False)
        mig=new.evaluate("(r)=>{const h=__xta.hydrateFromRecord(r);Object.assign(__xta.state,h);try{ if(typeof normalizeLoadedState==='function') normalizeLoadedState(); }catch(e){} const s=__xta.state;return {om:Array.isArray(s.organizations),lm:!!(s.layeredMemory&&s.layeredMemory.summaries)}}",rec)
        check("Truyện cũ không gây lỗi khi thiếu trường mới", not errs, "; ".join(errs)[:200])
    else:
        print("NOT RUN  nâng cấp từ app cũ (đặt UPGRADE_OLD_DIR=thư mục V14.5.15 để chạy)")
    # B) vòng lưu → nạp của trường mới
    new.evaluate(SEED)
    new.evaluate("""()=>{const s=__xta.state; s.accuracyMode=true; s.chapterWordMin=4000; s.chapterWordMax=5600;
      s.organizations=[{name:'Huyết Minh',description:'thế lực giả lập',history:[{at:1,note:'lập'}]}];
      s.layeredMemory={schemaVersion:1,config:{chunkSize:4,chunksPerArc:5,arcsPerVolume:3},summaries:{L1:[{id:'L1-000001',layer:'L1',chapterNumber:1,summary:'a',frozen:true,stale:false}],L2:[],L3:[],L4:[],L5:[]},history:[]};
      s.threads=[{id:'t1',title:'Bí mật cổng đá',status:'closed',history:[{status:'closed'}]}]; }""")
    rec2=run(new)
    back=new.evaluate("(r)=>{const h=__xta.hydrateFromRecord(r);return {am:h.accuracyMode,mn:h.chapterWordMin,mx:h.chapterWordMax,org:(h.organizations||[]).map(o=>o.name),l1:((h.layeredMemory||{}).summaries||{}).L1&&h.layeredMemory.summaries.L1.length,th:(h.threads||[])[0]&&h.threads[0].status}}",rec2)
    check("Accuracy Mode sống sót qua lưu/nạp", back["am"] is True, json.dumps(back,ensure_ascii=False))
    check("min/max chương sống sót", back["mn"]==4000 and back["mx"]==5600)
    check("Hồ sơ thế lực sống sót", back["org"]==["Huyết Minh"])
    check("Bộ nhớ L1 đóng băng sống sót", back["l1"]==1)
    check("Trạng thái thread do tác giả đóng sống sót", back["th"]=="closed")
    # C) ô "Số nhân vật có tên tối đa" (V14.7.5): chọn trên giao diện → state → lưu → nạp lại
    new.evaluate("()=>{const e=document.getElementById('maxNamedChars'); e.value='10'; e.dispatchEvent(new Event('change',{bubbles:true}));}")
    sc=new.evaluate("()=>({m:__xta.state.storyControl.maxNamedCharacters,u:__xta.state.storyControl.castCapUserSet})")
    check("Chọn 10 trong giao diện được ghi vào storyControl", sc["m"]==10 and sc["u"] is True, json.dumps(sc))
    rec3=run(new)
    back3=new.evaluate("(r)=>{const h=__xta.hydrateFromRecord(r);return h.storyControl&&{m:h.storyControl.maxNamedCharacters,u:h.storyControl.castCapUserSet}}",rec3)
    check("Giới hạn nhân vật do tác giả chọn sống sót qua lưu/nạp", back3 and back3["m"]==10 and back3["u"] is True, json.dumps(back3))
    b.close()
bad=res.count(False); print(f"\n{len(res)-bad}/{len(res)} PASS"); sys.exit(1 if bad else 0)
