# V4 Clothing / 全身精修检查点｜2026-09-19

> 更新：本文件保留原阶段记录。2026-09-19 后续近景贴合、独立绑定与基础动作状态以 [V4 Detail / Rig 检查点](ATHLETE-V4-DETAIL-RIG-CHECKPOINT.md) 为准；用户已授权推进绑定，但未授权替换正式比赛人物。

本文件是当前 V4 人物工作的最新入口。用户选择：**服装优先，随后精修头脸；参考图式写实游戏角色**。已完成独立静态候选 `appearance-1.0.0`，待用户审美确认；不是正式比赛角色更新。

## 基线与现状

- 实施前核对本地、远端 main 和 `v1.6.1`，均指向 `84b32a8`；主工作区含此前未提交成果，另一个 `happy-panini` 工作树干净且同提交。
- 已在 `artifacts/model-workbench/v4-implementation-backup/` 保存实施前源文件归档、差异和原资产指纹。未清理、重置或覆盖旧模型。
- Hair ref39 保持 752876 字节、SHA-256 `e300cbc68a42b0117298b2551054bbefec12ea423af8f33f54f0725d6c75b2da`。
- 本轮仅为本地制作，未提交、未推送、未部署。正式发布仍是 1.6.1，不用开发资产修订号冒充线上产品版本。

## 交付

| 候选 | GLB | 字节 | 三角形 | primitive | 材质 | 内嵌图片 |
|---|---|---:|---:|---:|---:|---:|
| 服装轮廓与结构 | `src/models/athlete-v4-clothing.glb` | 1851416 | 71798 | 68 | 17 | 0 |
| 全身精修 | `src/models/athlete-v4-polished.glb` | 4288936 | 102946 | 44 | 17 | 4 |

- Clothing SHA-256：`f965c0c0833f4fc3b2c011db4913ac5dcd636b0a4c6085640dd1247e4b6588c1`。
- Polished SHA-256：`c577d5bbe4a8fa9c2fa13f0289dda7d0867b1075eeeea0f1943993911c55bc09`。
- 同名 `.blend` 可编辑源位于 `artifacts/model-workbench/`，属于 Git 忽略的本地工程，需要另行备份。
- `scripts/build-athlete-v4-clothing.py` 从冻结 Hair 源重建独立服装；传 `--polish` 运行 `scripts/v4_surface_polish.py` 的头脸和表面精修。
- `scripts/render-v4-character-review.py` 从导出的 GLB 回读渲染，避免只验收 Blender 源而遗漏导出差异。

球衣采用连续肩袖版片、独立包边；短裤采用腰部与双腿筒连续拓扑、无重叠裆部封盖。白色袜子、角色左护腕和左髌腱带独立可隐藏。鞋包含鞋面、鞋底、鞋舌、鞋带、支撑片和原创简化鞋底纹路。

全身版重建短发冠部与侧后渐变，增加眉毛，按眼眶中心校正眼球位置，加入皮肤颜色层次。衣料、毛巾和发流的法线图由确定性程序生成；原创球衣印花使用 1K 图集，避免顶点色分界产生阶梯。没有引入品牌 Logo 或外部商品贴图。

## 静态 QA 与视觉检查

机器记录在 `docs/ATHLETE-V4-ASSET-QA.json`，与上述 GLB 的 SHA-256 绑定。构建在以下检查失败时中止导出：

- 衣物与身体的顶点、面中心采样穿透数为 0（穿透容差 0.5 mm）。
- 球衣、短裤非相邻三角形交叉数为 0，多面共用的异常边为 0；开口环分别为 4、3。
- 球衣主体与短裤主体的表面接触数为 0。
- GLB 保持 0 骨架、0 动画；人体 POSITION 数据与 ref39 相同，保留完整身体。

上述是静态采样与三角形交叉检查，不是连续碰撞证明，也不覆盖动作后的变形。相邻面和共面重合不由该射线交叉算法完整判定，须结合视觉与边界检查。

最终固定图在 `v4-clothing-final/` 和 `v4-polished-final/`（均位于 `artifacts/model-workbench/`）：正、侧、背、前后 3/4，以及肩腋、裆部、鞋部、鞋底；精修版另有头脸近景。已复查主要轮廓、袖口连接、衣裤交界、裆部和接地。

品质限制：当前是可继续绑定的静态候选。近景皮肤、眉毛和发丝仍采用有限几何/材质表现；球鞋内部结构和鞋底是原创简化结构。不能称为参考图等精度扫描人物，也尚未通过手机上的双人动画性能验收。

专项与全量验证：新增资产测试 8/8；全量 `npm test` 602/602；`npm run build` 通过。侧边栏已实测近景切换、护腕隐藏/恢复、服装与精修切换、返回现役人物后恢复动作控件，再切回静态版重新禁用。单人预览含阴影时 renderer 记录 90 次绘制、206116 三角形；这是桌面预览统计，不是手机比赛性能结论。

## 侧边栏与复现

- 服装入口：`?preview=athlete&model=v4c`；精修入口：`?preview=athlete&model=v4p`。
- 支持全身、头脸、鞋部查看；护腕与髌腱带可切换显示。动作、播放、进度和配色保持禁用。
- 本轮最终服务在 `http://127.0.0.1:3005/`，实际页面读取两份 GLB 的字节数和 SHA-256 与本文件一致，build id 为 `1d5efb8dfae47f16`。端口只代表本次本地会话。

```sh
BLENDER=./artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender
"$BLENDER" --background --factory-startup --python scripts/build-athlete-v4-clothing.py
"$BLENDER" --background --factory-startup --python scripts/build-athlete-v4-clothing.py -- --polish
"$BLENDER" --background --factory-startup --python scripts/render-v4-character-review.py -- \
  src/models/athlete-v4-polished.glb artifacts/model-workbench/v4-polished-final
node --test tests/athlete-v4-clothing.test.js
npm test
npm run build
```

重建后同步 QA 记录的哈希和统计，再运行测试。每次模型或预览源码变化后重启对应服务、用新 `rev` 重新导航，并在页面内 fetch 后计算 SHA-256。后续绑定必须先读 `docs/ATHLETE-V4-RIG-READINESS.md`，其中纠正了旧计划把运行时误写为 19 骨的问题。
