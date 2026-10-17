INSERT INTO user_account (username, password_hash, account_type, display_name, status)
VALUES (
  'admin',
  'scrypt$57ed0d6526dd0173d8fc4ab04ecc5dcb$3fd761a86f072f6e43c0a2899198b7c6881149c75f095daa1caeae62d92e20a7d217b8594ffa7e5163982df50da3c3794cd96191be9ef40d28a25c5babe61016',
  'admin',
  '罗老师',
  'active'
)
ON CONFLICT (lower(username)) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  account_type = EXCLUDED.account_type,
  display_name = EXCLUDED.display_name,
  status = EXCLUDED.status,
  _updated_at = CURRENT_TIMESTAMP;

INSERT INTO user_account (username, password_hash, account_type, display_name, student_no, class_name, status)
VALUES (
  'student001',
  'scrypt$5d85939067acd71753cf8e97efaecca6$7ee171eb8babd2dc859703ae3b4ff761db2d9dca82c3e757c256a3cda8c6221515011b476b961c40f46c0d57d97f2e972d45757bae9179d9a24082621045a42f',
  'student',
  '示例学生',
  '001',
  '一年级1班',
  'active'
)
ON CONFLICT (lower(username)) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  display_name = EXCLUDED.display_name,
  student_no = EXCLUDED.student_no,
  class_name = EXCLUDED.class_name,
  status = EXCLUDED.status,
  _updated_at = CURRENT_TIMESTAMP;

INSERT INTO lesson (
  slug, title, grade_label, full_text, pinyin_json, rubric_json, revision,
  status, full_demo_url, video_template_url
)
VALUES (
  'autumn',
  '秋天',
  '一年级 · 第1课',
  E'天气凉了，树叶黄了，一片片叶子从树上落下来。\n\n天那么蓝，那么高。一群大雁往南飞，一会儿排成个“人”字，一会儿排成个“一”字。\n\n啊！秋天来了！',
  '{"paragraphs":["tiān qì liáng le shù yè huáng le yí piàn piàn yè zi cóng shù shàng luò xià lái","tiān nà me lán nà me gāo yì qún dà yàn wǎng nán fēi yí huìr pái chéng gè rén zì yí huìr pái chéng gè yī zì","à qiū tiān lái le"]}'::jsonb,
  '{"accuracyTargets":[{"char":"秋","reading":"qiū"},{"char":"气","reading":"qì"},{"char":"树","reading":"shù"},{"char":"叶","reading":"yè"},{"char":"黄","reading":"huáng"},{"char":"片","reading":"piàn"},{"char":"从","reading":"cóng"},{"char":"来","reading":"lái"},{"char":"飞","reading":"fēi"}],"natural":{"kind":"prosody","description":"断句和节奏自然，标点处合理停顿"},"delivery":{"yiTargets":[{"label":"一片片","tone":2,"reading":"yí"},{"label":"一群","tone":4,"reading":"yì"},{"label":"一会儿","tone":2,"reading":"yí"},{"label":"一会儿","tone":2,"reading":"yí"},{"label":"一字","tone":1,"reading":"yī"}],"neutralTargets":["凉了","黄了","来了"]},"thresholds":{"normalPhoneLevel":3,"targetPhoneLevel":3,"targetRepeatedLevel":2}}'::jsonb,
  1,
  'published',
  'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879288723418187.mp3',
  'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879288815654921.mp4'
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  grade_label = EXCLUDED.grade_label,
  full_text = EXCLUDED.full_text,
  pinyin_json = EXCLUDED.pinyin_json,
  rubric_json = EXCLUDED.rubric_json,
  revision = EXCLUDED.revision,
  status = EXCLUDED.status,
  full_demo_url = EXCLUDED.full_demo_url,
  video_template_url = EXCLUDED.video_template_url,
  _updated_at = CURRENT_TIMESTAMP;

INSERT INTO lesson_page (lesson_id, page_no, page_type, text_content, pinyin_json, demo_audio_url, video_start_ms, video_end_ms)
SELECT lesson.id, page_data.page_no, page_data.page_type, page_data.text_content, page_data.pinyin_json, page_data.demo_audio_url, page_data.video_start_ms, page_data.video_end_ms
FROM lesson
CROSS JOIN (VALUES
  (1, 'cover', '秋天', '[{"text":"秋天","pinyin":"qiū tiān"}]'::jsonb, 'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879288717348890.mp3', 0, 2000),
  (2, 'body', '天气凉了，树叶黄了，一片片叶子从树上落下来。', '[]'::jsonb, 'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879288879333417.mp3', 2000, 9000),
  (3, 'body', '天那么蓝，那么高。一群大雁往南飞，', '[]'::jsonb, 'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879288865832058.mp3', 9000, 14000),
  (4, 'body', '一会儿排成个“人”字，', '[]'::jsonb, 'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879288876030009.mp3', 14000, 19000),
  (5, 'body', '一会儿排成个“一”字。', '[]'::jsonb, 'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879288885821531.mp3', 19000, 24000),
  (6, 'body', '啊！秋天来了！', '[]'::jsonb, 'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879288891906057.mp3', 24000, 30000)
) AS page_data(page_no, page_type, text_content, pinyin_json, demo_audio_url, video_start_ms, video_end_ms)
WHERE lesson.slug = 'autumn'
ON CONFLICT (lesson_id, page_no) DO UPDATE SET
  page_type = EXCLUDED.page_type,
  text_content = EXCLUDED.text_content,
  pinyin_json = EXCLUDED.pinyin_json,
  demo_audio_url = EXCLUDED.demo_audio_url,
  video_start_ms = EXCLUDED.video_start_ms,
  video_end_ms = EXCLUDED.video_end_ms,
  _updated_at = CURRENT_TIMESTAMP;
