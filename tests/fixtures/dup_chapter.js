// Mẫu thật (rút gọn) từ chương bị lặp: bản 1 và bản 2 cùng diễn biến, khác câu chữ, dính liền sau "nứng lồn."
const copy1 = [
"Chiếc xe nhả một tiếng máy trầm xuống rồi im bặt khi bánh răng vào số P. Trong khoang xe chỉ còn tiếng điều hòa thổi nhẹ, và tiếng nước lồn bạch bạch theo nhịp rút ngón tay ra khỏi cơ thể Mỹ Duyên.",
"Bùi Lạc rút hai ngón tay ra khỏi dưới váy cô. Hai đầu ngón tay bóng loáng, dính chặt một lớp dịch quánh trắng đục. Hắn không vội. Hắn đưa tay lên trước mặt, nhìn ngón tay mình như nhìn một món đồ vừa kiểm tra xong, rồi thản nhiên lau hai ngón tay vào mép ghế da.",
"Mỹ Duyên ngồi cứng đờ ở ghế lái. Hai đùi trong ướt nhẹp, dính chặt vào nhau. Cái lỗ lồn vừa rỗng ra sau gần một tiếng đồng hồ bị nhét đầy vẫn còn đang co giật từng chùm, như thể cơ thể cô chưa nhận ra rằng cái thứ đang xâm chiếm nó đã rút đi.",
"“Xuống trước. Đi bình thường.”",
"Gió sớm của thành phố còn lạnh, còn mang theo mùi khói xe và bánh mì nóng từ con hẻm bên kia đường. Dưới váy, không có gì che chắn. Cô bước xuống khỏi ghế lái, hai chân chạm đất, và ngay lập tức cô phải gồng cứng hai đùi vào nhau.",
"Cô đứng thẳng lưng. Cằm ngang. Mặt lạnh tanh như mọi ngày. Cô bước đi, từng bước một, cố gắng giữ nhịp điệu bình thường nhất, trong khi giữa hai đùi là một đầm lầy ướt đẫm đang từ từ thấm vào lớp vải.",
"Bùi Lạc bước xuống sau. Hắn đóng cửa xe, âm thanh một tiếng kịch nhẹ. Hắn bước đi sau lưng cô, cách cô vài bước chân, như đúng thân phận một thằng bảo vệ đi sau ông chủ lớn, hay một người xa lạ không liên quan.",
"Cả buổi sáng của Mỹ Duyên là một chuỗi dài những hành động xã hội hoàn hảo, được thực hiện bởi một cái xác đang từ từ tan chảy từ bên trong.",
"Cô ngồi trong phòng họp tầng 15, ký lên những văn bản quan trọng, nói chuyện với giám đốc khối kinh doanh về kế hoạch quý, cười gượng khi cần, cau mày khi nên cau mày. Trong suốt hai tiếng đồng hồ đó, cô không dám ngồi quá lâu trên ghế.",
"Cô đi cầu thang bộ từ tầng 15 xuống tầng 10 để tránh khu vực sảnh chính, nơi hắn có thể đứng gác. Cô nhờ cô trợ lý mang cơm hộp lên tận phòng làm việc. Cô không ra khỏi phòng làm việc trừ khi thật sự cần thiết.",
"Mười hai giờ trưa. Ánh nắng trưa hè chiếu nghiêng qua cửa kính sảnh, đổ một màu vàng chói lên nền đá cẩm thạch. Hành lang tầng trệt đông người qua lại. Nhân viên đi ăn trưa, khách hàng ra vào, những bước chân vội vã, những tiếng nói rôm rả.",
"Bùi Lạc đứng thẳng lưng ở góc hành lang, ngay sát quầy lễ tân, đúng vị trí một thằng bảo vệ luôn đứng. Khi cô vừa bước qua, hắn khẽ nhích sang ngang, chắn ngang đường cô.",
"“Chị Duyên. Tiến độ hồ sơ ba khách hàng lớn thế nào rồi? Hạn cuối hôm nay là mười tám giờ đúng không ạ?”",
"“Thằng bảo vệ chỉ biết đứng gác cũng đòi hỏi công việc của tao à? Biết thân phận mình đi. Xéo ra!”",
"Nhưng ngay khoảnh khắc cô xoay người, một bàn tay đã lặng lẽ luồn vào từ phía sau. Bàn tay đó không hề vội vàng, không hề run rẩy. Nó trượt nhẹ dọc theo mặt sau váy cô, rồi hai ngón tay thô ráp móc thẳng vào lỗ lồn cô.",
"Hai ngón tay hắn cắm phập vào trong, chạm ngay vào điểm nhạy cảm mà hắn đã đánh dấu suốt đêm qua. Cô phải đứng vững. Cô phải giữ vững tư thế. Cô phải tiếp tục đi bộ một cách bình thường.",
"Không phải kiểu vồ vập, mà là kiểu miết chậm, có nhịp. Rút ra một đoạn, đẩy vào sâu. Rút ra, đẩy vào. Mỗi cú đẩy đều đụng trúng cái chỗ sưng đỏ của cô.",
"Cô không thể chịu nổi nữa. Cơn cao trào ập đến, xé nát cô ra thành từng mảnh. Cô phải cắn chặt răng, nghiêng người về phía trước, giả vờ như đang ho sặc sụa, trong khi cơ thể cô đang run lên từng chùm.",
"Hắn lấy chiếc khăn tay lụa đắt tiền của cô ra, lau sạch từng ngón tay một cách chậm rãi, trước mặt mọi người. Rồi hắn gấp chiếc khăn tay đó lại, cẩn thận, và bỏ vào túi quần của mình.",
"“Nhớ hạn mười tám giờ.”",
"Khách hàng thứ ba, ông Thành, giám đốc một doanh nghiệp đối tác lớn, đã gọi điện lúc bốn giờ. Ông ta sẽ ký xác nhận vào sáng mai, khi có mặt ở văn phòng để trực tiếp trao đổi với chủ tịch. Cô đã dỗ dành, đã hứa hẹn, nhưng ông ta đã dập máy.",
"Cô đứng dậy, lấy túi xách, chìa khóa xe. Cô đi ra khỏi phòng làm việc, xuống thang máy. Cửa thang máy mở ra trước bãi xe dưới tầng hầm. Lạnh, ẩm, mùi xăng dầu nồng nặc.",
"Đồng hồ táp-lô trên bảng điều khiển hiện rõ hai con số màu đỏ rực: 17:58. Còn hai phút nữa là đến hạn chót.",
"Cô sẽ bị phạt. Cô biết. Và cái biết đó khiến cô vừa muốn khóc, vừa muốn nôn, vừa muốn… nứng lồn."
];
const copy2 = [
"Xe vừa dừng trước sảnh tòa nhà Vĩnh Phát, bánh xe lăn lên vạt vai nhựa cao, khựng lại, im hẳn. Bùi Lạc rút tay ra khỏi dưới váy Trần Mỹ Duyên. Hai ngón tay còn dính một lớp dịch quánh, kéo ra mấy sợi mỏng chạm vào lớp vải váy, đứt phựt.",
"Cô ngồi cứng đờ ở ghế lái. Hai đùi trong ướt nhẹp, dính vào nhau từng tấc da. Lỗ lồn vẫn còn co giật, từng cơn, rỗng tuếch mà nhớ nhung. Hơi nóng từ giữa chân bốc lên, nhức nhối.",
"“Xuống trước. Đi bình thường.”",
"Mỹ Duyên đẩy cửa xe. Gió sớm thổi qua, mát và khô, len vào khe hở giữa váy và đùi, khe hở mà bây giờ không còn lớp vải nhỏ xíu nào chắn giữa da thịt cô và thế giới. Cô phải gồng cứng hai đùi.",
"Cô bước đi. Mỗi bước chân là một trận chiến âm thầm giữa cơ thể và hình ảnh. Mặt cô cố giữ vẻ kiêu kỳ quen thuộc, cằm hơi ngẩng, mắt nhìn thẳng. Chỉ có hai đầu gối biết chúng đang run.",
"Bùi Lạc bước xuống sau, đóng cửa xe, tiếng đóng kịch nhẹ. Hắn đi cách cô vài bước, đúng thân phận một thằng bảo vệ và một vị cấp trên không liên quan. Không ai nhìn hắn. Không ai nhìn cô.",
"Cả buổi sáng trôi qua như một cuộc rượt đuổi giữa cô và chính cơ thể mình.",
"Trong phòng họp tầng mười lăm, cô ngồi trên ghế da, lưng ép sát vào lưng ghế, hai chân bắt chéo chặt. Có lúc giám đốc dự án nói chuyện dài quá, cô phải đứng lên đi rót nước, và ngay khoảnh khắc đứng dậy, một dòng dịch đọng từ lâu lại chảy dọc đùi trong.",
"Cô chủ động né tránh khu vực hắn đứng gác. Đi cầu thang bộ từ tầng mười lăm xuống tầng ba, rồi lại lên. Nhờ cô trợ lý trẻ mang hộp cơm lên tận phòng, ăn trong im lặng.",
"Gần mười hai giờ trưa. Ánh nắng trưa đổ nghiêng qua mặt kính sảnh, vẽ lên nền đá cẩm thạch những khối sáng chói gay gắt. Hành lang tầng trệt đông người. Nhân viên xách túi đi ăn trưa, nhóm khách hàng chờ ở quầy, tiếng nói rôm rả.",
"Rồi hắn chặn đường cô. Bùi Lạc đứng thẳng, không nghiêng đầu, không cúi chào, chỉ đứng chắn ngang như một cột sống tự di chuyển. Mắt nhìn xa xăm vào khoảng không.",
"“Chị Duyên. Tiến độ hồ sơ ba khách hàng lớn thế nào rồi? Hạn mười tám giờ hôm nay đúng không ạ?”",
"“Thằng bảo vệ chỉ biết đứng gác cũng đòi hỏi công việc của tao à? Biết thân phận mình đi. Xéo ra!”",
"Một bàn tay đã lặng lẽ luồn vào từ phía sau. Không vội, không run. Bàn tay trượt nhẹ dọc theo mặt sau váy cô, chui vào khe hở giữa vạt váy và da mông, hai ngón tay thô ráp, lạnh hơn không khí điều hòa, móc thẳng vào lỗ lồn trần.",
"Hai ngón tay hắn cắm phập vào trong, chạm ngay vào điểm nhạy cảm mà hắn đã đánh dấu suốt đêm qua. Nhưng cô phải đứng vững. Cô phải giữ vững tư thế. Cô phải tiếp tục diễn vai người phụ nữ quyền lực.",
"Không phải kiểu vồ vập, mà là kiểu miết chậm, có nhịp. Rút ra một đoạn, đẩy vào sâu. Rút ra, đẩy vào. Mỗi cú đẩy đều đụng trúng cái chỗ sưng đỏ của cô.",
"Cô không thể chịu nổi nữa. Cơn cao trào ập đến, xé nát cô ra thành từng mảnh. Cô phải cắn chặt răng, nghiêng người về phía trước, giả vờ như đang ho sặc sụa, trong khi cơ thể cô đang run lên từng chùm.",
"Hắn móc túi áo vest của cô, lấy chiếc khăn tay lụa đắt tiền ra, lau sạch từng ngón tay một cách chậm rãi, trước mặt mọi người. Rồi hắn gấp chiếc khăn tay đó lại, cẩn thận, và bỏ vào túi quần của mình.",
"“Nhớ hạn mười tám giờ.”",
"Khách hàng thứ ba, ông Thành, giám đốc một doanh nghiệp đối tác lớn, đã gọi điện lúc bốn giờ. Ông ta sẽ ký xác nhận vào sáng mai, khi có mặt ở văn phòng để trực tiếp trao đổi với chủ tịch. Cô đã dỗ dành, đã hứa hẹn, nhưng ông ta đã dập máy.",
"Cô đứng dậy, lấy túi xách, chìa khóa xe. Cô đi ra khỏi phòng làm việc, đi qua hành lang vắng tanh, xuống thang máy. Cửa thang máy mở ra trước bãi xe dưới tầng hầm. Lạnh, ẩm, mùi xăng dầu nồng nặc.",
"Đồng hồ táp-lô trên bảng điều khiển hiện rõ hai con số màu đỏ rực: 17:58. Còn hai phút nữa là đến hạn chót.",
"Cô sẽ bị phạt. Cô biết. Và cái biết đó khiến cô vừa muốn khóc, vừa muốn nôn, vừa muốn… nứng lồn."
];
module.exports = {
  copy1, copy2,
  glued: copy1.join("\n\n") + "TIÊU ĐỀ: Hạn Chót\n\nNỘI DUNG:\n\n" + copy2.join("\n\n"),   // đúng như trường hợp thực tế
  noLabel: copy1.join("\n\n") + "\n\n" + copy2.join("\n\n"),                                  // không có nhãn, chỉ có 2 bản diễn đạt khác
  single: copy1.join("\n\n")
};
