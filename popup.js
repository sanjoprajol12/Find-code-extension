document.addEventListener('DOMContentLoaded', () => {
  const ideEl   = document.getElementById('ide');
  const listEl  = document.getElementById('projects-list');
  const addBtn  = document.getElementById('btn-add');
  const saveBtn = document.getElementById('save');
  const autoEl  = document.getElementById('autoOff');
  const savedEl = document.getElementById('saved');

  let projects = [];

  // ── Render project cards ──────────────────────────────────────────────────
  function render() {
    listEl.innerHTML = '';
    projects.forEach((proj, i) => {
      const card = document.createElement('div');
      card.className = 'project-card';
      card.innerHTML = `
        <div class="card-title">
          <span>Project #${i + 1}</span>
          <button class="btn-remove" data-i="${i}">Remove</button>
        </div>
        <div class="card-inputs">
          <div>
            <label>Root Path (absolute)</label>
            <input type="text" class="f-root" placeholder="/var/www/html/my-project" value="${escAttr(proj.root || '')}">
          </div>
          <div>
            <label>Pages / Views Sub-folder (relative)</label>
            <input type="text" class="f-pages" placeholder="src/views/pages  or  resources/ts/pages" value="${escAttr(proj.pages || '')}">
          </div>
          <div>
            <label>Hostname(s) — comma-separated (for auto-detection)</label>
            <input type="text" class="f-hosts" placeholder="portal.consultancy.local, student.consultancy.local" value="${escAttr((proj.hosts || []).join(', '))}">
          </div>
        </div>`;
      listEl.appendChild(card);

      card.querySelector('.btn-remove').addEventListener('click', () => {
        projects.splice(i, 1);
        render();
      });
    });
  }

  // ── Load settings ─────────────────────────────────────────────────────────
  chrome.storage.sync.get(['ideProtocol', 'projects', 'autoOff'], (items) => {
    if (items.ideProtocol) ideEl.value = items.ideProtocol;
    if (items.autoOff != null) autoEl.checked = items.autoOff;

    if (items.projects && items.projects.length) {
      projects = items.projects;
    } else {
      // Migrate from old single-root format
      chrome.storage.sync.get(['projectRoot', 'pagesFolder'], (old) => {
        if (old.projectRoot) {
          projects = [{ root: old.projectRoot, pages: old.pagesFolder || '', hosts: [] }];
        } else {
          projects = [{ root: '', pages: '', hosts: [] }];
        }
        render();
      });
      return;
    }
    render();
  });

  // ── Add project ───────────────────────────────────────────────────────────
  addBtn.addEventListener('click', () => {
    projects.push({ root: '', pages: '', hosts: [] });
    render();
    listEl.lastElementChild?.querySelector('.f-root')?.focus();
  });

  // ── Save ──────────────────────────────────────────────────────────────────
  saveBtn.addEventListener('click', () => {
    // Collect current card values
    const cards = listEl.querySelectorAll('.project-card');
    const saved = [];
    cards.forEach((card) => {
      const root  = card.querySelector('.f-root').value.trim().replace(/\/$/, '');
      const pages = card.querySelector('.f-pages').value.trim().replace(/^\//, '').replace(/\/$/, '');
      const hostsRaw = card.querySelector('.f-hosts').value.trim();
      const hosts = hostsRaw ? hostsRaw.split(',').map(h => h.trim()).filter(Boolean) : [];
      if (root) saved.push({ root, pages, hosts });
    });

    chrome.storage.sync.set({
      ideProtocol: ideEl.value,
      projects: saved,
      autoOff: autoEl.checked,
    }, () => {
      savedEl.style.display = 'block';
      setTimeout(() => { savedEl.style.display = 'none'; }, 2000);
    });
  });

  function escAttr(s) {
    return String(s).replace(/"/g, '&quot;');
  }
});
