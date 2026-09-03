(function () {
  // Inject Vue DevTools hook BEFORE Vue loads so __file metadata is preserved
  if (!window.__VUE_DEVTOOLS_GLOBAL_HOOK__) {
    window.__VUE_DEVTOOLS_GLOBAL_HOOK__ = {
      enabled: true,
      _buffer: [],
      _apps: new Map(),
      emit() {},
      on() {},
      once() {},
      off() {},
      appRecords: [],
      customInspectors: [],
      cleanupBuffer() {},
      registerApp(app) {
        this._apps.set(app, {});
        window.__VUE_INSPECTOR_APP__ = app;
      },
    };
  }

  if (window.__CODE_INSPECTOR_INJECTED__) return;
  window.__CODE_INSPECTOR_INJECTED__ = true;

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const SKIP_NAMES = new Set([
    'App', 'RouterView', 'RouterLink', 'KeepAlive', 'Transition', 'Teleport',
    'Suspense', 'component', 'Fragment', 'Inertia', 'InertiaHead', 'Link',
    'VApp', 'VMain', 'VLayout', 'VContainer', 'VRow', 'VCol', 'VSheet',
    'VThemeProvider', 'VLocaleProvider', 'VDefaults',
  ]);

  function isSkippable(name) {
    if (!name) return true;
    if (SKIP_NAMES.has(name)) return true;
    // Skip Vuetify base UI components (VBtn, VCard, VIcon, etc.)
    if (/^V[A-Z]/.test(name)) return true;
    return false;
  }

  // ─── Vue 3: Walk component fibre tree ──────────────────────────────────────

  function walkVue3Fiber(fiber) {
    let c = fiber;
    while (c) {
      const type = c.type || {};
      const file = type.__file;
      const name = type.__name || type.name || type.displayName;

      if (file && !file.includes('node_modules')) {
        return { file, name: name || fileBasename(file), line: null, framework: 'Vue 3' };
      }
      c = c.parent;
    }
    // Second pass: find first meaningful name
    c = fiber;
    while (c) {
      const type = c.type || {};
      const name = type.__name || type.name || type.displayName;
      if (name && !isSkippable(name)) {
        return { file: null, name, line: null, framework: 'Vue 3 (name only)' };
      }
      c = c.parent;
    }
    return null;
  }

  // ─── Inertia: read page component from DOM ─────────────────────────────────

  function getInertiaPage() {
    const el = document.querySelector('#app[data-page], [data-page]');
    if (el?.dataset?.page) {
      try { return JSON.parse(el.dataset.page); } catch (_) {}
    }
    if (window.__page) return window.__page;
    return null;
  }

  // ─── Main inspect function ──────────────────────────────────────────────────

  function inspectNode(node) {
    if (!node || node === document.body || node === document.documentElement) return null;

    // 1. data-v-inspector attribute (vite-plugin-vue-inspector)
    let el = node;
    while (el && el !== document.body) {
      if (el.dataset?.vInspector) {
        const [file, line, col] = el.dataset.vInspector.split(':');
        return { file, line: line || null, col: col || null, name: fileBasename(file), framework: 'Vite Inspector' };
      }
      el = el.parentElement;
    }

    // 2. Vue 3 — __vueParentComponent (dev mode always has __file)
    el = node;
    while (el && el !== document.body) {
      const comp = el.__vueParentComponent;
      if (comp) {
        const result = walkVue3Fiber(comp);
        if (result) return result;
        break;
      }
      el = el.parentElement;
    }

    // 3. Vue 3 app root (get active route component via router)
    const appEl = document.querySelector('#app');
    if (appEl?.__vue_app__) {
      const app = appEl.__vue_app__;
      const router = app.config?.globalProperties?.$router;
      if (router?.currentRoute?.value) {
        const matched = router.currentRoute.value.matched;
        if (matched?.length) {
          const lastComp = matched[matched.length - 1].components?.default;
          if (lastComp?.__file) {
            return { file: lastComp.__file, name: lastComp.__name || lastComp.name || fileBasename(lastComp.__file), line: null, framework: 'Vue Router' };
          }
        }
      }
    }

    // 4. Inertia page fallback
    const inertia = getInertiaPage();
    if (inertia?.component) {
      return { file: inertia.component + '.vue', name: fileBasename(inertia.component + '.vue'), line: null, framework: 'Inertia Page' };
    }

    // 5. Vue 2
    el = node;
    while (el && el !== document.body) {
      const vm = el.__vue__;
      if (vm) {
        const file = vm.$options?.__file;
        const name = vm.$options?.name || vm.$options?._componentTag;
        if (file && !file.includes('node_modules')) {
          return { file, name: name || fileBasename(file), line: null, framework: 'Vue 2' };
        }
      }
      el = el.parentElement;
    }

    return null;
  }

  function fileBasename(p) {
    return (p || '').split('/').pop();
  }

  // ─── Message bridge ─────────────────────────────────────────────────────────

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.type !== 'CI_QUERY') return;
    const { x, y, action, id } = e.data;
    const node = document.elementFromPoint(x, y);
    const info = inspectNode(node);
    window.postMessage({ type: 'CI_RESULT', action, info, x, y, id }, '*');
  });
})();
