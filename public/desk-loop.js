(function () {
  /* Ethical habit loop: only rewards real work (open catalogue, fill a draft).
     Streak and completeness live on this device. No fake scores. */
  try {
    var today = new Date().toISOString().slice(0, 10);
    var raw = JSON.parse(localStorage.getItem('tp-desk') || '{}');
    if (raw.last !== today) {
      var yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      raw.streak = raw.last === yest ? (raw.streak || 0) + 1 : 1;
      raw.last = today;
      raw.days = (raw.days || 0) + 1;
      localStorage.setItem('tp-desk', JSON.stringify(raw));
    }
    var host = document.querySelector('.nav-inner') || document.querySelector('.nav');
    if (host && !document.getElementById('tp-desk-chip') && raw.streak > 1) {
      var chip = document.createElement('span');
      chip.id = 'tp-desk-chip';
      chip.style.cssText = 'font-size:12px;color:#cbd5e1;margin-left:10px;white-space:nowrap';
      chip.textContent = raw.streak + '-day desk';
      chip.title = 'Days in a row you opened Tenderpreneurs. Local only.';
      host.appendChild(chip);
    }
  } catch (e) {}

  function fillFromSample(input, targetName) {
    if (!input) return;
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var text = String(reader.result || '').slice(0, 20000);
        var ta = document.querySelector('[name="' + targetName + '"]');
        if (ta && text && !ta.value) ta.value = text;
        var note = document.createElement('p');
        note.className = 'pub-note';
        note.textContent = 'Loaded ' + f.name + ' as format sample. Edit before you advertise.';
        input.parentNode.appendChild(note);
      };
      reader.readAsText(f);
    });
  }
  fillFromSample(document.getElementById('sample-file'), 'description');
  fillFromSample(document.getElementById('review-file'), 'text');

  var create = document.getElementById('create-form');
  if (create && !document.getElementById('tp-complete')) {
    var bar = document.createElement('p');
    bar.id = 'tp-complete';
    bar.className = 'pub-note';
    create.appendChild(bar);
    function score() {
      var need = ['title', 'entity', 'description', 'closing_date', 'contact_email'];
      var n = need.filter(function (k) {
        var el = create.elements.namedItem(k);
        return el && String(el.value || '').trim();
      }).length;
      bar.textContent = 'Draft completeness ' + n + '/' + need.length + ' — finish the gap before you publish.';
    }
    create.addEventListener('input', score);
    score();
  }
})();
