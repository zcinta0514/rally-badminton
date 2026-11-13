# 赛前选择动效验收

日期：2026-11-13；分支：codex/selection-motion；预览版：1.21.1；构建：91551e420a7a9914。

基线：origin/main b60090645158cf97356de6323e5d09035bd351e1（已合并双打的 1.21.0）。修改前检查分支、工作目录、发布标签与其他 worktree；远端 fetch 连接中断，改用 GitHub commits/main API 核对完整 SHA，提交前再次核对仍相同。其他 worktree 中未提交的地狱挑战改动未纳入本次分支。

## 自动化与构建

- 100 项测试通过，0 失败：release-version、release-notice、connection-recovery、pwa-basepath、pwa-cache、pwa-client、pwa-server、pwa-update-worker。
- 命令：`node --test --test-concurrency=2 tests/release-version.test.js tests/release-notice.test.js tests/connection-recovery.test.js tests/pwa-basepath.test.js tests/pwa-cache.test.js tests/pwa-client.test.js tests/pwa-server.test.js tests/pwa-update-worker.test.js`。
- `npm run build` 成功，131 项本地资源，含新增选择动效模块；`git diff --check` 通过。

## 浏览器模拟

Windows Chrome / Playwright，触摸与手机模拟，软件 WebGL，非手机真机或 iOS Simulator。844×390、667×375 横屏和 390×844 竖屏。

1. 打法、难度、人数、比分选择：选项立即生效，指示线在 260ms 内移动；采样确认动画中间位置存在，结束后与选项左边缘和宽度一致。
2. 连续切换打法，在未完成时再次点击，最终停在最后选择；旋转尺寸后重新对齐，测得位置及宽度偏差均为 0。
3. 展开双打队友设置，切换队友打法、难度和陪练打法；折叠后再显示，指示线仍对齐。较矮横屏可滚动访问设置和开赛按钮。
4. 首页→单人→人机/地狱挑战，好友→创建/加入→返回，层级与输入正常。页面仅有一次 160ms 入场动画，避免与旧动画叠加。
5. 好友打法用键盘 Enter 选择成功；房间码输入正常。未提交创建或加入请求。
6. 人机双打开赛后 diagnostics 显示 format=doubles、playerCount=4、statePhase=serve。
7. 开启 reduced-motion 后，页面与指示线均无活动动画，选择仍立即对齐。
8. 无 pageerror。最终源码更新后重启本目录 3371 端口服务，重新加载并核对 RALLY_CONFIG.buildId=91551e420a7a9914、页面显示预览版 1.21.1；重新验证滑动、连续切换、横竖屏与减少动态效果。

本地截图和日志位于忽略目录 artifacts/doubles/motion-*.png、artifacts/selection-motion-tests.log。预览：http://127.0.0.1:3371/。

## 用户验收步骤

进入「单人对战 → 人机对战」，连续点选均衡/灵巧/力量和 5 分/11 分/21 分/标准三局，观察下划线移动。返回后进入好友创建或加入页面，观察页面轻微过渡。当前为独立分支预览，尚未合并或部署线上。
