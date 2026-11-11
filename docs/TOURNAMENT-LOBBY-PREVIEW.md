# 聚光球馆首页样板

2026-11-11，用户确认 B 概念方向。基线：远端主线 `8164ed8`（1.16.6）。本分支版本 1.17.0，等待用户视觉验收，尚未合并或部署。

![844×390 实际首页](images/tournament-lobby-phone.png)

当前验收构建：`43dbbd447e368ee0`，本地预览：http://127.0.0.1:3321/ 。

## 已实现

- 真实 Three.js 场馆：封闭屋顶与灯具、哑光地胶、分材质墙板、金属网柱、木质长椅、装备及实例化观众。与比赛共用 WebGL renderer，没有使用概念图充当实时场景。
- 现有人物在场边待机，脚固定、球拍下垂、轻微呼吸。导入资产维持姿势与独立材质；取消后的异步加载释放资源。
- 首页「单人对战 / 好友对战」。单人页进入「人机对战 / 地狱挑战」；返回遵循父级。好友建房、加入和既有规则配置沿用原流程。
- 短页面转场与进入比赛的渐显；系统减少动态效果时关闭。菜单不再运行示范对局。
- 准备表单整页滚动；声音与触感从首页顶部设置可用。保留主屏幕安装、操作说明、新手指南与内测群入口。
- 标题使用由得意黑派生的 Rally Display，菜单和正文使用由 Noto Sans SC 派生的 Rally UI。两套字体自托管、随离线包缓存，包含 SIL OFL 授权与来源；字体子集约219KB，未覆盖的昵称字符回退到系统字体。
- 球场柔和顶光、人物补光、侧后轮廓光和上墙洗光分层处理，看台保持较暗。首次入场用1秒由86%亮度平滑提亮，稳定后变化幅度不超过1%，周期31–71秒。减少动态效果时跳过入场提亮或冻结当前灯光；返回首页不重复播放。

## 实测证据

浏览器验证由 `scripts/verify-tournament-lobby.mjs` 检查实时构建标识；本轮同时在独立服务器和用户预览端口3321复核。输出在被 Git 忽略的 `artifacts/lobby/`，不是线上测试数据。

- 1440×900、844×390、667×375、390×844 首页：入口在视口内，主要触控目标至少44px，无横向溢出。
- 两种横屏尺寸：单人选择、普通人机开局、地狱挑战开局、暂停退出、好友创建/加入准备、声音设置。
- 竖屏准备页滚动和返回；减少动态效果路径；没有页面异常或 WebGL shader 错误。
- 场馆测试10/10；字体打包与服务测试2/2；与导航、销毁、发布元数据合计61/61通过。浏览器16项检查通过，包含字体实际加载和应用。
- 全量 node 测试 791/794。3项失败在改动前已存在：Windows创建文件/目录符号链接时报 EPERM（两个子测试及父级失败）。基线为778/781，未把这些失败写成通过。
- PWA 构建通过，115项资源。新增字体及授权文件约228KB，没有新增模型、视频或运行时外部字体请求。场馆共6盏灯、1张阴影贴图。

这些是 Windows 上 Chromium 的浏览器检查；不等于 iPhone 13 的真机性能、耗电、发热或 Safari 兼容性结论。

## 视觉与范围边界

概念图的人物并未作为正式资产交付。当前人物来自既有游戏资源；新人物和动作由独立人物计划继续制作。这一版完成球馆首页样板及实际比赛接入，比赛场景本体仍采用原来的美术与镜头。当前转场为短渐显，不是人物走进场内的完整动画。

## 复现

```powershell
npm ci
node --test tests/font-build.test.js tests/tournament-lobby.test.js tests/connection-recovery.test.js tests/view-dispose.test.js tests/release-notice.test.js tests/release-version.test.js
npm run build
# 将 Playwright 安装在隔离的 artifacts/qa，或设置 RALLY_PLAYWRIGHT_MODULE
npm install --prefix artifacts/qa playwright --ignore-scripts --no-audit --no-fund
node scripts/verify-tournament-lobby.mjs
```

验证脚本默认使用 Windows 已安装的 Chrome；其他环境通过 `RALLY_BROWSER_PATH` 指定 Chromium 路径。可设置 `RALLY_QA_URL` 对一个已启动的本分支服务器复核，脚本会拒绝与本地源代码构建标识不一致的服务。
