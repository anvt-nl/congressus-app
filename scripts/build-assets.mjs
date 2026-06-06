import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const vendorDir = resolve(rootDir, "source/html/vendor");

await mkdir(vendorDir, { recursive: true });

await copyFile(
  resolve(rootDir, "node_modules/lucide/dist/umd/lucide.min.js"),
  resolve(vendorDir, "lucide.min.js"),
);

await copyFile(
  resolve(rootDir, "node_modules/html5-qrcode/html5-qrcode.min.js"),
  resolve(vendorDir, "html5-qrcode.min.js"),
);
