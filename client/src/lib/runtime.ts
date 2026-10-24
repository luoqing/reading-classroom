export function isStandaloneRuntime() {
  if (process.env.STANDALONE_CONTENT === 'true') return true;
  const platform = window.__platform__ as Record<string, unknown> | undefined;
  return !platform || Object.keys(platform).length === 0;
}
