const categoryLabels = Object.freeze({
  controls: '操作手感',
  network: '联机问题',
  performance: '画面或性能',
  suggestion: '功能建议',
  other: '其他',
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function buildFeedbackMailto({ recipient, category, content, contact = '' } = {}) {
  if (typeof recipient !== 'string' || !emailPattern.test(recipient.trim())) throw new Error('反馈收件地址配置无效。');
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) throw new Error('请写下具体问题或建议。');
  const type = categoryLabels[category] || categoryLabels.other;
  const subject = `开拍 RALLY 反馈 · ${type}`;
  const body = [
    `问题类型：${type}`,
    '',
    '具体内容：',
    text,
    '',
    `联系方式：${typeof contact === 'string' && contact.trim() ? contact.trim() : '未提供'}`,
  ].join('\n');
  return `mailto:${recipient.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function initFeedback({ document: doc = globalThis.document, recipient, canOpen = () => true, openDialog = () => {}, navigate = url => { globalThis.location.href = url; } } = {}) {
  const trigger = doc?.getElementById('open-feedback');
  const backdrop = doc?.getElementById('dialog-backdrop');
  if (!trigger || !backdrop) return null;
  const dialog = doc.createElement('section');
  dialog.id = 'feedback-dialog';
  dialog.className = 'dialog feedback-dialog';
  dialog.hidden = true;
  dialog.setAttribute('aria-labelledby', 'feedback-title');
  dialog.innerHTML = `<button class="close-dialog" type="button" data-close aria-label="关闭意见反馈">×</button><div class="eyebrow">MAKE THE NEXT GAME BETTER</div><h2 id="feedback-title">意见反馈。</h2><p>遇到问题，或有想增加的玩法？写下来，邮件会发送到 <a href="mailto:${recipient}">${recipient}</a>。</p><form id="feedback-form"><label class="input-label" for="feedback-category">问题类型</label><select id="feedback-category" name="category"><option value="controls">操作手感</option><option value="network">联机问题</option><option value="performance">画面或性能</option><option value="suggestion">功能建议</option><option value="other">其他</option></select><label class="input-label" for="feedback-content">具体内容</label><textarea id="feedback-content" name="content" rows="5" maxlength="4000" required placeholder="请描述你遇到的问题或想法…"></textarea><label class="input-label" for="feedback-contact">联系方式 <small>选填，便于回复</small></label><input id="feedback-contact" name="contact" maxlength="200" autocomplete="email" placeholder="邮箱、微信或其他联系方式"><p id="feedback-status" class="feedback-status" role="status" aria-live="polite">提交后会打开你的邮件客户端，最终发送需要在邮件应用中确认。</p><button class="primary-btn" type="submit">打开邮件客户端 <span>↗</span></button></form>`;
  backdrop.append(dialog);
  const form = dialog.querySelector('#feedback-form');
  const category = dialog.querySelector('#feedback-category');
  const content = dialog.querySelector('#feedback-content');
  const contact = dialog.querySelector('#feedback-contact');
  const status = dialog.querySelector('#feedback-status');
  const open = () => {
    if (!canOpen()) return false;
    form.reset();
    status.textContent = '提交后会打开你的邮件客户端，最终发送需要在邮件应用中确认。';
    openDialog('feedback-dialog');
    category.focus();
    return true;
  };
  trigger.addEventListener('click', open);
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const url = buildFeedbackMailto({ recipient, category: category.value, content: content.value, contact: contact.value });
      status.textContent = '正在打开邮件客户端；最终发送需要在邮件应用中确认。';
      navigate(url);
    } catch (error) {
      status.textContent = error.message;
      content.focus();
    }
  });
  return { dialog, open };
}

export { categoryLabels };
