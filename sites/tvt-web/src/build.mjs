// Sinh toàn bộ trang HTML tĩnh của website TVT vào thư mục public/.
// Chạy: node src/build.mjs   (Node 18+, không cần cài thư viện)
import { writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { site, services, solutions, materials, steps, gallery, galleryCats, plans, policies, faq, articles } from './data.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const YEAR = 2026;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ph = (v, label) => (v ? esc(v) : `<span class="ph">${label}</span>`);
const fill = (s) => esc(s).replace('{freeShipFrom}', site.freeShipFrom ? esc(site.freeShipFrom) : '<span class="ph">mức đơn</span>');
const ARR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6"/></svg>';
const CARET = '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 3.5l3 3 3-3"/></svg>';
const img = (k) => `assets/img/${k}.png`;
const svcUrl = (s) => `dich-vu-${s.slug}.html`;
const solUrl = (s) => `giai-phap-${s.slug}.html`;
const polUrl = (p) => `chinh-sach-${p.slug}.html`;
const artUrl = (a) => `kien-thuc-${a.slug}.html`;
const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];
const fmtDate = (d) => d.split('-').reverse().join('/');

/* ---------------- Layout ---------------- */
function header(cur) {
  const ddSvc = services.map((s) => `<li><a href="${svcUrl(s)}">${esc(s.name)}<small>${esc(s.code)}</small></a></li>`).join('');
  const ddSol = solutions.map((s) => `<li><a href="${solUrl(s)}">${esc(s.name)}<small>${esc(s.title)}</small></a></li>`).join('');
  const a = (href, label, key) => `<li><a href="${href}"${cur === key ? ' aria-current="page"' : ''}>${label}</a></li>`;
  return `<a class="skip" href="#main">Bỏ qua tới nội dung</a>
<header class="top">
  <div class="wrap nav">
    <a class="brand" href="index.html" aria-label="TVT trang chủ"><b>TVT</b><small>${esc(site.tagline)}</small></a>
    <ul class="menu" id="menu">
      <li><button class="dd-btn${cur === 'dich-vu' ? ' cur' : ''}" aria-expanded="false">Dịch vụ ${CARET}</button><ul class="dd">${ddSvc}<li><a class="all" href="dich-vu.html">Tất cả dịch vụ →</a></li></ul></li>
      <li><button class="dd-btn${cur === 'giai-phap' ? ' cur' : ''}" aria-expanded="false">Giải pháp ${CARET}</button><ul class="dd">${ddSol}<li><a class="all" href="giai-phap.html">Tất cả giải pháp →</a></li></ul></li>
      ${a('tac-pham.html', 'Tác phẩm', 'tac-pham')}
      ${a('vat-lieu.html', 'Vật liệu', 'vat-lieu')}
      ${a('bao-gia.html', 'Báo giá', 'bao-gia')}
      ${a('kien-thuc.html', 'Kiến thức', 'kien-thuc')}
      ${a('ve-chung-toi.html', 'Về TVT', 've-chung-toi')}
      ${a('lien-he.html', 'Liên hệ', 'lien-he')}
    </ul>
    <div class="nav-cta">
      <a class="btn solid cta-top" href="lien-he.html">Gửi file in</a>
      <button class="menu-btn" id="menuBtn" aria-label="Mở menu" aria-expanded="false" aria-controls="menu"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 8h16M4 16h16"/></svg></button>
    </div>
  </div>
</header>`;
}

function footer() {
  const social = [['Facebook', site.facebook], ['TikTok', site.tiktok], ['Instagram', site.instagram]].filter((x) => x[1]);
  return `<footer class="site">
  <div class="wrap">
    <div class="foot">
      <div><div class="big">TVT</div><p>Xưởng in 3D theo yêu cầu. Từ một mẫu thử đến nghìn sản phẩm, in khi bạn cần.</p>
        <p>Hotline / Zalo: ${ph(site.phone, 'số điện thoại')}<br>Email: ${ph(site.email, 'email')}</p></div>
      <div><h4>Dịch vụ</h4><ul>${services.map((s) => `<li><a href="${svcUrl(s)}">${esc(s.name)}</a></li>`).join('')}</ul></div>
      <div><h4>Giải pháp</h4><ul>${solutions.map((s) => `<li><a href="${solUrl(s)}">${esc(s.name)}</a></li>`).join('')}</ul></div>
      <div><h4>Chính sách</h4><ul>${policies.map((p) => `<li><a href="${polUrl(p)}">${esc(p.name)}</a></li>`).join('')}</ul></div>
      <div><h4>TVT</h4><ul><li><a href="ve-chung-toi.html">Về chúng tôi</a></li><li><a href="quy-trinh.html">Quy trình</a></li><li><a href="tac-pham.html">Tác phẩm</a></li><li><a href="vat-lieu.html">Vật liệu</a></li><li><a href="bao-gia.html">Báo giá</a></li><li><a href="kien-thuc.html">Kiến thức</a></li><li><a href="faq.html">Hỏi đáp</a></li><li><a href="lien-he.html">Liên hệ</a></li>${social.map((x) => `<li><a href="${esc(x[1])}" rel="noopener" target="_blank">${x[0]}</a></li>`).join('')}</ul></div>
    </div>
    <div class="legal"><span>© ${YEAR} TVT 3D Print Atelier</span><span class="mono">G28 · M104 S215 · ready</span></div>
  </div>
</footer>`;
}

function layout({ file, title, desc, cur, body, extraScripts = '', ogImg = 'hero', jsonld }) {
  const full = file === 'index.html' ? `TVT · In 3D theo yêu cầu, Print on Demand` : `${title} · TVT 3D Print Atelier`;
  const url = `${site.url}/${file === 'index.html' ? '' : file}`;
  const ld = jsonld || { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: 'TVT 3D Print Atelier', url: site.url, description: 'Xưởng in 3D theo yêu cầu và Print on Demand.', ...(site.phone ? { telephone: site.phone } : {}), ...(site.email ? { email: site.email } : {}), ...(site.address ? { address: site.address } : {}) };
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="TVT 3D Print Atelier">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(site.url)}/${img(ogImg)}">
<meta name="theme-color" content="#0C0D10">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Be+Vietnam+Pro:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="assets/style.css">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
${header(cur)}
<main id="main">
${body}
</main>
${footer()}
<script src="assets/main.js" defer></script>
${extraScripts}
</body>
</html>
`;
}

function crumb(items) {
  return `<ol class="crumb"><li><a href="index.html">Trang chủ</a></li>${items.map(([l, h]) => (h ? `<li><a href="${h}">${esc(l)}</a></li>` : `<li aria-current="page">${esc(l)}</li>`)).join('')}</ol>`;
}

function pageHero({ crumbs, label, h1, lead, visual, actions }) {
  return `<section class="page-hero${visual ? '' : ' text-only'}"><div class="wrap">${crumb(crumbs)}
  <div class="grid" style="margin-top:28px">
    <div><p class="label">${esc(label)}</p><h1>${h1}</h1>${lead ? `<p class="lead">${esc(lead)}</p>` : ''}${actions ? `<div class="actions">${actions}</div>` : ''}</div>
    ${visual ? `<div class="visual"><img src="${img(visual)}" alt="" width="720" height="720"></div>` : ''}
  </div></div></section>`;
}

const secHead = (label, h2, lead) => `<div class="sec-head"><p class="label">${esc(label)}</p><div class="txt"><h2>${h2}</h2>${lead ? `<p class="lead">${esc(lead)}</p>` : ''}</div></div>`;

/* ---------------- Shared sections ---------------- */
const dots = (v) => `<span class="dots" role="img" aria-label="${v} trên 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</span>`;
const matTable = () => `<div class="tbl-wrap"><table><thead><tr><th>Vật liệu</th><th>Chi tiết</th><th>Độ bền</th><th>Chịu nhiệt</th><th>Hợp nhất cho</th></tr></thead><tbody>${materials.map((m) => `<tr><td class="mat">${esc(m.n)}<small>${esc(m.t)}</small></td><td>${dots(m.d)}</td><td>${dots(m.b)}</td><td class="mono">${m.h}</td><td>${esc(m.u)}</td></tr>`).join('')}</tbody></table></div>`;

const svcRows = () => `<div class="svc-list">${services.filter((s) => s.slug !== 'print-on-demand').map((s) => `<a class="svc" href="${svcUrl(s)}"><span class="code">${esc(s.code)}</span><h3>${esc(s.name)}</h3><p>${esc(s.short)}</p><ul>${s.specs.slice(0, 2).map((x) => `<li>${esc(x[0])}: ${esc(x[1])}</li>`).join('')}</ul><span class="arr">${ARR}</span></a>`).join('')}</div>`;

const podBlock = () => `<div class="pod">
  <div><p class="label" style="color:var(--mint)">Dịch vụ chủ lực</p><h3 style="margin-top:14px">Print on Demand &amp; Dropship</h3>
    <p class="lead">Đăng mẫu lên gian hàng của bạn, có đơn TVT mới in. Sản phẩm được hoàn thiện, đóng hộp mang thương hiệu của bạn và giao thẳng tới khách. Bạn không cần nhập hàng, cũng không lo tồn kho.</p>
    <div class="tags"><span>Shopee</span><span>TikTok Shop</span><span>Lazada</span><span>Etsy</span><span>Website riêng</span></div>
    <p style="margin-top:28px"><a class="btn" href="dich-vu-print-on-demand.html">Tìm hiểu POD ${ARR}</a></p></div>
  <div class="flow" aria-label="Luồng xử lý đơn POD">
    <div><span class="k">00:00</span><b>Khách đặt hàng trên gian hàng của bạn</b><i>đơn mới</i></div>
    <div><span class="k">00:05</span><b>Đơn tự động chuyển về xưởng TVT</b><i>đồng bộ</i></div>
    <div><span class="k">+24 h</span><b>In, hoàn thiện, kiểm tra chất lượng</b><i>ảnh QC</i></div>
    <div><span class="k">+30 h</span><b>Đóng hộp với nhãn và thiệp của bạn</b><i>white-label</i></div>
    <div><span class="k">+2–4 ngày</span><b>Giao tận tay khách hàng</b><i>toàn quốc</i></div>
  </div></div>`;

const stepsGrid = () => `<div class="steps">${steps.map((s, i) => `<div class="step"><span class="n">${roman[i]}.</span><h3>${esc(s[0])}</h3><p>${esc(s[1])}</p><span class="t">${esc(s[2])}</span></div>`).join('')}</div>`;

const galGrid = (items, bigFirst = 2) => `<div class="gal" id="gal">${items.map((g, i) => `<figure class="work${i < bigFirst ? ' big' : ''}" data-cat="${g.cat}"><img src="${img(g.img)}" alt="${esc(g.title)}" loading="lazy" width="720" height="720"><figcaption class="cap"><b>${esc(g.title)}</b><span>${esc(g.meta)}</span></figcaption></figure>`).join('')}</div>`;

const quoteBlock = () => `<div class="quote">
  <form class="q-form" id="qForm" onsubmit="return false">
    <div class="field"><label for="qSize">Kích thước lớn nhất <output id="qSizeOut" for="qSize">10 cm</output></label><input type="range" id="qSize" min="2" max="35" value="10"></div>
    <div class="field"><label for="qMat">Vật liệu</label><select id="qMat">${materials.map((m) => `<option data-rate="${m.rate}" data-type="${esc(m.t)}">${esc(m.n)}</option>`).join('')}</select></div>
    <div class="field"><span class="lbl">Độ đặc</span><div class="seg" role="radiogroup" aria-label="Độ đặc">
      <input type="radio" name="qFill" id="fa" value="0.08"><label for="fa">Vỏ mỏng</label>
      <input type="radio" name="qFill" id="fb" value="0.14" checked><label for="fb">Tiêu chuẩn</label>
      <input type="radio" name="qFill" id="fc" value="0.24"><label for="fc">Đặc, chịu lực</label></div></div>
    <div class="field"><span class="lbl">Hoàn thiện</span><div class="seg" role="radiogroup" aria-label="Hoàn thiện">
      <input type="radio" name="qFin" id="ha" value="1" checked><label for="ha">Thô</label>
      <input type="radio" name="qFin" id="hb" value="1.35"><label for="hb">Chà mịn</label>
      <input type="radio" name="qFin" id="hc" value="2.1"><label for="hc">Sơn tay</label></div></div>
    <div class="field"><label for="qQty">Số lượng <output id="qQtyOut" for="qQty">1</output></label><input type="range" id="qQty" min="0" max="100" value="0"></div>
  </form>
  <div class="q-out" aria-live="polite">
    <div><p class="label">Giá tham khảo / sản phẩm</p><div class="q-price" id="qPrice">—</div></div>
    <div class="q-break" id="qBreak"></div>
    <p class="q-note">Giá tham khảo để bạn hình dung chi phí. Báo giá chính thức được gửi sau khi kỹ sư kiểm tra file.</p>
    <a class="btn solid" href="lien-he.html" style="justify-self:start">Gửi file để chốt giá ${ARR}</a>
  </div></div>`;

const plansBlock = () => `<div class="plans">${plans.map((p) => `<div class="plan${p.hot ? ' hot' : ''}"><span class="label">${esc(p.who)}</span><h3>${esc(p.name)}</h3><p class="price">${esc(p.price)}<small>${esc(p.sub)}</small></p><ul>${p.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><a class="btn${p.hot ? ' solid' : ''}" href="lien-he.html">${esc(p.cta)}</a></div>`).join('')}</div>`;

const ctaBand = (h2 = 'Có ý tưởng? <em class="pearl">Hãy cho nó hình hài.</em>') => `<section class="band"><div class="wrap cta-band"><div><p class="label">Bắt đầu</p><h2 style="margin-top:18px">${h2}</h2></div><div class="actions"><a class="btn solid" href="lien-he.html">Gửi file in ${ARR}</a><a class="btn" href="bao-gia.html">Ước tính giá</a></div></div></section>`;

const cards = (arr) => `<div class="cards n${arr.length}">${arr.join('')}</div>`;
const card = (href, image, title, text, more = 'Xem chi tiết') => `<a class="card" href="${href}"><div class="img"><img src="${img(image)}" alt="" loading="lazy" width="720" height="720"></div><div class="body"><h3>${esc(title)}</h3><p>${esc(text)}</p><span class="more">${more} →</span></div></a>`;

const faqAcc = (items) => `<div class="acc">${items.map(([q, a]) => `<details><summary>${esc(q)}<span class="plus"></span></summary><p>${esc(a)}</p></details>`).join('')}</div>`;

/* ---------------- Pages ---------------- */
const pages = [];
const add = (file, opts) => pages.push({ file, ...opts });

// Trang chủ
add('index.html', {
  title: 'Trang chủ', cur: 'home', desc: 'TVT in 3D theo yêu cầu cho nghệ sĩ, nhà bán hàng và doanh nghiệp. Print on Demand không tồn kho, in resin siêu chi tiết, FDM khổ lớn, thiết kế 3D và sơn hoàn thiện.',
  extraScripts: `<script src="${THREE_URL}" defer></script>\n<script src="assets/hero3d.js" defer></script>`,
  body: `<section class="hero"><div class="wrap">
  <div class="hero-grid">
    <div><p class="label">TVT · Xưởng in 3D theo yêu cầu</p>
      <h1>In ra những điều <em class="pearl">chưa từng tồn tại.</em></h1>
      <p class="lead">TVT biến bản phác thảo, file 3D hay chỉ một ý tưởng thành vật thể hoàn thiện, cho nghệ sĩ, nhà bán hàng và thương hiệu. In từ một chiếc, không tồn kho.</p>
      <div class="hero-ctas"><a class="btn solid" href="bao-gia.html">Ước tính chi phí ${ARR}</a><a class="btn" href="tac-pham.html">Xem tác phẩm</a></div></div>
    <div class="stage" aria-label="Mô phỏng một chiếc bình đang được in 3D từng lớp">
      <img class="poster" src="${img('hero')}" alt="" width="720" height="720">
      <canvas id="hero3d"></canvas>
      <div class="readout"><span>Lớp <b id="rLayer">150/150</b></span><span>Z <b id="rZ">24.00</b> mm</span><span>Resin ánh ngọc · 0,05 mm</span></div>
    </div>
  </div>
  <div class="facts"><div><strong>0,05 mm</strong><span>Độ dày lớp in resin</span></div><div><strong>01</strong><span>Sản phẩm là đủ để đặt in</span></div><div><strong>12+</strong><span>Vật liệu nhựa và resin</span></div><div><strong>24–72 h</strong><span>Thời gian in mẫu</span></div></div>
</div></section>

<section class="band tight"><div class="wrap">
  ${secHead('Dịch vụ', 'Bạn giữ ý tưởng.<br><em>Phần còn lại để TVT.</em>')}
  ${podBlock()}
  <div style="margin-top:clamp(64px,8vw,100px)">${svcRows()}</div>
</div></section>

<section class="band light"><div class="wrap">
  ${secHead('Giải pháp', 'Mỗi người làm nghề <em>một cách in riêng.</em>')}
  <div class="sol-tabs" role="tablist" aria-label="Giải pháp theo khách hàng" id="solTabs">${solutions.map((s, i) => `<button role="tab" id="t-${s.slug}" aria-controls="p-${s.slug}">${esc(s.name)}</button>`).join('')}</div>
  ${solutions.map((s) => `<div class="sol-panel" role="tabpanel" id="p-${s.slug}" aria-labelledby="t-${s.slug}" tabindex="0"><div><h3>${esc(s.title)}</h3><p class="lead">${esc(s.desc)}</p><ul class="bullets">${s.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><aside class="sol-side"><div class="big-stat"><strong>${esc(s.stat[0])}</strong><span>${esc(s.stat[1])}</span></div><div style="display:grid;gap:12px"><p class="label">Sản phẩm tiêu biểu</p><div class="chips">${s.products.map((x) => `<span>${esc(x)}</span>`).join('')}</div></div><a class="btn solid" href="${solUrl(s)}" style="justify-self:start">Xem giải pháp ${ARR}</a></aside></div>`).join('')}
</div></section>

<section class="band light alt"><div class="wrap">
  ${secHead('Quy trình', 'Sáu bước, <em>minh bạch từ đầu đến cuối.</em>')}
  ${stepsGrid()}
  <p style="margin-top:32px"><a class="link" href="quy-trinh.html">Chi tiết quy trình và thời gian</a></p>
</div></section>

<section class="band"><div class="wrap">
  ${secHead('Tác phẩm', 'Ra lò tại <em>xưởng TVT.</em>')}
  ${galGrid(gallery.slice(0, 5))}
  <p style="margin-top:32px"><a class="btn" href="tac-pham.html">Xem tất cả tác phẩm ${ARR}</a></p>
</div></section>

<section class="band light"><div class="wrap">
  ${secHead('Vật liệu', 'Chất liệu quyết định <em>cảm giác cầm trên tay.</em>', 'Chưa chắc chọn loại nào? Ghi công dụng sản phẩm khi gửi file, kỹ sư TVT sẽ đề xuất.')}
  ${matTable()}
</div></section>

<section class="band"><div class="wrap">
  ${secHead('Báo giá nhanh', 'Ước tính chi phí <em>trong mười giây.</em>')}
  ${quoteBlock()}
</div></section>

<section class="band light"><div class="wrap">
  ${secHead('Hỏi đáp', 'Những điều <em>bạn hay hỏi.</em>')}
  ${faqAcc(faq.flatMap((g) => g[1]).slice(0, 5))}
  <p style="margin-top:32px"><a class="link" href="faq.html">Xem tất cả câu hỏi</a></p>
</div></section>
${ctaBand()}`,
});

// Dịch vụ: tổng quan + chi tiết
add('dich-vu.html', {
  title: 'Dịch vụ', cur: 'dich-vu', desc: 'Dịch vụ in 3D của TVT: Print on Demand, in FDM khổ lớn, in resin siêu chi tiết, thiết kế 3D, sơn hoàn thiện và sản xuất loạt nhỏ.',
  body: `${pageHero({ crumbs: [['Dịch vụ']], label: 'Dịch vụ', h1: 'Một xưởng, <em>đủ mọi công đoạn.</em>', lead: 'Từ file thiết kế đến hộp giao hàng. Chọn dịch vụ bạn cần, hoặc kết hợp nhiều dịch vụ trong một đơn.', visual: 'gear' })}
<section class="band tight"><div class="wrap">${podBlock()}</div></section>
<section class="band light"><div class="wrap">${secHead('Tất cả dịch vụ', 'Chọn đúng công nghệ <em>cho từng sản phẩm.</em>')}<div class="cards">${services.map((s) => card(svcUrl(s), s.img, s.name, s.short)).join('')}</div></div></section>
${ctaBand()}`,
});
for (const s of services) {
  const rel = solutions.filter((x) => x.services.includes(s.slug));
  add(svcUrl(s), {
    title: s.name, cur: 'dich-vu', desc: s.short, ogImg: s.img,
    jsonld: { '@context': 'https://schema.org', '@type': 'Service', name: s.name, description: s.intro, provider: { '@type': 'LocalBusiness', name: 'TVT 3D Print Atelier', url: site.url }, areaServed: 'VN' },
    body: `${pageHero({ crumbs: [['Dịch vụ', 'dich-vu.html'], [s.name]], label: s.code, h1: esc(s.name), lead: s.intro, visual: s.img, actions: `<a class="btn solid" href="lien-he.html?dich-vu=${encodeURIComponent(s.name)}">Nhận báo giá ${ARR}</a><a class="btn" href="bao-gia.html">Ước tính giá</a>` })}
<section class="band light"><div class="wrap">${secHead('Điểm nổi bật', 'Vì sao chọn <em>' + esc(s.name.toLowerCase()) + '</em> tại TVT')}
  <div class="feat">${s.features.map((f) => `<div><h3>${esc(f[0])}</h3><p>${esc(f[1])}</p></div>`).join('')}</div></div></section>
<section class="band light alt"><div class="wrap two">
  <div><p class="label">Thông số</p><dl class="specs" style="margin-top:20px">${s.specs.map((x) => `<div><dt>${esc(x[0])}</dt><dd>${esc(x[1])}</dd></div>`).join('')}</dl></div>
  <div><p class="label">Thường dùng cho</p><ul class="bullets" style="margin-top:20px">${s.uses.map((u) => `<li>${esc(u)}</li>`).join('')}</ul></div>
</div></section>
<section class="band light"><div class="wrap">${secHead('Quy trình', 'Đặt in <em>trong sáu bước.</em>')}${stepsGrid()}</div></section>
${rel.length ? `<section class="band"><div class="wrap">${secHead('Giải pháp liên quan', 'Dịch vụ này <em>phục vụ ai.</em>')}${cards(rel.map((r) => card(solUrl(r), r.img, r.name, r.title)))}</div></section>` : ''}
<section class="band light alt"><div class="wrap">${secHead('Dịch vụ khác', 'Kết hợp để <em>hoàn thiện sản phẩm.</em>')}<div class="cards">${services.filter((x) => x !== s).slice(0, 3).map((x) => card(svcUrl(x), x.img, x.name, x.short)).join('')}</div></div></section>
${ctaBand()}`,
  });
}

// Giải pháp
add('giai-phap.html', {
  title: 'Giải pháp', cur: 'giai-phap', desc: 'Giải pháp in 3D cho seller TMĐT, nghệ sĩ, doanh nghiệp, kỹ sư và kiến trúc sư.',
  body: `${pageHero({ crumbs: [['Giải pháp']], label: 'Giải pháp', h1: 'Mỗi người làm nghề <em>một cách in riêng.</em>', lead: 'TVT điều chỉnh vật liệu, quy trình và cách giao hàng theo đúng mô hình kinh doanh của bạn.', visual: 'vase2' })}
<section class="band light"><div class="wrap">${cards(solutions.map((s) => card(solUrl(s), s.img, s.name, s.title)))}</div></section>
${ctaBand()}`,
});
for (const s of solutions) {
  const svcs = services.filter((x) => s.services.includes(x.slug));
  add(solUrl(s), {
    title: s.name, cur: 'giai-phap', desc: `${s.title}. ${s.desc}`, ogImg: s.img,
    body: `${pageHero({ crumbs: [['Giải pháp', 'giai-phap.html'], [s.name]], label: s.name, h1: esc(s.title), lead: s.desc, visual: s.img, actions: `<a class="btn solid" href="lien-he.html">Tư vấn miễn phí ${ARR}</a>` })}
<section class="band light"><div class="wrap two">
  <div><p class="label">Bạn đang gặp</p><ul class="bullets x" style="margin-top:20px">${s.pain.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
  <div><p class="label">TVT giải quyết</p><ul class="bullets" style="margin-top:20px">${s.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
</div></section>
<section class="band light alt"><div class="wrap two">
  <div class="big-stat"><strong>${esc(s.stat[0])}</strong><span>${esc(s.stat[1])}</span></div>
  <div style="display:grid;gap:14px"><p class="label">Sản phẩm tiêu biểu</p><div class="chips">${s.products.map((x) => `<span>${esc(x)}</span>`).join('')}</div></div>
</div></section>
<section class="band"><div class="wrap">${secHead('Dịch vụ sử dụng', 'Ghép từ <em>những dịch vụ này.</em>')}<div class="cards">${svcs.map((x) => card(svcUrl(x), x.img, x.name, x.short)).join('')}</div></div></section>
${s.slug === 'seller-tmdt' ? `<section class="band light"><div class="wrap">${secHead('Gói hợp tác', 'Bắt đầu <em>không mất phí.</em>')}${plansBlock()}</div></section>` : ''}
${ctaBand()}`,
  });
}

// Tác phẩm
add('tac-pham.html', {
  title: 'Tác phẩm', cur: 'tac-pham', desc: 'Bộ sưu tập sản phẩm in 3D tại xưởng TVT: decor, art toy, quà tặng, chi tiết kỹ thuật và mô hình kiến trúc.',
  body: `${pageHero({ crumbs: [['Tác phẩm']], label: 'Tác phẩm', h1: 'Ra lò tại <em>xưởng TVT.</em>', lead: 'Một phần các sản phẩm TVT đã in và hoàn thiện. Lọc theo lĩnh vực để xem sản phẩm gần với nhu cầu của bạn.' })}
<section class="band tight"><div class="wrap">
  <div class="filters" id="filters" role="group" aria-label="Lọc theo lĩnh vực">${galleryCats.map(([k, l], i) => `<button data-cat="${k}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div>
  ${galGrid(gallery, 2)}
  <p class="gal-note">Ảnh render minh hoạ. Thay bằng ảnh chụp sản phẩm thật trong <span class="mono">public/assets/img/</span>.</p>
</div></section>
${ctaBand('Muốn sản phẩm tiếp theo <em class="pearl">là của bạn?</em>')}`,
});

// Vật liệu
add('vat-lieu.html', {
  title: 'Vật liệu', cur: 'vat-lieu', desc: 'So sánh vật liệu in 3D tại TVT: PLA, PETG, ASA, TPU, nhựa sợi carbon và các loại resin.',
  body: `${pageHero({ crumbs: [['Vật liệu']], label: 'Vật liệu', h1: 'Chất liệu quyết định <em>cảm giác cầm trên tay.</em>', lead: 'Mỗi vật liệu có thế mạnh riêng về độ chi tiết, độ bền và chịu nhiệt. Bảng dưới giúp bạn chọn nhanh.', visual: 'knot' })}
<section class="band light"><div class="wrap">${matTable()}</div></section>
<section class="band light alt"><div class="wrap">${secHead('Ghi chú', 'Hiểu thêm về <em>từng vật liệu.</em>')}<div class="mat-notes">${materials.map((m) => `<div><b>${esc(m.n)}</b><p>${esc(m.note)}</p></div>`).join('')}</div>
<p style="margin-top:32px"><a class="link" href="${artUrl(articles[1])}">Đọc hướng dẫn chọn vật liệu</a></p></div></section>
${ctaBand()}`,
});

// Báo giá
add('bao-gia.html', {
  title: 'Báo giá', cur: 'bao-gia', desc: 'Ước tính chi phí in 3D trong 10 giây theo kích thước, vật liệu, độ đặc, hoàn thiện và số lượng. Xem các gói hợp tác của TVT.',
  body: `${pageHero({ crumbs: [['Báo giá']], label: 'Báo giá', h1: 'Ước tính chi phí <em>trong mười giây.</em>', lead: 'Kéo thanh trượt để xem giá tham khảo. Báo giá chính thức được gửi trong 2 giờ làm việc sau khi kỹ sư xem file.' })}
<section class="band tight"><div class="wrap">${quoteBlock()}</div></section>
<section class="band light"><div class="wrap">${secHead('Gói hợp tác', 'Bắt đầu từ một chiếc, <em>lớn lên cùng TVT.</em>')}${plansBlock()}</div></section>
<section class="band light alt"><div class="wrap two">
  <div><p class="label">Giá phụ thuộc vào</p><ul class="bullets" style="margin-top:20px"><li>Thể tích nhựa thực tế và độ đặc bên trong</li><li>Vật liệu và độ dày lớp in</li><li>Mức hoàn thiện: thô, chà mịn hay sơn tay</li><li>Số lượng: giảm 15% từ 10 chiếc, 28% từ 50, 40% từ 200</li></ul></div>
  <div><p class="label">Chiết khấu theo số lượng</p><dl class="specs" style="margin-top:20px"><div><dt>1 – 9</dt><dd>Giá gốc</dd></div><div><dt>10 – 49</dt><dd>−15%</dd></div><div><dt>50 – 199</dt><dd>−28%</dd></div><div><dt>200+</dt><dd>−40%</dd></div></dl></div>
</div></section>
${ctaBand()}`,
});

// Quy trình
add('quy-trinh.html', {
  title: 'Quy trình', cur: '', desc: 'Quy trình đặt in 3D tại TVT trong 6 bước: gửi file, báo giá, duyệt mẫu, sản xuất, QC và giao hàng.',
  body: `${pageHero({ crumbs: [['Quy trình']], label: 'Quy trình', h1: 'Sáu bước, <em>minh bạch từ đầu đến cuối.</em>', lead: 'Bạn luôn biết đơn hàng đang ở đâu. Mỗi bước có thời gian cam kết và ảnh cập nhật qua Zalo.' })}
<section class="band light"><div class="wrap">${stepsGrid()}</div></section>
<section class="band light alt"><div class="wrap two">
  <div><p class="label">Bạn cần chuẩn bị</p><ul class="bullets" style="margin-top:20px"><li>File 3D (STL, 3MF, OBJ, STEP) hoặc ảnh tham khảo</li><li>Kích thước mong muốn, tính bằng milimét</li><li>Công dụng: trưng bày, chịu lực, để ngoài trời</li><li>Số lượng và thời hạn cần hàng</li></ul><p style="margin-top:24px"><a class="link" href="${artUrl(articles[0])}">Hướng dẫn chuẩn bị file in</a></p></div>
  <div><p class="label">Thời gian tham khảo</p><dl class="specs" style="margin-top:20px"><div><dt>Báo giá</dt><dd>Trong 2 giờ làm việc</dd></div><div><dt>Thiết kế 3D</dt><dd>1 – 5 ngày</dd></div><div><dt>In mẫu</dt><dd>24 – 72 giờ</dd></div><div><dt>Sơn hoàn thiện</dt><dd>Thêm 1 – 3 ngày</dd></div><div><dt>Giao hàng</dt><dd>1 – 4 ngày</dd></div></dl></div>
</div></section>
${ctaBand()}`,
});

// Chính sách
add('chinh-sach.html', {
  title: 'Chính sách', cur: '', desc: 'Chính sách bảo mật, đổi trả, vận chuyển, thanh toán, huỷ đơn, cam kết chất lượng, điều khoản và quyền riêng tư của TVT.',
  body: `${pageHero({ crumbs: [['Chính sách']], label: 'Chính sách', h1: 'Rõ ràng <em>trước khi bạn đặt đơn.</em>', lead: 'Mọi cam kết của TVT về bảo mật, chất lượng, giao hàng và thanh toán.' })}
<section class="band light"><div class="wrap"><div class="pol-list">${policies.map((p) => `<a href="${polUrl(p)}"><span><b>${esc(p.name)}</b><small>${esc(p.short)}</small></span>${ARR}</a>`).join('')}</div></div></section>
${ctaBand()}`,
});
for (const p of policies) {
  add(polUrl(p), {
    title: p.name, cur: '', desc: `${p.name} của TVT 3D Print Atelier. ${p.short}`,
    body: `${pageHero({ crumbs: [['Chính sách', 'chinh-sach.html'], [p.name]], label: 'Chính sách', h1: esc(p.name), lead: p.short })}
<section class="band light"><div class="wrap doc">
  <nav class="toc" aria-label="Các chính sách"><p class="label">Chính sách</p>${policies.map((x) => `<a href="${polUrl(x)}"${x === p ? ' aria-current="page"' : ''}>${esc(x.name)}</a>`).join('')}</nav>
  <article class="prose"><p class="meta">Cập nhật: 01/11/${YEAR}</p>${p.body.map(([h, items]) => `<section><h2>${esc(h)}</h2>${items.length > 1 ? `<ul>${items.map((i) => `<li>${fill(i)}</li>`).join('')}</ul>` : `<p>${fill(items[0])}</p>`}</section>`).join('')}
  <section><h2>Liên hệ</h2><p>Có thắc mắc về chính sách? Gọi hoặc nhắn Zalo ${ph(site.phone, 'số điện thoại')}, email ${ph(site.email, 'email')}.</p></section></article>
</div></section>`,
  });
}

// FAQ
add('faq.html', {
  title: 'Hỏi đáp', cur: '', desc: 'Câu hỏi thường gặp về đặt in 3D, Print on Demand, vật liệu, chất lượng, giao hàng và thanh toán tại TVT.',
  jsonld: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.flatMap((g) => g[1]).map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  body: `${pageHero({ crumbs: [['Hỏi đáp']], label: 'Hỏi đáp', h1: 'Những điều <em>bạn hay hỏi.</em>', lead: 'Chưa thấy câu hỏi của bạn? Nhắn Zalo, kỹ sư trả lời trong giờ làm việc.' })}
<section class="band light"><div class="wrap faq-groups">${faq.map(([g, items]) => `<div class="faq-group"><p class="label">${esc(g)}</p>${faqAcc(items)}</div>`).join('')}</div></section>
${ctaBand()}`,
});

// Kiến thức
add('kien-thuc.html', {
  title: 'Kiến thức', cur: 'kien-thuc', desc: 'Hướng dẫn và kiến thức in 3D: chuẩn bị file, chọn vật liệu, mô hình Print on Demand.',
  body: `${pageHero({ crumbs: [['Kiến thức']], label: 'Kiến thức', h1: 'Hiểu in 3D <em>để đặt in đúng.</em>', lead: 'Hướng dẫn ngắn giúp bạn chuẩn bị file, chọn vật liệu và bắt đầu bán hàng với POD.' })}
<section class="band light"><div class="wrap"><div class="posts">${articles.map((a) => card(artUrl(a), a.img, a.title, a.excerpt, `${fmtDate(a.date)} · ${a.read}`)).join('')}</div></div></section>
${ctaBand()}`,
});
for (const a of articles) {
  add(artUrl(a), {
    title: a.title, cur: 'kien-thuc', desc: a.excerpt, ogImg: a.img,
    jsonld: { '@context': 'https://schema.org', '@type': 'Article', headline: a.title, datePublished: a.date, author: { '@type': 'Organization', name: 'TVT 3D Print Atelier' } },
    body: `${pageHero({ crumbs: [['Kiến thức', 'kien-thuc.html'], [a.title]], label: `${fmtDate(a.date)} · ${a.read} đọc`, h1: esc(a.title), lead: a.excerpt, visual: a.img })}
<section class="band light"><div class="wrap doc">
  <nav class="toc" aria-label="Bài viết khác"><p class="label">Bài viết</p>${articles.map((x) => `<a href="${artUrl(x)}"${x === a ? ' aria-current="page"' : ''}>${esc(x.title)}</a>`).join('')}</nav>
  <article class="prose">${a.body.map(([h, items]) => `<section><h2>${esc(h)}</h2>${items.length > 1 ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : `<p>${esc(items[0])}</p>`}</section>`).join('')}</article>
</div></section>
${ctaBand()}`,
  });
}

// Về chúng tôi
add('ve-chung-toi.html', {
  title: 'Về chúng tôi', cur: 've-chung-toi', desc: 'TVT là xưởng in 3D theo yêu cầu, kết hợp kỹ thuật in chính xác với tay nghề hoàn thiện thủ công.',
  body: `${pageHero({ crumbs: [['Về chúng tôi']], label: 'Về TVT', h1: 'Nơi kỹ thuật <em>gặp nghệ thuật.</em>', lead: 'TVT là xưởng in 3D theo yêu cầu. Chúng tôi kết hợp máy in chính xác với tay nghề hoàn thiện thủ công, để mỗi sản phẩm vừa đúng kỹ thuật vừa có hồn.', visual: 'armillary' })}
<section class="band light"><div class="wrap">
  <div class="facts" style="margin-top:0"><div><strong>0,03 mm</strong><span>Lớp in mỏng nhất</span></div><div><strong>24/7</strong><span>Dàn máy vận hành</span></div><div><strong>12+</strong><span>Vật liệu sẵn có</span></div><div><strong>63</strong><span>Tỉnh thành giao hàng</span></div></div>
</div></section>
<section class="band light alt"><div class="wrap">${secHead('Giá trị', 'Ba điều <em>TVT giữ vững.</em>')}
  <div class="values"><div><h3>Chính xác</h3><p>Mỗi đơn được kiểm kích thước và chụp ảnh nghiệm thu. Dung sai được cam kết bằng văn bản.</p></div><div><h3>Tận tâm</h3><p>Kỹ sư tư vấn vật liệu theo đúng công dụng, sửa file miễn phí với lỗi nhỏ, cập nhật tiến độ từng bước.</p></div><div><h3>Bảo mật</h3><p>File của bạn chỉ dùng cho đơn của bạn. Ký NDA khi cần, không bao giờ in lại cho người khác.</p></div></div>
</div></section>
<section class="band"><div class="wrap two">
  <div><p class="label">Xưởng</p><h2 style="margin-top:18px">Ghé thăm <em>xưởng TVT.</em></h2><p class="lead" style="margin-top:20px">Đặt lịch trước để xem máy in, mẫu vật liệu và trao đổi trực tiếp với kỹ sư.</p></div>
  <dl class="c-list" style="margin-top:0"><div><dt>Địa chỉ</dt><dd>${ph(site.address, 'địa chỉ xưởng')}</dd></div><div><dt>Giờ làm</dt><dd>${esc(site.hours)}</dd></div><div><dt>Hotline</dt><dd>${ph(site.phone, 'số điện thoại')}</dd></div></dl>
</div></section>
${ctaBand()}`,
});

// Liên hệ
const svcOptions = services.map((s) => `<option>${esc(s.name)}</option>`).join('') + '<option>Quà tặng doanh nghiệp</option><option>Khác</option>';
const zaloLink = site.zalo ? `<a class="btn" id="bZalo" href="https://zalo.me/${esc(site.zalo)}" target="_blank" rel="noopener">Mở Zalo</a>` : '';
add('lien-he.html', {
  title: 'Liên hệ', cur: 'lien-he', desc: 'Liên hệ TVT để nhận báo giá in 3D trong 2 giờ làm việc. Gửi file hoặc mô tả ý tưởng qua Zalo, email.',
  body: `${pageHero({ crumbs: [['Liên hệ']], label: 'Liên hệ', h1: 'Có ý tưởng? <em class="pearl">Hãy cho nó hình hài.</em>', lead: 'Điền vài dòng mô tả, trang sẽ tạo sẵn bản brief để bạn gửi qua Zalo hoặc email kèm file. Báo giá trong 2 giờ làm việc.' })}
<section class="band tight"><div class="wrap contact">
  <div><p class="label">Thông tin</p>
    <dl class="c-list"><div><dt>Hotline / Zalo</dt><dd>${ph(site.phone, 'số điện thoại')}</dd></div><div><dt>Email</dt><dd>${ph(site.email, 'email liên hệ')}</dd></div><div><dt>Xưởng</dt><dd>${ph(site.address, 'địa chỉ xưởng')}</dd></div><div><dt>Giờ làm</dt><dd>${esc(site.hours)}</dd></div></dl></div>
  <form class="brief" id="brief" novalidate data-email="${esc(site.email)}">
    <div class="row"><label for="bName">Tên của bạn<input type="text" id="bName" autocomplete="name" placeholder="Nguyễn Văn A"></label><label for="bPhone">Số Zalo<input type="tel" id="bPhone" autocomplete="tel" placeholder="09xx xxx xxx"></label></div>
    <div class="row"><label for="bSvc">Dịch vụ<select id="bSvc">${svcOptions}</select></label><label for="bQty">Số lượng dự kiến<input type="number" id="bQty" min="1" value="1"></label></div>
    <label for="bDesc">Mô tả sản phẩm<textarea id="bDesc" placeholder="Ví dụ: tượng mèo cao 12 cm, resin, sơn màu cam, cần trong 5 ngày."></textarea></label>
    <p id="bErr" class="err" hidden>Vui lòng điền tên và số Zalo để TVT liên hệ lại.</p>
    <button class="btn solid" type="submit">Tạo brief ${ARR}</button>
    <div class="brief-out" id="bOut" hidden><b style="font-weight:500">Brief đã sẵn sàng. Sao chép rồi gửi qua Zalo hoặc email, nhớ đính kèm file thiết kế.</b><pre id="bText"></pre>
      <div class="acts"><button class="btn" type="button" id="bCopy">Sao chép brief</button>${zaloLink}${site.email ? '<a class="btn" id="bMail" href="#">Gửi email</a>' : ''}</div></div>
  </form>
</div></section>
<section class="band light"><div class="wrap">${secHead('Trước khi gửi', 'Câu hỏi <em>thường gặp.</em>')}${faqAcc(faq[0][1])}</div></section>`,
});

// 404
add('404.html', {
  title: 'Không tìm thấy trang', cur: '', desc: 'Trang bạn tìm không tồn tại.',
  body: `<section class="wrap nf"><p class="label">Lỗi 404</p><h1><em class="pearl">404</em></h1><p class="lead">Trang này chưa được in ra. Có thể đường dẫn đã thay đổi hoặc không còn tồn tại.</p><p><a class="btn solid" href="index.html">Về trang chủ ${ARR}</a></p></section>`,
});

/* ---------------- Write ---------------- */
for (const f of readdirSync(OUT)) if (f.endsWith('.html')) unlinkSync(join(OUT, f));
for (const p of pages) writeFileSync(join(OUT, p.file), layout(p));
const urls = pages.filter((p) => p.file !== '404.html').map((p) => `  <url><loc>${site.url}/${p.file === 'index.html' ? '' : p.file}</loc></url>`).join('\n');
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);
console.log(`Đã sinh ${pages.length} trang vào public/`);
