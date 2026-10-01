(function () {
  var m = location.pathname.match(/\/tenders\/t\/([0-9A-Z]{26})/);
  if (!m) return;
  var host = document.querySelector('.tdoc-wrap') || document.querySelector('main');
  if (!host || document.getElementById('tp-timeline')) return;
  var box = document.createElement('section');
  box.id = 'tp-timeline';
  box.setAttribute('aria-label', 'Notice timeline');
  box.style.cssText = 'margin:18px 0 24px;padding:16px;border:1px solid rgba(12,27,51,.12);border-radius:14px;background:#fff';
  host.insertBefore(box, host.children[2] || null);
  box.innerHTML = '<p style="margin:0;font-size:13px;color:#3D4A5C">Loading briefing and closing timeline\u2026</p>';
  function esc(s) {
    return String(s || '').replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }
  fetch('/api/tenders/' + m[1] + '/timeline').then(function (r) { return r.json(); }).then(function (d) {
    if (!d || !d.ok) {
      box.innerHTML = '<p style="margin:0;font-size:13px;color:#3D4A5C">Briefing timeline is not available on this notice yet. Dates above are what we hold.</p>';
      return;
    }
    var events = d.events || [];
    var dates = events.map(function (e) { return e.date; }).filter(Boolean).sort();
    var min = dates[0] ? Date.parse(dates[0]) : NaN;
    var max = dates[dates.length - 1] ? Date.parse(dates[dates.length - 1]) : NaN;
    var span = max - min;
    var html = '<p style="margin:0 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#A66708">This notice only</p>';
    html += '<h2 style="margin:0 0 8px;font-size:1.15rem">Briefing and closing timeline</h2>';
    html += '<p style="margin:0 0 14px;color:#3D4A5C;font-size:14px">' + (d.compulsory
      ? 'Compulsory briefing: miss the register and the bid is non-responsive. Work back from this date, not only the close.'
      : 'No compulsory briefing on the fields we hold. Confirm on the official pack.') + '</p>';
    html += '<ol style="list-style:none;margin:0;padding:0;display:grid;gap:10px">';
    events.forEach(function (e) {
      var pct = e.date && span > 0 ? Math.round(((Date.parse(e.date) - min) / span) * 100) : 8;
      html += '<li><div style="display:flex;justify-content:space-between;font-size:13px"><strong>' + esc(e.label) + '</strong><span>' + esc(e.date || 'Not on this notice') + '</span></div>';
      html += '<div style="height:8px;background:#e8eef5;border-radius:99px;margin:6px 0"><div style="height:8px;width:' + pct + '%;background:#0C6E63;border-radius:99px"></div></div>';
      html += '<p style="margin:0;font-size:13px;color:#3D4A5C">' + esc(e.detail) + '</p></li>';
    });
    html += '</ol><h3 style="margin:16px 0 8px;font-size:1rem">What this notice actually contains</h3><ul style="display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:0">';
    (d.coverage || []).forEach(function (c) {
      html += '<li style="font-size:13px;padding:4px 8px;border-radius:99px;background:' + (c.ok ? '#e7f6f3' : '#fde8e8') + '">' + (c.ok ? 'Held' : 'Missing') + ' \u00b7 ' + esc(c.label) + '</li>';
    });
    html += '</ul>';
    box.innerHTML = html;
  }).catch(function () {
    box.innerHTML = '<p style="margin:0;font-size:13px;color:#3D4A5C">Briefing timeline could not load. Closing and briefing dates above are still the fields we hold.</p>';
  });
})();
