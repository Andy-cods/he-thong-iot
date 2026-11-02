(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* Menu di động + dropdown */
  var menu = $('#menu'), mb = $('#menuBtn');
  if (menu && mb) {
    mb.addEventListener('click', function () {
      var o = menu.classList.toggle('open');
      mb.setAttribute('aria-expanded', String(o));
    });
  }
  $$('.dd-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var li = b.parentElement, o = !li.classList.contains('open');
      $$('.menu > li.open').forEach(function (x) { if (x !== li) x.classList.remove('open'); });
      li.classList.toggle('open', o);
      b.setAttribute('aria-expanded', String(o));
    });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.menu > li')) $$('.menu > li.open').forEach(function (x) { x.classList.remove('open'); });
  });

  /* Tab giải pháp (trang chủ) */
  var tabs = $('#solTabs');
  if (tabs) {
    var btns = $$('[role=tab]', tabs);
    var pick = function (i) {
      btns.forEach(function (b, j) {
        b.setAttribute('aria-selected', String(i === j));
        b.tabIndex = i === j ? 0 : -1;
        var p = document.getElementById(b.getAttribute('aria-controls'));
        if (p) p.hidden = i !== j;
      });
    };
    btns.forEach(function (b, i) { b.addEventListener('click', function () { pick(i); }); });
    tabs.addEventListener('keydown', function (e) {
      var i = btns.indexOf(document.activeElement); if (i < 0) return;
      var j = e.key === 'ArrowRight' ? (i + 1) % btns.length : e.key === 'ArrowLeft' ? (i - 1 + btns.length) % btns.length : -1;
      if (j >= 0) { e.preventDefault(); pick(j); btns[j].focus(); }
    });
    pick(0);
  }

  /* Bộ lọc tác phẩm */
  var filters = $('#filters');
  if (filters) {
    var fb = $$('button', filters);
    fb.forEach(function (b) {
      b.addEventListener('click', function () {
        var c = b.dataset.cat;
        fb.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        $$('#gal .work').forEach(function (w) { w.hidden = !(c === 'all' || w.dataset.cat === c); });
      });
    });
  }

  /* Ước tính báo giá */
  var qForm = $('#qForm');
  var lastEst = '';
  if (qForm) {
    var qSize = $('#qSize'), qMat = $('#qMat'), qQty = $('#qQty');
    var steps = [1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500, 1000];
    var vnd = function (v) { return (Math.round(v / 1000) * 1000).toLocaleString('vi-VN') + 'đ'; };
    var qty = function (v) { return steps[Math.round(v / 100 * (steps.length - 1))]; };
    var disc = function (q) { return q >= 200 ? 0.6 : q >= 50 ? 0.72 : q >= 10 ? 0.85 : 1; };
    var calc = function () {
      var s = +qSize.value, opt = qMat.options[qMat.selectedIndex];
      var rate = +opt.dataset.rate, resin = opt.dataset.type.indexOf('MSLA') >= 0;
      var fill = +$('[name=qFill]:checked').value, fin = +$('[name=qFin]:checked').value, q = qty(+qQty.value);
      $('#qSizeOut').textContent = s + ' cm';
      $('#qQtyOut').textContent = q.toLocaleString('vi-VN');
      var vol = Math.pow(s, 3) * fill, raw = Math.max(30000, vol * rate * fin * disc(q)), lo = raw * 0.85, hi = raw * 1.2;
      lastEst = vnd(lo) + ' – ' + vnd(hi) + ' / sp (' + opt.textContent + ', ' + s + ' cm, SL ' + q + ')';
      $('#qPrice').innerHTML = vnd(lo) + ' – ' + vnd(hi) + '<small>Tổng ' + q.toLocaleString('vi-VN') + ' sản phẩm: khoảng ' + vnd(lo * q) + ' – ' + vnd(hi * q) + '</small>';
      var hrs = Math.max(1, vol / (resin ? 40 : 14));
      var d = disc(q);
      $('#qBreak').innerHTML =
        '<div><span>Thể tích ước tính</span><span class="mono">' + Math.round(vol).toLocaleString('vi-VN') + ' cm³</span></div>' +
        '<div><span>Thời gian in / sản phẩm</span><span class="mono">~' + (hrs < 10 ? hrs.toFixed(1).replace('.', ',') : Math.round(hrs)) + ' giờ</span></div>' +
        '<div><span>Chiết khấu số lượng</span><span class="mono">' + (d < 1 ? '−' + Math.round((1 - d) * 100) + '%' : '—') + '</span></div>';
      try { sessionStorage.setItem('tvt-est', lastEst); } catch (e) {}
    };
    qForm.addEventListener('input', calc);
    calc();
  }

  /* Form brief liên hệ */
  var brief = $('#brief');
  if (brief) {
    var sp = new URLSearchParams(location.search);
    if (sp.get('dich-vu')) { var sel = $('#bSvc'); $$('option', sel).forEach(function (o) { if (o.value === sp.get('dich-vu')) sel.value = o.value; }); }
    brief.addEventListener('submit', function (e) {
      e.preventDefault();
      var n = $('#bName').value.trim(), p = $('#bPhone').value.trim();
      $('#bErr').hidden = !!(n && p);
      if (!n || !p) return;
      var est = lastEst; if (!est) { try { est = sessionStorage.getItem('tvt-est') || ''; } catch (e2) {} }
      var t = 'BRIEF IN 3D GỬI TVT\nTên: ' + n + '\nZalo: ' + p + '\nDịch vụ: ' + $('#bSvc').value + '\nSố lượng: ' + $('#bQty').value +
        '\nMô tả: ' + ($('#bDesc').value.trim() || '(chưa có)') + (est ? '\nƯớc tính đã xem: ' + est : '');
      $('#bText').textContent = t;
      var mail = $('#bMail'); if (mail && brief.dataset.email) mail.href = 'mailto:' + brief.dataset.email + '?subject=' + encodeURIComponent('Brief in 3D - ' + n) + '&body=' + encodeURIComponent(t);
      $('#bOut').hidden = false;
    });
    $('#bCopy').addEventListener('click', function () {
      var b = this, el = $('#bText');
      var sel = function () { var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Đã chọn sẵn, nhấn Ctrl+C'; };
      if (navigator.clipboard) navigator.clipboard.writeText(el.textContent).then(function () { b.textContent = 'Đã sao chép'; }, sel); else sel();
    });
  }
})();
