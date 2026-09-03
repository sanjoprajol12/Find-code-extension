# 📍 Click to Code Inspector Extension

A Chrome/Edge browser extension that adds an **"Inspect Code"** floating button on your web pages. Clicking any element inspects its source Vue/React component and opens the file directly in **VS Code**, **Cursor**, or **WebStorm** at the exact line number!

---

## 🚀 Features

- **Floating Inspector Button**: A clean, stylish button on the webpage (toggleable).
- **Keyboard Shortcut**: Press `Alt + Shift + C` to toggle inspect mode anytime.
- **Smart Framework Detection**:
  - **Vue 3**: Inspects `__vueParentComponent` file paths and line numbers.
  - **Vue 2**: Inspects `__vue__` component file options.
  - **React**: Inspects React Fiber `_debugSource` (`fileName`, `lineNumber`).
  - **Vite / Devtool Attributes**: Supports `data-v-inspector`, `data-source-file`, etc.
- **Direct IDE Integration**: Opens `vscode://file/<path>:<line>`, `cursor://file/<path>`, `idea://file/`, etc.
- **Custom Project Root**: Configure project base path (`/var/www/html/consultancy/portal`) to seamlessly open relative source paths.

---

## 🛠️ How to Install in Chrome / Edge / Brave

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select the folder:
   `/home/prajwol/Claude/code-inspector-extension`

---

## ⚙️ Configuration

1. Click the extension icon in your browser toolbar.
2. Select your editor (VS Code, Cursor, WebStorm, Sublime).
3. Set your project root folder path (e.g. `/var/www/html/consultancy/portal`).
4. Click **Save Settings**.

---

## ⚡ Alternative Framework-Specific Plugin (Vite Projects)

If your project is built using **Vite + Vue**:
```bash
npm install -D vite-plugin-vue-inspector
```

Add it to your `vite.config.js`:
```js
import Inspector from 'vite-plugin-vue-inspector';

export default {
  plugins: [
    Inspector(),
    // ...other plugins
  ],
};
```
With `vite-plugin-vue-inspector`, pressing `Alt + Shift` on your dev page lets you click any element to jump straight to source in VS Code!
