// .eslintrc.cjs
module.exports = {
  root: true,
  extends: ["next/core-web-vitals"],
  env: { browser: true, node: true, es2021: true },
  overrides: [
    {
      files: ["**/*.{ts,tsx}"],
      rules: { "no-undef": "off" }
    }
  ],
  globals: {
    Request: "readonly",
    Response: "readonly",
    Headers: "readonly",
    URL: "readonly",
    fetch: "readonly",
    window: "readonly",
    document: "readonly",
    navigator: "readonly",
    localStorage: "readonly",
    setTimeout: "readonly",
    queueMicrotask: "readonly",
    Notification: "readonly",
    HTMLDivElement: "readonly",
    HTMLInputElement: "readonly",
    HTMLButtonElement: "readonly",
    HTMLLabelElement: "readonly",
    HTMLHeadingElement: "readonly",
    HTMLVideoElement: "readonly",
    MouseEvent: "readonly",
    KeyboardEvent: "readonly",
    ClipboardEvent: "readonly",
    BeforeUnloadEvent: "readonly",
    process: "readonly",
    require: "readonly",
    console: "readonly"
  },
  rules: {
    "react-hooks/exhaustive-deps": "off"
  }
}
