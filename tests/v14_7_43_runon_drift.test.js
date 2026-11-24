const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const core=fs.readFileSync(path.join(__dirname,'../shared/core.js'),'utf8');
const ctx=vm.createContext({console});
vm.runInContext(core+';this.f={countRunOnDrift,trimRunOnDrift,degenerationCheck,sanitizeChapterText}',ctx);const F=ctx.f;
const bad='“Phòng lưu trữ tầng ba,” hắn nói giọng trầm đều như đọc biên bản họp giao ban đầu tuần vậy thôi à nghen các bạn ơi xin cảm ơn mọi người đã theo dõi hết bản tin này nhé bye bye hẹn gặp lại kỳ sau chia sẻ tiếp những câu chuyện thú vị khác về đời sống văn phòng công sở hiện đại ngày càng phát triển mạnh mẽ vượt bậc trong kỷ nguyên số hóa toàn cầu đang lan tỏa khắp mọi ngành nghề lĩnh vực khác nhau trên toàn thế giới chúng ta đang sống hôm nay và cả ngày mai nữa cơ đấy!';
const sparse='Anh ta lấy ra một vòng cổ da mềm màu đen khâu tay đường chỉ đỏ đô chạy quanh mép trong suốt chiều dài vòng tròn khép kín hoàn hảo tỷ lệ vàng chuẩn xác tuyệt đối không sai lệch một nhỏ bé tí ti nào trong toàn bộ cấu trúc hình học phức tạp của nó cả.';
const good='Hắn gõ khẽ một cái vào khung cửa, rồi đi thẳng vào trong, không cần chờ phép; tập danh sách đặt xuống mặt bàn, cạnh chiếc đèn xanh, và cô vẫn không ngẩng lên, dù ngón tay đã siết chặt cây bút từ lúc nào không hay.';
let n=0;const t=(m,f)=>{try{f();console.log('PASS',m);}catch(e){console.log('FAIL',m,e.message);n++;}};
t('bắt giọng bản tin',()=>assert(F.degenerationCheck(good+'\n'+good+'\n'+bad).reasons.some(r=>/bản tin/.test(r))));
t('bắt câu lê thê thưa dấu (≥2)',()=>assert(F.degenerationCheck([good,sparse,good,sparse].join('\n')).reasons.some(r=>/lan man/.test(r))));
t('KHÔNG báo câu dài nhưng nhiều dấu phẩy',()=>assert.strictEqual(F.countRunOnDrift(good).sparse,0));
t('cắt: giữ phần đầu, đóng câu, hết dấu hiệu',()=>{const r=F.trimRunOnDrift(good+'\n'+bad+'\n'+sparse);assert(r.trimmed===2);assert(!/bye bye|các bạn ơi/.test(r.text));assert(r.text.includes(good));{const rd=F.countRunOnDrift(r.text);assert(rd.sparse===0&&rd.chatter===0);}});
t('chuẩn hóa dấu toàn chiều rộng',()=>assert(!/[；（）]/.test(F.sanitizeChapterText('Hắn đứng im；rồi đi（rất nhanh）.')) ));
const real='/mnt/user-data/attachments/2715c23c-f06e-5342-ab65-5b57b1080754/388aff17-attachment.txt';
if(fs.existsSync(real)){const T=fs.readFileSync(real,'utf8');t('file thật của người dùng: bắt được rồi cắt sạch',()=>{assert(F.degenerationCheck(T).bad);const r=F.trimRunOnDrift(T);assert(r.trimmed>=8);assert(F.countRunOnDrift(r.text).chatter===0);});}
const samples=['/mnt/user-data/attachments/2715c23c-f06e-5342-ab65-5b57b1080754/'];
if(fs.existsSync(samples[0]))fs.readdirSync(samples[0]).filter(f=>/^[0-9a-f]{8}-\d+\.txt$/.test(f)).forEach(f=>{const T=fs.readFileSync(samples[0]+f,'utf8');t('chương tác giả '+f.slice(9)+' không bị báo lan man',()=>assert(F.countRunOnDrift(T).sparse<2&&F.countRunOnDrift(T).chatter===0));});
process.exit(n?1:0);
