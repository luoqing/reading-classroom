INSERT INTO lesson (
  slug,
  title,
  grade_label,
  full_text,
  pinyin_json,
  rubric_json,
  revision,
  status,
  cover_url,
  full_demo_url
)
VALUES (
  'prettiest-house',
  '哪座房子最漂亮',
  '一年级 · 朗读课文',
  E'一座房，两座房，青青的瓦，白白的墙。\n\n三座房，四座房，房前花果香，屋后树成行。\n\n哪座房子最漂亮？\n\n要数我们的小学堂。',
  '{"paragraphs":["yí zuò fáng liǎng zuò fáng qīng qīng de wǎ bái bái de qiáng","sān zuò fáng sì zuò fáng fáng qián huā guǒ xiāng wū hòu shù chéng háng","nǎ zuò fáng zi zuì piào liang","yào shǔ wǒ men de xiǎo xué táng"]}'::jsonb,
  '{"accuracyTargets":[{"char":"座","reading":"zuò"},{"char":"房","reading":"fáng"},{"char":"青","reading":"qīng"},{"char":"瓦","reading":"wǎ"},{"char":"白","reading":"bái"},{"char":"墙","reading":"qiáng"},{"char":"香","reading":"xiāng"},{"char":"行","reading":"háng"},{"char":"哪","reading":"nǎ"},{"char":"漂","reading":"piào"},{"char":"亮","reading":"liang"},{"char":"堂","reading":"táng"}],"natural":{"kind":"prosody","description":"按逗号和句号自然停顿，问句读出疑问语气"},"delivery":{"kind":"expression","description":"青青、白白读得轻快；哪座房子最漂亮读出疑问；要数我们的小学堂读出自豪感","focusTargets":["青青","白白","哪座房子最漂亮","要数我们的小学堂"]},"thresholds":{"normalPhoneLevel":3,"targetPhoneLevel":2,"targetRepeatedLevel":2}}'::jsonb,
  1,
  'published',
  'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879315179806875.jpg',
  'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879315345051737.mp3'
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  grade_label = EXCLUDED.grade_label,
  full_text = EXCLUDED.full_text,
  pinyin_json = EXCLUDED.pinyin_json,
  rubric_json = EXCLUDED.rubric_json,
  revision = EXCLUDED.revision,
  status = EXCLUDED.status,
  cover_url = EXCLUDED.cover_url,
  full_demo_url = EXCLUDED.full_demo_url,
  _updated_at = CURRENT_TIMESTAMP;

INSERT INTO lesson_page (
  lesson_id,
  page_no,
  page_type,
  text_content,
  pinyin_json,
  illustration_url,
  demo_audio_url
)
VALUES
  (
    (SELECT id FROM lesson WHERE slug = 'prettiest-house'),
    1,
    'body',
    '一座房，两座房，青青的瓦，白白的墙。',
    '[{"text":"一座房，两座房，青青的瓦，白白的墙。","pinyin":"yí zuò fáng liǎng zuò fáng qīng qīng de wǎ bái bái de qiáng"}]'::jsonb,
    'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879315070096432.jpg',
    'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879315345049657.mp3'
  ),
  (
    (SELECT id FROM lesson WHERE slug = 'prettiest-house'),
    2,
    'body',
    '三座房，四座房，房前花果香，屋后树成行。',
    '[{"text":"三座房，四座房，房前花果香，屋后树成行。","pinyin":"sān zuò fáng sì zuò fáng fáng qián huā guǒ xiāng wū hòu shù chéng háng"}]'::jsonb,
    'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879315122095136.jpg',
    'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879315345050729.mp3'
  ),
  (
    (SELECT id FROM lesson WHERE slug = 'prettiest-house'),
    3,
    'body',
    '哪座房子最漂亮？',
    '[{"text":"哪座房子最漂亮？","pinyin":"nǎ zuò fáng zi zuì piào liang"}]'::jsonb,
    'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879315070098480.jpg',
    'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879315345051721.mp3'
  ),
  (
    (SELECT id FROM lesson WHERE slug = 'prettiest-house'),
    4,
    'body',
    '要数我们的小学堂。',
    '[{"text":"要数我们的小学堂。","pinyin":"yào shǔ wǒ men de xiǎo xué táng"}]'::jsonb,
    'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879315179806875.jpg',
    'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879315472291850.mp3'
  )
ON CONFLICT (lesson_id, page_no) DO UPDATE SET
  page_type = EXCLUDED.page_type,
  text_content = EXCLUDED.text_content,
  pinyin_json = EXCLUDED.pinyin_json,
  illustration_url = EXCLUDED.illustration_url,
  demo_audio_url = EXCLUDED.demo_audio_url,
  _updated_at = CURRENT_TIMESTAMP;
