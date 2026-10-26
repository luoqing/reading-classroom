import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const path = 'client/src/pages/classroom/LessonRubyText.tsx';
const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = new Module(path);
module.filename = path;
module.paths = Module._nodeModulePaths(process.cwd());
module._compile(compiled, path);

const tokens = [...'一座房，\n\n两座房。\n\n哪座最漂亮？'].map(text => ({ text, pinyin: /\p{Script=Han}/u.test(text) ? 'fáng' : '' }));
const markup = renderToStaticMarkup(React.createElement(module.exports.default, { tokens }));
assert.equal((markup.match(/class="lesson-ruby-paragraph"/gu) || []).length, 3);
assert.equal((markup.match(/<ruby>/gu) || []).length, tokens.filter(token => token.pinyin).length);
assert.equal(markup.includes('\n'), false);
console.log('Lesson ruby text keeps character readings and collapses blank lines');
