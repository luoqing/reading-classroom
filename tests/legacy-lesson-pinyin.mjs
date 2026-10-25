import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';

function loadTypeScript(path) {
  const source = readFileSync(path, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = new Module(path);
  module.filename = path;
  module.paths = Module._nodeModulePaths(process.cwd());
  module._compile(output, path);
  return module.exports;
}

const { restoreLegacyPagePinyin, restoreFullTextPinyin, paragraphsFromPagePinyin } = loadTypeScript('client/src/pages/classroom/legacy-lesson-pinyin.ts');
const localLessons = [
  {
    title: '秋天',
    fullText: '天气凉了，树叶黄了，一片片叶子从树上落下来。\n\n天那么蓝，那么高。一群大雁往南飞，一会儿排成个“人”字，一会儿排成个“一”字。\n\n啊！秋天来了！',
    pinyin: { paragraphs: [
      'tiān qì liáng le shù yè huáng le yí piàn piàn yè zi cóng shù shàng luò xià lái',
      'tiān nà me lán nà me gāo yì qún dà yàn wǎng nán fēi yí huìr pái chéng gè rén zì yí huìr pái chéng gè yī zì',
      'à qiū tiān lái le',
    ] },
    pages: [
      { pageType: 'cover', text: '秋天', pinyin: [{ text: '秋天', pinyin: 'qiū tiān' }] },
      ...['天气凉了，树叶黄了，一片片叶子从树上落下来。', '天那么蓝，那么高。一群大雁往南飞，', '一会儿排成个“人”字，', '一会儿排成个“一”字。', '啊！秋天来了！']
        .map(text => ({ pageType: 'body', text, pinyin: [] })),
    ],
  },
  {
    title: '哪座房子最漂亮',
    fullText: '一座房，两座房，青青的瓦，白白的墙。\n\n三座房，四座房，房前花果香，屋后树成行。\n\n哪座房子最漂亮？\n\n要数我们的小学堂。',
    pinyin: { paragraphs: [
      'yí zuò fáng liǎng zuò fáng qīng qīng de wǎ bái bái de qiáng',
      'sān zuò fáng sì zuò fáng fáng qián huā guǒ xiāng wū hòu shù chéng háng',
      'nǎ zuò fáng zi zuì piào liang',
      'yào shǔ wǒ men de xiǎo xué táng',
    ] },
    pages: [
      ['一座房，两座房，青青的瓦，白白的墙。', 'yí zuò fáng liǎng zuò fáng qīng qīng de wǎ bái bái de qiáng'],
      ['三座房，四座房，房前花果香，屋后树成行。', 'sān zuò fáng sì zuò fáng fáng qián huā guǒ xiāng wū hòu shù chéng háng'],
      ['哪座房子最漂亮？', 'nǎ zuò fáng zi zuì piào liang'],
      ['要数我们的小学堂。', 'yào shǔ wǒ men de xiǎo xué táng'],
    ].map(([text, pinyin]) => ({ pageType: 'body', text, pinyin: [{ text, pinyin }] })),
  },
];

for (const lesson of localLessons) {
  const restored = restoreLegacyPagePinyin(lesson);
  assert.equal(restored.length, lesson.pages.length);
  restored.forEach((tokens, index) => {
    assert.equal(tokens.map(token => token.text).join(''), lesson.pages[index].text);
    assert.equal(tokens.filter(token => /\p{Script=Han}/u.test(token.text) && !token.pinyin).length, 0);
  });
  assert.deepEqual(
    paragraphsFromPagePinyin(lesson.fullText, lesson.pages.map((page, index) => ({ ...page, pinyin: restored[index] }))),
    lesson.pinyin.paragraphs,
  );
  const fullTextTokens = restoreFullTextPinyin(lesson);
  assert.equal(fullTextTokens.map(token => token.text).join(''), lesson.fullText);
  assert.equal(fullTextTokens.filter(token => /\p{Script=Han}/u.test(token.text) && !token.pinyin).length, 0);
}

const [autumn, house] = localLessons;
assert.equal(restoreLegacyPagePinyin(autumn)[1][0].pinyin, 'tiān');
assert.equal(restoreLegacyPagePinyin(house)[0][0].pinyin, 'yí');
const firstPageTokens = restoreLegacyPagePinyin(house)[0];
assert.equal(paragraphsFromPagePinyin(house.fullText, [{ ...house.pages[0], pinyin: [{ text: '', pinyin: '' }, ...firstPageTokens] }])[0], house.pinyin.paragraphs[0]);
console.log('Legacy lesson pinyin restoration passed for 秋天 and 哪座房子最漂亮');
