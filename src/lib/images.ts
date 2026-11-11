// 图片条目识别与自然排序。

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "avif",
  "bmp",
  "svg",
]);

export function isImagePath(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  if (name.startsWith(".")) return false; // 跳过隐藏文件（macOS 的 .DS_Store 等）
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

// Intl.Collator numeric: 按数字语义排序（2 在 10 之前）
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/** 按压缩包内路径排序：先目录结构，再自然数字序。 */
export function sortImagePaths(paths: string[]): string[] {
  return [...paths].sort(collator.compare);
}

/** 取文件名（不含目录与扩展名）。 */
export function baseName(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
