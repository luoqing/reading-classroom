import WebSocket from 'ws';
import { createHmac, randomInt, randomUUID } from 'node:crypto';

export interface TencentSoeResult {
  rawResult: string;
  sid: string;
}

interface TencentSoeConfig {
  appId: string;
  secretId: string;
  secretKey: string;
}

function objectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resultText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (objectValue(value)) return JSON.stringify(value);
  return null;
}

export function configuredTencentSoe(): boolean {
  return Boolean(
    process.env.TENCENT_SOE_APP_ID
      && process.env.TENCENT_SOE_SECRET_ID
      && process.env.TENCENT_SOE_SECRET_KEY,
  );
}

function readConfig(): TencentSoeConfig {
  const appId: string = process.env.TENCENT_SOE_APP_ID || '';
  const secretId: string = process.env.TENCENT_SOE_SECRET_ID || '';
  const secretKey: string = process.env.TENCENT_SOE_SECRET_KEY || '';
  if (!appId || !secretId || !secretKey) {
    throw new Error('老师尚未配置腾讯评测服务。');
  }
  return { appId, secretId, secretKey };
}

function buildSocketUrl(text: string, config: TencentSoeConfig): string {
  const host: string = 'soe.cloud.tencent.com';
  const timestamp: number = Math.floor(Date.now() / 1000);
  const parameters: Record<string, string> = {
    eval_mode: '2',
    expired: String(timestamp + 3600),
    nonce: String(randomInt(100000000, 999999999)),
    rec_mode: '1',
    ref_text: text,
    score_coeff: '1.0',
    secretid: config.secretId,
    sentence_info_enabled: '0',
    server_engine_type: '16k_zh',
    text_mode: '0',
    timestamp: String(timestamp),
    voice_format: '0',
    voice_id: randomUUID(),
  };
  const sortedKeys: string[] = Object.keys(parameters).sort();
  const signingQuery: string = sortedKeys
    .map((key: string) => `${key}=${parameters[key]}`)
    .join('&');
  const signingText: string = `${host}/soe/api/${config.appId}?${signingQuery}`;
  const signature: string = createHmac('sha1', config.secretKey)
    .update(signingText)
    .digest('base64');
  const requestQuery: string = sortedKeys
    .map((key: string) => `${encodeURIComponent(key)}=${encodeURIComponent(parameters[key])}`)
    .concat(`signature=${encodeURIComponent(signature)}`)
    .join('&');
  return `wss://${host}/soe/api/${config.appId}?${requestQuery}`;
}

export function callTencentSoe(text: string, audio: Buffer): Promise<TencentSoeResult> {
  if (audio.length > 60 * 16000 * 2) {
    throw new Error('腾讯录音模式最多评测60秒，请缩短录音后重试。');
  }
  const socket: WebSocket = new WebSocket(buildSocketUrl(text, readConfig()), {
    handshakeTimeout: 20000,
  });
  return new Promise<TencentSoeResult>((resolve, reject) => {
    let finished: boolean = false;
    let latestResult: string | null = null;
    const deadline: ReturnType<typeof setTimeout> = setTimeout(
      () => finish(new Error('腾讯评测超时，请重试。')),
      75000,
    );
    const finish = (error?: Error, result?: TencentSoeResult): void => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      socket.close();
      if (error) reject(error);
      else if (result) resolve(result);
    };
    socket.addEventListener('error', () => {
      finish(new Error('腾讯评测连接失败，请检查服务配置或稍后重试。'));
    });
    socket.addEventListener('close', () => {
      if (!finished) finish(new Error('腾讯评测连接提前关闭，请重试。'));
    });
    socket.addEventListener('message', (event: WebSocket.MessageEvent) => {
      try {
        const parsed: unknown = JSON.parse(String(event.data));
        if (!objectValue(parsed) || typeof parsed.code !== 'number') {
          finish(new Error('腾讯评测返回的数据无法解析，请重试。'));
          return;
        }
        if (parsed.code !== 0) {
          finish(new Error(`腾讯评测未完成（错误码 ${parsed.code}），请检查额度或录音。`));
          return;
        }
        const currentResult: string | null = resultText(parsed.result);
        if (currentResult) latestResult = currentResult;
        if (Number(parsed.final) === 1) {
          if (!latestResult) {
            finish(new Error('腾讯评测未返回有效结果，请重新录音。'));
            return;
          }
          finish(undefined, {
            rawResult: latestResult,
            sid: typeof parsed.voice_id === 'string' ? parsed.voice_id : '',
          });
        }
      } catch {
        finish(new Error('腾讯评测返回的数据无法解析，请重试。'));
      }
    });
    socket.addEventListener('open', () => {
      try {
        socket.send(audio, { binary: true });
        socket.send(JSON.stringify({ type: 'end' }));
      } catch {
        finish(new Error('腾讯评测音频发送失败，请重试。'));
      }
    });
  });
}
