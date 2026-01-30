const fs = require("fs");
const path = require("path");

const projectName = process.argv[2];

if (!projectName) {
  console.error("❌ 请提供项目名称！");
  process.exit(1);
}

const rootDir = path.resolve(__dirname, "..");
const templateDir = path.join(rootDir, "examples", "_template");
const targetDir = path.join(rootDir, "examples", projectName);

if (fs.existsSync(targetDir)) {
  console.error(`❌ 目录已存在: ${projectName}`);
  process.exit(1);
}

console.log(`🚀 创建中: ${projectName}...`);

// 复制文件夹
fs.cpSync(templateDir, targetDir, { recursive: true });

// 修改 package.json name
const pkgPath = path.join(targetDir, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
pkg.name = projectName;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

console.log(
  `✅ 完成！你可以运行: pnpm install && pnpm --filter ${projectName} dev`,
);
