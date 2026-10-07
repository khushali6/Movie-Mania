import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Network posture: every outbound model/provider request goes through packages/egress (EgressGuard).
// Raw fetch, XHR, sockets and beacons are lint errors everywhere except the guard itself and its one wiring point.
const NETWORK = [
  { name: 'fetch', message: 'Use EgressGuard.fetch (packages/egress). No direct network calls.' },
  { name: 'XMLHttpRequest', message: 'Use EgressGuard.fetch (packages/egress).' },
  { name: 'WebSocket', message: 'Use EgressGuard.fetch (packages/egress).' },
  { name: 'EventSource', message: 'Use EgressGuard.fetch (packages/egress).' },
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-test/**', '**/node_modules/**', '**/.vite/**', 'test-results/**', 'playwright-report/**', 'bench-results/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { plugins: { 'react-hooks': reactHooks }, rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' } },
  {
    languageOptions: { globals: { window: 'readonly', document: 'readonly', navigator: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', AbortController: 'readonly', AbortSignal: 'readonly', Response: 'readonly', Request: 'readonly', Headers: 'readonly', RequestInfo: 'readonly', RequestInit: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly', crypto: 'readonly', performance: 'readonly', structuredClone: 'readonly', queueMicrotask: 'readonly', indexedDB: 'readonly', localStorage: 'readonly', BroadcastChannel: 'readonly', Worker: 'readonly', self: 'readonly', globalThis: 'readonly', process: 'readonly', Buffer: 'readonly', chrome: 'readonly', HTMLElement: 'readonly', Event: 'readonly', CustomEvent: 'readonly', requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', getComputedStyle: 'readonly', ResizeObserver: 'readonly', IntersectionObserver: 'readonly', MutationObserver: 'readonly', DOMParser: 'readonly', File: 'readonly', Blob: 'readonly', FileReader: 'readonly', atob: 'readonly', btoa: 'readonly', location: 'readonly', matchMedia: 'readonly', innerWidth: 'readonly', innerHeight: 'readonly', MessageChannel: 'readonly', ReadableStream: 'readonly', CompressionStream: 'readonly', DecompressionStream: 'readonly', Node: 'readonly', Element: 'readonly', SVGElement: 'readonly', DOMRect: 'readonly', KeyboardEvent: 'readonly', PointerEvent: 'readonly', MouseEvent: 'readonly', HTMLInputElement: 'readonly', HTMLTextAreaElement: 'readonly', HTMLButtonElement: 'readonly', HTMLSelectElement: 'readonly', HTMLDivElement: 'readonly', IDBDatabase: 'readonly', IDBKeyRange: 'readonly', caches: 'readonly', fetch: 'readonly', Intl: 'readonly' } },
    rules: {
      'no-restricted-globals': ['error', ...NETWORK],
      'no-restricted-properties': ['error', { object: 'navigator', property: 'sendBeacon', message: 'No beacons. Nothing phones home.' }, { object: 'window', property: 'fetch', message: 'Use EgressGuard.fetch.' }, { object: 'globalThis', property: 'fetch', message: 'Use EgressGuard.fetch.' }],
      '@typescript-eslint/no-explicit-any': ['error'],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
      'prefer-const': 'error',
    },
  },
  // the guard itself and the single place its fetch implementation is injected
  { files: ['packages/egress/src/**', 'apps/extension/src/shared/guard.ts'], rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' } },
  // test doubles, tools and e2e may talk to localhost fixtures directly
  { files: ['e2e/**'], rules: { 'react-hooks/rules-of-hooks': 'off' } },
  { files: ['**/test/**', 'e2e/**', 'tools/**', 'packages/gateway/src/mock-gateway.ts', '**/*.config.*', 'apps/*/build.mjs'], rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off', '@typescript-eslint/no-explicit-any': 'off' } },
);
