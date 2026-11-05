// V14.7.1: client runtime nằm ở app/client.js. Helper trả về index.html với thẻ <script src="app/client.js..."> được nhúng lại
// thành script nội tuyến -> các test cũ (regex trên "index.html") vẫn kiểm đúng nội dung như trước khi tách.
const fs = require("fs"), path = require("path");
module.exports = function readIndex(root) {
  root = root || path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  return html.replace(/<script src="app\/client\.js[^"]*"><\/script>/, () => "<script>\n" + fs.readFileSync(path.join(root, "app/client.js"), "utf8").replace(/^\/\*[\s\S]*?\*\/\n/, "") + "</script>");
};
