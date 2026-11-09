# RALLY V4 Hair 发型检查点

核查日期：2026-09-19。该版本建立在已验收的 V4 Anatomy 上，只审核头皮覆盖、发际线和侧面轮廓；不进入正式比赛运行时。

## 当前产物

- 输入基线：[athlete-v4-anatomy.blend](../artifacts/model-workbench/athlete-v4-anatomy.blend)
- 可编辑源：[athlete-v4-hair.blend](../artifacts/model-workbench/athlete-v4-hair.blend)（Git 忽略的本地工作文件）
- 运行时预览：[athlete-v4-hair.glb](../src/models/athlete-v4-hair.glb)
- 文件大小：752876 字节
- SHA-256：`e300cbc68a42b0117298b2551054bbefec12ea423af8f33f54f0725d6c75b2da`
- 网格：7 个 Anatomy 网格 + 头皮壳与冠部发束层（GLB 中按材质 primitive 展开为 12 个 Three.js Mesh）
- 动画：0；骨骼：0；服装、鞋和绑定：未制作
- 发型实现：[build-athlete-v4-hair.py](../scripts/build-athlete-v4-hair.py)；当前使用 V4 Anatomy 真实头皮拓扑、浅表面发流起伏、低对比三档棕色材质、7 束闭合锥形主发束和 4 束低抬起短副发束，顶部发束的高度、长度和横向偏移做了小幅错落，整体保持向右前方侧扫。公开 CC0 发型仅保存在 `artifacts/model-workbench/reference-hair/` 作为拓扑参考，未进入运行时。

## 固定视角复查

```sh
./artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python scripts/build-athlete-v4-hair.py

./artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python scripts/render-v3-review.py -- \
  src/models/athlete-v4-hair.glb artifacts/model-workbench/v4-hair-review-ref39 glb

node --test tests/athlete-v4-hair.test.js
```

`artifacts/model-workbench/v4-hair-review-ref39/` 提供当前正面、侧面和背面视角。冠部由 7 束闭合、渐缩主发束和低抬起短副发束组成：顶部发束保持错落高度与末端差异，材质对比收窄以避免色块切断，根部衔接头皮壳，发束从后上方向前额并向右侧扫；该版本仍是用户审核中的实验资产。

## 侧边栏预览

预览地址：`http://127.0.0.1:3004/?preview=athlete&model=v4h&rev=20260919-v4-hair-ref39`

页面通过 `src/athlete-v4-hair-preview.js` 接入 `model-preview.js`。该版本仍是静态审核资产，动作按钮、进度条和播放按钮必须保持禁用；不得替换正式比赛使用的 `src/models/athlete.glb`。
