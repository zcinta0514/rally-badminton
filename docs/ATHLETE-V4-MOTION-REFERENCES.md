# V4 骨骼、持拍与动作参考

核验日期：2026-09-19。本文是技术参考和建议，不是动作验收结论；当前实施状态仍以 `PROJECT-STATUS.md` 和实际 GLB 检查为准。只查阅源码、文档和许可，没有引入第三方人物、动作数据库或训练权重。

## 与当前工程的对应关系

研究时本地 HEAD、origin/main 和 GitHub 远端 main 均为 `f245201408cae4e195243ec69e172b5d54c5e763`，可达正式标签 v1.7.0；根目录另有大量未提交 V4 成果，不能用已提交代码覆盖。读取了 `scripts/build-athlete-v4-rigged.py`、`src/athlete-v4-rigged-preview.js`、`src/athlete.js` 及当前绑定检查点。

当时 V4 已有 54 骨和 6 段研究动作，问题不是缺少骨头数量：

- `ik_joint()` 保持两段骨长，但靠固定 pole 和近共线时固定 X 轴回退；没有逐帧弯曲平面连续性验收。
- `interpolate()` 对每段位置插值使用 smoothstep；所有控制点都趋近零速度，容易把连续挥拍做成几个停顿。加密到 60 fps 不能解决这个轨迹问题。
- `maximum_ankle_target_error_m` 验证脚踝跟随目标，不等于鞋底无滑移、无穿地。
- 预览 `stopAllAction()` 直接切动作；单段首尾相同也不能证明任意时刻切换流畅。
- 现有 `clear → overhead`、`drop → reach`、`smash → split-step` 是研究预览别名，不是高远、吊球、杀球资产。
- 正式 `src/athlete.js` 已由 `contactAt` 控制击球，使用共享切线的 Hermite 轨迹穿过触球点，可为 V4 时间合同提供本仓参考。

## 核验过的 GitHub 参考

### 1. ozz-animation：两节 IK、接地与相位同步

已通过 GitHub API 核对 master：`744eb9d99f606eda849acb0b1204f7a3dc20bca1`；[许可为 MIT](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/LICENSE.md)。采用实现时需保留版权和许可。

| 官方来源 | 可借鉴的机制 | 对 RALLY 的限制 |
|---|---|---|
| [IKTwoBoneJob](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/include/ozz/animation/runtime/ik_two_bone_job.h) | 固定局部弯曲轴、pole、接近完全伸直时软到达、IK 权重 | 源码明确要求调用方避免目标与 pole 共线；采用 IK 不自动消除翻膝翻肘。软到达会牺牲末端位置，需要重心/步伐配合 |
| [Foot IK 示例](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/samples/foot_ik/README.md) | 骨盆高度修正、腿部 IK、足部朝向和鞋底偏移 | 示例明确不包含完整接地状态管理；RALLY 仍需支撑窗口、离地混合和不可达处理 |
| [Blend 示例](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/samples/blend/README.md) | 动作局部变换按权重混合，步伐时间同步 | 周期移动要对齐落脚相位；不能把击球动作整个拉伸到同一长度，破坏触球时刻 |

落地判断：保留当前 Blender/Three.js 链路，移植设计原则即可；为了这些机制引入完整 C++/WASM 库没有当前收益。

### 2. Three.js r185：现成混合器及受限 IK

项目依赖是 `three@0.185.1`；对照同代 [AnimationAction](https://github.com/mrdoob/three.js/blob/r185/src/animation/AnimationAction.js) 与 [CCDIKSolver](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/animation/CCDIKSolver.js)，[许可 MIT](https://github.com/mrdoob/three.js/blob/dev/LICENSE)。

`AnimationAction` 能以权重混合动画轨，包括骨骼与形态键；`CCDIKSolver` 有每链节的角度/旋转限制和迭代设置。RALLY 可先用现有混合器完成短时过渡。受限 CCD 可以参考约束配置方式，但它的欧拉分量限制不等同于人体关节活动范围；不建议为两节肢体替换已有解析 IK。检查手腕与肩部时应使用骨骼局部坐标，不拿世界 XYZ 角度直接裁剪。

预览拖动时间要求精确采样，应立即定位；正常播放换动作才应用过渡。过渡时不能先 `stopAllAction()`，且应同步混合服装修形轨。混合出的位置仍可能产生新穿插，必须另测过渡中间帧。

### 3. orangeduck/Motion-Matching：带速度的过渡

已通过 GitHub API 核对 main：`57b7250e0d34a4e456a34d47e24c2f05fdcc711e`。[controller.cpp](https://github.com/orangeduck/Motion-Matching/blob/57b7250e0d34a4e456a34d47e24c2f05fdcc711e/controller.cpp) 的 `inertialize_pose_transition`、`inertialize_pose_update` 将位置/旋转及速度差作为衰减偏移，适合连续快速打断时减少速度突变。

[代码许可 MIT](https://github.com/orangeduck/Motion-Matching/blob/main/LICENSE)，但 [README](https://github.com/orangeduck/Motion-Matching) 指出的原始动作数据是 CC BY-NC-ND 4.0。不能把代码许可当作动作库许可；本轮不拿其数据库或网络权重。

落地判断：当前 6 段人工研究动作不值得引入运动匹配和训练流程。先使用短时混合并测量角速度；若高频打断仍明显抽动，再独立实现旋转惯性过渡。惯性偏移在触球/接地约束处需要收敛，不能拖延拍面命中。

### 4. AI4Animation：运动接触相位的研究参照

[官方仓库](https://github.com/sebastianstarke/AI4Animation) 的 SIGGRAPH 2020 Local Motion Phases 展示多接触运动中的局部相位，可参考“左右足接触、手和器械接触分别建模”的思路。

仓库 Copyright Information 明确限制为研究或教育用途；动作捕捉数据为 CC BY-NC 4.0。本项目只把它作为论文/机制参照，不将代码、动作和模型权重复制到产品。研究演示不能证明它能直接生成符合当前 RALLY 骨架和击球合同的羽毛球动作。

### 羽毛球同类项目检索结论

检索包含 badminton、Unity、animation 和 inverse kinematics。查看的 [Badminton-VR](https://github.com/tejasbadone/Badminton-VR) 主要公开说明为 Unity 羽毛球场景 VR 复现，未提供足以核验的高质量全身挥拍、足部锁定或人体约束实现，因此未选为动作实现来源，也未导入其资源。此结论只覆盖本次检索，不代表 GitHub 不存在其他合适项目。

## 本轮建议：先做能复核的持拍基础

以下属于本项目工程建议，数值是待验收的起始目标，不是医学上限或已达到的指标。

1. **握拍先固定。** 自制球拍包含握柄、锥盖、细杆、拍框与拍线；建为手骨 socket 子节点，用同一局部握点推导握柄轴、拍面中心和法线。右手每根手指独立闭合，拇指对掌；不靠把拍柄塞进手掌中心遮住握姿错误。记录接触处截面和局部偏移，所有动作复用。
2. **逐关节约束。** 固定骨长，膝肘保持一致弯曲侧；pole 接近退化时延续上一有效弯曲面，首帧才选明确备用轴。近伸直保留余量；目标不可达先调整步伐/躯干，再有限 IK，禁止拉长肢体。手腕不承担整段挥拍，前臂扭转骨要参与分摊。
3. **有触球速度。** 每段显式标记准备、触球、随挥、回位；引拍到触球与触球到随挥共享非零切线。高远、吊球、杀球可有不同准备和收拍幅度，但每段真实制作并校准，不能把单一片段改名当成三段。
4. **有支撑节奏。** 为两脚分别标记支撑/抬脚窗口。支撑阶段锁定鞋跟或前掌的世界目标，起落脚平滑释放，足部滚动与骨盆起伏配合；脚踝精确不是唯一条件。
5. **有限过渡。** 从 120–180 ms 过渡窗口开始调；任意切换都记录旋转速度、脚底位移和球拍轨迹。击球必须在权威触球时刻收敛；连续打断从实际当前混合姿态起步。暂停/拖动和回放保持确定性。
6. **先解已有穿插。** 弓步短裤裆部是已知未通过项；新片段和混合也会覆盖新姿势，不能用只降低动作幅度或整体撑大裤子替代修复。新动作的视觉完成、骨骼稳定和衣物通过分别记录。

## 多样化动作与解锁架构建议

动作家族与风格变体分开。建议动作注册表至少含：

| 字段 | 含义 |
|---|---|
| `id`, `family`, `variantId`, `clip` | 稳定 ID、击球/移动家族、风格、真实 GLB 片段名 |
| `markers` | 归一化的准备、触球、随挥、回位时刻 |
| `supportWindows` | 两脚独立的支撑区间 |
| `gripProfile`, `contactProfile` | 使用的握姿、触球点和拍面方向合同 |
| `unlockId`, `availability` | 解锁条件引用与制作/验收状态 |
| `allowedTransitions`, `fallbackId` | 可直接过渡的动作与缺失/未解锁时的基础替代 |

可以先制作两种可辨认但不夸张的同族风格：紧凑引拍/标准引拍、短随挥/较充分随挥。前场挑球、正手平抽、反手挡网、后场高远、吊球、杀球分别是不同动作家族；反手还需要不同握姿，不能直接镜像右手正手动作。

解锁系统只选择通过验收的 `variantId`；比赛继续决定根位置、朝向、`contactAt`、`contact`、有效够球范围、`swingTime` 和球路/得分。动画事件不触发第二次击球。将来若动作解锁要改变性能，这是额外的角色平衡与网络同步功能，不能偷偷由某片段更长、更快、拍子更远实现。

建议本轮先在独立审核预览展示动作目录、基础/变体与制作状态；不把本地试听按钮当成已上线的账号解锁系统。

## 应增加的验证

- 导出后逐帧、半帧回读 GLB：骨长漂移、四元数有限且归一、膝肘弯曲侧、局部扭转上限、手指/握柄穿插。
- 对每个击球触球帧记录拍面中心与目标距离、法线误差；握点随手骨的局部变换应恒定。显示球拍轨迹，慢放检查触球附近有无停顿或跳转。
- 支撑窗口记录鞋跟/前掌世界漂移和最低鞋底高度；落地阶段单独检查。可以先以 5 mm 支撑漂移作为审核目标，但必须从鞋底实测并明确容差。
- 除单段闭环，采样常见转换及快速中断的 0%、25%、50%、75%、100% 混合位置；同时查人体、衣物、器械。不能把单片段无穿插推断为混合也无穿插。
- 新骨架继续使用保持层级与 inverse bind matrices 的加载器。旧 18 个语义点比赛接口需要适配，不压平 54 骨。

本文没有宣称上述机制已经实现。是否已完成需以当轮源码、导出资产和实际预览结果核对。


## 2026-09-20 实时球场重建校对

- BWF《Shuttle Time Teachers Manual》：https://badminton.gr/wp-content/uploads/2025/11/Shuttle-Time-Manual.pdf 。PDF 第 49 页用于弓步校对：前脚朝向来球、脚跟先接地、膝盖与脚保持同向，后臂参与平衡；第 74–75 页用于剪刀跳和头顶击球的动作阶段校对。
- BWF《Coach Education Level 1》：https://orpingtonjuniors.com/coach_resources/docs/BWFLevel1Handbook.pdf 。PDF 第 77 页用于垫步时机与落地蹬出；第 91 页用于后场步法组合；第 147 页用于后腿承重与头顶杀球准备。
- 实现中的关节角阈值是该候选的工程约束，不是医学正常活动度结论。来源支持动作顺序，不能代替模型逐帧或实际观看验收。
- 用户已允许本地 V4 运动配置调整比赛时序；本文前述“比赛参数不变”只继续约束默认正式模式与动作解锁，不再限制本次已授权的本地试用。

## 2026-09-20 Three.js 与真实动捕实施路线

本节更新早期的“未引入动作数据”范围：现在仅引入已核对 **CC0** 的
[MultiSenseBadminton](https://github.com/dailyminiii/MultiSenseBadminton)
Sub11 专家骨架片段；代码 MIT 与数据 CC0 分开核验。数据出处、哈希及重现步骤见
[assets/motion/README.md](../assets/motion/README.md)。原视频只作本地参考。

当前工程本来就使用 Three.js，不需要迁移引擎才能改善动作。选用以下分工：

| 环节 | 当前改进 | 不能替代的工作 |
|---|---|---|
| 动作来源 | 高远球、反手平抽各三段真实专家动捕；其余家族独立制作 | 动捕没有手指细节，不能直接生成正确握拍；关节位置不能唯一确定轴向旋转 |
| Blender 离线制作 | 保持人物骨长重定向、连续肩部旋转求解、蒙皮与局部衣物修形；辅助骨算法与运行时一致 | 不把源片段无穿插当作任意混合无穿插 |
| Three.js 运行时 | 播放实际 GLB 动画，按速度衔接；步伐相位、支撑脚、骨盆与击球点共同适配 | 不能靠逐帧旋转关节凭空获得专家发力顺序 |
| 击球时间 | 共享切线的相位映射与连续穿越轨迹；实际拍头和拍面检查 | 源片段触球标记仍是手速峰值估计，不是传感器测得的球拍接触 |
| 质量回路 | 先查真实导出片段，再查 Three.js 适配后的表面和正常速度预览 | 数值通过不能证明动作已达到最终视觉质量 |

没有复制 Motion-Matching、AI4Animation 的受限动作数据，没有引入付费素材、付费工具或云端训练。
当前仍是显式 V4 参数下的制作候选；正式人物替换、推送与部署另行处理。
