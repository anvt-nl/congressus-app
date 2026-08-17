// ESLint config for Super-linter's JAVASCRIPT_ES check.
//
// The frontend under source/html/ is plain, non-bundled browser JavaScript:
// scripts are loaded as classic <script> tags (not ES modules), so globals
// declared in one file (e.g. fetchEventDetails in event_heading.js) are used
// directly by other files, and third-party libraries loaded via
// vendor/*.min.js (lucide, html5-qrcode) attach their own globals.
export default [
  {
    files: ["source/html/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        console: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        navigator: "readonly",
        alert: "readonly",
        confirm: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URLSearchParams: "readonly",
        AudioContext: "readonly",
        webkitAudioContext: "readonly",
        // Loaded via <script src="vendor/lucide.min.js">.
        lucide: "readonly",
        // Loaded via <script src="vendor/html5-qrcode.min.js">.
        Html5Qrcode: "readonly",
        // Declared in event_heading.js, used by participations_overview.js;
        // both are loaded as classic scripts on the same page.
        fetchEventDetails: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          vars: "local",
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
