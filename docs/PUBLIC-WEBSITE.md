# 开拍 RALLY · 公开网站

## 对外入口

- 游戏：https://kaipai-rally.vercel.app/
- 备用入口：https://zcinta0514.github.io/rally-badminton/
- 二维码：`docs/images/kaipai-rally-qr.png`（指向上面的游戏网址）。
- 宣传文案：开拍 RALLY｜有空，就开拍。打开链接，手机横屏，直接人机练习；两台手机还可创建房间、邀请球友对打。

Vercel 项目的简短生产域名是宣传入口。不要分享带随机字符串的部署地址或带账号后缀的内部预览地址，它们可能要求登录。

## 2026-09-09 发布记录

- 游戏版本：RALLY 1.2.0。
- 稳定源码：`8806e1e697eb431ee84f7c1003aaa3e28194ecf8`。
- Vercel 项目：`kaipai-rally`。
- 项目 ID：`prj_AMrtF27Nyd8Ai5EW01fMTRRIGB7a`。
- 团队 ID：`team_Mxf1jkhnbNE7cDasjMjZp90t`。
- 部署 ID：`dpl_5o3KrYXiTQ9aSNzbRysey1VoARNp`，平台状态 `READY`。
- PWA 资源版本：`30183bfc380ab68d`。
- 发布内容：47 个静态文件、2,532,936 字节；未上传 Git 元数据、服务器、内部文档、账号凭据或玩家数据。
- 校验：350 项现有测试通过；产物与稳定源码构建一致；敏感凭据模式扫描无匹配。
- 线上检查：首页、runtime-config.js、src/entry.js、sw.js 和 manifest 均由平台探测返回 200；根路径为 `/`、`peerMode=true`、`demoMode=false`。
- 上述五份线上文本资源与本地发布包完全一致。
- 用户已使用手机浏览器打开正式网址，确认正常显示游戏首页，无需账号登录。
- 当前电脑直连 Vercel 域名发生超时；用户手机可打开不等于所有大陆网络均可访问。真实双手机对局测试仍需用户设备完成。

本次只重新托管稳定版，没有修改玩法、人物、球场和音效。GitHub Pages 保持原部署。另一个任务的音效改动未纳入本次发布。

## 后续更新

这是一次独立静态发布，尚未连接 GitHub 自动部署。GitHub `main` 的后续更新不会自动进入这个 Vercel 项目。以后应核对待发布版本，通过测试、构建和产物检查后，更新同一个 Vercel 项目；不要重新创建项目或从旧工作树覆盖新版。

在干净构建目录中安装锁定依赖并构建：

```powershell
npm ci
$env:PUBLIC_BASE_PATH = '/'
$env:PUBLIC_PEER_MODE = '1'
$env:PUBLIC_DEMO_MODE = '0'
$env:PUBLIC_WS_URL = ''
npm test
npm run build
Copy-Item -LiteralPath 'deploy/vercel-static.json' -Destination 'dist/vercel.json'
```

只发布 `dist/` 内文件，按相对路径上传，二进制文件需保留原字节。构建脚本不清空旧 `dist/`，必须检查没有历史文件混入。Vercel 读取 `dist/vercel.json` 的响应头；`_headers` 是其他静态主机使用的格式。

Service Worker 校验资源 SHA-256；不要开启自动注入脚本或改写 HTML/JS/CSS 的功能。发布后检查未登录访问、根路径资源、离线缓存、人机入口、好友建房/加入与邀请链接。版本更新时可能需要关闭所有旧游戏窗口，再重新打开。

## 域名与玩家记录

当前使用免费托管子域名，未购买域名。以后可在同一项目绑定用户已拥有的独立域名。任何域名购买或续费，必须先明确归属和预算。

昵称、身份、战绩与视角保存在当前网站的浏览器存储中；换域名不会自动转移旧记录。手机对打继续使用 PeerJS 公共配对服务与 WebRTC，推荐同一 Wi-Fi 或允许设备互访的热点；不能承诺所有公网和热点都能连通。

Vercel 官方对大陆访问的说明：https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china
