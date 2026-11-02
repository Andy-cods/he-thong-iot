// Toàn bộ nội dung website TVT nằm ở file này.
// Sửa nội dung ở đây rồi chạy `node src/build.mjs` để sinh lại các trang HTML trong `public/`.

export const site = {
  brand: 'TVT',
  tagline: '3D Print Atelier',
  // Đổi thành tên miền thật trước khi chạy chính thức (dùng cho canonical, sitemap, Open Graph).
  url: 'https://tvt3d.vn',
  // Các mục để trống sẽ hiện ô gạch chân "chờ cập nhật" trên trang.
  phone: '',          // ví dụ: '0901 234 567'
  zalo: '',           // ví dụ: '0901234567' (số liền, dùng tạo link zalo.me)
  email: '',          // ví dụ: 'hello@tvt3d.vn'
  address: '',        // ví dụ: 'Số 1, đường ABC, Quận X, TP. Hồ Chí Minh'
  hours: '8:00 – 20:00, Thứ 2 – Thứ 7',
  freeShipFrom: '',   // ví dụ: '500.000đ'
  facebook: '',
  tiktok: '',
  instagram: '',
};

export const services = [
  {
    slug: 'print-on-demand', code: 'POD', name: 'Print on Demand & Dropship', img: 'vase',
    short: 'Đăng mẫu lên gian hàng, có đơn TVT mới in và giao thẳng tới khách với thương hiệu của bạn.',
    intro: 'Bạn bán, TVT sản xuất. Mỗi đơn khách đặt trên gian hàng của bạn được chuyển về xưởng, in, hoàn thiện, đóng hộp mang nhãn của bạn và giao tận tay khách. Bạn không bỏ vốn nhập hàng và không ôm tồn kho.',
    features: [
      ['In khi có đơn', 'Không cần đặt trước số lượng. Mẫu nào bán được thì in mẫu đó.'],
      ['White-label', 'Hộp, nhãn, thiệp cảm ơn mang thương hiệu của bạn. Khách không thấy tên TVT.'],
      ['Đồng bộ đơn', 'Nhận đơn qua Google Sheet dùng chung hoặc API cho website riêng.'],
      ['Ảnh mockup', 'Ảnh sản phẩm nền sạch để đăng bán, miễn phí cho 5 mẫu đầu tiên.'],
    ],
    specs: [['Đơn tối thiểu', '1 sản phẩm'], ['Thời gian xử lý', '24 – 48 giờ'], ['Kênh hỗ trợ', 'Shopee, TikTok Shop, Lazada, Etsy, website'], ['Đối soát', 'Hằng tuần']],
    uses: ['Đồ decor cá nhân hoá', 'Art toy bán theo đợt', 'Phụ kiện bàn làm việc', 'Quà tặng in tên'],
  },
  {
    slug: 'in-fdm', code: 'FDM', name: 'In nhựa FDM khổ lớn', img: 'gear',
    short: 'Bền, kinh tế, in được nhiều màu. Hợp cho decor, vỏ thiết bị, props và chi tiết chức năng.',
    intro: 'FDM đùn sợi nhựa nóng chảy thành từng lớp. Đây là công nghệ kinh tế nhất cho sản phẩm cỡ vừa và lớn, chịu lực tốt, với nhiều loại nhựa kỹ thuật như PETG, ASA, TPU và nhựa sợi carbon.',
    features: [
      ['Khổ in lớn', 'Tới 350 × 350 × 400 mm một lần in, lớn hơn thì in ghép.'],
      ['Đa màu', 'In tới 8 màu trong một lần chạy, không cần sơn.'],
      ['Nhựa kỹ thuật', 'PETG-CF, Nylon-CF chịu lực, ASA chịu nắng, TPU dẻo.'],
      ['Giá tốt cho cỡ lớn', 'Chi phí thấp hơn resin nhiều lần với sản phẩm trên 15 cm.'],
    ],
    specs: [['Độ dày lớp', '0,08 – 0,28 mm'], ['Dung sai', '±0,2 mm'], ['Khổ in', '350 × 350 × 400 mm'], ['Số màu', 'Tới 8 màu']],
    uses: ['Vỏ thiết bị điện tử', 'Props cosplay', 'Bình, chậu decor', 'Jig, đồ gá sản xuất'],
  },
  {
    slug: 'in-resin', code: 'MSLA', name: 'In resin siêu chi tiết', img: 'toy',
    short: 'Bề mặt mịn như sứ, giữ từng nét vân và sợi tóc. Cho figure, art toy, trang sức và mẫu đúc.',
    intro: 'Máy in resin dùng màn hình 8K–12K chiếu tia UV làm đông cứng từng lớp nhựa lỏng mỏng chỉ 0,03 mm. Kết quả là chi tiết sắc nét mà FDM không làm được, rất hợp với sản phẩm nhỏ cần độ tinh xảo.',
    features: [
      ['Chi tiết cực cao', 'Lớp 0,03 – 0,05 mm, gần như không thấy vân lớp.'],
      ['Nhiều loại resin', 'Tiêu chuẩn, ABS-like dai, resin đúc sáp cho trang sức.'],
      ['Sẵn sàng sơn', 'Bề mặt mịn, chỉ cần chà nhẹ là sơn được.'],
      ['Mẫu đúc', 'Resin đúc sáp cháy sạch, dùng cho xưởng kim hoàn.'],
    ],
    specs: [['Độ dày lớp', '0,03 – 0,05 mm'], ['Dung sai', '±0,1 mm'], ['Khổ in', '220 × 130 × 250 mm'], ['Màn hình', '8K – 12K']],
    uses: ['Figure, art toy', 'Tượng chân dung mini', 'Mẫu trang sức', 'Mô hình game, wargame'],
  },
  {
    slug: 'thiet-ke-3d', code: 'CAD · SCULPT', name: 'Thiết kế & dựng mẫu 3D', img: 'facet',
    short: 'Từ ảnh, bản vẽ tay hay vài dòng mô tả, 3D artist dựng file sẵn sàng in.',
    intro: 'Không có file 3D cũng không sao. Đội thiết kế của TVT dựng mô hình từ ảnh tham khảo, bản phác thảo hay bản vẽ kỹ thuật, gửi ảnh render để bạn duyệt, rồi tối ưu file để in đẹp nhất.',
    features: [
      ['Sculpt nhân vật', 'Dựng figure, linh vật, chân dung từ ảnh hoặc concept art.'],
      ['CAD kỹ thuật', 'Thiết kế chi tiết lắp ghép theo kích thước, xuất STEP.'],
      ['Scan 3D', 'Quét vật mẫu có sẵn để sao chép hoặc chỉnh sửa.'],
      ['Sửa file', 'Vá lỗi lưới, làm dày thành mỏng, chia khối để in ghép.'],
    ],
    specs: [['Định dạng nhận', 'Ảnh, PDF, DWG, STL, OBJ, STEP'], ['Định dạng giao', 'STL, 3MF, STEP'], ['Số lần sửa', '2 lần miễn phí'], ['Thời gian', '1 – 5 ngày']],
    uses: ['Linh vật thương hiệu', 'Logo 3D', 'Chi tiết thay thế', 'Tượng chân dung'],
  },
  {
    slug: 'hau-ky-son', code: 'FINISH', name: 'Hậu kỳ & sơn tay', img: 'knot',
    short: 'Chà nhám, sơn lót, sơn tay, airbrush, phủ bóng hoặc mờ. Ra xưởng là trưng bày được ngay.',
    intro: 'Hậu kỳ quyết định sản phẩm trông như đồ in 3D hay như tác phẩm hoàn chỉnh. Thợ hoàn thiện của TVT xử lý bề mặt, sơn lót và sơn màu bằng tay hoặc airbrush theo đúng bảng màu bạn yêu cầu.',
    features: [
      ['3 cấp hoàn thiện', 'Thô (gỡ support), mịn (chà nhám), sơn màu hoàn chỉnh.'],
      ['Pha màu Pantone', 'Đúng mã màu thương hiệu hoặc artbook nhân vật.'],
      ['Hiệu ứng', 'Kim loại, đá, gốm, ngọc trai, gỉ sét, chuyển sắc.'],
      ['Phủ bảo vệ', 'Phủ bóng, mờ hoặc satin chống trầy, chống UV.'],
    ],
    specs: [['Cấp hoàn thiện', 'Thô · Mịn · Sơn màu'], ['Kỹ thuật', 'Sơn tay, airbrush'], ['Hệ màu', 'Pantone, RAL'], ['Thời gian thêm', '1 – 3 ngày']],
    uses: ['Figure sưu tầm', 'Props điện ảnh', 'Quà tặng cao cấp', 'Mẫu trưng bày'],
  },
  {
    slug: 'san-xuat-loat-nho', code: 'BATCH', name: 'Sản xuất loạt nhỏ', img: 'medal',
    short: 'Từ 10 tới vài nghìn sản phẩm mà không tốn tiền khuôn. Đơn giá giảm theo bậc số lượng.',
    intro: 'Khi cần vài chục đến vài nghìn sản phẩm, làm khuôn ép nhựa thường quá đắt và quá lâu. Dàn máy in chạy 24/7 của TVT sản xuất loạt nhỏ nhanh hơn, đổi mẫu dễ dàng, và kiểm tra chất lượng từng chiếc.',
    features: [
      ['Không tiền khuôn', 'Đổi thiết kế giữa chừng không mất chi phí làm lại khuôn.'],
      ['Giá theo bậc', 'Giảm 15% từ 10 chiếc, 28% từ 50, tới 40% từ 200 chiếc.'],
      ['QC từng chiếc', 'Kiểm kích thước, bề mặt và chụp ảnh lô hàng.'],
      ['Giao theo lịch', 'Chia đợt giao theo tiến độ dự án hoặc sự kiện.'],
    ],
    specs: [['Số lượng', '10 – 5.000 sản phẩm'], ['Chiết khấu', 'Tới 40%'], ['Công suất', 'Dàn máy 24/7'], ['Chứng từ', 'Hợp đồng, VAT']],
    uses: ['Quà tặng sự kiện', 'Kỷ niệm chương', 'Linh kiện thay thế', 'Sản phẩm thử thị trường'],
  },
];

export const solutions = [
  { slug: 'seller-tmdt', name: 'Seller TMĐT', img: 'vase2', title: 'Mở rộng gian hàng mà không cần nhập hàng',
    desc: 'Đăng hàng chục mẫu cùng lúc, chỉ in khi có đơn. TVT lo in, đóng gói theo thương hiệu của bạn và giao thẳng tới khách.',
    pain: ['Nhập hàng số lượng lớn, vốn chết trong kho', 'Không dám thử mẫu mới vì sợ ế', 'Tự đóng gói, giao hàng tốn thời gian'],
    points: ['Nhận đơn tự động qua Google Sheet hoặc API', 'Đóng hộp white-label, kèm thiệp cảm ơn riêng', 'Ảnh mockup để đăng bán ngay', 'Đối soát công nợ theo tuần'],
    products: ['Đèn ngủ in tên', 'Chậu cây mini', 'Giá đỡ điện thoại', 'Móc khoá cá nhân hoá', 'Tượng thú cưng'],
    stat: ['0đ', 'vốn tồn kho ban đầu'], services: ['print-on-demand', 'in-fdm', 'thiet-ke-3d'] },
  { slug: 'nghe-si-creator', name: 'Nghệ sĩ & Creator', img: 'toy', title: 'Đưa nhân vật của bạn ra đời thực',
    desc: 'Từ bản sculpt số đến tượng sơn hoàn chỉnh. Hợp cho drop phiên bản giới hạn, gọi vốn cộng đồng hay hội chợ sáng tạo.',
    pain: ['Xưởng lớn không nhận đơn vài chục chiếc', 'Sợ lộ file thiết kế', 'Khó tìm thợ sơn đúng màu artbook'],
    points: ['In resin 8K giữ từng nét chi tiết', 'Sơn tay theo artbook của bạn', 'Đánh số phiên bản, hộp và thẻ chứng nhận', 'Bảo mật file, không in lại cho ai khác'],
    products: ['Art toy', 'Figure', 'Tượng chân dung', 'Trang sức', 'Mô hình game'],
    stat: ['0,05 mm', 'độ dày lớp in resin'], services: ['in-resin', 'hau-ky-son', 'print-on-demand'] },
  { slug: 'doanh-nghiep-qua-tang', name: 'Doanh nghiệp & quà tặng', img: 'medal', title: 'Quà tặng mang dấu ấn thương hiệu',
    desc: 'Thiết kế quà riêng theo bộ nhận diện, khắc tên từng người nhận, giao đúng lịch sự kiện kèm hoá đơn VAT.',
    pain: ['Quà tặng đại trà, không ai nhớ', 'Cần gấp cho sự kiện', 'Yêu cầu chứng từ, hợp đồng đầy đủ'],
    points: ['Cá nhân hoá tên, logo trên từng sản phẩm', 'Màu theo mã Pantone thương hiệu', 'Hợp đồng, NDA, hoá đơn VAT đầy đủ', 'Giao theo lịch, nhiều điểm nhận'],
    products: ['Kỷ niệm chương', 'Logo để bàn', 'Móc khoá', 'Quà Tết', 'Cúp giải'],
    stat: ['−40%', 'đơn giá với đơn từ 200 chiếc'], services: ['san-xuat-loat-nho', 'thiet-ke-3d', 'hau-ky-son'] },
  { slug: 'ky-thuat-prototype', name: 'Kỹ thuật & prototype', img: 'gear', title: 'Rút ngắn vòng lặp phát triển sản phẩm',
    desc: 'Có mẫu trong tay sau 24 giờ để thử lắp ráp và công thái học, trước khi đầu tư làm khuôn.',
    pain: ['Làm khuôn mẫu thử quá đắt', 'Chờ gia công CNC cả tuần', 'Linh kiện hỏng không còn hàng thay'],
    points: ['Nhựa kỹ thuật: PETG-CF, Nylon, ASA', 'Dung sai ±0,2 mm, đo kiểm từng mẫu', 'Sửa file STEP, tối ưu cho in 3D', 'In gấp trong ngày với phụ phí'],
    products: ['Vỏ thiết bị', 'Jig & fixture', 'Bánh răng', 'Khớp nối', 'Phụ tùng'],
    stat: ['24 h', 'có mẫu thử đầu tiên'], services: ['in-fdm', 'thiet-ke-3d', 'san-xuat-loat-nho'] },
  { slug: 'kien-truc-trung-bay', name: 'Kiến trúc & trưng bày', img: 'arch', title: 'Mô hình khiến khách hàng gật đầu',
    desc: 'In mô hình công trình, sa bàn dự án và vật phẩm trưng bày cho showroom, triển lãm.',
    pain: ['Làm mô hình thủ công mất nhiều tuần', 'Khó thể hiện chi tiết mặt dựng', 'Cần sửa nhanh khi thiết kế đổi'],
    points: ['Tỉ lệ từ 1:50 đến 1:1000', 'In ghép nhiều phần cho mô hình lớn', 'Hoàn thiện trắng hoặc sơn màu thật', 'Giao và lắp đặt tận nơi'],
    products: ['Sa bàn', 'Mô hình nhà', 'Display POSM', 'Props sân khấu'],
    stat: ['1:200', 'tỉ lệ phổ biến cho sa bàn'], services: ['in-fdm', 'in-resin', 'hau-ky-son'] },
];

export const materials = [
  { n: 'PLA / PLA+', t: 'FDM', d: 2, b: 2, h: '55°C', u: 'Decor, mô hình, quà tặng, đồ dùng trong nhà', rate: 2400,
    note: 'Dễ in, nhiều màu, có loại silk bóng và loại mờ. Không hợp để ngoài nắng hoặc trong xe hơi.' },
  { n: 'PETG', t: 'FDM', d: 2, b: 4, h: '75°C', u: 'Hộp, giá đỡ, đồ dùng hằng ngày, chịu nước', rate: 2900,
    note: 'Dai hơn PLA, chịu nước và hoá chất nhẹ. An toàn hơn cho đồ dùng hằng ngày.' },
  { n: 'ASA / ABS', t: 'FDM', d: 2, b: 4, h: '95°C', u: 'Dùng ngoài trời, phụ tùng xe, chịu tia UV', rate: 3400,
    note: 'ASA giữ màu dưới nắng, chịu nhiệt tốt. Lựa chọn cho đồ ngoài trời và phụ tùng.' },
  { n: 'TPU 95A', t: 'FDM dẻo', d: 2, b: 5, h: '80°C', u: 'Ốp lưng, gioăng, đế giày, chi tiết đàn hồi', rate: 4500,
    note: 'Dẻo như cao su, không gãy khi uốn. Dùng cho chi tiết cần đàn hồi hoặc giảm chấn.' },
  { n: 'PETG-CF / Nylon-CF', t: 'FDM kỹ thuật', d: 2, b: 5, h: '120°C', u: 'Bánh răng, jig, chi tiết chịu lực cao', rate: 6500,
    note: 'Pha sợi carbon cho độ cứng cao, bề mặt mờ đẹp. Dùng thay chi tiết nhôm nhẹ trong nhiều trường hợp.' },
  { n: 'Resin tiêu chuẩn 8K', t: 'MSLA', d: 5, b: 2, h: '50°C', u: 'Figure, art toy, mẫu trưng bày chi tiết', rate: 6000,
    note: 'Chi tiết sắc nét nhất, bề mặt mịn. Giòn hơn nhựa FDM nên hợp đồ trưng bày.' },
  { n: 'Resin ABS-like', t: 'MSLA', d: 5, b: 3, h: '65°C', u: 'Mẫu cần chi tiết và độ dai, mẫu lắp ráp', rate: 7800,
    note: 'Giữ chi tiết của resin nhưng dai hơn, ít gãy. Hợp cho mẫu cần lắp ghép.' },
  { n: 'Resin đúc sáp', t: 'MSLA', d: 5, b: 1, h: '—', u: 'Mẫu đúc trang sức vàng bạc', rate: 12000,
    note: 'Cháy sạch không để lại tro, dùng làm mẫu đúc mất sáp cho xưởng kim hoàn.' },
];

export const steps = [
  ['Gửi file hoặc ý tưởng', 'STL, 3MF, ảnh tham khảo hay bản phác thảo tay đều được.', 'Ngay khi gửi'],
  ['Kiểm tra & báo giá', 'Kỹ sư soát lỗi file, tư vấn vật liệu và gửi báo giá chi tiết.', 'Trong 2 giờ làm việc'],
  ['Duyệt mẫu', 'Ảnh render hoặc mẫu in thử để bạn chốt trước khi chạy đơn.', 'Cọc 50%'],
  ['Sản xuất', 'In trên dàn máy của xưởng, cập nhật tiến độ qua Zalo.', '24 – 72 giờ'],
  ['Hậu kỳ & QC', 'Hoàn thiện bề mặt, đo kích thước, chụp ảnh nghiệm thu.', 'Ảnh QC từng đơn'],
  ['Đóng gói & giao', 'Hộp chống sốc, nhãn thương hiệu của bạn, giao toàn quốc.', '1 – 4 ngày'],
];

export const gallery = [
  { img: 'vase', title: 'Bình xoắn tham số', meta: 'PLA silk · 0,16 mm · 26 cm', cat: 'decor' },
  { img: 'knot', title: 'Nút thắt vô tận', meta: 'Resin 8K · sơn ngọc trai', cat: 'nghe-thuat' },
  { img: 'toy', title: 'Art toy "Mochi"', meta: 'Resin 8K · sơn tay · 9 cm', cat: 'nghe-thuat' },
  { img: 'gear', title: 'Bánh răng kỹ thuật', meta: 'PETG-CF · 100% infill', cat: 'ky-thuat' },
  { img: 'arch', title: 'Mô hình 1:200', meta: 'PLA trắng · 42 chi tiết', cat: 'kien-truc' },
  { img: 'medal', title: 'Kỷ niệm chương', meta: 'PLA đa màu · 500 chiếc', cat: 'qua-tang' },
  { img: 'ring', title: 'Mẫu nhẫn đúc', meta: 'Resin đúc sáp · 0,03 mm', cat: 'nghe-thuat' },
  { img: 'facet', title: 'Khối đa diện', meta: 'Resin ABS-like · 12 cm', cat: 'decor' },
  { img: 'armillary', title: 'Quả cầu thiên văn', meta: 'PLA silk · in ghép 3 phần', cat: 'decor' },
  { img: 'vase2', title: 'Chậu cây lục giác', meta: 'PETG · bán qua POD', cat: 'qua-tang' },
];
export const galleryCats = [['all', 'Tất cả'], ['decor', 'Decor'], ['nghe-thuat', 'Nghệ thuật'], ['qua-tang', 'Quà tặng'], ['ky-thuat', 'Kỹ thuật'], ['kien-truc', 'Kiến trúc']];

export const plans = [
  { who: 'Cá nhân · nghệ sĩ', name: 'In lẻ', price: 'Từ 30.000đ / sản phẩm', sub: 'Không số lượng tối thiểu',
    items: ['Kiểm tra và sửa lỗi file nhỏ miễn phí', 'Tư vấn vật liệu theo công dụng', 'Ảnh QC trước khi giao'], cta: 'Gửi file in' },
  { who: 'Phổ biến với seller', name: 'POD Partner', price: 'Giá sỉ theo từng mẫu', sub: 'Không phí tham gia', hot: true,
    items: ['In khi có đơn, không ôm tồn kho', 'Đóng hộp white-label, thiệp cảm ơn riêng', 'Nhận đơn qua Google Sheet hoặc API', 'Ảnh mockup miễn phí cho 5 mẫu đầu'], cta: 'Đăng ký đối tác' },
  { who: 'Doanh nghiệp', name: 'Dự án', price: 'Báo giá theo dự án', sub: 'Hợp đồng, hoá đơn VAT',
    items: ['Quản lý dự án riêng', 'Ký NDA bảo mật thiết kế', 'Sản xuất loạt, giao theo lịch'], cta: 'Đặt lịch tư vấn' },
];

// Chính sách: mỗi mục là một trang con. `body` là danh sách [tiêu đề mục, [đoạn hoặc gạch đầu dòng]].
export const policies = [
  { slug: 'bao-mat-ban-quyen', name: 'Bảo mật file & bản quyền', short: 'File của bạn là của bạn.', body: [
    ['Cam kết bảo mật', ['TVT không chia sẻ, không bán, không in lại thiết kế của khách hàng cho bất kỳ bên thứ ba nào.', 'File chỉ được dùng cho đúng đơn hàng bạn đặt và chỉ nhân sự phụ trách đơn được truy cập.', 'Sau khi hoàn tất đơn, bạn có thể yêu cầu xoá file khỏi hệ thống của TVT.']],
    ['Thoả thuận bảo mật (NDA)', ['Với đơn doanh nghiệp, dự án sản phẩm chưa công bố, TVT ký NDA theo mẫu của bạn hoặc của TVT trước khi nhận file.']],
    ['Quyền sở hữu trí tuệ', ['Bạn giữ toàn quyền với thiết kế do bạn cung cấp.', 'Với file do TVT thiết kế theo đơn, quyền sử dụng thuộc về bạn sau khi thanh toán đủ.', 'TVT có thể xin phép chụp ảnh sản phẩm để giới thiệu. Bạn có quyền từ chối.']],
    ['Nội dung TVT từ chối in', ['Sản phẩm vi phạm bản quyền, nhãn hiệu của bên khác khi không có giấy phép.', 'Vũ khí, linh kiện vũ khí và vật phẩm pháp luật Việt Nam cấm.', 'Nội dung phản cảm, kích động hoặc xúc phạm cá nhân, tổ chức.']],
  ]},
  { slug: 'doi-tra-bao-hanh', name: 'Đổi trả & bảo hành', short: 'In lại miễn phí nếu lỗi từ xưởng.', body: [
    ['Thời hạn báo lỗi', ['Trong 7 ngày kể từ khi nhận hàng, kèm ảnh hoặc video mở hộp.']],
    ['Trường hợp được in lại hoặc hoàn tiền 100%', ['Lỗi in: tách lớp, cong vênh, thiếu chi tiết.', 'Sai kích thước vượt dung sai cam kết.', 'Sai màu, sai vật liệu so với mẫu đã duyệt.']],
    ['Hư hỏng khi vận chuyển', ['TVT làm việc với đơn vị giao hàng và gửi bù sản phẩm cho bạn, không cần chờ kết quả bồi thường.']],
    ['Trường hợp không áp dụng', ['Lỗi nằm trong file thiết kế do khách cung cấp và đã được TVT cảnh báo trước khi in.', 'Sản phẩm hư hỏng do sử dụng sai công dụng, để gần nguồn nhiệt vượt mức chịu nhiệt của vật liệu.', 'Khác biệt nhỏ về màu do màn hình hiển thị.']],
  ]},
  { slug: 'van-chuyen', name: 'Vận chuyển', short: 'Toàn quốc, đóng gói chống sốc.', body: [
    ['Thời gian giao hàng', ['Nội thành: 1 – 2 ngày.', 'Liên tỉnh: 2 – 4 ngày qua GHN, GHTK, Viettel Post.', 'Có giao hoả tốc nội thành trong ngày.']],
    ['Phí vận chuyển', ['Tính theo bảng giá đơn vị vận chuyển, báo rõ trong báo giá.', 'Miễn phí vận chuyển cho đơn từ {freeShipFrom}.']],
    ['Đóng gói', ['Hộp carton nhiều lớp, chèn xốp hoặc giấy tổ ong theo từng sản phẩm.', 'Sản phẩm mảnh, nhiều chi tiết nhỏ được cố định riêng từng phần.']],
    ['Đơn dropship', ['Giao thẳng tới khách cuối, nhãn gửi và thiệp mang thương hiệu của bạn.', 'Mã vận đơn được cập nhật vào bảng đơn dùng chung ngay khi gửi.']],
  ]},
  { slug: 'thanh-toan', name: 'Thanh toán', short: 'Cọc 50%, phần còn lại khi giao.', body: [
    ['Hình thức', ['Chuyển khoản ngân hàng.', 'Ví điện tử.', 'COD cho đơn lẻ dưới 2.000.000đ.']],
    ['Đơn in lẻ và sản xuất', ['Đặt cọc 50% khi duyệt mẫu.', 'Thanh toán phần còn lại trước khi giao hoặc khi nhận hàng (COD).']],
    ['Đối tác POD', ['Đối soát và thanh toán theo tuần dựa trên số đơn đã giao.']],
    ['Hoá đơn', ['Xuất hoá đơn VAT khi có yêu cầu. Vui lòng gửi thông tin xuất hoá đơn khi đặt đơn.']],
  ]},
  { slug: 'thoi-gian-huy-don', name: 'Thời gian & huỷ đơn', short: 'Đúng hẹn hoặc giảm giá.', body: [
    ['Cam kết thời gian', ['Thời gian hoàn thành được ghi rõ trong báo giá đã chốt.', 'Giao trễ quá 48 giờ so với cam kết do lỗi của xưởng: giảm 10% giá trị đơn.']],
    ['Huỷ đơn', ['Huỷ miễn phí trước khi bắt đầu in, hoàn lại toàn bộ tiền cọc.', 'Sau khi đã in, phí được tính theo phần đã hoàn thành và vật liệu đã dùng.', 'Đơn thiết kế 3D đã bắt đầu dựng mẫu: tính phí theo khối lượng công việc đã làm.']],
  ]},
  { slug: 'cam-ket-chat-luong', name: 'Cam kết chất lượng', short: 'Dung sai ±0,2 mm với FDM.', body: [
    ['Dung sai kích thước', ['FDM: ±0,2 mm với chi tiết dưới 100 mm, ±0,2% với chi tiết lớn hơn.', 'Resin: ±0,1 mm với chi tiết dưới 100 mm.']],
    ['Kiểm tra chất lượng', ['Mỗi đơn được kiểm tra bề mặt, kích thước và chụp ảnh nghiệm thu trước khi đóng gói.', 'Ảnh QC và thông số in (vật liệu, độ dày lớp, infill) được gửi kèm để bạn đối chiếu.']],
  ]},
  { slug: 'dieu-khoan-su-dung', name: 'Điều khoản sử dụng', short: 'Quy định khi dùng website và dịch vụ.', body: [
    ['Phạm vi', ['Điều khoản áp dụng cho mọi khách hàng sử dụng website và dịch vụ in 3D của TVT.']],
    ['Báo giá và hợp đồng', ['Giá trên website, kể cả công cụ ước tính, chỉ mang tính tham khảo.', 'Giá chính thức là báo giá TVT gửi sau khi kiểm tra file. Báo giá có hiệu lực 7 ngày.', 'Đơn hàng được xác nhận khi bạn duyệt mẫu và đặt cọc.']],
    ['Trách nhiệm của khách hàng', ['Cung cấp thông tin liên hệ chính xác.', 'Đảm bảo có quyền hợp pháp với thiết kế gửi in.']],
    ['Giải quyết tranh chấp', ['Hai bên ưu tiên thương lượng. Nếu không thành, tranh chấp được giải quyết theo pháp luật Việt Nam.']],
  ]},
  { slug: 'quyen-rieng-tu', name: 'Chính sách quyền riêng tư', short: 'Cách TVT thu thập và bảo vệ dữ liệu cá nhân.', body: [
    ['Dữ liệu thu thập', ['Họ tên, số điện thoại, email, địa chỉ giao hàng khi bạn liên hệ hoặc đặt đơn.', 'File thiết kế và mô tả sản phẩm bạn gửi.']],
    ['Mục đích sử dụng', ['Báo giá, sản xuất, giao hàng và chăm sóc sau bán.', 'Gửi thông tin khuyến mãi khi bạn đồng ý nhận.']],
    ['Chia sẻ dữ liệu', ['Chỉ chia sẻ thông tin giao hàng cần thiết cho đơn vị vận chuyển.', 'Không bán hoặc cho thuê dữ liệu cá nhân.']],
    ['Quyền của bạn', ['Yêu cầu xem, sửa hoặc xoá dữ liệu cá nhân bằng cách liên hệ TVT.', 'Chính sách tuân thủ Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.']],
  ]},
];

export const faq = [
  ['Đặt hàng', [
    ['Tôi không có file 3D thì có in được không?', 'Được. Gửi ảnh, bản vẽ tay hoặc mô tả, đội thiết kế sẽ dựng file và gửi ảnh render để bạn duyệt trước khi in. Phí thiết kế báo riêng theo độ phức tạp.'],
    ['File cần định dạng gì?', 'STL, OBJ, 3MF hoặc STEP. Nếu file lỗi lưới hay thành quá mỏng, TVT sửa miễn phí lỗi nhỏ và báo trước nếu cần chỉnh nhiều.'],
    ['Có nhận in 1 chiếc không?', 'Có. TVT không có số lượng tối thiểu. Đơn giá giảm dần khi số lượng tăng.'],
    ['Bao lâu thì nhận được báo giá?', 'Trong 2 giờ làm việc kể từ khi nhận file và mô tả đầy đủ.'],
  ]],
  ['POD & Dropship', [
    ['POD khác gì so với đặt in số lượng lớn?', 'Với POD, bạn đăng sản phẩm bán trước, có đơn TVT mới in và giao. Bạn không bỏ vốn nhập hàng, không lo tồn kho, và thử được nhiều mẫu cùng lúc.'],
    ['Khách của tôi có biết sản phẩm do TVT làm không?', 'Không. Hộp, nhãn gửi và thiệp đều mang thương hiệu của bạn.'],
    ['Đơn được chuyển về xưởng thế nào?', 'Qua bảng Google Sheet dùng chung, hoặc API nếu bạn có website riêng. TVT cập nhật mã vận đơn vào cùng bảng.'],
  ]],
  ['Vật liệu & chất lượng', [
    ['In nhiều màu được không?', 'Được. Máy FDM đa màu in tới 8 màu một lần. Với màu chuyển sắc hay chi tiết phức tạp, TVT khuyên chọn gói sơn tay.'],
    ['Sản phẩm in 3D có bền không?', 'Tuỳ vật liệu. PETG và ASA dùng ngoài trời tốt, TPU dẻo như cao su, nylon sợi carbon dùng cho chi tiết chịu lực. Cho TVT biết công dụng để được tư vấn.'],
    ['Đồ in 3D có dùng đựng thực phẩm được không?', 'TVT không khuyến nghị dùng đồ in 3D tiếp xúc trực tiếp với thực phẩm vì vân lớp có thể giữ vi khuẩn.'],
  ]],
  ['Giao hàng & thanh toán', [
    ['Bao lâu thì nhận được hàng?', 'Mẫu tiêu chuẩn in xong trong 24–72 giờ, cộng 1–4 ngày vận chuyển. Có in gấp trong ngày với phụ phí.'],
    ['Có xuất hoá đơn VAT không?', 'Có, khi bạn yêu cầu và gửi thông tin xuất hoá đơn lúc đặt đơn.'],
    ['Thanh toán thế nào?', 'Cọc 50% khi duyệt mẫu, phần còn lại khi giao. Đơn lẻ dưới 2 triệu có thể COD.'],
  ]],
];

export const articles = [
  { slug: 'chuan-bi-file-in-3d', title: 'Chuẩn bị file in 3D đúng cách', img: 'facet', date: '2026-10-20', read: '5 phút',
    excerpt: 'Năm điều cần kiểm tra trước khi gửi file để sản phẩm in ra đẹp và đúng kích thước.',
    body: [
      ['1. Xuất đúng định dạng', ['Dùng STL hoặc 3MF cho mô hình nghệ thuật, STEP cho chi tiết kỹ thuật. 3MF giữ được màu và đơn vị đo, nên ưu tiên khi phần mềm hỗ trợ.']],
      ['2. Kiểm tra đơn vị đo', ['Lỗi phổ biến nhất là xuất file theo inch thay vì milimét, khiến sản phẩm to hoặc nhỏ gấp 25 lần. Hãy ghi rõ kích thước mong muốn khi gửi file.']],
      ['3. Lưới phải kín', ['Mô hình cần là khối kín (watertight), không có mặt hở hay mặt chồng lên nhau. Blender có add-on 3D Print Toolbox để kiểm tra nhanh.']],
      ['4. Độ dày thành tối thiểu', ['FDM cần thành dày ít nhất 1,2 mm, resin ít nhất 0,8 mm. Chi tiết mảnh hơn dễ gãy hoặc không in ra.']],
      ['5. Ghi chú công dụng', ['Cho TVT biết sản phẩm dùng để trưng bày, chịu lực hay để ngoài trời. Kỹ sư sẽ chọn vật liệu, hướng in và độ đặc phù hợp.']],
    ] },
  { slug: 'chon-vat-lieu-in-3d', title: 'PLA, PETG hay resin: chọn vật liệu nào?', img: 'knot', date: '2026-10-12', read: '6 phút',
    excerpt: 'So sánh nhanh các vật liệu phổ biến theo độ chi tiết, độ bền, chịu nhiệt và giá.',
    body: [
      ['Khi nào chọn PLA', ['Sản phẩm trưng bày trong nhà, decor, mô hình. PLA rẻ, nhiều màu, dễ in, nhưng mềm ở khoảng 55°C nên không để trong xe hơi hay ngoài nắng.']],
      ['Khi nào chọn PETG hoặc ASA', ['Đồ dùng hằng ngày, chi tiết cần dai, đồ để ngoài trời. ASA giữ màu dưới nắng và chịu nhiệt tới khoảng 95°C.']],
      ['Khi nào chọn resin', ['Sản phẩm nhỏ cần chi tiết cao như figure, trang sức, mô hình thu nhỏ. Resin cho bề mặt mịn nhưng giòn hơn nhựa FDM.']],
      ['Khi nào chọn nhựa kỹ thuật', ['Chi tiết chịu lực, bánh răng, jig sản xuất. PETG-CF hoặc Nylon-CF cứng, nhẹ và chịu nhiệt tốt.']],
    ] },
  { slug: 'print-on-demand-la-gi', title: 'Print on Demand là gì? Bán hàng không tồn kho với in 3D', img: 'vase2', date: '2026-10-02', read: '4 phút',
    excerpt: 'Mô hình POD giúp seller thử nhiều mẫu mà không cần vốn nhập hàng. Đây là cách nó vận hành.',
    body: [
      ['POD hoạt động thế nào', ['Bạn đăng sản phẩm lên gian hàng bằng ảnh mockup. Khi có khách đặt, đơn được chuyển cho xưởng in. Xưởng sản xuất, đóng gói theo thương hiệu của bạn và giao tới khách.']],
      ['Lợi ích', ['Không vốn tồn kho, không rủi ro hàng ế.', 'Thử được hàng chục mẫu cùng lúc, giữ lại mẫu bán chạy.', 'Dễ cá nhân hoá: in tên, đổi màu theo từng đơn.']],
      ['Sản phẩm in 3D hợp với POD', ['Đèn ngủ, chậu cây mini, giá đỡ điện thoại, móc khoá in tên, tượng thú cưng theo ảnh, phụ kiện bàn làm việc.']],
      ['Bắt đầu với TVT', ['Đăng ký gói POD Partner, gửi 5 mẫu đầu để nhận ảnh mockup miễn phí, rồi kết nối bảng đơn dùng chung.']],
    ] },
];
