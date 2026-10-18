UPDATE lesson
SET rubric_json = '{"accuracyTargets":[{"char":"秋","reading":"qiū"},{"char":"气","reading":"qì"},{"char":"树","reading":"shù"},{"char":"叶","reading":"yè"},{"char":"黄","reading":"huáng"},{"char":"片","reading":"piàn"},{"char":"从","reading":"cóng"},{"char":"来","reading":"lái"},{"char":"飞","reading":"fēi"}],"natural":{"kind":"neutral_tone","description":"把“凉了、黄了、来了”中的轻声“了”读得轻轻的、短短的，不刻意重读或拖长","neutralTargets":["凉了","黄了","来了"]},"delivery":{"kind":"yi_tone_change","description":"把“一片片、一群、一会儿、‘一’字”中“一”的不同读音读到位","yiTargets":[{"label":"一片片","tone":2,"reading":"yí"},{"label":"一群","tone":4,"reading":"yì"},{"label":"第一处“一会儿”","tone":2,"reading":"yí"},{"label":"第二处“一会儿”","tone":2,"reading":"yí"},{"label":"“一”字","tone":1,"reading":"yī"}]},"thresholds":{"normalPhoneLevel":3,"targetPhoneLevel":2,"targetRepeatedLevel":2}}'::jsonb,
    cover_url = 'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879369789693307.jpg',
    revision = revision + 1,
    _updated_at = CURRENT_TIMESTAMP
WHERE slug = 'autumn';
