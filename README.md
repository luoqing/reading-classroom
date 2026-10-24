# Reading Classroom

小学语文朗读练习应用。仓库保留了《秋天》《哪座房子最漂亮》的正文、拼音、评测规则、插图、示范音频、朗读视频和小秋语音。

运行环境要求 Node.js 22.22 或更高版本。

## 无数据库独立运行

独立模式不会连接妙搭数据库，也不会请求妙搭文件存储。页面直接使用仓库内的课文和素材：

```bash
npm ci
npm run dev:standalone
```

打开终端中显示的本地地址即可。独立模式支持课文浏览、拼音、插图、示范音频和匿名录音；登录、持久化和在线评测需要另行配置后端与数据库。

生产构建和预览：

```bash
npm run build:standalone
npm run preview:standalone -- --port 4173
```

## 妙搭兼容模式

原有妙搭全栈构建仍保留：

```bash
npm run build
```

有妙搭运行时和数据库时，应用优先读取线上课文数据；线上数据库或课文接口不可用时，自动切换到仓库内的两篇课文。已归档的课文素材始终使用本地副本，避免妙搭文件地址失效后出现空图。

## 本地内容位置

- 课文、拼音和评测规则：`client/src/pages/reading/local-lessons.ts`
- 插图、字体、示范音频和视频：`client/public/content/media/`
- 数据库结构和种子脚本：`server/database/`

## 密钥

仓库只保留 `.env.example` 中的变量名。真实的讯飞、腾讯评测密钥应放在部署平台的环境变量或本地 `.env.local` 中，不能提交到 Git。
