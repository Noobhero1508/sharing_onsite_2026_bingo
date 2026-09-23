# Kết quả kiểm thử

Ngày kiểm tra: 23/09/2026. Trình duyệt: Chrome 153 trên Windows, chạy tự động qua Playwright.

**Bản đầu: 19 kiểm tra chính và 3 kiểm tra bổ sung đều đạt. Bản sửa phối cảnh nút và bánh răng: 15/15 kiểm tra đạt.**

| Hạng mục | Kết quả |
| --- | --- |
| Mở trực tiếp từ tệp khi offline | 25 ảnh sẵn sàng, 0 yêu cầu mạng ngoài, 0 lỗi JavaScript |
| Quay, giữ phím và bấm liên tục | Chỉ ghi nhận một lượt; lịch sử chưa công bố kết quả đang quay |
| Cần gạt | Kéo ngắn không quay; hủy sau khi kéo quá ngưỡng không quay; kéo đủ và bấm cần đều tạo đúng một lượt |
| Bốc đủ 25 thẻ | 25 kết quả khác nhau, đúng bộ đếm và lịch sử; khóa quay khi hết thẻ |
| Kích thước màn hình | 1920×1080, 1366×768, 1280×720, 3840×2160, 320×690, 375×812, 414×896, 768×1024 |
| Thay đổi kích thước trong lúc quay | Tâm ảnh và tâm cửa sổ trùng nhau sau khi dừng |
| Lịch sử và phóng to | Phím tắt, đóng/mở, tiêu đề thẻ và trả focus hoạt động |
| Điều khiển bằng bàn phím | Enter/Space trên ô kết quả mở phóng to, không bắt đầu lượt mới |
| Toàn màn hình và âm thanh | Vào/thoát bằng nút; âm thanh được khởi tạo và dừng sau lượt, tắt/bật hoạt động |
| Giảm chuyển động | Chuyển cảnh ngắn, kết quả và lịch sử vẫn chính xác |
| Thiếu toàn bộ ảnh thẻ | Có thông báo, dùng tên và mã thẻ thay thế; quay và phóng to vẫn hoạt động |
| Tài nguyên chuyển động sau 25 lượt | Không tăng số animation tồn đọng: 1 → 1 |
| Tải lại trang | Bắt đầu phiên mới, bộ đếm trở về 25 |

Lượt đầu được chạy với nhịp bình thường; chuỗi kiểm tra lặp 25 lượt dùng tăng tốc thời gian GSAP trong trình duyệt kiểm thử. Bản bàn giao không có chế độ tăng tốc kiểm thử. Các lần kéo cần dùng thao tác chuột thật của trình duyệt ở cả kích thước 1920 và 1366.

Đã cập nhật ảnh chụp trạng thái chờ, kết quả, khay thẻ, lịch sử, phóng to, hoàn tất và điện thoại theo bản mới.

## Kiểm tra bản sửa nút và bánh răng

| Hạng mục | Kết quả |
| --- | --- |
| Tâm và hướng nút | Tâm nút trùng tâm mặt bàn điều khiển tại tọa độ cục bộ (330,5; 682). Tấm kim loại, vòng đế và nút dùng cùng phép chiếu; đạt ở 1920, 1366, 1280, 3840 và 375 px |
| Ăn khớp bánh răng | 8 bánh / 4 cặp, đúng khoảng cách trục, pha răng và chiều quay; tốc độ tỷ lệ nghịch với số răng. Kiểm tra cả biến trạng thái và phép xoay thực tế trên SVG |
| Nhịp truyền động | Trục tham chiếu tăng từ 10 lên 60 độ/giây rồi về 10; cụm có ly hợp đứng yên lúc chờ |
| Rung và tia lửa | Các cụm rung đồng nhịp khi vào tải/hãm, giảm biên độ theo độ sâu; không rung nền lúc chờ. Đợt vào tải tối đa 7 tia, hãm 5 tia tại điểm tiếp xúc cạnh máy |
| Toàn bộ phiên chơi | 25 kết quả duy nhất, đúng thứ tự lịch sử và bộ đếm; kéo ngắn/hủy không phát sinh lượt; kéo đủ và bàn phím không tạo lượt kép |
| Tài nguyên sau 5 → 25 lượt | Giữ ổn định 1 animation, 3 ticker listener, 8 bánh răng và 18 phần tử tia lửa dùng lại |
| Giảm chuyển động giữa lượt | Chốt đúng một kết quả, tắt rung/tia lửa, dừng ticker cơ khí; bật lại chuyển động về ngay nhịp chờ, không phát lại rung/hãm cũ |
| Offline | Không lỗi JavaScript, không yêu cầu mạng ngoài |

Ảnh kiểm tra trực tiếp: `preview/08-mechanics-idle-1920.png`, `09-mechanics-spinning-1920.png` và `10-button-aligned-detail.png`.

## Kiểm tra nhịp chơi và âm thanh

**7/7 kiểm tra đạt** trên bản bổ sung nhịp quay: khoảng 3,3 giây và đủ các pha tác động → tăng tốc → hãm → công bố. Bản âm thanh mạnh của lần kiểm tra này đã được thay sau phản hồi về cảm giác khó chịu khi nghe.

Phóng to có chuyển động bật từ thẻ được chọn, trả focus sau khi đóng; giảm chuyển động mở ngay và không rung. Thử đủ 25 lượt không trùng, không tích lũy animation khi phóng to nhiều lần. Ở 4K, cuộn thẻ tiếp tục phản hồi trong lúc quay và trở về đúng một thẻ khi dừng. Không phát sinh lỗi JavaScript hoặc yêu cầu mạng. Ảnh mới: `preview/11-energy-idle-1920.png` đến `15-energy-spinning-3840.png`.

## Điều chỉnh tiếng quay và bánh răng vàng

**5/5 kiểm tra đạt** trên bản hiện tại. Chuỗi âm đã đưa về cấu trúc của bộ mẫu: cú thụ cần gạt, nền động cơ/bánh răng trong lúc chạy, tiếng lạch cạch theo nhịp cuộn, rồi tiếng chốt và nốt công bố ngắn. Các lớp âm được route qua compressor cục bộ để giữ lực mà không vỡ tiếng. Tiếng chuyển thẻ cũ sang khay dùng cùng chất âm cơ khí.

Đo ở đầu ra Web Audio trong Chrome: đỉnh trong lượt khoảng **0,23**, RMS tối đa **0,083**; tính cả tiếng chốt và công bố, đỉnh khoảng **0,42**, RMS tối đa **0,148**. Các mức này thấp hơn bản âm thanh mạnh trước đó (đỉnh khoảng **0,57**, RMS tối đa **0,251**) trong cùng phép đo. Đây là mức tín hiệu số, không thay cho nghe thử trên hệ thống loa hội trường. Tắt tiếng giữa lượt đưa tín hiệu về 0 và kết quả vẫn đúng; phóng to hoạt động; không có lỗi trang hoặc yêu cầu mạng ngoài.

Ba bánh răng vàng hiển thị rõ: hai trong nền và một bên thân máy. Ảnh đối chiếu: `preview/17-gold-gears-idle-1920.png`, `18-gold-gears-spinning-1920.png`. Bản nghe thử theo bộ mẫu đã được ghi lại tại `preview/16-am-thanh-luot-quay.mp3`.

Âm thanh được xác nhận ở mức Web Audio; chưa nghe kiểm tra trên loa sự kiện hoặc kiểm tra trực tiếp với máy chiếu/LED của hội trường. Chưa kiểm chứng tích hợp Canva. Bộ 25 ảnh hiện tại vẫn là thẻ tạm.
