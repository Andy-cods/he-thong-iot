# TVT — Website in 3D theo yêu cầu (POD)

Website tĩnh nhiều trang cho thương hiệu **TVT 3D Print Atelier**. Không cần framework, không cần cài thư viện: chỉ HTML, CSS, JS thuần. Upload thư mục `public/` lên bất kỳ hosting tĩnh nào là chạy.

## Cấu trúc

```
sites/tvt-web/
├── src/
│   ├── data.mjs            ← TOÀN BỘ nội dung: liên hệ, dịch vụ, giải pháp, vật liệu, chính sách, FAQ, bài viết
│   ├── build.mjs           ← sinh các trang HTML vào public/
│   └── render-images.mjs   ← (tuỳ chọn) render lại ảnh minh hoạ 3D
└── public/                 ← thư mục deploy
    ├── *.html              ← 35 trang (được sinh ra, đừng sửa tay)
    ├── sitemap.xml, robots.txt
    └── assets/
        ├── style.css, main.js, hero3d.js, favicon.svg
        └── img/*.png       ← ảnh sản phẩm (đang là ảnh render minh hoạ)
```

## Danh sách trang

| Nhóm | Trang |
|---|---|
| Chính | Trang chủ, Về chúng tôi, Quy trình, Tác phẩm (có bộ lọc), Vật liệu, Báo giá (công cụ ước tính + gói), Hỏi đáp, Liên hệ, 404 |
| Dịch vụ | Tổng quan + 6 trang: Print on Demand, In FDM, In resin, Thiết kế 3D, Hậu kỳ & sơn, Sản xuất loạt nhỏ |
| Giải pháp | Tổng quan + 5 trang: Seller TMĐT, Nghệ sĩ & Creator, Doanh nghiệp & quà tặng, Kỹ thuật & prototype, Kiến trúc & trưng bày |
| Chính sách | Tổng quan + 8 trang: Bảo mật & bản quyền, Đổi trả & bảo hành, Vận chuyển, Thanh toán, Thời gian & huỷ đơn, Cam kết chất lượng, Điều khoản sử dụng, Quyền riêng tư |
| Kiến thức | Tổng quan + 3 bài viết |

## Sửa nội dung

1. Mở `src/data.mjs`, sửa phần `site` (số điện thoại, Zalo, email, địa chỉ, tên miền, mức freeship, mạng xã hội). Mục nào để trống sẽ hiện ô gạch chân "chờ cập nhật" trên trang.
2. Sửa giá trong `materials[].rate` (đơn giá đồng/cm³ dùng cho công cụ ước tính), `plans`, và các chính sách cho đúng thực tế xưởng.
3. Chạy:
   ```bash
   cd sites/tvt-web
   node src/build.mjs
   ```
4. Mở `public/index.html` trong trình duyệt để xem.

**Thay ảnh thật:** chép ảnh vào `public/assets/img/` với đúng tên file đang dùng (`vase.png`, `toy.png`, `gear.png`…). Ảnh vuông, nền tối hoặc trong suốt sẽ hợp với giao diện nhất.

**Thay logo:** logo hiện là chữ "TVT" trong `build.mjs` (hàm `header`) và `public/assets/favicon.svg`.

## Triển khai

Upload nguyên thư mục `public/`. Một vài lựa chọn:

- **Netlify / Vercel / Cloudflare Pages:** trỏ thư mục publish là `sites/tvt-web/public`, không cần lệnh build.
- **VPS có Caddy:**
  ```
  tvt3d.vn {
      root * /var/www/tvt-web/public
      file_server
      encode gzip zstd
      handle_errors {
          rewrite * /404.html
          file_server
      }
  }
  ```

Nhớ đổi `site.url` trong `data.mjs` thành tên miền thật rồi build lại để canonical, sitemap và Open Graph đúng.

## Ghi chú kỹ thuật

- Font: Cormorant Garamond (tiêu đề), Be Vietnam Pro (nội dung), JetBrains Mono (thông số), tải từ Google Fonts.
- Trang chủ dùng Three.js 0.149 (jsDelivr) để dựng cảnh bình đang in. Không có WebGL thì hiện ảnh `hero.png` tĩnh.
- Form liên hệ chưa có backend: nó tạo bản brief để khách sao chép rồi gửi qua Zalo/email. Muốn nhận đơn tự động cần thêm một endpoint (Google Apps Script, Formspree, hoặc API riêng).
- Render lại ảnh minh hoạ: `THREE_PATH=/đường/dẫn/three.min.js node src/render-images.mjs` (cần Playwright + Chromium).
