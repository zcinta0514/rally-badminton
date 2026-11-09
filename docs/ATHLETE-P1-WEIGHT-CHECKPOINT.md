# P1 肘／前臂与踝足权重修复检查点

2026-10-02。对应 P1-1、P1-2。历史证据，不替代 PROJECT-STATUS.md。整体运动质量未通过。

## 基线与制作

- 工作期间远端从 f245201 更新到 d15ff7c（v1.7.1），本地 main 已快进整合。原改动保存在 artifacts/p1-weight-repair/baseline/workspace.tar、pre-v1.7.1-integration.patch 和命名 stash 中。解决 index.html 与 shared/game.js 两处冲突时保留新计分及原布局／运动功能。未提交、推送或部署。
- 原 P1-03 GLB：07273aa822cda78c023428fd91b4fd40b4f8e7e0fb8674e8c03f15cdf6f22158。新独立 P1：864189e54cd3924504baa5461da1626b63ecd07e24ab826c3bf62423bc4b8856。正式 athlete.glb 与冻结 V4 不变。
- 制作文件：artifacts/p1-weight-repair/combined-03/athlete-p1.blend；SHA256：4de17df23d83f867ca117cb398d78aae18cb4accefc7870bdd79ae14b3974188。
- Blender 5.2.2：连续踝足权重；修正两根 UpperArmTwist 的绑定轴；每肘新增25%、50%、75%旋转段，共71骨。只烘焙新增辅助骨曲线，原网格、形态键、原动作曲线与主骨保留，每顶点最多四影响。
- 重建命令：Blender 后台运行 scripts/build-p1-weight-repair.py，参数 --out <新目录> --arm-segments --elbow-bias .0075 --feet。输出目录冻结构建脚本与权重模块。

## 失败数与回退

| 检查口径 | 原 P1-03 | 当前候选 |
| --- | ---: | ---: |
| 六段源动作身体，30 Hz | 162/281 | 1/281 |
| 源动作加密，60 Hz | 未同口径重采 | 1/554 |
| 实际运行身体交叉 | 43/77 | 28/77 |
| 实际衣物／球拍 | 31/77 | 29/77 |

源动作肘／前臂／踝足失败均为0；唯一失败为左拇指碰大腿。实际运行踝足交叉231→0对，右臂局部557→248对，臂与躯干881→891对。

新增右臂失败：overhead-0-102（18对）、overhead-1-164（27对）、overhead-2-102（48对）、drive-0-164（30对）。上衣穿入点4285→4616，最大深度32.221→35.801 mm。袜鞋改善不等于所有服装改善。

## 运行旋转与额外覆盖

直接对最终前臂旋转作连续分数幂会保留整圈，收拍后辅助骨残留180°；该方案拒绝。改为保存动画采样后的主骨和辅助骨，仅分配随后 IK 的相对增量。真实防守回位会越过π再返回，因此相对增量也必须连续选取四元数符号。

全部48个固定回放、双方共96条轨迹中，4次触发完整旋转回环；0.18秒残余偏移回正明确标为 P1_FULL_TURN_RECOVERY，暂停不推进。结束时均无未完成回正。这是已记录的退化行为，不构成正常速度视觉验收。四项真实发球／防守回位回归与九项旋转测试通过。

12例浏览器覆盖五组两端，72张前后截图、24次倒带，游戏状态一致，0页面错误、采样检查点0旋转告警；全轨迹140条回正状态另记录，不能用稀疏截图掩盖它们。

## 最终证据

目录：artifacts/p1-weight-repair/combined-03/。

- motion-audit.json、motion-audit-60hz.json：源动作。
- authoring-qa.json、grip-qa.json：制作控制器／原始权重、握拍复核。
- runtime-continuous-ik/manifest.json：最终实际Three.js表面、资产及源码哈希。
- runtime-continuous-ik-body-qa.json、runtime-continuous-ik-surface-qa.json：最终身体及衣物／球拍。
- region-comparison-relative-ik.json/md：分区；其77帧与最终连续增量版全部几何SHA256相同，因此计数仍适用。它本身是中间版本报告。
- browser-continuous-ik/report.json：浏览器；service-verification-final.json：111项HTTP资源。
- ../audit/relative-branch/probe-all48-final.json：全部固定回放轨迹。
- node-tests-final.log：718/719通过，唯一失败为更长V4 AI比赛支撑误差11.391 mm超过10 mm。未放宽断言。

本地预览端口3016，构建54c0721cbb4f7876；侧边栏实际加载两名71骨P1，资产哈希吻合、无Service Worker controller，防守回位第33帧辅助骨正常更新。线上未核验。

下一步：实际IK后右肘局部折叠、臂躯干避让与上衣回退；整圈回正视觉评估；更长比赛支撑误差。P1-1继续未完成。
