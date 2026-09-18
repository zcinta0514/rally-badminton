// Player-facing release notes are intentionally separate from the build hash.
// Internal-only changes can produce a new asset version without showing a new notice.
export const RELEASE_NOTICE = Object.freeze({
  id: '2026-09-18-ai-difficulty',
  title: '人机强度更新',
  summary: '入门更容易上手，高手更难被摸透。',
  items: Object.freeze([
    '入门档提供更宽松的接球范围、时机和输入缓冲。',
    '进阶档保持标准节奏，适合从辅助过渡到正常对局。',
    '高手档会动态改变线路、深浅和出手选择，减少固定套路。',
  ]),
});
