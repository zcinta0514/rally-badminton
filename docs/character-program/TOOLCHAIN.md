# 人物制作工具链与本轮验证

更新：2026-11-11。范围：CHAR-00 离线工具准备；不是新人物或动作质量验收。

## 本机配置

便携工具目录：`C:/Users/Administrator/Documents/ChatGPT/开拍/character-program/local`。未新增收费、账号、付费 API 或云 GPU。软件与大资产仅保存在本机，没有进入游戏部署包。

| 工具 | 当前版本与实际验证 | 用途 |
| --- | --- | --- |
| Blender | 4.5.9 LTS；现有 GLB 和恢复的免费 glTF 均可导入并保存 | 建模、蒙皮、动作修正与导出 |
| MPFB | 2.0.18；官方 ZIP SHA256 校验一致，独立用户配置安装并启用；成功生成 53 骨骼、204 顶点组测试人体并保存 | 免费参数化人体候选，不代表最终选型 |
| Python | 3.12.10 独立 venv，pip check 通过 | 离线处理 |
| MediaPipe | 1.2.2，Pose Landmarker Full；IMAGE 与 VIDEO 模式均实际推理 | 参考视频人体姿态辅助识别 |
| FFmpeg | imageio-ffmpeg 0.8.1 携带 9.0.2 Windows 二进制；实际解码、编码与 PTS 验证 | 视频裁剪、抽帧和时间轴 |
| Node / Three.js | 沿用项目锁文件；主线 1.16.6 构建通过 | 后续游戏内对照预览 |

MPFB 软件许可证为 GPL-3.0-or-later，其包内 base.obj 明确标记 CC0。不要把软件许可当成任意第三方服饰或材质的许可；后续新增资产逐个记录来源。MPFB 安装在项目独立配置中，不依赖另装 MakeHuman 或联网服务。基础生成人体包含被遮罩的辅助几何，19158 顶点不能作为最终手机资产预算。

官方来源：[Blender LTS](https://download.blender.org/release/Blender4.5/)、[MPFB 扩展](https://extensions.blender.org/add-ons/mpfb/)、[MPFB 2.0.18](https://github.com/makehumancommunity/mpfb2/releases/tag/v2.0.18)、[MediaPipe Pose](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/python)。

## 统一入口

在人物 worktree 根目录用 PowerShell 执行。`tools.ps1` 只在子进程运行期间设置 UTF-8 和隔离 Blender 配置，结束后恢复环境；可通过 `-ToolRoot` 指向搬迁后的工具目录。

```powershell
# 打开配置了 MPFB 的 Blender
& scripts/character/tools.ps1 -Tool blender

# 检查 Python 依赖与 FFmpeg
& scripts/character/tools.ps1 -Tool python -ToolArgs @('-m','pip','check')
& scripts/character/tools.ps1 -Tool ffmpeg -ToolArgs @('-version')

# 本地视频提取；替换视频路径和输出路径
$tools = Join-Path $env:USERPROFILE 'Documents\ChatGPT\开拍\character-program\local'
& scripts/character/tools.ps1 -Tool python -ToolArgs @(
  'scripts/character/video_pose.py',
  '--video','C:\path\reference.mp4',
  '--model',"$tools\models\pose_landmarker_full.task",
  '--output','artifacts/character/CHAR-00/reference-pose.json'
)

# 重跑合成视频集成检查
& scripts/character/tools.ps1 -Tool python -ToolArgs @(
  '-B','scripts/character/test_video_pose.py',
  '--model',"$tools\models\pose_landmarker_full.task",
  '--sample',"$tools\samples\pose.jpg",
  '--evidence','artifacts/character/CHAR-00/video-pipeline/recheck.json'
)
```

Blender 执行 Python 检查时加 `--python-exit-code 1`，避免 Python 异常仍返回 Blender 默认的成功退出码。MPFB 检查使用 `scripts/character/mpfb_smoke_check.py -- NEW_OUTPUT.blend`，输出必须不存在；不要使用 `--factory-startup`，否则不会加载已启用的扩展。普通 glTF 导入检查可使用 factory startup。

依赖锁文件：`pose-requirements.lock.txt`。工具不在全局 PATH 中，不需要用户手工操作才能继续。需要重新部署时，使用 Python 3.12 创建 venv，按锁文件安装，下载与清单 SHA256 一致的 Blender、MPFB 和 .task；独立扩展仓库名须为 `rally_local`，这是检查脚本的导入名称。

## 恢复的免费角色源包

从 [Quaternius 官方页面](https://quaternius.itch.io/universal-base-characters) 选择免费 Standard 下载，未购买 Source。压缩包 128968391 字节，SHA256 与项目历史值一致：`fdbf1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40`。

压缩包在 `local/downloads/universal-base-standard.zip`，展开在 `local/assets-source/base/Universal Base Characters[Standard]/`。License_Standard.txt 为 CC0。已验证历史使用的 Superhero_Male_FullBody.gltf 和 Hair_SimpleParted.gltf 存在。男性身体 glTF 导入后骨架为 65 骨骼，保存为 `artifacts/character/CHAR-00/quaternius-base-inspection.blend`。

这恢复的是发行 glTF 源资产；保存的 .blend 是重新导入的检查工程，不是付费包中的原始制作文件。尚未运行会覆盖正式 GLB 的 `scripts/prepare-athlete.py`，正式 `src/models/athlete.glb` 未变。

## 验证结果与证据

- 视频 CLI 六项集成检查通过：变帧率／非零起点／空检测、缺失文件、损坏文件、数据包中间截断、数据包边界截断、输入输出冲突。使用官方静态姿态图与空白帧合成 8 帧视频，源时间戳为 300、400、600、900、1300、1800、2400、3100 ms；前四帧检测到人，后四帧为空。
- 保留原始 PTS 与时间基；MediaPipe 使用单独归零且单调递增的毫秒时间戳。临时 JSON 只在完整处理后替换输出，失败不会留下伪成功的部分数据。
- MPFB 生成、蒙皮关联和保存成功；源 glTF 导入成功。模型美观、极限姿态变形和手机预算未验收。
- 合入主线 8164ed8（1.16.6）后，人物相关测试 61/61 通过；构建 `f6efb28b73aee10a`，107 资源。
- 全量测试在 f91fa04 整合版本运行，781 中 774 通过、7 失败，仍是 project-handoff 的 Windows 路径大小写／别名与 symlink EPERM。此次全量测试尝试设置临时目录时路径写错，实际落到 Windows Temp，日志如实保留；改为已存在的完整路径后，仅复跑受影响的 project-handoff 为 23/26 通过，余下两个符号链接用例连同父测试共计 3 失败。未修改系统权限或掩盖失败。

本地证据在 `artifacts/character/CHAR-00/`：`mpfb-base-check.json`、`quaternius-base-inspection.json`、`video-pipeline/review-vfr-pose.json`、`video-pipeline/review-tests.log`、`toolchain-character-tests.log`、`toolchain-build.log`、`toolchain-full-tests.log`、`toolchain-handoff-longpath-tests.log`。大文件和日志未上传，散列见 `CHAR-00-LOCAL-FILES.json`。

## 尚未证明的能力

单目姿态关键点是髋部中心相对估计，不是场地全局移动，不是可直接导入比赛的动画。当前最多检测一人，没有稳定人物 ID；多人比赛需要先明确目标人物／裁切。关键点不包含球拍与触球约束。未验证羽毛球高速挥拍、遮挡、跨帧平滑、骨骼重定向与实时性能。没有声明完整长度的容器可能无法区分正常结束和部分提前截断。

没有安装大型视频动捕模型、Unity 或 Unreal；先以现有硬件和 Three.js 验证最小动作链，再决定是否确实需要其他免费工具。软件准备不能保证 NBA2K 级最终效果。

## 接续

本轮实际将视频工具交给 Sol high 子代理完成，主代理复读代码并独立复跑；没有声称调用 Astra。下一步：取得可逐帧观察的石宇奇参考，制作准备—到位—杀球—落地回位最小骨骼样片，并比较站稳和移动到位两种情境。由 Astra ultra 承担关键动作／骨骼适配设计和复核；免费基础人物二选一仍取决于变形与效果证据，不依据骨骼数量决定。
