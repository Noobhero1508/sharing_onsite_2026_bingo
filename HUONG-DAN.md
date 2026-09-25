# Bingo · Sharing Onsite 2026

## Mở và trình chiếu

1. Giữ nguyên cả thư mục `bingo-sharing-onsite` rồi mở `index.html` bằng Chrome hoặc Edge.
2. Bấm biểu tượng toàn màn hình ở góc trên bên phải. Thiết kế chính dành cho màn hình 16:9.
3. Bấm nút đỏ, bấm cần gạt hoặc kéo cần xuống quá 65% hành trình để quay. Một lượt kéo thành công chỉ bốc một thẻ.

Không cần cài đặt, máy chủ hay Internet. Ảnh, font, GSAP và hai plugin đã nằm trong thư mục. Âm thanh được tạo bằng Web Audio và chỉ phát sau khi có thao tác.

Các cụm bánh răng phía xa quay chậm khi chờ; cụm phía dưới bắt đầu chuyển động khi quay thẻ. Khi bấm nút hoặc gạt cần, tất cả tăng tốc theo cùng nhịp truyền động rồi giảm về tốc độ chờ. Các bánh ăn khớp quay ngược chiều, tốc độ theo số răng. Rung và tia lửa ngắn chỉ nhấn vào lúc vào tải, hãm; tia lửa xuất phát từ chỗ hai bánh răng bên thân máy tiếp xúc.

Nhịp quay kéo dài khoảng 3,3 giây: cần gạt tác động bằng một cú thụ trầm, bánh răng và động cơ chạy nền, tiếng lạch cạch dồn theo cuộn thẻ, sau đó hãm lại trước khi công bố thẻ. Chuỗi này được đưa theo bộ âm thanh mẫu trong dự án gốc. Một số bánh răng được hoàn thiện màu vàng để làm điểm nhấn. Khi mở phóng to, thẻ bật từ vị trí vừa chọn ra giữa màn hình và trở về khi đóng.

Có thể nghe trước một lượt âm thanh tại `preview/16-am-thanh-luot-quay.mp3` để chỉnh hệ thống loa trước buổi chơi.

| Thao tác | Phím |
| --- | --- |
| Quay | Space hoặc Enter |
| Phóng to kết quả vừa bốc | Z, bấm thẻ hoặc nút phóng to |
| Đóng phóng to | Space, Enter, Z hoặc Esc |
| Mở / đóng lịch sử | H |
| Đóng lịch sử | Esc |
| Bật / tắt âm thanh | M |

Khi một nút công cụ có focus, Space/Enter kích hoạt chính nút đó. Đóng lịch sử trước khi quay tiếp. Thẻ cũ chuyển sang khay bên trái khi bắt đầu lượt kế tiếp; lịch sử giữ đủ mọi kết quả theo thứ tự.

## Ảnh thẻ và đáp án

Ảnh nguồn hiện lấy từ `C:\Users\LEGION\OneDrive\Desktop\bingo-sharing-onsite\assets\items`. Thẻ 03 và 06–25 đã hiện ảnh mới. Thẻ 01, 02, 04, 05 vẫn là ô số: bốn tệp tương ứng trong thư mục nguồn còn là thẻ cũ có ghi đáp án. Bản công khai chỉ hiện số thẻ, không ghi đáp án bằng chữ; ô lịch sử chưa bốc không hiện hình.

- Khi có hình cho thẻ 01, 02, 04, 05, chép vào `assets/items/` với tên trung tính như `item-1.png`, rồi đổi `image: null` ở dòng tương ứng trong `js/items.js` thành đường dẫn ảnh.
- Một số tệp trong thư mục nguồn có đuôi `.png` nhưng dữ liệu thực là JPEG hoặc WebP. Bản đóng gói đã đặt lại đúng đuôi cho thẻ 03, 09, 15, 23; khi thay ảnh về sau, hãy dùng đúng đuôi theo định dạng thật của tệp.
- Giữ 25 mã số duy nhất từ 1 đến 25. Tên `name` trong danh sách vẫn là nhãn trung tính “Thẻ 01”, “Thẻ 02”…; không đưa đáp án vào mã nguồn công khai, tên tệp hoặc nội dung thay thế của ảnh.
- Dùng ảnh vuông và tránh chữ tiết lộ đáp án trong chính ảnh. Ảnh 256 × 256 px vẫn dùng được; ảnh lớn hơn sẽ sắc hơn trên màn hình LED hoặc khi phóng to.
- Tải lại trang để nạp bộ ảnh mới. Khi cập nhật bản công khai, tăng số phiên bản sau `?v=` ở cuối `js/items.js` và trong `index.html` để trình duyệt lấy ảnh mới ngay. Nếu thiếu ảnh, trang báo rõ và dùng số thẻ thay thế.

Ví dụ một mục:

```js
{ id: 1, name: 'Thẻ 01', image: 'assets/items/item-1.png' }
```

## Trong buổi sự kiện

- Một phiên gồm 25 thẻ, mỗi thẻ chỉ được bốc một lần. Bộ đếm và lịch sử chỉ cập nhật khi máy dừng.
- Khi bốc đủ, nút quay và cần gạt khóa; lịch sử và phóng to vẫn dùng được.
- **Tải lại trang sẽ xóa lịch sử và bắt đầu phiên mới.** Bản này không lưu phiên chơi.
- Nếu hệ điều hành bật giảm chuyển động, bánh răng đứng yên, tắt rung và tia lửa; thao tác quay dùng chuyển cảnh ngắn, vẫn giữ nguyên quy tắc bốc thẻ.
- Điều chỉnh âm lượng loa trước khi bắt đầu. Các âm thanh được kiểm tra bằng trình duyệt; mức âm thực tế cần nghe trên hệ thống loa sử dụng tại hội trường.
- Tiếng cần gạt, động cơ, bánh răng và chốt kết quả được tổng hợp tại chỗ theo bộ mẫu; nút loa và phím M tắt/bật ngay cả khi máy đang quay.

## Các tệp chính

| Tệp / thư mục | Nội dung |
| --- | --- |
| `index.html` | Trang chạy trực tiếp |
| `js/items.js` | Danh sách 25 thẻ |
| `assets/items/` | Hình thẻ |
| `assets/images/` | Logo, tiêu đề, nền, bánh răng và vỏ máy |
| `tokens.css`, `css/style.css` | Font, màu sắc, bố cục |
| `js/app.js`, `js/layout.js`, `js/sfx.js` | Quay thẻ, tỷ lệ trình chiếu và âm thanh |
| `js/mechanics.js`, `css/mechanics.css` | Bánh răng đồng bộ, độ sâu của nền, rung và tia lửa |
| `js/vendor/` | GSAP, Draggable, Flip — bản cục bộ |
| `preview/` | Ảnh chụp giao diện và các trạng thái |

Bản gốc tại ổ D được giữ nguyên. Bản này chưa tích hợp Canva.

## Bản công khai trên GitHub Pages

Trang truy cập: https://noobhero1508.github.io/sharing_onsite_2026_bingo/

Mã nguồn và tài nguyên: https://github.com/Noobhero1508/sharing_onsite_2026_bingo

Khi thêm hoặc thay ảnh, cập nhật `assets/items/`, đường dẫn trong `js/items.js` và số phiên bản tải ảnh, sau đó commit và push vào nhánh `main`. GitHub Pages sẽ xuất bản phiên bản mới sau khi triển khai xong. Bản chạy tại chỗ vẫn mở được bằng `index.html` và không cần mạng.
