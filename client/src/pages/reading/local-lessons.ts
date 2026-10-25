import type { LessonView } from '@shared/api.interface';

const media = (name: string) => `/content/media/${name}`;

export const localPinyinFontUrl = media('1879663708213499.ttf');

export const localLessons: LessonView[] = [
  {
    id: 'local-autumn',
    slug: 'autumn',
    title: '秋天',
    gradeLabel: '一年级 · 第1课',
    fullText: '天气凉了，树叶黄了，一片片叶子从树上落下来。\n\n天那么蓝，那么高。一群大雁往南飞，一会儿排成个“人”字，一会儿排成个“一”字。\n\n啊！秋天来了！',
    pinyin: {
      paragraphs: [
        'tiān qì liáng le shù yè huáng le yí piàn piàn yè zi cóng shù shàng luò xià lái',
        'tiān nà me lán nà me gāo yì qún dà yàn wǎng nán fēi yí huìr pái chéng gè rén zì yí huìr pái chéng gè yī zì',
        'à qiū tiān lái le',
      ],
    },
    rubric: {
      accuracyTargets: [
        { char: '秋', reading: 'qiū' },
        { char: '气', reading: 'qì' },
        { char: '树', reading: 'shù' },
        { char: '叶', reading: 'yè' },
        { char: '黄', reading: 'huáng' },
        { char: '片', reading: 'piàn' },
        { char: '从', reading: 'cóng' },
        { char: '来', reading: 'lái' },
        { char: '飞', reading: 'fēi' },
      ],
      natural: {
        kind: 'neutral_tone',
        description: '把“凉了、黄了、来了”中的轻声“了”读得轻轻的、短短的，不刻意重读或拖长',
        neutralTargets: ['凉了', '黄了', '来了'],
      },
      delivery: {
        kind: 'yi_tone_change',
        description: '把“一片片、一群、一会儿、‘一’字”中“一”的不同读音读到位',
        pronunciationTargets: [
          { char: '一', phrase: '一片片', tone: 2, reading: 'yí' },
          { char: '一', phrase: '一群', tone: 4, reading: 'yì' },
          { char: '一', phrase: '一会儿', tone: 2, reading: 'yí' },
          { char: '一', phrase: '一会儿', tone: 2, reading: 'yí' },
          { char: '一', phrase: '一字', tone: 1, reading: 'yī' },
        ],
      },
      thresholds: { normalPhoneLevel: 3, targetPhoneLevel: 2, targetRepeatedLevel: 2 },
    },
    revision: 1,
    coverUrl: media('1879369789693307.jpg'),
    fullDemoUrl: media('1879288723418187.mp3'),
    videoTemplateUrl: media('1879288815654921.mp4'),
    pages: [
      {
        id: 'local-autumn-1', pageNo: 1, pageType: 'cover', text: '秋天',
        pinyin: [{ text: '秋天', pinyin: 'qiū tiān' }],
        scenePrompt: '清新秋日乡村，一年级语文绘本封面，暖黄色树叶与蓝天。',
        illustrationUrl: media('1879374043911385.jpg'),
        demoAudioUrl: media('1879288717348890.mp3'),
        videoStartMs: 0, videoEndMs: 2000,
      },
      {
        id: 'local-autumn-2', pageNo: 2, pageType: 'body',
        text: '天气凉了，树叶黄了，一片片叶子从树上落下来。', pinyin: [],
        scenePrompt: '秋风吹过，黄叶从树上轻轻落下，儿童水彩绘本风。',
        illustrationUrl: media('1879374072662075.jpg'),
        demoAudioUrl: media('1879288879333417.mp3'),
        videoStartMs: 2000, videoEndMs: 9000,
      },
      {
        id: 'local-autumn-3', pageNo: 3, pageType: 'body',
        text: '天那么蓝，那么高。一群大雁往南飞，', pinyin: [],
        scenePrompt: '高远蓝天下，一群大雁向南飞，秋日乡村水彩绘本风。',
        illustrationUrl: media('1879374072663051.jpg'),
        demoAudioUrl: media('1879288865832058.mp3'),
        videoStartMs: 9000, videoEndMs: 14000,
      },
      {
        id: 'local-autumn-4', pageNo: 4, pageType: 'body',
        text: '一会儿排成个“人”字，', pinyin: [],
        scenePrompt: '大雁在蓝天排成人字形，画面干净，无文字。',
        illustrationUrl: media('1879374110725131.jpg'),
        demoAudioUrl: media('1879288876030009.mp3'),
        videoStartMs: 14000, videoEndMs: 19000,
      },
      {
        id: 'local-autumn-5', pageNo: 5, pageType: 'body',
        text: '一会儿排成个“一”字。', pinyin: [],
        scenePrompt: '大雁在蓝天排成一字形，秋色温暖，画面无文字。',
        illustrationUrl: media('1879374043911401.jpg'),
        demoAudioUrl: media('1879288885821531.mp3'),
        videoStartMs: 19000, videoEndMs: 24000,
      },
      {
        id: 'local-autumn-6', pageNo: 6, pageType: 'body',
        text: '啊！秋天来了！', pinyin: [],
        scenePrompt: '孩子欣喜地望着金黄秋景，明亮温暖的儿童绘本风。',
        illustrationUrl: media('1879373996218400.jpg'),
        demoAudioUrl: media('1879288891906057.mp3'),
        videoStartMs: 24000, videoEndMs: 30000,
      },
    ],
  },
  {
    id: 'local-prettiest-house',
    slug: 'prettiest-house',
    title: '哪座房子最漂亮',
    gradeLabel: '一年级 · 朗读课文',
    fullText: '一座房，两座房，青青的瓦，白白的墙。\n\n三座房，四座房，房前花果香，屋后树成行。\n\n哪座房子最漂亮？\n\n要数我们的小学堂。',
    pinyin: {
      paragraphs: [
        'yí zuò fáng liǎng zuò fáng qīng qīng de wǎ bái bái de qiáng',
        'sān zuò fáng sì zuò fáng fáng qián huā guǒ xiāng wū hòu shù chéng háng',
        'nǎ zuò fáng zi zuì piào liang',
        'yào shǔ wǒ men de xiǎo xué táng',
      ],
    },
    rubric: {
      accuracyTargets: [
        { char: '座', reading: 'zuò' }, { char: '房', reading: 'fáng' },
        { char: '青', reading: 'qīng' }, { char: '瓦', reading: 'wǎ' },
        { char: '白', reading: 'bái' }, { char: '墙', reading: 'qiáng' },
        { char: '香', reading: 'xiāng' }, { char: '行', reading: 'háng' },
        { char: '哪', reading: 'nǎ' }, { char: '漂', reading: 'piào' },
        { char: '亮', reading: 'liang' }, { char: '堂', reading: 'táng' },
      ],
      natural: { kind: 'neutral_tone', description: '轻声字词读得轻而短', neutralTargets: ['房子', '漂亮', '我们', '的'] },
      delivery: {
        kind: 'polyphone',
        description: '检查多音字在具体词组中的音节和声调',
        pronunciationTargets: [
          { char: '一', phrase: '一座房', tone: 2, reading: 'yí' },
          { char: '行', phrase: '树成行', tone: 2, reading: 'háng' },
          { char: '数', phrase: '要数', tone: 3, reading: 'shǔ' },
        ],
      },
      thresholds: { normalPhoneLevel: 3, targetPhoneLevel: 2, targetRepeatedLevel: 2 },
    },
    revision: 1,
    coverUrl: media('1879315179806875.jpg'),
    fullDemoUrl: media('1879315345051737.mp3'),
    videoTemplateUrl: null,
    pages: [
      {
        id: 'local-prettiest-house-1', pageNo: 1, pageType: 'body',
        text: '一座房，两座房，青青的瓦，白白的墙。',
        pinyin: [{ text: '一座房，两座房，青青的瓦，白白的墙。', pinyin: 'yí zuò fáng liǎng zuò fáng qīng qīng de wǎ bái bái de qiáng' }],
        scenePrompt: '清新乡村水彩绘本，一座青瓦白墙的小房子，画面无文字。',
        illustrationUrl: media('1879315070096432.jpg'), demoAudioUrl: media('1879315345049657.mp3'),
        videoStartMs: null, videoEndMs: null,
      },
      {
        id: 'local-prettiest-house-2', pageNo: 2, pageType: 'body',
        text: '三座房，四座房，房前花果香，屋后树成行。',
        pinyin: [{ text: '三座房，四座房，房前花果香，屋后树成行。', pinyin: 'sān zuò fáng sì zuò fáng fáng qián huā guǒ xiāng wū hòu shù chéng háng' }],
        scenePrompt: '四座青瓦白墙房屋，房前花果、屋后树木成行，清新水彩。',
        illustrationUrl: media('1879315122095136.jpg'), demoAudioUrl: media('1879315345050729.mp3'),
        videoStartMs: null, videoEndMs: null,
      },
      {
        id: 'local-prettiest-house-3', pageNo: 3, pageType: 'body',
        text: '哪座房子最漂亮？',
        pinyin: [{ text: '哪座房子最漂亮？', pinyin: 'nǎ zuò fáng zi zuì piào liang' }],
        scenePrompt: '孩子站在乡村小路上好奇地比较几座漂亮房子，绘本风。',
        illustrationUrl: media('1879315070098480.jpg'), demoAudioUrl: media('1879315345051721.mp3'),
        videoStartMs: null, videoEndMs: null,
      },
      {
        id: 'local-prettiest-house-4', pageNo: 4, pageType: 'body',
        text: '要数我们的小学堂。',
        pinyin: [{ text: '要数我们的小学堂。', pinyin: 'yào shǔ wǒ men de xiǎo xué táng' }],
        scenePrompt: '青瓦白墙的小学堂里传来读书声，孩子们快乐上学，乡村水彩绘本。',
        illustrationUrl: media('1879315179806875.jpg'), demoAudioUrl: media('1879315472291850.mp3'),
        videoStartMs: null, videoEndMs: null,
      },
    ],
  },
];

export function mergeWithLocalLessons(remoteLessons: LessonView[]) {
  const remoteBySlug = new Map(remoteLessons.map(lesson => [lesson.slug, lesson]));
  const known = localLessons.map(local => {
    const remote = remoteBySlug.get(local.slug);
    if (!remote) return local;
    remoteBySlug.delete(local.slug);
    return {
      ...local,
      ...remote,
      coverUrl: local.coverUrl,
      fullDemoUrl: local.fullDemoUrl,
      videoTemplateUrl: local.videoTemplateUrl,
      pages: remote.pages.length
        ? remote.pages.map((page, index) => ({
          ...page,
          illustrationUrl: local.pages[index]?.illustrationUrl ?? page.illustrationUrl,
          demoAudioUrl: local.pages[index]?.demoAudioUrl ?? page.demoAudioUrl,
        }))
        : local.pages,
    };
  });
  return [...known, ...remoteBySlug.values()];
}
