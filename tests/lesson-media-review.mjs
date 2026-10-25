import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';

const path = 'client/src/pages/classroom/lesson-media-review.ts';
const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = new Module(path);
module.filename = path;
module._compile(compiled, path);
const { getChangedPagesWithRetainedMedia: changedPages } = module.exports;

const page = {
  id: 'page-1', text: '秋天来了。', pinyin: [{ text: '秋', pinyin: 'qiū' }],
  illustrationUrl: 'image-1', demoAudioUrl: 'audio-1',
};
const saved = { pages: [page] };
const current = change => ({ pages: [{ ...page, ...change }] });

assert.deepEqual(changedPages(saved, current({})), []);
assert.deepEqual(changedPages(saved, current({ text: '秋天来啦。' })), [{ pageIndex: 0, textChanged: true, pinyinChanged: false }]);
assert.deepEqual(changedPages(saved, current({ pinyin: [{ text: '秋', pinyin: 'qiú' }] })), [{ pageIndex: 0, textChanged: false, pinyinChanged: true }]);
assert.deepEqual(changedPages(saved, current({ text: '秋天来啦。', pinyin: [{ text: '秋', pinyin: 'qiú' }] })), [{ pageIndex: 0, textChanged: true, pinyinChanged: true }]);
assert.deepEqual(changedPages(saved, current({ scenePrompt: '一片秋叶' })), []);
assert.equal(changedPages(saved, current({ text: '秋天来啦。', illustrationUrl: 'image-2' })).length, 1);
assert.deepEqual(changedPages(saved, current({ text: '秋天来啦。', illustrationUrl: 'image-2', demoAudioUrl: 'audio-2' })), []);
assert.deepEqual(changedPages({ pages: [{ ...page, illustrationUrl: null, demoAudioUrl: null }] }, current({ text: '秋天来啦。' })), []);
assert.deepEqual(changedPages(saved, { pages: [{ ...page, id: undefined, text: '秋天来啦。' }] }), []);
console.log('Lesson media review conditions passed');
