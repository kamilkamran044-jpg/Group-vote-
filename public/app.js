(function () {
  const $ = id => document.getElementById(id);
  const m = location.pathname.match(/^\/p\/([a-z0-9]+)$/i);
  const pollId = m ? m[1] : null;
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const store = {
    get(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  };

  async function api(url, body) {
    const r = await fetch(url, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : undefined);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Kuch masla hua, dobara try karein.');
    return j;
  }

  /* ---------- CREATE ---------- */
  function addOptRow(val) {
    const row = el('div', 'optrow');
    const inp = el('input'); inp.type = 'text'; inp.maxLength = 80; inp.placeholder = 'Option'; inp.value = val || '';
    inp.setAttribute('aria-label', 'Option');
    const del = el('button', 'ghost', '✕'); del.type = 'button'; del.setAttribute('aria-label', 'Remove option');
    del.onclick = () => { if ($('opts').children.length > 2) row.remove(); };
    row.append(inp, del); $('opts').append(row);
  }
  function initCreate() {
    $('create').classList.remove('hidden');
    addOptRow(); addOptRow();
    $('addOpt').onclick = () => { if ($('opts').children.length < 12) addOptRow(); };
    $('createForm').onsubmit = async e => {
      e.preventDefault();
      $('createErr').textContent = '';
      $('createBtn').disabled = true;
      try {
        const options = [...$('opts').querySelectorAll('input')].map(i => i.value);
        const { id } = await api('/api/polls', { title: $('title').value, description: $('desc').value, options });
        location.href = '/p/' + id;
      } catch (err) {
        $('createErr').textContent = err.message;
        $('createBtn').disabled = false;
      }
    };
  }

  /* ---------- POLL ---------- */
  let current = null, picks = {};
  function renderQuestions() {
    const box = $('questions'); box.textContent = '';
    current.options.forEach((label, i) => {
      const q = el('div', 'q'); q.append(el('div', 'name', label));
      const seg = el('div', 'seg');
      [['yes', 'Yes', 'y'], ['maybe', 'Maybe', 'm'], ['no', 'No', 'n']].forEach(([val, txt, cls]) => {
        const b = el('button', cls, txt); b.type = 'button';
        b.setAttribute('aria-pressed', picks[i] === val ? 'true' : 'false');
        b.onclick = () => { picks[i] = val; renderQuestions(); };
        seg.append(b);
      });
      q.append(seg); box.append(q);
    });
  }
  function renderResults() {
    $('pTitle').textContent = current.title;
    $('pDesc').textContent = current.description || '';
    $('pDesc').classList.toggle('hidden', !current.description);
    const n = current.votes.length;
    $('count').textContent = n ? '· ' + n + (n === 1 ? ' vote' : ' votes') : '';
    const box = $('results'); box.textContent = '';
    if (!n) box.append(el('p', 'sub', 'No votes yet. Be the first!'));
    const order = current.totals.map((t, i) => ({ t, i })).sort((a, b) => b.t.score - a.t.score);
    if (n) order.forEach(({ t, i }) => {
      const win = current.winners.includes(i);
      const r = el('div', 'res' + (win ? ' win' : ''));
      const top = el('div', 'top'); top.append(el('span', null, t.label));
      if (win) top.append(el('span', 'badge', current.winners.length > 1 ? 'Tied lead' : 'Best choice'));
      r.append(top, el('div', 'meta', t.yes + ' yes · ' + t.maybe + ' maybe · ' + t.no + ' no'));
      const bar = el('div', 'bar');
      [['yes', 'var(--yes)'], ['maybe', 'var(--maybe)'], ['no', 'var(--no)']].forEach(([k, c]) => {
        const s = el('i'); s.style.width = (t[k] / n * 100) + '%'; s.style.background = c; bar.append(s);
      });
      r.append(bar); box.append(r);
    });
    $('voters').textContent = n ? 'Voted: ' + current.votes.map(v => v.name).join(', ') : '';
  }
  async function initPoll() {
    $('poll').classList.remove('hidden');
    $('shareLink').value = location.href;
    $('shareLink').onclick = e => e.target.select();
    $('copyBtn').onclick = async () => {
      try { await navigator.clipboard.writeText(location.href); }
      catch (_) { $('shareLink').select(); }
      $('copyBtn').textContent = 'Copied!';
      setTimeout(() => { $('copyBtn').textContent = 'Copy'; }, 1500);
    };
    try { current = await api('/api/polls/' + pollId); }
    catch (err) {
      $('poll').textContent = '';
      const c = el('div', 'card'); c.append(el('p', null, err.message));
      const a = el('a', null, 'Create a new poll'); a.href = '/'; c.append(a);
      $('poll').append(c); return;
    }
    $('vname').value = store.get('gv_name');
    renderQuestions(); renderResults();
    $('voteForm').onsubmit = async e => {
      e.preventDefault(); $('voteErr').textContent = ''; $('voteBtn').disabled = true;
      try {
        store.set('gv_name', $('vname').value.trim());
        current = await api('/api/polls/' + pollId + '/vote', { name: $('vname').value, answers: picks });
        renderResults(); $('voteBtn').textContent = 'Update my vote';
        $('results').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) { $('voteErr').textContent = err.message; }
      $('voteBtn').disabled = false;
    };
    // returning voter: load their earlier answers when they type their name
    $('vname').addEventListener('change', () => {
      const v = current.votes.find(v => v.name.toLowerCase() === $('vname').value.trim().toLowerCase());
      if (v) { picks = Object.assign({}, v.answers); renderQuestions(); $('voteBtn').textContent = 'Update my vote'; }
    });
    // keep results live
    setInterval(async () => {
      try { current = await api('/api/polls/' + pollId); renderResults(); } catch (_) {}
    }, 10000);
  }

  if (pollId) initPoll(); else initCreate();
})();
