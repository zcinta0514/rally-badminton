# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-11-08",
  "baseline": {
    "branch": "main",
    "head": "e1b3d2cf39e1e081edcbba65f89311ccea915ca6",
    "originMain": "e1b3d2cf39e1e081edcbba65f89311ccea915ca6",
    "releaseTag": "v1.14.0"
  },
  "activeTask": {
    "title": "SMASH-1 R4：杀球连贯性与关节检查，准备合并",
    "scope": "保留R3肘领先与髋胸错峰，修复远触点肘腕翻转、引拍停顿及离地脚部补偿突变；修正手臂误绑定头部造成的腕部尖刺。",
    "nextAction": "核对最终原速/慢放实物，自审、提交PR，检查通过后按用户授权合并并核验生产部署。",
    "blockedBy": [],
    "documents": [
      "docs/tasks/SMASH-1.md"
    ],
    "checkpoint": "docs/SMASH-1-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "User authorized merge after smoothing and joint checks; final local validation in progress.",
    "localPreview": {
      "task": "SMASH-1",
      "url": "http://127.0.0.1:3257/?preview=smash&revision=4-skin-final",
      "worktree": "/Users/xindong/Documents/开拍rally-smash-motion",
      "verifiedOn": "2026-11-08",
      "buildId": "b04f294f9765fca9",
      "limitations": "仍运行整合前快照，尚未重启核验；实体手机未测试。"
    }
  },
  "readNext": [
    "docs/tasks/SMASH-1.md",
    "docs/SMASH-1-CHECKPOINT.md"
  ],
  "links": [
    "docs/tasks/UI-2.md",
    "docs/UI-2-CHECKPOINT.md",
    "docs/tasks/HELL-2.md",
    "docs/HELL-2-CHECKPOINT.md"
  ],
  "handoff": {
    "taskId": "SMASH-1",
    "branch": "feat/SMASH-1-natural-motion",
    "baselineHead": "e1b3d2cf39e1e081edcbba65f89311ccea915ca6",
    "taskFile": "docs/tasks/SMASH-1.md",
    "worktree": "/Users/xindong/Documents/开拍rally-smash-motion",
    "phase": "已整合HELL-2主线，重新验证",
    "stopReason": "进行中；用户已认可前一动作并授权继续优化、测试通过后合并。",
    "nextAction": "核对最终原速/慢放实物，自审、提交PR，检查通过后按用户授权合并并核验生产部署。",
    "checkpoint": "docs/SMASH-1-CHECKPOINT.md",
    "validation": "整合前761/761与构建b04f294f9765fca9通过；整合后需重跑，不沿用旧结果。",
    "scopeBoundary": "用户2026-11-08授权继续优化杀球、检查关节，测试通过后合并main；已核实main会自动发布。"
  },
  "publication": "已保存本地提交98085908；正在整合最新main e1b3d2cf，保留地狱人机与鱼跃，不覆盖最新功能。"
}
-->
