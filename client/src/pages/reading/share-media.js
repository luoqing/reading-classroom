import './share-media.css';
import { safeFileName } from './downloads';

export const shareIcon = '<svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V3m-4 4 4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';

export async function uploadShareVideo(blob, title) {
  const { uploadFile } = await import('../../components/business-ui/api/files/service');
  const file = new File([blob], `${safeFileName(title)}-朗读视频.webm`, { type: 'video/webm' });
  const result = await uploadFile(file);
  if (!result.url) throw Error('视频保存失败，请重试。');
  return new URL(result.url, location.origin).href;
}

export function showShareDialog(url, kind = '录音', expires = false) {
  if (!url) throw Error(`${kind}暂时无法分享。`);
  const dialog = document.createElement('dialog');
  dialog.className = 'media-share-dialog';
  const heading = document.createElement('h2');
  heading.textContent = `分享${kind}`;
  const description = document.createElement('p');
  description.textContent = expires
    ? '复制链接发给家长或同学。录音链接在约 1 小时后失效，届时可重新生成。'
    : '视频已保存。复制链接发给家长或同学，收到链接的人可以直接观看。';
  const input = document.createElement('input');
  input.value = new URL(url, location.origin).href;
  input.readOnly = true;
  input.setAttribute('aria-label', `${kind}分享链接`);
  input.onclick = () => input.select();
  const status = document.createElement('p');
  status.className = 'media-share-status';
  status.setAttribute('role', 'status');
  const actions = document.createElement('div');
  actions.className = 'media-share-actions';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'primary';
  copy.textContent = '复制链接';
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(input.value);
      status.textContent = '已复制，直接粘贴发送即可。';
    } catch {
      input.focus();
      input.select();
      status.textContent = '请长按或按 Ctrl+C 复制选中的链接。';
    }
  };
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'secondary';
  close.textContent = '完成';
  close.onclick = () => dialog.close();
  actions.append(copy, close);
  dialog.append(heading, description, input, status, actions);
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
  copy.focus();
  input.scrollLeft = 0;
}
