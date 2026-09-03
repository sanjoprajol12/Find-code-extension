(function () {
  if (window.__CI_CONTENT_LOADED__) return;
  window.__CI_CONTENT_LOADED__ = true;

  // ─── Safe chrome API wrappers ─────────────────────────────────────────────────
  function safeStorageGet(keys, cb) {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) return cb({});
      chrome.storage.sync.get(keys, (items) => {
        if (chrome.runtime.lastError) return cb({});
        cb(items || {});
      });
    } catch (_) { cb({}); }
  }

  function safeGetURL(path) {
    try { return chrome.runtime.getURL(path); } catch (_) { return null; }
  }

  // ─── Inject injected.js into main page world ──────────────────────────────────
  const injectedSrc = safeGetURL('injected.js');
  if (injectedSrc) {
    const s = document.createElement('script');
    s.src = injectedSrc;
    (document.head || document.documentElement).appendChild(s);
  }

  // ─── State ────────────────────────────────────────────────────────────────────
  let active = false;
  let settings = {
    ideProtocol: 'vscode',
    projects: [],    // [{ root, pages, hosts[] }]
    autoOff: false
  };

  safeStorageGet(['ideProtocol', 'projects', 'autoOff', 'projectRoot', 'pagesFolder'], (items) => {
    settings.ideProtocol = items.ideProtocol || 'vscode';
    settings.autoOff     = items.autoOff || false;
    if (items.projects && items.projects.length) {
      settings.projects = items.projects;
    } else if (items.projectRoot) {
      // Migrate from old single-root format
      settings.projects = [{ root: items.projectRoot, pages: items.pagesFolder || '', hosts: [] }];
    }
  });

  // ─── UI Elements ──────────────────────────────────────────────────────────────
  const tooltip = document.createElement('div');
  tooltip.id = 'ci-tooltip';

  const fab = document.createElement('button');
  fab.id = 'ci-fab';
  fab.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span>Inspect Code</span>`;

  let highlightEl = null;

  function attachUI() {
    if (!document.body) return;
    if (!document.getElementById('ci-fab'))     document.body.appendChild(fab);
    if (!document.getElementById('ci-tooltip')) document.body.appendChild(tooltip);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachUI);
  } else {
    attachUI();
  }

  // ─── Toggle ───────────────────────────────────────────────────────────────────
  function setActive(val) {
    active = val;
    fab.classList.toggle('ci-active', active);
    fab.querySelector('span').textContent = active ? 'Stop Inspect' : 'Inspect Code';
    if (!active) {
      tooltip.style.display = 'none';
      clearHighlight();
    }
    safeStorageGet(['ideProtocol', 'projects', 'autoOff', 'projectRoot', 'pagesFolder'], (items) => {
      settings.ideProtocol = items.ideProtocol || 'vscode';
      settings.autoOff     = items.autoOff || false;
      if (items.projects && items.projects.length) {
        settings.projects = items.projects;
      } else if (items.projectRoot) {
        settings.projects = [{ root: items.projectRoot, pages: items.pagesFolder || '', hosts: [] }];
      }
      if (active && settings.projects.length === 0) {
        toast('⚠ No projects configured. Click the extension icon to add your project roots.', 'warn');
      }
    });
  }

  fab.addEventListener('click', (e) => { e.stopPropagation(); setActive(!active); });
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) { e.preventDefault(); setActive(!active); }
    if (e.key === 'Escape' && active) setActive(false);
  });

  // ─── Highlight ────────────────────────────────────────────────────────────────
  function highlight(el) {
    if (el === highlightEl) return;
    clearHighlight();
    if (!el || el === document.body || el === document.documentElement) return;
    highlightEl = el;
    el.setAttribute('data-ci-highlight', '');
  }
  function clearHighlight() {
    if (highlightEl) { highlightEl.removeAttribute('data-ci-highlight'); highlightEl = null; }
  }

  // ─── Mouse move ───────────────────────────────────────────────────────────────
  // Use a request counter to discard stale async responses (fixes "previous file name" bug)
  let reqId = 0;

  document.addEventListener('mousemove', (e) => {
    if (!active) return;
    if (e.target === fab || fab.contains(e.target) || e.target === tooltip) return;

    highlight(e.target);

    const id = ++reqId;
    window.postMessage({ type: 'CI_QUERY', action: 'hover', x: e.clientX, y: e.clientY, id }, '*');

    const tx = Math.min(e.clientX + 16, window.innerWidth - 270);
    tooltip.style.left = `${tx + window.scrollX}px`;
    tooltip.style.top  = `${e.clientY + 20 + window.scrollY}px`;
  }, true);

  // ─── Click ────────────────────────────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    if (!active) return;
    if (e.target === fab || fab.contains(e.target)) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const id = ++reqId;
    window.postMessage({ type: 'CI_QUERY', action: 'click', x: e.clientX, y: e.clientY, id }, '*');

    if (settings.autoOff) setActive(false);
  }, true);

  // ─── Message handler ──────────────────────────────────────────────────────────
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.type !== 'CI_RESULT') return;
    const { action, info, id } = e.data;

    // Discard stale responses (fixes tooltip showing previous element's name)
    if (id !== reqId) return;

    if (action === 'hover') {
      const resolvedPath = info?.file && hasSlash(info.file) ? resolvePath(info.file) : null;

      if (resolvedPath) {
        tooltip.innerHTML = `
          <span class="ci-fw">${escHtml(info.framework || 'Vue')}</span>
          <span class="ci-name">${escHtml(info.name || basename(resolvedPath))}</span>
          <span class="ci-path">${escHtml(basename(resolvedPath))}${info.line ? ':' + info.line : ''}</span>`;
        tooltip.title = resolvedPath;
        tooltip.style.display = 'flex';
      } else if (info?.name) {
        tooltip.innerHTML = `
          <span class="ci-fw">${escHtml(info.framework || 'Vue')}</span>
          <span class="ci-name">${escHtml(info.name)}</span>
          <span class="ci-path ci-warn">⚠ No exact path — install vite-plugin-vue-inspector</span>`;
        tooltip.style.display = 'flex';
      } else {
        tooltip.innerHTML = `<span class="ci-fw">HTML</span><span class="ci-path ci-warn">No Vue component found</span>`;
        tooltip.style.display = 'flex';
      }
    }

    if (action === 'click') {
      if (info?.file && hasSlash(info.file)) {
        openIDE(info);
      } else if (info?.name) {
        toast(`Detected: "${info.name}" — install vite-plugin-vue-inspector for exact file+line navigation.`, 'warn');
      } else {
        toast('No source location found for this element.', 'warn');
      }
    }
  });

  // ─── Project matching ─────────────────────────────────────────────────────────
  // Find the best matching project for the current page:
  // 1. First try hostname match
  // 2. Then try to find which project root the file path starts with
  // 3. Fallback: try all projects and return paths for each
  function findProject(rawFilePath) {
    if (!settings.projects || settings.projects.length === 0) return null;

    const hostname = window.location.hostname;
    const cleanedPath = (rawFilePath || '').replace(/\\/g, '/').replace(/^webpack:\/\/\/?/, '').replace(/^\.\//, '');

    // 1. Check if the raw file path already starts with a known project root
    for (const proj of settings.projects) {
      if (proj.root && cleanedPath.startsWith(proj.root)) {
        return proj;
      }
    }

    // 2. Match by hostname
    for (const proj of settings.projects) {
      if (proj.hosts && proj.hosts.length > 0) {
        if (proj.hosts.some(h => h.trim() === hostname || hostname.endsWith(h.trim()))) {
          return proj;
        }
      }
    }

    // 3. Fallback: return first project that has a root
    return settings.projects.find(p => p.root) || null;
  }

  // ─── Path resolution ──────────────────────────────────────────────────────────
  function resolvePath(raw) {
    const proj = findProject(raw);
    if (!proj) return null;

    let p = (raw || '').replace(/\\/g, '/').replace(/^webpack:\/\/\/?/, '').replace(/^\.\//, '');

    const root   = (proj.root  || '').replace(/\/$/, '');
    const folder = (proj.pages || '').replace(/^\//, '').replace(/\/$/, '');

    // Add .vue extension if missing
    if (p && !p.match(/\.[a-z]+$/i)) p = p + '.vue';

    if (p.startsWith('/')) {
      // Already starts with known project root → use as-is
      if (root && p.startsWith(root)) return p;
      // Relative path with leading slash (Inertia/webpack) → strip it
      p = p.substring(1);
    }

    // Strip leading hyphen from each segment (webpack module ID artifact)
    p = p.split('/').map(seg => seg.replace(/^-/, '')).join('/');

    // Prepend pages folder if path doesn't already include it or a known src prefix
    if (folder && !p.startsWith(folder) && !p.startsWith('src/') && !p.startsWith('resources/') && !p.startsWith('@')) {
      p = `${folder}/${p}`;
    }

    return root ? `${root}/${p}` : `/${p}`;
  }

  // ─── Open IDE ──────────────────────────────────────────────────────────────────
  function openIDE(info) {
    // Always re-read settings fresh right before opening
    safeStorageGet(['ideProtocol', 'projects', 'autoOff', 'projectRoot', 'pagesFolder'], (fresh) => {
      if (fresh.projects && fresh.projects.length) settings.projects = fresh.projects;
      else if (fresh.projectRoot) settings.projects = [{ root: fresh.projectRoot, pages: fresh.pagesFolder || '', hosts: [] }];
      settings.ideProtocol = fresh.ideProtocol || 'vscode';

      if (settings.projects.length === 0) {
        toast('⚠ No projects configured! Click the extension icon → add your Project Root → Save.', 'warn');
        return;
      }

      const path = resolvePath(info.file);
      if (!path) {
        toast('⚠ Could not resolve file path. Check your project settings.', 'warn');
        return;
      }

      const line  = info.line ? `:${info.line}` : ':1';
      const col   = info.col  ? `:${info.col}`  : '';
      const proto = settings.ideProtocol || 'vscode';

      let uri;
      if      (proto === 'vscode')  uri = `vscode://file${path}${line}${col}`;
      else if (proto === 'cursor')  uri = `cursor://file${path}${line}${col}`;
      else if (proto === 'sublime') uri = `subl://open?url=file://${path}&line=${info.line || 1}`;
      else if (proto === 'idea')    uri = `idea://open?file=${path}&line=${info.line || 1}`;
      else                          uri = `${proto}://file${path}${line}`;

      toast(`→ ${path}${line}`, 'ok');
      window.location.href = uri;
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function hasSlash(f) { return f && (f.includes('/') || f.includes('\\')); }
  function basename(p) { return (p || '').replace(/\\/g, '/').split('/').pop(); }
  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── Toast ────────────────────────────────────────────────────────────────────
  function toast(msg, type = 'ok') {
    const t = document.createElement('div');
    t.className = `ci-toast ci-toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('ci-toast-show'));
    setTimeout(() => { t.classList.remove('ci-toast-show'); setTimeout(() => t.remove(), 400); }, 3500);
  }
})();
