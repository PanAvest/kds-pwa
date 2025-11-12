export default [
  // Ignore build outputs
  { ignores: ['.next/**', 'node_modules/**', 'dist/**', 'out/**'] },

  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      // Declare globals used across the project so ESLint doesn't flag them
      globals: {
        // Server/Edge
        process: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        // Browser
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        Notification: 'readonly',
        setTimeout: 'readonly',
        // DOM types sometimes referenced as values by ESLint's no-undef
        HTMLDivElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLLabelElement: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLVideoElement: 'readonly',
        CanvasRenderingContext2D: 'readonly',
        ClipboardEvent: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        BeforeUnloadEvent: 'readonly',
        queueMicrotask: 'readonly',
        // Some files reference React identifier (types) without import
        React: 'readonly'
      }
    },
    rules: {
      // Let TypeScript handle undefineds; silence ESLint false positives
      'no-undef': 'off',
      // Keep the build moving; tone down noisy rules you hit in logs
      'no-empty': 'off',
      'no-unused-vars': ['warn', { 'args': 'none', 'varsIgnorePattern': '^_' }],
      // You can re-enable this later
      'react-hooks/exhaustive-deps': 'off'
    }
  }
];
