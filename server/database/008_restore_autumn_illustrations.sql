UPDATE lesson_page AS lp
SET illustration_url = CASE lp.page_no
  WHEN 1 THEN 'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879374043911385.jpg'
  WHEN 2 THEN 'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879374072662075.jpg'
  WHEN 3 THEN 'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879374072663051.jpg'
  WHEN 4 THEN 'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879374110725131.jpg'
  WHEN 5 THEN 'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879374043911401.jpg'
  WHEN 6 THEN 'https://bytedance.feishuapp.cn/spark/app/app_17g7hv91br2/runtime/api/v1/storage/object/bucket_aadk2myxensps/1879373996218400.jpg'
END,
    _updated_at = CURRENT_TIMESTAMP
FROM lesson AS l
WHERE lp.lesson_id = l.id
  AND l.slug = 'autumn'
  AND lp.page_no BETWEEN 1 AND 6;
