import { readFile, writeFile } from 'node:fs/promises';

const htmlPath = 'dist/client/index.html';
let html = await readFile(htmlPath, 'utf8');

// The Miaoda preset prepends runtime telemetry and server-side template
// variables. They are not needed by the standalone build and otherwise make
// a static deployment issue requests to Miaoda observability endpoints.
html = html.replace(
  /<head>[\s\S]*?(?=\s*<meta charset="UTF-8">)/,
  '<head>\n',
);

const replacements = new Map([
  ['{{{__platform__}}}', '{}'],
  ['{{{appAvatar}}}', '/favicon.svg'],
  ['{{appAvatar}}', '/favicon.svg'],
  ['{{appName}}', '朗读小屋 · 把秋天读给你听'],
  ['{{appDescription}}', '小学一年级课文朗读与评测'],
  ['{{environment}}', 'standalone'],
  ['{{basename}}', ''],
  ['{{appId}}', ''],
  ['{{userId}}', ''],
  ['{{tenantId}}', ''],
  ['{{userName}}', ''],
  ['{{csrfToken}}', ''],
]);

for (const [placeholder, value] of replacements) {
  html = html.replaceAll(placeholder, value);
}

await writeFile(htmlPath, html);
