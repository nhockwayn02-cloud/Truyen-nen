# E2E: nút "🤖 AI đề xuất" (0.6 Chapter Outline) theo cài đặt 18+ và rào chắn tuổi. AI được mock qua route cục bộ.
import http.server, threading, socketserver, os, functools, json
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(("127.0.0.1",0),functools.partial(Q,directory=ROOT)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
def outline(adult_rows, start=3):
    ch=[]
    for i in range(10):
        n=start+i
        ch.append({"chapter":n,"beat":adult_rows.get(n,"Linh và Hùng tiến thêm một bước trong cuộc điều tra, gặp hậu quả mới.")})
    return json.dumps({"name":"Giai đoạn 2","milestone":"Linh biết kẻ phản bội","chapters":ch},ensure_ascii=False)
def run(page, mature, focus, ai_json, extra=None):
    sent=[]
    def handler(route):
        sent.append(json.loads(route.request.post_data))
        route.fulfill(status=200,content_type="application/json",body=json.dumps({"choices":[{"message":{"content":ai_json}}]}))
    page.route("**/fake/chat/completions",handler)
    page.evaluate("""([m,f,port,ex])=>{const s=__xta.state;
      s.apiEndpoint='http://127.0.0.1:'+port+'/fake/chat/completions'; s.apiKey='k'; s.model='m';
      s.chapters=[{id:'c1',title:'1',text:'x'.repeat(60),wordCount:1},{id:'c2',title:'2',text:'x'.repeat(60),wordCount:1}];
      s.mainCharProfile={name:'Linh',age:25}; s.characters=[{name:'Hùng',age:30},{name:'Mai',age:16}].concat(ex);
      s.outlinePlans=[]; s.mature=m; s.chapterMatureFocus=f;}""",[mature,focus,port,extra or []])
    page.evaluate("()=>document.getElementById('outlineAIGenerateBtn').click()")
    page.wait_for_timeout(1200)
    r=page.evaluate("()=>({plans:__xta.state.outlinePlans.map(o=>o.content), status:document.body.innerText.match(/(Đã tạo outline[^\\n]*|Outline có cảnh 18\\+[^\\n]*|Không phân tích được[^\\n]*)/)})")
    page.unroute("**/fake/chat/completions")
    prompt=(sent[0]["messages"][-1]["content"] if sent else "")
    return r,prompt
ok_all=True
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(); ctx.add_init_script("window.__XTA_TEST__=true")
    page=ctx.new_page(); errs=[]; page.on("pageerror",lambda e:errs.append(str(e)))
    page.goto(f"http://127.0.0.1:{port}/index.html"); page.wait_for_timeout(1200)
    clean={5:"Cảnh nóng giữa Linh và Hùng, làm đổi quyền lực giữa hai người sau khi Hùng lật bài.",9:"Cảnh nóng giữa Linh và Hùng trong căn hộ, kéo theo một bí mật bị lộ."}
    # A) 18+ BẬT + PRIMARY, kết quả sạch -> prompt có chỉ thị 18+ và rào chắn tuổi, outline được lưu, có chương 18+
    r,pr=run(page,True,"primary",outline(clean))
    a=("NỘI DUNG 18+" in pr and "RÀO CHẮN TUỔI" in pr and "KHÔNG được xuất hiện trong cảnh 18+: Mai" in pr and len(r["plans"])==1 and "Cảnh nóng" in r["plans"][0] and r["status"] and "2 chương 18+" in r["status"][0])
    print(("PASS " if a else "FAIL ")+"A: 18+ bật/PRIMARY -> prompt có chỉ thị 18+, outline lưu, báo 2 chương 18+", r["status"]); ok_all&=a
    # B) kết quả có cảnh 18+ dính nhân vật 16 tuổi -> bị loại, không lưu
    bad=dict(clean); bad[7]="Cảnh nóng giữa Hùng và Mai trong phòng làm việc."
    r,pr=run(page,True,"primary",outline(bad))
    bb=(len(r["plans"])==0 and r["status"] and "đã bỏ kết quả" in r["status"][0] and "ch 7" in r["status"][0])
    print(("PASS " if bb else "FAIL ")+"B: cảnh 18+ có nhân vật dưới 18 -> loại kết quả", r["status"]); ok_all&=bb
    # C) 18+ TẮT -> prompt như cũ, outline thường, status giải thích
    r,pr=run(page,False,"none",outline({}))
    c=("NỘI DUNG 18+" not in pr and len(r["plans"])==1 and r["status"] and "outline thường" in r["status"][0] and "TẮT" in r["status"][0])
    print(("PASS " if c else "FAIL ")+"C: 18+ tắt -> outline thường + giải thích", r["status"]); ok_all&=c
    # D) 18+ bật nhưng NONE -> outline thường, nhắc chọn SECONDARY/PRIMARY
    r,pr=run(page,True,"none",outline({}))
    d=("NỘI DUNG 18+" not in pr and r["status"] and "NONE" in r["status"][0])
    print(("PASS " if d else "FAIL ")+"D: bật nhưng NONE -> nhắc chọn SECONDARY/PRIMARY", r["status"]); ok_all&=d
    # E) bật + SECONDARY nhưng AI không đưa chương 18+ nào -> báo để tạo lại
    r,pr=run(page,True,"secondary",outline({}))
    e=("SECONDARY" in pr and r["status"] and "chưa có chương 18+" in r["status"][0])
    print(("PASS " if e else "FAIL ")+"E: AI không đưa chương 18+ -> báo tạo lại", r["status"]); ok_all&=e
    # F) Nhân vật không ghi tuổi = người lớn: vẫn dùng được trong chương 18+, không cảnh báo, không bị loại
    adult_nt={5:"Cảnh nóng giữa Linh và Khoa, làm đổi quyền lực giữa hai người sau cuộc cãi vã.",9:"Cảnh nóng giữa Khoa và Hùng, kéo theo một bí mật bị lộ."}
    r,pr=run(page,True,"primary",outline(adult_nt),[{"name":"Khoa"}])
    f=("không ghi tuổi trong hồ sơ được coi là người lớn" in pr and "KHÔNG được xuất hiện trong cảnh 18+: Mai" in pr and len(r["plans"])==1 and r["status"] and "2 chương 18+" in r["status"][0] and "Chưa có tuổi" not in r["status"][0])
    print(("PASS " if f else "FAIL ")+"F: không ghi tuổi = người lớn, dùng được, không bị loại", r["status"]); ok_all&=f
    ok_all&=not errs
    if errs: print("FAIL lỗi trang:",errs[:2])
    b.close()
raise SystemExit(0 if ok_all else 1)
