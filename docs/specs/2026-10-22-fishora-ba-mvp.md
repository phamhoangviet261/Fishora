# Fishora — BA MVP tổng hợp

Bản tổng hợp nghiệp vụ · 22/10/2026

Mục tiêu: xây dựng game nuôi cá trên trình duyệt, sử dụng Three.js / React Three Fiber, trong đó người chơi thu thập cá, câu cá, chăm sóc cá thể, phát triển cân nặng, quản lý kho và nâng cấp hệ thống bằng xu.

Tài liệu này tổng hợp các quyết định BA đã chốt. Những thông số chưa thống nhất sẽ được đánh dấu TBD, không tự đặt giá trị thay người chơi.

## 1. Phạm vi MVP

Trong MVP

Thu thập cá, cửa hàng, Blindbox, câu cá, kho vật phẩm, trang bị có độ bền, bể cá, chăm sóc thủ công và tự động, tăng cân, trưởng thành, phần thưởng, bán/thả cá, hồi sinh, cấp độ, nhiệm vụ ngày, thành tựu, mở khóa khu câu cá và nâng cấp.

Để giai đoạn sau

Hệ thống sinh sản cá, ghép đôi, trứng/cá con và hệ thống trang trí bể cá có tương tác gameplay. Không mở rộng phạm vi bằng các hệ thống này trong MVP.

## 2. Vòng lặp gameplay chính

Kiếm xu và tài nguyên

Câu cá · Bán cá · Nhiệm vụ · Đăng nhập · Thành tựu

Thu thập cá và vật phẩm

Câu cá · Mua cá · Blindbox · Phần thưởng

Nuôi và phát triển cá

Cho ăn · Vệ sinh · Tăng cân · Đạt mốc · Trưởng thành

Nhận thưởng và nâng cấp

Mở khu câu cá · Nâng cấp bể/kho · Cải thiện trang bị

Vòng lặp tiếp tục; người chơi tự quyết định giữ, bán hoặc thả từng cá.

## 3. Cá thể và thông số cá

### 3.1. Quản lý cá thể

- Mỗi người chơi có đúng một bể cá chính.
- Mỗi con cá là một cá thể độc lập, có ID riêng và lịch sử xuyên suốt vòng đời.
- Mỗi cá có loài, tên riêng, giới tính đực/cái, cân nặng, độ hiếm, tuổi, thời gian được nuôi, giá trị cố định, HP và trạng thái hiện tại.
- Người chơi có thể đặt tên và đổi tên cá bất cứ lúc nào. Đổi tên không làm thay đổi ID, chỉ số hoặc lịch sử.
- Tên loài là tên mặc định nếu cá chưa có tên riêng.

### 3.2. Cân nặng, tuổi và giá trị

- Cân nặng chịu ảnh hưởng bởi thức ăn, HP/sức khỏe và độ bẩn của bể.
- Cá được chăm sóc tốt có thể tăng cân; bỏ đói hoặc môi trường bẩn có thể khiến cá giảm cân.
- Cân nặng không vượt quá mức tối đa hiện hành của loài.
- Tuổi và thời gian nuôi chỉ tăng theo ngày mới khi cá ở trong bể. Cá trong kho không tăng tuổi hoặc thời gian nuôi.
- Giá trị cơ bản được tính từ độ hiếm, cân nặng và tuổi tại thời điểm tạo/nhận cá, sau đó lưu cố định. Giá trị này không đổi trong suốt đời cá dù tuổi hoặc cân nặng thay đổi.
- HP tăng khi được cho ăn và giảm khi đói. HP bằng 0 đồng nghĩa cá chết.

### 3.3. Độ hiếm

Các mức độ hiếm: Common, Uncommon, Rare, Epic, Legendary.

Các loài và thông số như cân nặng tối đa, nhu cầu thức ăn, giá mua, xác suất xuất hiện và hệ số tăng trưởng là dữ liệu cấu hình, không hardcode trong logic gameplay.

## 4. Bể cá và chăm sóc

### 4.1. Sức chứa bể

- Bể có giới hạn số lượng cá.
- Nâng cấp bể có các nhánh riêng:
  - Capacity: tăng số cá tối đa.
  - Care: cải thiện khả năng chăm sóc, bao gồm cho ăn/vệ sinh tự động theo các cơ chế đã chốt.
- Khi bể đầy, không cho chuyển thêm cá vào. Người chơi phải chuyển cá ra kho, bán hoặc thả cá trước.

### 4.2. Cho ăn

- Cho ăn thủ công áp dụng cho các cá sống trong bể.
- Nếu không đủ thức ăn, hệ thống chọn cá ngẫu nhiên trước; cá không được chọn tiếp tục chịu quy tắc đói.
- Lượng thức ăn cần cho mỗi cá phụ thuộc loài và độ hiếm.
- Thức ăn có nhiều cấp; mọi cấp đều dùng được cho mọi loài, nhưng thức ăn cấp cao có thể không hiệu quả về chi phí với cá thông thường.
- Hiệu quả thức ăn cấp cao gồm nhiều hệ số riêng; công thức cụ thể là TBD.

### 4.3. Tự động cho ăn

- Khi bật và còn thức ăn, cá không bị đói do thiếu thức ăn trong các chu kỳ được hệ thống xử lý thành công.
- Ưu tiên thức ăn kho chính, sau đó mới dùng kho dự trữ.
- Người chơi tự chuyển thức ăn vào kho dự trữ; kho này không tự nạp lại.
- Nếu cả hai nguồn hết, cá đói và chịu thay đổi HP/cân nặng bình thường.
- Khi không đủ thức ăn cho cả bể, chọn cá ngẫu nhiên trong số cá sống; hết thức ăn thì dừng.

### 4.4. Độ bẩn và vệ sinh

- Độ bẩn tăng theo thời gian và số cá sống trong bể. Cá trong kho và cá chết chờ hồi sinh không làm bẩn bể.
- Bẩn dưới ngưỡng đầu tiên không ảnh hưởng cá; vượt ngưỡng sẽ ảnh hưởng HP/cân nặng. Nhiều ngưỡng bẩn tạo mức tác động tăng dần.
- Vệ sinh thủ công có nhiều mức, mỗi mức tiêu xu hoặc vật phẩm.
- Vệ sinh tự động chạy theo chu kỳ ngày và có thể kích hoạt sớm khi bẩn vượt ngưỡng cấu hình.
- Phải tránh chạy trùng khi chu kỳ định kỳ và kích hoạt sớm trùng nhau.
- Hết vật phẩm vệ sinh thì bỏ qua lần chạy; bể tiếp tục bẩn cho đến cơ hội xử lý tiếp theo.

Các giá trị ngưỡng, chu kỳ, lượng thức ăn/vật phẩm tiêu hao và hiệu quả vệ sinh đều là TBD.

## 5. Trạng thái cá, chết và hồi sinh

### 5.1. Cá trong bể, kho và chuyến câu

| Trạng thái        | Quy tắc chính                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| Trong bể          | Chịu tác động của thức ăn, HP, cân nặng và độ bẩn                                                                    |
| Trong kho         | Hoàn toàn an toàn: không đói, không mất HP, không chết, không đổi cân nặng/tuổi/thời gian nuôi và không cần chăm sóc |
| Chết chờ hồi sinh | Không chiếm sức chứa bể; không thay đổi HP/cân nặng trong thời gian chờ                                              |
| Trong chuyến câu  | Nằm trong thùng cá của chuyến đi, chưa thể chuyển vào kho hoặc bể trước khi về nhà                                   |
| Đã mất vĩnh viễn  | Giữ hồ sơ trong Lịch sử cá đã mất; không xóa cứng                                                                    |

Quy tắc an toàn trong kho cũng áp dụng cho cá vừa hồi sinh thành công. Người chơi phải tự chuyển cá giữa kho và bể; chuyển cá không tạo cá thể mới.

### 5.2. Hồi sinh

- Cá chết lần đầu có thể hồi sinh bằng xu hoặc vật phẩm hồi sinh đặc biệt.
- Chi phí bằng xu phụ thuộc độ hiếm và tuổi cá; công thức TBD.
- Vật phẩm hồi sinh đặc biệt chỉ nhận qua nhiệm vụ, thành tựu hoặc sự kiện; không bán trong shop.
- Thời hạn hồi sinh là 14 ngày theo thời gian thực, kể cả khi người chơi offline.
- Hồi sinh thành công chỉ khôi phục một phần HP; tỷ lệ khôi phục TBD.
- Mỗi cá thể chỉ được hồi sinh một lần trong đời.
- Sau hồi sinh, cá vào kho, không tự động vào bể.
- Nếu kho không đủ sức chứa, người chơi phải giải phóng chỗ trước khi hồi sinh. Thời hạn 14 ngày vẫn tiếp tục đếm ngược.
- Nếu cá chết lần thứ hai hoặc hết hạn hồi sinh, cá chuyển vào Lịch sử cá đã mất, không được hoàn xu và không thể khôi phục.
- Không xóa cứng bản ghi cá đã mất.

## 6. Trưởng thành và mốc cân nặng

### 6.1. Mốc cân nặng thông thường

Mỗi loài có thể có các mốc cấu hình, ví dụ 1 kg, 2 kg, 5 kg, 10 kg, 50 kg và 100 kg.

- Các mốc độc lập; không bắt buộc đạt theo thứ tự tăng dần.
- Mỗi mốc chỉ được nhận thưởng một lần cho mỗi cá thể trong đời.
- Lần đầu đạt mốc sẽ gửi thông báo; người chơi tự nhận thưởng.
- Quyền nhận thưởng được lưu riêng, không chiếm sức chứa kho và không hết hạn.
- Gói thưởng có thể gồm xu và nhiều vật phẩm. Mỗi phần thưởng được nhận độc lập.
- Xu được cộng trực tiếp khi nhận; vật phẩm chỉ được xác nhận đã nhận sau khi chuyển thành công vào kho.
- Nếu kho đầy, phần vật phẩm còn lại vẫn chờ nhận. Cho phép nhận một phần, không mất phần chưa nhận và không nhận trùng.
- Mốc chỉ hoàn tất khi mọi phần thưởng đã được nhận.

### 6.2. Cấu hình mốc và xử lý thay đổi

- Admin có thể cấu hình mốc mặc định và tùy chỉnh mốc/gói thưởng theo từng loài, không cần sửa code.
- Thay đổi mốc áp dụng cho cá hiện có và cá mới; quyền nhận đã hoàn tất và quyền nhận đang chờ đều phải được bảo toàn theo quy tắc đã chốt.
- Hạ mốc xuống bằng hoặc thấp hơn cân nặng cá khiến cá đủ điều kiện ngay, trừ trường hợp đã nhận mốc tương ứng.
- Xóa mốc ngừng tạo quyền nhận mới nhưng không thu hồi phần thưởng đã nhận hoặc quyền nhận đang chờ.
- Mốc đã xóa không kích hoạt lại; muốn sử dụng lại phải tạo mốc mới.
- Nếu tạo lại mốc cùng cân nặng:
  - Cá đã nhận mốc cũ không được nhận lần nữa ở cùng loài và cân nặng mốc.
  - Nếu cá chưa nhận mốc cũ, gói thưởng chờ nhận được cập nhật/thay thế, không cộng dồn hai gói.
  - Phần đã nhận được giữ lại; phần chờ nhận được xử lý theo quyết định giữ/xóa của admin.

Lưu lịch sử đầy đủ các thay đổi: snapshot trước/sau, thời điểm, admin và quyết định xử lý từng phần thưởng. Có thể xem lịch sử trong trang admin. Preview tác động là tùy chọn, không bắt buộc trước khi lưu.

### 6.3. Trưởng thành

- Khi đạt cân nặng tối đa của loài, cá trưởng thành và nhận một gói thưởng trưởng thành riêng, ngoài các mốc cân nặng thông thường.
- Cá trưởng thành vẫn sống trong bể, vẫn cần chăm sóc bình thường và vẫn có thể đói, mất HP, giảm cân.
- Nếu được chăm sóc tốt, cá có thể tăng cân lại tới mức tối đa, không vượt quá giới hạn hiện hành.
- Khi đạt tối đa, cân nặng không tăng thêm nhưng vẫn có thể giảm nếu bị bỏ bê.
- Admin duy nhất cấu hình thưởng trưởng thành và thưởng bán cá trưởng thành theo từng loài.
- Thưởng bán cá trưởng thành gồm xu cố định cộng phần trăm giá trị cơ bản. Giá trị áp dụng được lưu tại thời điểm cá trưởng thành.
- Thưởng bán trưởng thành chỉ được áp dụng khi bán cá đang ở trạng thái trưởng thành; thả cá không được nhận thưởng bán trưởng thành.
- Nếu admin thay đổi cân nặng tối đa:
  - Nếu cân nặng cá bằng hoặc vượt mức tối đa mới, cá trưởng thành ngay, không ép cân nặng giảm.
  - Nếu mức tối đa được nâng cao hơn cân nặng hiện tại, cá có thể trở lại trạng thái chưa trưởng thành và tiếp tục tăng cân.
  - Nếu cá đã nhận thưởng trưởng thành, không nhận lại lần hai dù trạng thái trưởng thành thay đổi nhiều lần.
  - Nếu thưởng đã mở khóa nhưng chưa nhận, quyền nhận được giữ nguyên kể cả khi cá trở lại trạng thái chưa trưởng thành.
- Mỗi cá chỉ được bán một lần. Thưởng bán trưởng thành đã lưu cho cá được dùng theo các quy tắc áp dụng cho cá đó, không bị ghi đè hồi tố khi cấu hình thay đổi.

### 6.4. Lịch sử cấu hình loài

- Loài chỉ được ngừng hoạt động hoặc xóa mềm, không xóa vĩnh viễn.
- Loài ngừng hoạt động không thể được mua hoặc tạo mới, nhưng cá hiện có vẫn có thể được chăm sóc, bán, thả và nhận thưởng dựa trên dữ liệu đã lưu.
- Admin có thể kích hoạt lại loài; cấu hình mới nhất áp dụng cho cá hiện có và cá mới, bảo toàn tuổi, cân nặng, trạng thái trưởng thành và lịch sử thưởng.
- Tên hiển thị loài được đổi; mã định danh nội bộ bất biến.
- Mỗi lần đổi tên lưu tên cũ/mới, thời điểm và admin thực hiện.
- Mọi thay đổi cấu hình loài lưu snapshot trước/sau và danh sách cá bị ảnh hưởng.
- Thay đổi nhiều trường phải thực hiện nguyên tử trong một transaction. Nếu thất bại, rollback toàn bộ, giữ cấu hình cũ và không tạo lịch sử phiên bản giả.

## 7. Câu cá và trang bị

### 7.1. Điều kiện câu cá

- Khu vực và trang bị xác định danh sách loài có thể xuất hiện cùng xác suất tương ứng.
- Mỗi lần thả câu, backend quyết định ngẫu nhiên kết quả; không có mini-game kỹ năng tác động tới loài cá xuất hiện trong MVP.
- Mỗi khu vực có danh sách loài và tỷ lệ xuất hiện riêng; các khu vực có thể có một số loài trùng nhau.
- Mở khóa khu vực yêu cầu cả cấp độ tối thiểu và trả xu. Mỗi khu vực có điều kiện riêng; mở rồi thì giữ vĩnh viễn, không phải trả lại khi quay lại.

### 7.2. Bộ trang bị

Một bộ trang bị đang hoạt động gồm:

- Cần câu.
- Dây câu.
- Lưỡi câu.
- Mồi câu.
- Thùng cá.

Người chơi sở hữu được nhiều món cùng loại, mỗi món có thông số và độ bền riêng. Mỗi vị trí chỉ trang bị một món tại một thời điểm. Bộ trang bị đang chọn được lưu cho đến khi người chơi thay đổi.

Cần câu, dây câu và lưỡi câu ảnh hưởng giới hạn tải/kích thước cá. Trang bị không tương thích có thể bị giảm độ bền. Khi độ bền bằng 0, món đồ không dùng được nhưng có thể sửa chữa, không bị phá hủy vĩnh viễn.

### 7.3. Mồi và kết quả thả câu

- Mỗi lần thả câu tiêu hao một đơn vị mồi, kể cả khi không câu được cá.
- Khi hụt cá, chỉ mất mồi, không mất độ bền.
- Độ bền chỉ giảm khi câu được cá hoặc khi thất bại trong giai đoạn đấu cá.
- Nếu cá vượt giới hạn tải trang bị, bước đấu cá được kích hoạt. Thành công thì giữ được cá; thất bại thì cá thoát và trang bị giảm độ bền.
- Cơ chế đấu cá chi tiết và công thức độ bền là TBD.
- Hết mồi có thể mua thêm ngay tại khu câu bằng xu. Mồi bị trừ trực tiếp từ kho; không có hạn mức mồi riêng theo chuyến.

### 7.4. Thùng cá và kết thúc chuyến

- Thùng cá giới hạn tổng cân nặng, không giới hạn riêng kích thước từng cá.
- Cá câu được nằm trong thùng của chuyến đi, không được chuyển vào kho/bể trước khi về nhà.
- Khi chọn "Về nhà", hiển thị danh sách cá câu được để người chơi chọn từng con hoặc chọn tất cả mang về.
- Nếu kho không đủ sức chứa theo tổng cân nặng hiện tại, phải thả bớt cá trước khi xác nhận mang về.
- Cá mang về vào kho; cá thả ra nhận 25% giá trị cơ bản.
- Không bán trực tiếp cá trong luồng kết thúc chuyến câu.
- Nếu người chơi đóng game hoặc mất kết nối khi chuyến đi chưa hoàn tất, chuyến đi bị hủy và toàn bộ cá chưa mang về bị mất. Backend phải đảm bảo chuyến đi không thể vừa bị hủy vừa trao cá thưởng.

## 8. Kho, cửa hàng và vật phẩm

### 8.1. Quản lý kho

- Kho có giới hạn tổng cân nặng cá, không giới hạn số lượng cá.
- Cá trong kho không thay đổi cân nặng, vì vậy tải trọng được giữ ổn định cho đến khi cá được chuyển ra/vào.
- Nếu sức chứa không đủ, chặn nhận thêm cá; không tự giảm cân nặng hoặc vượt giới hạn.
- Người chơi có thể mở rộng kho bằng xu và mở khóa các cấp nâng cấp theo cấp độ.
- Kho vật phẩm có giới hạn sức chứa. Khi đầy, chặn nhận vật phẩm mới và yêu cầu giải phóng chỗ.
- Vật phẩm tiêu hao cùng loại được gộp stack: thức ăn, mồi câu, Blindbox và các vật phẩm tương tự.
- Trang bị được quản lý riêng từng món, có ID, thông số và độ bền riêng.
- Không thể bán lại vật phẩm đã mua; chỉ bán cá để kiếm xu.

### 8.2. Cửa hàng và nhận cá

Shop cung cấp hai phương thức:

1. Mua cá trực tiếp: giá cố định theo loài; cá nhận được có cân nặng/độ hiếm theo cấu hình.
2. Blindbox: mua hộp bằng xu, nhận cá ngẫu nhiên theo bảng xác suất.

- Blindbox có thể cho cá trùng loài; mỗi con vẫn là cá thể riêng.
- Cá từ cả hai phương thức đều vào kho trước.
- Phải kiểm tra sức chứa kho trước khi xác nhận giao dịch.
- Nếu không đủ chỗ, không trừ xu và không làm mất vật phẩm/phần thưởng.
- Không có chức năng bán lại vật phẩm để hoàn xu.

### 8.3. Mua và nhận vật phẩm

- Các giao dịch mua cần kiểm tra số dư xu và sức chứa trước khi hoàn tất.
- Không cho phép số dư xu âm.
- Vật phẩm nhận từ phần thưởng phải được lưu trạng thái chờ nhận nếu kho đầy; không làm mất quyền nhận.
- Trang bị mua được lưu như từng món độc lập.
- Công thức giá, sức chứa ban đầu, cấp nâng cấp và phân loại đầy đủ vật phẩm sẽ được chốt ở giai đoạn cân bằng dữ liệu.

## 9. Bán cá, thả cá và lịch sử

### 9.1. Giá bán

- Bán cá thông thường: nhận 100% giá trị cơ bản cố định.
- Thả cá: nhận 25% giá trị cơ bản.
- Bán cá trưởng thành: nhận giá trị cơ bản cộng thưởng bán trưởng thành đã lưu cho cá đó, nếu đủ điều kiện.
- Thả cá trưởng thành không nhận thưởng bán trưởng thành.
- Không bán lại trang bị hay vật phẩm.

### 9.2. Bán hàng loạt

- Cho phép chọn thủ công từng cá hoặc lọc theo loài, độ hiếm và cân nặng để chọn nhiều cá.
- Hiển thị tổng xu dự kiến trước khi xác nhận.
- Backend tính giá trị cho từng cá, áp dụng thưởng trưởng thành đúng điều kiện và cộng xu chính xác một lần.
- Không triển khai tự động bán cá trong MVP.
- Lưu lịch sử bán theo từng cá thể, kể cả khi cá đã rời kho.

### 9.3. Bộ sưu tập

Có hai loại lịch sử riêng:

- Danh mục khám phá loài: ghi nhận các loài người chơi từng khám phá/bắt/sở hữu, kể cả khi hiện không còn cá đó.
- Lịch sử cá thể: lưu từng cá từng thuộc sở hữu người chơi, kể cả cá đã bán, thả hoặc mất.

Không xóa lịch sử khi cá rời bể hoặc kho.

## 10. Kinh tế, cấp độ và tiến trình

### 10.1. Xu

Nguồn xu gồm:

- Bán cá.
- Câu cá và các phần thưởng gameplay đã cấu hình.
- Phần thưởng đăng nhập hằng ngày.
- Nhiệm vụ hằng ngày.
- Thành tựu, mốc cân nặng và phần thưởng trưởng thành.

Không cho số dư âm hoặc mua vượt số dư hiện tại. Giao dịch phải được xử lý phía backend và chống cộng/trừ trùng.

### 10.2. Cấp độ và EXP

- Người chơi có cấp độ và EXP.
- Nguồn EXP chính là nhiệm vụ và mốc tiến trình; hoạt động gameplay có thể cấp thêm EXP với giới hạn/chống farm.
- Backend là nguồn dữ liệu có thẩm quyền cho cấp độ và EXP.
- Mở khóa khu câu cá yêu cầu đồng thời đạt cấp độ và trả xu.

### 10.3. Nhiệm vụ ngày và đăng nhập

- Nhiệm vụ ngày được cá nhân hóa theo tiến trình và hoạt động của người chơi; không giao nhiệm vụ bất khả thi.
- Nhiệm vụ cũ hết hạn và được thay bằng nhiệm vụ mới.
- Bỏ lỡ một ngày sẽ đặt lại chuỗi đăng nhập liên tiếp.
- Phần thưởng đã nhận không bị thu hồi.
- Mọi mốc ngày sử dụng một múi giờ nhất quán.

### 10.4. Thành tựu

Thành tựu dài hạn tách biệt với nhiệm vụ ngày, có điều kiện và phần thưởng riêng. Ví dụ:

- Số cá đã câu.
- Số loài đã thu thập.
- Cá đạt cân nặng tối đa.
- Số khu vực đã khám phá.

Lưu trạng thái hoàn thành và nhận thưởng; không cho nhận trùng.

## 11. Xử lý offline và chu kỳ mô phỏng

Đây là một trong những yêu cầu kỹ thuật quan trọng nhất của Fishora.

- Trạng thái cá trong bể và độ bẩn tiếp tục được tính theo thời gian thực khi người chơi offline.
- Không giới hạn thời gian offline được tính; cá có thể đói, giảm HP/cân nặng hoặc chết theo quy tắc bình thường.
- Backend xử lý thời gian đã trôi qua theo chu kỳ khi người chơi quay lại, không cần chạy tiến trình liên tục cho từng người chơi.
- Các lần cho ăn/vệ sinh tự động đến hạn trong thời gian offline phải được xử lý theo lượng vật phẩm thực tế còn lại.
- Mô phỏng từng chu kỳ theo đúng thứ tự thời gian. Mỗi chu kỳ áp dụng việc tiêu hao tài nguyên và thay đổi trạng thái tương ứng.
- Nếu hết thức ăn hoặc vật phẩm vệ sinh, bỏ qua tác vụ tương ứng theo quy tắc đã chốt.
- Khi cá chết, không tiếp tục tác động chăm sóc lên cá đã chết.
- Cá trong kho không tham gia mô phỏng chăm sóc; không đổi tuổi, cân nặng, HP hoặc trạng thái.
- Chu kỳ phải có mốc thời gian và trạng thái xử lý để không chạy trùng khi đăng nhập nhiều lần.
- Backend cần xử lý giao dịch nguyên tử, khóa/cơ chế chống đồng thời phù hợp và chống nhận thưởng hoặc cộng xu hai lần.

Lưu ý thiết kế: phải phân biệt thời điểm thực tế một sự kiện xảy ra với thời điểm backend xử lý sự kiện. Đặc biệt, thời hạn hồi sinh 14 ngày vẫn trôi qua trong thời gian offline, kể cả khi người chơi chưa quay lại để xử lý trạng thái.

## 12. Quy tắc quản trị và cấu hình

Phạm vi admin MVP tập trung vào cấu hình gameplay và tính toàn vẹn dữ liệu:

- Cấu hình loài cá, độ hiếm, cân nặng tối đa, mốc cân nặng và phần thưởng.
- Cấu hình thưởng trưởng thành và thưởng bán cá trưởng thành theo loài.
- Bật/tắt hoặc xóa mềm loài; không xóa cứng dữ liệu loài đã có cá thể liên quan.
- Lưu lịch sử thay đổi cấu hình, snapshot trước/sau, thời điểm, admin và các quyết định xử lý quyền nhận thưởng.
- Thay đổi cấu hình ảnh hưởng cá hiện có theo quy tắc đã chốt; các thay đổi liên quan phải chạy nguyên tử.
- Khi thay đổi cấu hình thất bại, rollback toàn bộ và báo lỗi; không tạo lịch sử thay đổi sai lệch.

## 13. Các edge case bắt buộc

| Tình huống                          | Kết quả mong đợi                                                     |
| ----------------------------------- | -------------------------------------------------------------------- |
| Không đủ xu mua hàng                | Không hoàn tất giao dịch, không có số dư âm                          |
| Kho đầy khi mua cá                  | Không trừ xu, không mất cá                                           |
| Kho đầy khi nhận vật phẩm           | Phần thưởng vật phẩm vẫn chờ nhận                                    |
| Bể đầy khi chuyển cá vào            | Chặn chuyển; không tạo bản ghi cá mới                                |
| Cá chết lần đầu                     | Bắt đầu hạn hồi sinh 14 ngày                                         |
| Hết hạn hồi sinh khi offline        | Cá chuyển vào lịch sử mất vĩnh viễn                                  |
| Cá chết lần hai                     | Không thể hồi sinh; giữ lịch sử                                      |
| Cá trong kho qua nhiều ngày         | Không thay đổi trạng thái                                            |
| Chuyến câu bị hủy                   | Không nhận cá chưa mang về                                           |
| Hụt cá khi câu                      | Mất mồi, không mất độ bền                                            |
| Độ bền trang bị bằng 0              | Không dùng được; có thể sửa chữa                                     |
| Nhận mốc khi kho đầy                | Xu có thể nhận riêng; vật phẩm còn lại chờ nhận                      |
| Nhận thưởng nhiều lần do retry      | Không cộng xu/vật phẩm trùng                                         |
| Admin hạ cân nặng tối đa            | Cá đủ điều kiện trưởng thành ngay, không ép cân nặng giảm            |
| Admin nâng cân nặng tối đa          | Cá có thể trở lại chưa trưởng thành theo quy tắc đã chốt             |
| Admin sửa mốc đã có thưởng chờ nhận | Không mất phần đã nhận; phần chờ nhận xử lý theo quyết định cấu hình |
| Đăng nhập lại nhiều lần             | Không xử lý trùng chu kỳ offline                                     |
| Bán nhiều cá cùng lúc               | Mỗi cá chỉ bán một lần, cộng xu đúng một lần                         |

## 14. Tiêu chí nghiệm thu MVP

### Gameplay và dữ liệu

- Mỗi cá có ID riêng và giữ nguyên ID khi di chuyển giữa bể/kho.
- Cá trong kho hoàn toàn an toàn; cá trong bể chịu quy tắc chăm sóc.
- Cân nặng, HP, tuổi, trưởng thành và giá trị cơ bản tuân theo quy tắc đã chốt.
- Bán, thả, chết, hồi sinh và mất vĩnh viễn có trạng thái/lịch sử chính xác.
- Hệ thống mốc cân nặng và thưởng trưởng thành không phát thưởng trùng.
- Shop, Blindbox và hệ thống kho kiểm tra sức chứa trước khi xác nhận.

### Câu cá và trang bị

- Kết quả câu cá được xác định ở backend.
- Mồi bị trừ đúng mỗi lần thả câu.
- Hụt cá không làm giảm độ bền.
- Trang bị có ID và độ bền độc lập; trang bị hỏng có thể sửa.
- Cá trong thùng chuyến câu chỉ được chuyển vào kho sau khi về nhà.
- Hủy chuyến câu không thể đồng thời trao cá chưa mang về.

### Offline và tính toàn vẹn

- Xử lý đầy đủ thời gian offline theo thứ tự chu kỳ.
- Tự động cho ăn/vệ sinh tiêu hao đúng tài nguyên.
- Hạn hồi sinh vẫn đếm khi offline.
- Không xử lý chu kỳ hoặc phát thưởng hai lần khi retry.
- Giao dịch xu, nhận vật phẩm, bán cá và cập nhật cấu hình có kiểm soát tính nguyên tử.
- Các bài test bao gồm ranh giới thời gian, kho đầy, bể đầy, hết tài nguyên và cá chết giữa các chu kỳ.

### Chất lượng và kiểm thử

- Unit test cho công thức trạng thái cá, giá trị, trưởng thành và thưởng.
- Integration test cho giao dịch, kho, chu kỳ offline, hồi sinh và cập nhật cấu hình.
- E2E test cho luồng chính: mua cá → chuyển vào bể → chăm sóc → đạt mốc → bán cá.
- E2E test cho luồng câu cá → mang cá về → xử lý sức chứa.
- Kiểm thử retry và đăng nhập đồng thời không tạo dữ liệu hoặc phần thưởng trùng.
- Không tuyên bố hoàn thành tính năng nếu chưa có kết quả kiểm thử xác nhận.

## 15. Những thông số còn TBD

Các mục này chưa có quyết định đủ cụ thể để triển khai cân bằng gameplay. Không nên tự bịa số liệu trong code.

| Nhóm         | Thông số chưa chốt                                            |
| ------------ | ------------------------------------------------------------- |
| Cá           | Công thức tăng/giảm cân, tốc độ mất HP, HP hồi từ thức ăn     |
| Kinh tế      | Giá mua từng loài, công thức giá trị cơ bản, giá vật phẩm     |
| Chăm sóc     | Chu kỳ cho ăn, lượng thức ăn mỗi cá, hệ số từng cấp thức ăn   |
| Vệ sinh      | Ngưỡng bẩn, tốc độ tăng bẩn, chi phí và hiệu quả vệ sinh      |
| Hồi sinh     | Công thức chi phí xu theo độ hiếm/tuổi; phần HP hồi lại       |
| Trưởng thành | Gói thưởng, mức thưởng xu cố định và tỷ lệ thưởng bán         |
| Câu cá       | Xác suất loài, thời gian câu, công thức đấu cá và mất độ bền  |
| Trang bị     | Độ bền tối đa, chi phí sửa, thông số tải từng món             |
| Kho/bể       | Sức chứa ban đầu, giá và hiệu quả từng cấp nâng cấp           |
| Tiến trình   | EXP mỗi hoạt động, bảng cấp độ, điều kiện mở khóa khu vực     |
| Nội dung     | Danh sách loài, bảng xác suất Blindbox, nhiệm vụ và thành tựu |
| Thời gian    | Múi giờ game, thời điểm reset ngày và quy tắc biên chu kỳ     |

## 16. Nguyên tắc triển khai

1. Kiểm tra codebase và mô hình dữ liệu thực tế trước khi thiết kế hoặc sửa code.
2. Tách cấu hình game khỏi logic xử lý để có thể điều chỉnh giá, xác suất, mốc và hệ số mà không phải sửa thuật toán.
3. Backend là nguồn dữ liệu có thẩm quyền đối với xu, EXP, cá, kho, độ bền, thưởng và thời gian.
4. Không xóa cứng cá thể, lịch sử giao dịch hoặc lịch sử thưởng có ý nghĩa nghiệp vụ.
5. Dùng transaction và cơ chế chống xử lý trùng cho các giao dịch quan trọng.
6. Xây dựng unit/integration/E2E test dựa trên business rules và edge cases trong tài liệu.
7. Không mở rộng sang sinh sản hoặc trang trí bể trong MVP khi các vòng lặp cốt lõi chưa hoàn thiện.

Kết luận: Đây là bản BA tổng hợp từ các quyết định đã chốt. Phần nghiệp vụ cốt lõi đã được xác định; công việc tiếp theo nên là chuyển tài liệu này thành đặc tả triển khai và danh sách task theo module, đồng thời giữ riêng các thông số TBD để cân bằng sau.
