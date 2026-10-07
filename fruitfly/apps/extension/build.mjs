// Multi-pass Vite build for the MV3 extension.
//   1. pages (side panel, popup, options, onboarding, offscreen) + ingest worker
//   2. background service worker (single ES module)
//   3. page-bridge.js and overlay.js as IIFEs (injected with executeScript)
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, process.env.FF_TEST ? 'dist-test' : 'dist');
const watch = process.argv.includes('--watch');
const isTest = !!process.env.FF_TEST;
const r = (...p) => path.join(root, ...p);
const alias = { '@ff/fly': path.resolve(root, '../../packages/ui/src/fly') };
const define = { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production'), __FF_TEST__: JSON.stringify(isTest) };
const common = { root, configFile: false, logLevel: 'warn', define, resolve: { alias } };
const minify = watch ? false : 'esbuild';

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// 1. pages
await build({
  ...common,
  plugins: [react()],
  base: './',
  publicDir: r('public'),
  worker: { format: 'es', rollupOptions: { output: { entryFileNames: 'assets/[name]-[hash].js' } } },
  build: {
    outDir: out, emptyOutDir: false, minify, sourcemap: watch, target: 'es2023', chunkSizeWarningLimit: 4000, modulePreload: false,
    rollupOptions: { input: { sidepanel: r('sidepanel.html'), popup: r('popup.html'), options: r('options.html'), onboarding: r('onboarding.html'), offscreen: r('offscreen.html') } },
  },
});

// 2. background
const stub = r('src/stubs/empty.ts');
await build({
  ...common,
  resolve: { alias: { ...alias, 'pdfjs-dist/legacy/build/pdf.mjs': stub, 'pdfjs-dist': stub, mammoth: stub } },
  plugins: [],
  build: {
    outDir: out, emptyOutDir: false, minify, sourcemap: watch, target: 'es2023', copyPublicDir: false,
    lib: { entry: r('src/background/index.ts'), formats: ['es'], fileName: () => 'background.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});

// 3. injected scripts
for (const [name, entry] of [['page-bridge', 'src/page/bridge.ts'], ['overlay', 'src/page/overlay.ts']]) {
  await build({
    ...common,
    plugins: [],
    build: {
      outDir: out, emptyOutDir: false, minify, sourcemap: false, target: 'es2023', copyPublicDir: false,
      lib: { entry: r(entry), formats: ['iife'], name: `__ff_${name.replace('-', '_')}`, fileName: () => `${name}.js` },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
}

// manifest
const connect = ['http://localhost:*', 'http://127.0.0.1:*', 'https://api.anthropic.com', 'https://generativelanguage.googleapis.com'];
const manifest = {
  manifest_version: 3,
  name: 'FruitFly',
  version: JSON.parse(fs.readFileSync(r('package.json'), 'utf8')).version,
  description: 'A small, quiet agent that works in your browser. Your notes and keys stay on your device.',
  minimum_chrome_version: '116',
  icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  action: { default_title: 'FruitFly', default_popup: 'popup.html', default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' } },
  side_panel: { default_path: 'sidepanel.html' },
  options_ui: { page: 'options.html', open_in_tab: true },
  background: { service_worker: 'background.js', type: 'module' },
  commands: { 'open-panel': { suggested_key: { default: 'Alt+Shift+F' }, description: 'Open FruitFly' } },
  permissions: ['storage', 'unlimitedStorage', 'sidePanel', 'scripting', 'tabs', 'offscreen', 'alarms', 'contextMenus'],
  optional_host_permissions: ['http://*/*', 'https://*/*'],
  ...(isTest ? { host_permissions: ['http://localhost/*', 'http://127.0.0.1/*'] } : {}),
  content_security_policy: { extension_pages: `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' ${connect.join(' ')}; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:` },
  web_accessible_resources: [],
};
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
const lic = r('../../THIRD_PARTY_LICENSES.md');
if (fs.existsSync(lic)) fs.copyFileSync(lic, path.join(out, 'THIRD_PARTY_LICENSES.md'));
console.log(`built ${path.relative(process.cwd(), out) || out}`);
