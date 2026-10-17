import type { FileService } from '@lark-apaas/fullstack-nestjs-core';

const STORAGE_OBJECT_PATTERN = /\/runtime\/api\/v1\/storage\/object\/([^/]+)\/(.+)$/;

export async function signedStoredFileUrl(
  files: FileService,
  bucketId: string | null,
  filePath: string | null,
) {
  if (!bucketId || !filePath) return null;
  try {
    return await files.from(bucketId).createSignedUrl(filePath.replace(/^\//, ''), 3600);
  } catch {
    return null;
  }
}

export async function signedStorageObjectUrl(files: FileService, url: string | null) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const match = url.match(STORAGE_OBJECT_PATTERN);
  if (!match) return url;
  return signedStoredFileUrl(files, match[1], decodeURIComponent(match[2]));
}
