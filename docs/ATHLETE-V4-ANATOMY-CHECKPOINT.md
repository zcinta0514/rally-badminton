# RALLY V4 Anatomy 人体细节检查点

核查日期：2026-09-18。该版本是 V4 全量重制路线的第二个可视检查点，只用于侧边栏审核人体、面部、手脚和整体轮廓；不进入正式比赛运行时。

## 当前产物

- 可编辑源：[athlete-v4-anatomy.blend](../artifacts/model-workbench/athlete-v4-anatomy.blend)（Git 忽略的本地工作文件）
- 运行时预览：[athlete-v4-anatomy.glb](../src/models/athlete-v4-anatomy.glb)
- 文件大小：704904 字节
- SHA-256：`5cde53b4489560ce6a9258b816a98edde2f00815a28603d5a55dc80c8d4524a7`
- 网格：1 个身体网格 + 6 个眼部/虹膜/瞳孔细节网格
- 动画：0；骨骼：0；头发、服装、鞋、绑定和动作：未制作
- 来源：Blender Studio Human Base Meshes v1.4.1（CC0）独立男性人体和双眼；V4 比例变换与眼球位置修正由项目脚本生成

## 构建与复查

从项目根目录运行：

```sh
./artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python scripts/build-athlete-v4-anatomy.py

./artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python scripts/render-v3-review.py -- \
  src/models/athlete-v4-anatomy.glb artifacts/model-workbench/v4-anatomy-review-2 glb

node --test tests/athlete-v4-anatomy.test.js
```

固定前、侧、后视角位于 `artifacts/model-workbench/v4-anatomy-review-2/`。复查确认眼球源对象的错误父级变换已经解除，巩膜不再漂移到面部右侧。

## 侧边栏预览

预览地址：`http://127.0.0.1:43330/?preview=athlete&model=v4a&rev=20260918-v4-anatomy-3`

页面通过 `src/athlete-v4-anatomy-preview.js` 接入 `model-preview.js`。浏览器实测结果：HTTP 200、704904 字节、SHA-256 与上方一致、7 个网格；动作按钮、进度条和播放按钮均禁用。

该版本仍是审核资产，不得替换正式比赛使用的 `src/models/athlete.glb`，也不得在没有重新验收的情况下加入服装、绑定或动作系统。
