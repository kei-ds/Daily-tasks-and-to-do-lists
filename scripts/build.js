'use strict';

// electron-builder 的包装脚本。
//
// 为什么需要它：electron-builder 打包 Windows 时会调 app-builder 内置的 rcedit 命令去写
// exe 的图标和版本信息，而这个命令会先去下载 winCodeSign 工具包。那个包里 darwin/ 和
// linux/ 目录下有符号链接，在没开「开发者模式」、也不是管理员的 Windows 上，7za 解压
// 符号链接会失败（ERROR: Cannot create symbolic link），于是整个构建以退出码 1 崩溃，
// exe 的图标和版本信息全都停留在 Electron 的默认值。
//
// 这里不去绕它的下载（app-builder 会校验 sha512，改过的包对不上），而是彻底不用它的
// rcedit：自己把工具包下载下来、跳过含符号链接的目录解压、取出 rcedit-x64.exe，
// 然后在 afterPack 钩子里自己调用（见 scripts/afterpack.js）。
// 配合 package.json 里的 signAndEditExecutable: false，electron-builder 就完全不会去碰
// winCodeSign 了。顺带的好处是这个构建在没装开发模式、没有管理员权限的机器上都能跑。

const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'build', 'cache');
const RCEDIT = path.join(CACHE_DIR, 'rcedit-x64.exe');
// 只排除含符号链接的两个目录，其余（rcedit、windows-10、openssl 等）原样保留
const EXCLUDE = ['-xr!darwin', '-xr!linux'];
const UPSTREAM = 'https://registry.npmmirror.com/-/binary/electron-builder-binaries/winCodeSign-2.6.0/winCodeSign-2.6.0.7z';

const sevenZip = require('7zip-bin').path7za;

const log = msg => console.log(`[build] ${msg}`);

/** 取出 rcedit-x64.exe 备用。只需要这一个文件，其余（含符号链接的目录）全部丢掉。 */
async function ensureRcedit() {
  if (fs.existsSync(RCEDIT)) {
    log('复用已解出的 rcedit-x64.exe');
    return RCEDIT;
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const raw = path.join(CACHE_DIR, 'winCodeSign.orig.7z');
  const tmp = path.join(CACHE_DIR, 'extract');

  log('下载 winCodeSign 工具包（只为取里面的 rcedit）…');
  const res = await fetch(UPSTREAM);
  if (!res.ok) throw new Error(`下载失败: HTTP ${res.status}`);
  fs.writeFileSync(raw, Buffer.from(await res.arrayBuffer()));

  log('解压（跳过 darwin/linux，那里面的符号链接在非管理员环境下必然失败）…');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  execFileSync(sevenZip, ['x', raw, `-o${tmp}`, '-bd', '-y', ...EXCLUDE], { stdio: 'pipe' });

  const found = path.join(tmp, 'rcedit-x64.exe');
  if (!fs.existsSync(found)) throw new Error('工具包里没找到 rcedit-x64.exe');
  fs.copyFileSync(found, RCEDIT);

  fs.rmSync(raw, { force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  log(`已解出 ${path.relative(ROOT, RCEDIT)} (${(fs.statSync(RCEDIT).size / 1024).toFixed(0)} KB)`);
  return RCEDIT;
}

function runBuilder(args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'electron-builder', 'cli.js'), ...args], {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        // 没有代码签名证书，别去自动找
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      },
    });
    child.on('close', code => resolve(code ?? 1));
  });
}

async function main() {
  const arg = process.argv[2] || '--dir';
  const args = arg === '--nsis' ? ['--win', 'nsis', ...process.argv.slice(3)]
                                : ['--dir', ...process.argv.slice(3)];

  execFileSync(process.execPath, [path.join(__dirname, 'make-icon.js')], { stdio: 'inherit' });
  await ensureRcedit();

  const code = await runBuilder(args);
  if (code !== 0) {
    console.error(`\n[build] electron-builder 退出码 ${code}`);
    process.exitCode = code;
  } else {
    log(`构建完成 → ${path.join(ROOT, 'release')}`);
  }
}

main().catch(err => {
  console.error('[build] 失败:', (err && err.stack) || err);
  process.exit(1);
});
