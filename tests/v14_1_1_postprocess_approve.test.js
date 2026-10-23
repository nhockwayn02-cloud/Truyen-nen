// V14.1.1: nút "Chạy hậu kỳ server" phải tự duyệt chương nháp TRƯỚC khi gửi, nếu không worker chặn hậu kỳ.
const fs=require('fs'),path=require('path'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const i=html.indexOf('async function retryBackgroundPostProcess');
assert(i>0,'thiếu retryBackgroundPostProcess');
const body=html.slice(i,i+2500);
const approve=body.indexOf('ch.status="APPROVED"'), send=body.indexOf('await startBackgroundPostProcess');
assert(approve>0&&send>approve,'phải duyệt chương trước khi gửi hậu kỳ');
assert(/drafted/.test(body),'phải xử lý trạng thái DRAFTED');
console.log('PASS V14.1.1: retry postprocess button auto-approves drafts before sending');
