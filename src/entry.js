// The inspection view uses the same athlete as the game, on an explicit URL.
const preview = new URLSearchParams(location.search).get('preview') === 'athlete';
import(new URL('../runtime-config.js', import.meta.url).href).then(() => import(preview ? './model-preview.js' : './main.js')).catch(error => {
  console.error(error);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = '加载失败，请联网后重试。若已缓存，请关闭全部开拍窗口后重新打开。';
});
