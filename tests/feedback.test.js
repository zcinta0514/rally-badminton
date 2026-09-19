import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeedbackMailto } from '../src/feedback.js';

test('feedback mailto includes the selected type, content, and contact', () => {
  const value = buildFeedbackMailto({
    recipient: '2228144556@qq.com',
    category: 'network',
    content: '好友加入房间后偶尔看不到对方。',
    contact: 'example@example.com',
  });
  const url = new URL(value);
  assert.equal(url.protocol, 'mailto:');
  assert.equal(url.pathname, '2228144556@qq.com');
  assert.equal(url.searchParams.get('subject'), '开拍 RALLY 反馈 · 联机问题');
  assert.match(url.searchParams.get('body'), /问题类型：联机问题/);
  assert.match(url.searchParams.get('body'), /好友加入房间后偶尔看不到对方。/);
  assert.match(url.searchParams.get('body'), /联系方式：example@example.com/);
});

test('feedback mailto rejects empty content and invalid recipient', () => {
  assert.throws(() => buildFeedbackMailto({ recipient: '2228144556@qq.com', content: '   ' }), /请写下具体问题/);
  assert.throws(() => buildFeedbackMailto({ recipient: 'not-an-email', content: '内容' }), /收件地址配置无效/);
});
