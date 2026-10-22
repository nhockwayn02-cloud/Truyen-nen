# E2E V14.1: form tu luyện (nhân vật chính + nhân vật phụ), nhãn theo thể loại, Story Bible hệ thống tu luyện, vật phẩm phẩm cấp, khóa đột phá phía client.
import http.server, threading, socketserver, os, functools, json
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(("127.0.0.1",0),functools.partial(Q,directory=ROOT)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
ok_all=True
def check(name,cond,extra=""):
    global ok_all
    print(("PASS " if cond else "FAIL ")+name, extra); ok_all&=bool(cond)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(); ctx.add_init_script("window.__XTA_TEST__=true")
    page=ctx.new_page(); errs=[]; page.on("pageerror",lambda e:errs.append(str(e)))
    page.goto(f"http://127.0.0.1:{port}/index.html"); page.wait_for_timeout(1200)
    page.evaluate("()=>document.querySelectorAll('.section').forEach(x=>x.classList.add('open'))")
    page.add_style_tag(content=".section-body,.settings-only-section,[data-column]{display:block !important;visibility:visible !important;height:auto !important;max-height:none !important}")
    # A) Story Bible: nạp mẫu + lưu
    page.fill("#genre","Tu tiên, huyền huyễn, võ hiệp")
    page.click("#cultSeedBtn"); page.click("#saveSettingsBtn"); page.wait_for_timeout(200)
    r=page.evaluate("()=>({cs:__xta.state.cultivationSystem, rl:__xta.state.realmLadder})")
    check("A: nạp mẫu + lưu Story Bible", "chín tiểu tầng" in r["cs"] and r["rl"]=="Luyện Khí, Trúc Cơ, Kết Đan, Nguyên Anh", json.dumps(r,ensure_ascii=False)[:120])
    # B) nhãn theo thể loại (nhân vật chính)
    ph=page.evaluate("()=>({occ:document.getElementById('mcOccupationInput').placeholder, fac:document.getElementById('mcf_faction').placeholder, age:document.getElementById('mcAgeInput').placeholder})")
    check("B: nhãn tu tiên cho NV chính", ph["occ"].startswith("Thân phận") and "Tông môn" in ph["fac"] and ph["age"]=="Tuổi thực", json.dumps(ph,ensure_ascii=False))
    page.fill("#genre","Đô thị tình cảm")
    ph2=page.evaluate("()=>document.getElementById('mcOccupationInput').placeholder")
    check("B2: đổi sang thể loại khác thì nhãn trở lại 'Nghề'", ph2=="Nghề", ph2)
    page.fill("#genre","Tu tiên")
    # C) nhân vật chính: nhập + lưu + nạp lại
    page.evaluate("()=>{document.getElementById('mcCultDetails').open=true}")
    page.fill("#mcNameInput","Lâm Phong"); page.fill("#mcf_realm","Luyện Khí đệ cửu trọng"); page.fill("#mcf_technique","Thanh Mộc Quyết")
    page.fill("#mcf_aliasesText","Huyền Phong, Lâm Tiểu Tử"); page.fill("#mcf_faction","Thanh Vân Tông"); page.fill("#mcf_apparentAge","17")
    page.click("#saveMainCharBtn"); page.wait_for_timeout(200)
    mc=page.evaluate("()=>{const m=__xta.state.mainCharProfile; __xta.hydrateMainCharForm(); return {realm:m.realm, peak:m.peakRealm, al:m.aliases, fac:m.faction, tech:m.technique, back:document.getElementById('mcf_aliasesText').value}}")
    check("C: NV chính lưu đủ trường tu luyện + peakRealm tự điền + tên khác", mc["realm"]=="Luyện Khí đệ cửu trọng" and mc["peak"]==mc["realm"] and mc["al"]==["Huyền Phong","Lâm Tiểu Tử"] and mc["fac"]=="Thanh Vân Tông" and mc["back"]=="Huyền Phong, Lâm Tiểu Tử", json.dumps(mc,ensure_ascii=False))
    # D) nhân vật phụ: form có mục tu luyện, lưu tên khác
    page.evaluate("""()=>{const s=__xta.state; s.characters=[__xta.newCharacter({name:'Trần Nhị',tier:'major',age:'30'})]; __xta.renderCharacters();}""")
    n=page.evaluate("()=>document.querySelectorAll('#charList [data-char-field=\"realm\"]').length")
    check("D: thẻ NV phụ có ô cảnh giới", n==1, str(n))
    page.evaluate("()=>{document.querySelector('#charList [data-char-field=\"aliasesText\"]').value='Hắc Y Kiếm, Nhị Gia'; document.querySelector('#charList [data-char-field=\"realm\"]').value='Trúc Cơ đệ tam trọng'; document.querySelector('#charList [data-char-save]').click();}")
    page.wait_for_timeout(200)
    c=page.evaluate("()=>{const c=__xta.state.characters[0]; return {al:c.aliases, t:c.aliasesText===undefined?null:c.aliasesText, realm:c.realm, peak:c.peakRealm}}")
    check("D2: lưu NV phụ -> aliases là mảng, không rò aliasesText, peakRealm tự điền", c["al"]==["Hắc Y Kiếm","Nhị Gia"] and c["t"] is None and c["realm"]=="Trúc Cơ đệ tam trọng" and c["peak"]==c["realm"], json.dumps(c,ensure_ascii=False))
    # E) client merge: đột phá cần explicit + bằng chứng
    src="Trần Nhị khoanh chân ngồi suốt bảy ngày, linh khí cuộn như thủy triều, rồi hắn tiến vào Trúc Cơ đệ tứ trọng."
    r1=page.evaluate("(src)=>{__xta.mergeCharacterUpdate({name:'Trần Nhị',realm:'Trúc Cơ đệ tứ trọng',arts:'Phong Lôi chưởng'},3,src); return __xta.state.characters[0].realm}",src)
    check("E: AI đổi cảnh giới không có explicit -> bị bác", r1=="Trúc Cơ đệ tam trọng", r1)
    r2=page.evaluate("(src)=>{__xta.mergeCharacterUpdate({name:'Trần Nhị',realm:'Trúc Cơ đệ tứ trọng',explicitCoreChange:true,changeEvidence:'rồi hắn tiến vào Trúc Cơ đệ tứ trọng'},3,src); const c=__xta.state.characters[0]; return {realm:c.realm, tracker:Object.values(__xta.state.characterStateTracker||{}).map(x=>x.powerLevel), arts:c.arts}}",src)
    check("E2: explicit + bằng chứng trích từ chương -> đổi; tracker theo hồ sơ; thần thông cộng dồn", r2["realm"]=="Trúc Cơ đệ tứ trọng" and r2["tracker"][0]=="Trúc Cơ đệ tứ trọng" and "Phong Lôi" in (r2["arts"] or ""), json.dumps(r2,ensure_ascii=False))
    r3=page.evaluate("(src)=>{__xta.mergeCharacterUpdate({name:'Trần Nhị',realm:'Hóa Thần đệ nhất trọng',explicitCoreChange:true,changeEvidence:'rồi hắn tiến vào Trúc Cơ đệ tứ trọng'},4,src); return __xta.state.characters[0].realm}",src)
    check("E3: cảnh giới ngoài thang bị bác dù có explicit", r3=="Trúc Cơ đệ tứ trọng", r3)
    # F) prompt có hệ thống tu luyện + hồ sơ nhân vật
    ctxt=page.evaluate("()=>__xta.buildContextBlock()")
    check("F: ngữ cảnh viết chương chứa hệ thống tu luyện + cảnh giới NV chính", "HỆ THỐNG TU LUYỆN" in ctxt and "CẢNH GIỚI:Luyện Khí đệ cửu trọng" in ctxt, "")
    # G) vật phẩm
    page.evaluate("""()=>{const set=(id,v)=>{document.getElementById(id).value=v}; set('itemNameInput','Hắc Phong Kiếm'); set('itemKindInput','binh khí'); set('itemGradeInput','Hạ phẩm pháp khí'); set('itemEffectInput','Tăng tốc ngự kiếm'); document.getElementById('itemBoundInput').checked=true; document.getElementById('itemAddBtn').click();}""")
    page.wait_for_timeout(200)
    it=page.evaluate("()=>({it:__xta.state.items[0], html:document.getElementById('itemList').textContent})")
    check("G: vật phẩm lưu loại/phẩm cấp/công dụng/nhận chủ và hiển thị", it["it"]["grade"]=="Hạ phẩm pháp khí" and it["it"]["bound"] is True and "Hạ phẩm pháp khí" in it["html"], json.dumps(it["it"],ensure_ascii=False)[:160])
    # H) rào chắn tuổi dùng tuổi ngoại hình
    u=page.evaluate("()=>{__xta.state.characters[0].age='300'; __xta.state.characters[0].apparentAge='16'; return __xta.underageNames(__xta.state)}")
    check("H: tuổi thực 300 nhưng ngoại hình 16 vẫn bị rào chắn 18+", "Trần Nhị" in u, json.dumps(u,ensure_ascii=False))
    if errs: print("FAIL lỗi trang:",errs[:3]); ok_all=False
    b.close()
raise SystemExit(0 if ok_all else 1)
