# CHAR-00 第一轮准备记录

日期：2026-11-11。本报告记录已完成准备，不代表 CHAR-00 全部完成或新人物已产出。

## 隔离与基线

- 原目录存在另一个首页任务；没有改其文件、切换其分支或携带未提交变更。
- 首次 Git 网络访问超时，重试 fetch 成功；远端 main 为 `b609e714081568cc420fe29ddb7b43b504d0189c`。
- 创建 Codex 管理的独立 worktree：`C:/Users/Administrator/.codex/worktrees/rally-char-00/rally-dev`。
- 当前人物分支：`codex/char-00-feasibility`。基线是上述精确主线提交。
- 与原首页分支比较，仅 index.html、style.css 和 package 版本文件有差异，人物代码相同。首页后续进展在正式接入前重新整合。
- 本轮正式运行时 `src/`、`shared/`、`server/`、package 文件相对基线无修改；原 GLB SHA256 不变。

## 工具与文件

共享本机工具目录：`C:/Users/Administrator/Documents/ChatGPT/开拍/character-program/local/`。不纳入游戏部署，也不新增费用。

| 项目 | 实测结果 |
| --- | --- |
| Blender 4.5.9 LTS Windows 便携版 | 下载、官方 SHA256 比对、后台启动成功；hash `8bf95cbd38d1` |
| Blender ZIP SHA256 | `41da973b9bf95bb312cbeff4d1982feb13259b43c821686b9bafea4dfe5477cf` |
| 原 GLB 静态审计 | 297572 字节、8931 三角形、5350 POSITION 顶点、5 primitive、18 关节、0 动画片段、0 贴图 |
| 原 GLB SHA256 | `2bd358cca2e5a963c4de5da6d80e576920d15d33b19143b94e509608dc8b242f` |
| 资产导入 | 成功保存 `artifacts/character/CHAR-00/athlete-inspection.blend`；这是运行时模型的检查工程，不是原作者 `.blend` 源文件 |
| Python | 3.12.10，独立 venv，不修改全局依赖 |
| 姿态识别 | MediaPipe 1.2.2，官方 full float16 v1 模型；CPU 对官方 pose.jpg 检出 1 人、33 关键点；含创建 detector 约 0.99 秒，不代表视频吞吐 |
| 依赖检查 | pip check 通过；避免两个 OpenCV 包覆盖同一 cv2，只保留 opencv-contrib-python；版本见 pose-requirements.lock.txt |

MediaPipe 最初因原生库中文路径读取失败，改为 Python 读取模型字节与图片数组后成功；保留同样路径实测，未通过改名绕过输入。脚本见 `scripts/character/pose_smoke_check.py`。

下载来源：[Blender 4.5 目录](https://download.blender.org/release/Blender4.5/)、[官方校验清单](https://download.blender.org/release/Blender4.5/blender-4.5.9.sha256)、[MediaPipe full 模型](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task)、[官方样例图片](https://storage.googleapis.com/mediapipe-assets/pose.jpg)。模型与图片 SHA256 见 CHAR-00-POSE-SMOKE.json；图片仅工具验证，不作为羽毛球动作来源。

## 测试与已有问题

- 初始全量 `npm test`：781 项，774 通过、7 失败；未修改游戏源码前发生。
- 相关人物、蒙皮、导入、杀球、扑救、赛后演出、模型资源与构建测试：61／61 通过。
- `npm run build`：成功，构建 `72ccda64ef2c7940`，107 个本地资源。
- 全量失败集中在交接工具测试。最小复现显示 Node realpath 保留 `ADMINI~1` 短路径，而 Git 根路径为 `Administrator` 长路径；直接字符串比较得到不相等，大小写归一化也不能解决。
- 只为测试进程指定完整临时目录后，交接测试 26 项中 23 通过、3 失败，剩余为符号链接创建 EPERM 及父测试失败计数。未修改系统 TEMP、未提升权限、未伪造全绿。
- 本轮不修交接工具，不降低测试门槛。正式发布前仍需在相应任务中处理或验证环境；独立离线资产准备不依赖这些交接测试通过。

日志位于 `artifacts/character/CHAR-00/`：`baseline-tests.log`、`character-tests.log`、`baseline-build.log`、`handoff-longpath-tests.log`。同名计数按 Node 测试报告记录，父子测试可能分别计入失败，不应简单理解为 7 个独立功能缺陷。

## 桌面基线预览

- 本轮已启动 `http://127.0.0.1:3311/?preview=athlete`，服务 PID 3448；该编号仅为启动时记录，接续时先核实进程归属。
- 来源是本 worktree、上述基线；页面实际显示“与比赛使用同款球员模型”，fetch GLB 实算哈希与本地一致。
- 可切换准备／移动／杀球／跨步，旋转角度、暂停和拖动时间。它是旧人物对照，不是新方案效果。
- 已观察桌面浏览器准备姿势；近景上衣边缘、肩部和裤腿关节存在可见的几何分段感，属于后续检查重点。没有由一张截图推断全部动作质量。
- 浏览器截图保存因浏览器工具的路径访问限制未成功；已内联查看截图，不声称本地有截图或完整动作录像。
- Codex 侧栏打开请求返回 queued；不能声称侧栏已显示。普通浏览器 URL 已实际读取。

## 尚未完成

原始 Quaternius 免费包未恢复；Blender 中的模型是从现有 GLB 导入。石宇奇参考尚未逐帧筛选。没有制作新的羽毛球骨骼样片，没有测试视频时序稳定性，没有新的人物外形。iPhone 13 未做真机验收。这些是下一轮工作，不用工具准备结果代替。
