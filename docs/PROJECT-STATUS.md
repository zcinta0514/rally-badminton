# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-11-08",
  "baseline": {
    "branch": "main",
    "head": "a8c4a8f25e014d6dad7072daa3568886819dfab9",
    "originMain": "a8c4a8f25e014d6dad7072daa3568886819dfab9",
    "releaseTag": "v1.15.0"
  },
  "activeTask": {
    "title": "SMASH-1：杀球动作已合并并上线",
    "scope": "保留R3肘领先与髋胸错峰，修复远触点肘腕翻转、引拍停顿及离地脚部补偿突变；修正手臂误绑定头部造成的腕部尖刺。",
    "nextAction": "本任务功能已交付；用户可在正式游戏或新旧对比页检查实际手感。",
    "blockedBy": [],
    "documents": [
      "docs/tasks/SMASH-1.md"
    ],
    "checkpoint": "docs/SMASH-1-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "1.15.0已合并、打标签并发布；Pages/Vercel生产资源核验通过。",
    "localPreview": {
      "task": "SMASH-1",
      "url": "http://127.0.0.1:3256/?preview=smash&revision=1.15.0",
      "worktree": "/Users/xindong/Documents/开拍rally-smash-motion",
      "verifiedOn": "2026-11-08",
      "buildId": "218fbb52f2f88429",
      "limitations": "3256已重启为正式源码快照；最终画面及缓存更新另外以线上核验为准。实体手机和完整表面碰撞审计未执行。"
    },
    "production": {
      "commit": "a8c4a8f25e014d6dad7072daa3568886819dfab9",
      "pullRequest": "https://github.com/zcinta0514/rally-badminton/pull/20",
      "release": "https://github.com/zcinta0514/rally-badminton/releases/tag/v1.15.0",
      "pagesBuild": "fe9d7433146d69b2",
      "vercelBuild": "218fbb52f2f88429",
      "verifiedOn": "2026-11-08"
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
    "branch": "docs/SMASH-1-release-result",
    "baselineHead": "a8c4a8f25e014d6dad7072daa3568886819dfab9",
    "taskFile": "docs/tasks/SMASH-1.md",
    "worktree": "/Users/xindong/Documents/开拍rally-smash-motion",
    "phase": "已合并、上线并完成双站浏览器核验",
    "stopReason": "SMASH-1已交付；保留本地预览、录像与证据。",
    "nextAction": "本任务已完成；正式游戏和新旧对比均可查看。",
    "checkpoint": "docs/SMASH-1-CHECKPOINT.md",
    "validation": "767/767；Node22/24 CI通过；main测试和Pages部署成功。双站各13项资源与对应构建完全一致；Pages浏览器已通过正常空闲更新从1.14.0切到1.15.0并显示杀球公告，正式对比页双方模型ready。无实体手机或完整碰撞审计。 Vercel正式对比页实读218fbb52f2f88429，双方模型ready。",
    "scopeBoundary": "用户2026-11-08授权继续优化杀球、检查关节，测试通过后合并main；已核实main会自动发布。"
  },
  "publication": "PR #20已于2026-11-08合并main a8c4a8f2；v1.15.0标签与GitHub Release指向该提交。Pages fe9d7433146d69b2、Vercel 218fbb52f2f88429资源均已核验。"
}
-->
