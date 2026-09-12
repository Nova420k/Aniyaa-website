import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dest = join(root, "site");

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

const files = [
  "index.html",
  "faq.html",
  "download.html",
  "changelog.html",
  "privacy.html",
  "404.html",
  "favicon.png",
  "robots.txt",
  "sitemap.txt",
  "sitemap.xml",
  "site.webmanifest",
  "LICENSE",
];

for (const file of files) {
  cpSync(join(root, file), join(dest, file));
}

cpSync(join(root, "css"), join(dest, "css"), { recursive: true });
cpSync(join(root, "js"), join(dest, "js"), { recursive: true });
cpSync(join(root, "images"), join(dest, "images"), { recursive: true });

console.log("Prepared ./site");
