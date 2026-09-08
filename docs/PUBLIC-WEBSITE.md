# 开拍 RALLY · 公开网站

## 对外入口

- [Vercel 主入口](https://kaipai-rally.vercel.app/)
- [GitHub Pages 备用入口](https://zcinta0514.github.io/rally-badminton/)
- 二维码：`docs/images/kaipai-rally-qr.png`（指向上面的游戏网址）。
- 宣传文案：开拍 RALLY｜有空，就开拍。打开链接，手机横屏，直接人机练习；两台手机还可创建房间、邀请球友对打。

Vercel 项目的简短生产域名是宣传入口。不要分享带随机字符串的部署地址或带账号后缀的内部预览地址，它们可能要求登录。

## 1.3.0 发布说明

- 发布标识：[v1.3.0 标签](https://github.com/zcinta0514/rally-badminton/tree/v1.3.0)。
- 本轮内容：录制羽毛球击球声、轻微移动脚步声、普通得分短掌声，以及精彩得分短欢呼与 12 位观众的轻微动作。最终版本不播放鞋底摩擦或急停吱声。
- 手机声音：保留手势解锁、静音、后台与暂停处理，从后台返回后可通过再次触碰恢复音频。
- 离线资源：6 个 WAV 及其 CC0 来源许可随游戏缓存，原始下载和处理记录留在本地。
- 发布配置：Vercel 根路径 `/`；GitHub Pages 子路径 `/rally-badminton/`；均为 `peerMode=true`、`demoMode=false`，`wsUrl` 留空。
- 自动部署：仓库根目录 `vercel.json` 已定义安装、测试、构建与响应头；现有 Vercel 项目仍需在 Settings → Git 中连接 `zcinta0514/rally-badminton`，生产分支选 `main`。配置文件本身不会建立账号连接。
- 本地核验：382 项测试通过；浏览器确认 6 个音频均可加载、静音和暂停有效，模拟的音频中断可在手势后恢复，无页面异常。
- 发布包：各有 51 个缓存资源；Vercel PWA 版本 `a25a31ba4c845323`，Pages PWA 版本 `a9701aac5c6971ae`。两个版本哈希因根路径不同而不同，游戏源码相同。

完整变更见 [CHANGELOG](../CHANGELOG.md)。两个公开入口使用不同托管平台，发布配置与触发结果需要分别验证。

## 历史记录：2026-09-09 首次托管 1.2.0

- 游戏版本：RALLY 1.2.0。
- 稳定源码：`8806e1e697eb431ee84f7c1003aaa3e28194ecf8`。
- Vercel 项目：`kaipai-rally`。
- PWA 资源版本：`30183bfc380ab68d`。
- 发布内容：47 个静态文件、2,532,936 字节；未上传 Git 元数据、服务器、内部文档、账号凭据或玩家数据。
- 校验：350 项现有测试通过；产物与稳定源码构建一致；敏感凭据模式扫描无匹配。
- 线上检查：首页、runtime-config.js、src/entry.js、sw.js 和 manifest 均由平台探测返回 200；根路径为 `/`、`peerMode=true`、`demoMode=false`。
- 上述五份线上文本资源与本地发布包完全一致。
- 用户已使用手机浏览器打开正式网址，确认正常显示游戏首页，无需账号登录。
- 当时电脑直连 Vercel 域名发生超时；用户手机可打开不等于所有大陆网络均可访问。真实双手机对局测试仍需用户设备完成。

该次发布只重新托管 1.2.0，没有修改玩法、人物、球场和音效；GitHub Pages 当时保持原部署。1.3.0 的音效与观众改动不在这份历史记录内。

## 更新方式与手动构建备用流程

GitHub Pages 由仓库工作流更新。Vercel 的源码构建配置位于根目录 `vercel.json`：执行 `npm ci`、`npm test && npm run build`，只发布 `dist/`，测试失败时不会替换网站。

首次连接须在现有 `kaipai-rally` 项目的 Settings → Git 中选择 `zcinta0514/rally-badminton`，生产分支为 `main`。连接后推送 `main` 会自动触发生产部署；以平台显示的提交与成功部署结果为准，不能只凭配置文件判断自动同步已经启用。

需要手动发布或恢复时，可从待发布标签建立干净构建目录，安装锁定依赖并构建；更新原有 Vercel 项目，不要从旧工作树覆盖新版：

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

GitHub Pages 使用 `/rally-badminton/` 子路径，`PUBLIC_PEER_MODE=1`、`PUBLIC_DEMO_MODE=0`、`PUBLIC_WS_URL` 留空。两处产物应对应同一发布提交及版本标签，不能混用根路径和子路径的 Service Worker 或 manifest。

Service Worker 校验资源 SHA-256；不要开启自动注入脚本或改写 HTML/JS/CSS 的功能。发布后检查未登录访问、根路径资源、离线缓存、人机入口、好友建房/加入与邀请链接。版本更新时可能需要关闭所有旧游戏窗口，再重新打开。

## 域名与玩家记录

当前使用免费托管子域名，未购买域名。以后可在同一项目绑定用户已拥有的独立域名。任何域名购买或续费，必须先明确归属和预算。

昵称、身份、战绩与视角保存在当前网站的浏览器存储中；换域名不会自动转移旧记录。手机对打继续使用 PeerJS 公共配对服务与 WebRTC，推荐同一 Wi-Fi 或允许设备互访的热点；不能承诺所有公网和热点都能连通。

网络访问说明见 [Vercel 官方文档](https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china)。
