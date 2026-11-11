# 技术现状、候选与来源

核查日期：2026-11-11。区分本机读取事实、历史文档记录和未验证建议。

本文件的源码快照是规划阶段的历史核查；之后已 fetch 并建立独立人物工作树，工具也已准备。当前事实以 [第一轮准备报告](CHAR-00-PREPARATION.md) 与 [STATUS](STATUS.md) 为准，新方法筛选见 [动作方向](MOTION-DIRECTION.md)。不要按下面早先的“未 fetch／尚未安装”描述重复准备。

## 当前源码事实

只读检查目录：`../rally-dev/`。读取时分支 `codex/mobile-landscape-verification`，HEAD `739b929e0340be2eacd7c482da0f27d33288c8f3`。本地 `main`／`origin/main` 为 `79fa35c`，联网 `git ls-remote --heads origin main` 返回 `b609e714081568cc420fe29ddb7b43b504d0189c`。本轮没有 fetch 或分析远端提交内容，因此不能确定完整继承关系，也不能把现目录宣称为最新基线。

读取时游戏工作区无未提交改动；只有一个已列出的 worktree。远端标签包含 v1.16.0；本地 package.json 为 1.16.4，版本字符串与标签不一致，不能单独用任何一个推断线上状态。本轮没有核验线上游戏。

| 文件 | 本次观察／未来责任 |
| --- | --- |
| `src/athlete.js` | `sampleAthletePose` 程序化姿态与两骨段求解；移动、击球、扑救的兼容入口 |
| `src/athlete-import.js` | 导入模型被重建为扁平骨架；手腕朝向跟随前臂、脚踝跟随小腿；须评估新的骨架接入方式 |
| `src/smash-motion.js` | 已有专项杀球，不能假定项目尚未处理全身发力 |
| `src/model-assets.js` | GLB 缓存、实例克隆、动画片段克隆与资源隔离；可作为保留候选 |
| `src/model-preview.js`、`src/smash-preview.js` | 已有姿态、角度、时间与新旧对比预览能力；先复用再扩展 |
| `src/finale-pose.js` | 赛后演出兼容点 |
| `shared/game.js`、`src/network-playback.js` | 比赛逻辑与网络显示边界，A 阶段不擅改规则 |
| `scripts/prepare-athlete.py` | 现有人物离线生成脚本，可检查重用价值 |
| `tests/athlete*.test.js`、`tests/smash-motion.test.js`、`tests/rescue-motion.test.js`、`tests/finale-pose.test.js`、`tests/model-*.test.js` | 已有相关回归入口；本轮未运行，不报告通过 |

## 旧素材记录与本机缺口

仓库 `docs/CHARACTER-ASSETS.md` 记载：现有模型来自 Quaternius Universal Base Characters 免费 Standard，经过 Blender 改编；源资产许可另见 `src/models/LICENSE-Quaternius.txt`。历史记录描述产物 18 骨骼、0 动画片段，以及来自源包的 65 骨骼原型。这些计数本轮未重算，实施前应重新解析 GLB。

历史文档中的以下本机相对路径已检查不存在：

- `artifacts/tools/blender-5.2.1-windows-x64/blender.exe`
- `artifacts/assets-source/universal-base-standard.zip`
- `artifacts/assets-source/base/`

这仅证明这些指定位置缺失，不证明整台电脑没有其他 Blender／素材副本。恢复阶段先检查可能的现有副本，再从官方来源补齐，校验来源与许可。不要把历史可再生成说明当作当前已可再生成。

`docs/WORKFLOW.md` 引用的 `docs/DEVELOPMENT-PLAN.md` 在当前目录不存在。本轮不修补其他任务文档，不覆盖全局 PROJECT-STATUS。

当前执行环境通过 nvidia-smi 读取为 GTX 1050 4096 MiB，系统内存约 15.88 GiB。只能说明当前环境；不代表用户所有电脑配置，不代表任何候选模型已在该环境运行成功。

## 免费路线候选

| 候选 | 用途 | 当前判断 | 样片验证要求 |
| --- | --- | --- | --- |
| Blender | 模型、蒙皮、关键帧、导出 | 建议主制作工具；版本按兼容性和可复现性选定 | 无付费插件，能够后台导出并保留编辑源文件 |
| 现有 Quaternius 改编资产 | 对照与可能的基础模型 | 优先检查，不丢弃已有成果 | 体态、拓扑与肩髋变形是否达到新目标 |
| MakeHuman／MPFB 核心资产 | 写实比例的人体基础候选 | 免费候选，尚未下载／测试 | 检查实际导出、骨架、权重；社区附件单独检查许可 |
| MediaPipe Pose Landmarker | 视频姿态／节奏辅助提取 | 轻量候选，尚未在本机验证 | 侧转、抬臂、落地时误检和抖动；关键点不等于完整骨骼动画 |
| 视频参考＋Blender 关键帧 | 动捕补足或替代 | 必须保留的路线 | 以参考时序制作全身姿态，校正肩、腕、拍面与接地 |
| FreeMoCap | 多视角动捕 | 有合适设备时再考虑，不要求新增购买 | 摄像头同步、标定、遮挡、输出到角色的重定向 |
| GVHMR | 单目世界坐标动作恢复研究 | 不作为默认生产依赖 | 官方非商业等限制与依赖资产条款未满足前不接入产品 |
| DeepMotion 等收费服务 | 商业视频动捕 | 排除 | 用户明确不新增订阅 |

最终策略是先以一段短动作对比“识别辅助”和“直接按视频制作关键帧”的总修正成本。识别结果不可靠时切换制作方法，不把所有关节无差别平滑导致爆发力消失。不默认从比赛转播、网络视频提取的数据可自由再分发，需记录参考／提取用途与来源许可。

## 来源链接与证据边界

- [参考视频原作者](https://x.com/Sakura_Rabbiter/status/2119661554954301546)：浏览器已读原帖及部分画面，标明 Unity 实时丝袜拉伸；不是羽毛球动作技术证明，未读付费工程。
- [Unity 对作者工具的介绍](https://unity.com/blog/games/first-guide-animation-in-unity)：提及 Final IK、Magica Cloth、Face Capture；不能据此认定某一个插件就是上述视频的实现。
- [Blender](https://www.blender.org/about/)：免费开源工具候选。
- [MakeHuman 许可](https://www.makehumancommunity.org/about/license.html)与[导出模型 FAQ](https://download.makehumancommunity.org/makehuman/faq/can_i_sell_models_created_with_makehuman.html)：核心资产／导出 CC0；不自动覆盖任意社区附件。
- [MediaPipe Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker)：视频人体关键点、三维坐标估计，不保证专业羽毛球准确度。
- [FreeMoCap 相机说明](https://docs.freemocap.org/1.x/tutorials/hardware/)：旧版文档明确单机位三维不可靠；[当前仓库相机说明](https://github.com/freemocap/freemocap/blob/main/freemocap-docs/docs/guides/camera-setup.mdx)亦按相机数量区分质量。选定版本时重新核对安装与许可。
- [GVHMR 许可](https://github.com/zju3dv/GVHMR/blob/main/LICENSE)及[安装依赖](https://github.com/zju3dv/GVHMR/blob/main/docs/INSTALL.md)：非商业等限制、SMPL／SMPLX 和多模型依赖；未下载或测试。
- [DeepMotion 许可与价格](https://www.deepmotion.com/pricing-animate3d)：免费版非商业、付费许可；已按预算排除。

联网调研日期为 2026-11-11。网页可能变化；真正获取资源时保存对应版本与许可副本，不把网页宣传当成样片通过。
