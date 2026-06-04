/**
 * リリーススクリプト
 *
 * 使い方:
 *   npm run release          # パッチバージョンアップ (1.0.7 → 1.0.8)
 *   npm run release minor    # マイナーバージョンアップ (1.0.7 → 1.1.0)
 *   npm run release major    # メジャーバージョンアップ (1.0.7 → 2.0.0)
 *   npm run release 1.2.3    # バージョンを直接指定
 *
 * 実行内容:
 *   1. package.json のバージョンを更新
 *   2. release-notes.md を生成（private/HISTORY.md から最新セクション抽出）
 *   3. LICENSES.txt を生成
 *   4. git commit → タグ → push
 *   5. electron-builder でビルド & GitHub Releases にアップロード
 *      ※ macOS で実行 → macOS 版 DMG をアップロード
 *      ※ Windows で実行 → Windows 版 EXE をアップロード
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// --- GH_TOKEN チェック（ビルド前に確認） ---
if (!process.env.GH_TOKEN) {
  console.error(`
エラー: GH_TOKEN 環境変数が設定されていません。

GitHub Releases へのアップロードにはトークンが必要です。
以下の手順で設定してください：

1. https://github.com/settings/personal-access-tokens/new で PAT を作成
   - Repository access: sign-flow のみ
   - Permissions > Contents: Read and write

2. ~/.zshrc に追加:
   export GH_TOKEN=発行されたトークン

3. 反映:
   source ~/.zshrc
`);
  process.exit(1);
}

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// --- バージョン決定 ---
const bump = process.argv[2] || 'patch';
const validBumps = ['patch', 'minor', 'major'];
const isExplicitVersion = !validBumps.includes(bump) && /^\d+\.\d+\.\d+$/.test(bump);

if (!validBumps.includes(bump) && !isExplicitVersion) {
  console.error(`エラー: 引数は patch / minor / major または x.y.z 形式で指定してください。`);
  process.exit(1);
}

// --- バージョンを上げる ---
if (isExplicitVersion) {
  const pkg = readJson(path.join(ROOT, 'package.json'));
  pkg.version = bump;
  fs.writeFileSync(path.join(ROOT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`\nバージョンを ${bump} に設定しました`);
} else {
  run(`npm version ${bump} --no-git-tag-version`);
}

const version = readJson(path.join(ROOT, 'package.json')).version;
console.log(`\n🚀 リリース: v${version}`);

// --- CHANGELOG.md の更新チェック ---
const changelogPath = path.join(ROOT, 'CHANGELOG.md');
const changelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';
if (!changelog.includes(`## v${version}`)) {
  console.error(`
エラー: CHANGELOG.md に v${version} のセクションがありません。

リリース前に CHANGELOG.md を更新してください。
先頭に以下の形式で追加します：

## v${version} (${new Date().toISOString().slice(0, 10)})

### 追加
- 新機能の説明

### 修正
- バグ修正の説明

---
`);
  process.exit(1);
}

// --- リリースノート・ライセンス生成 ---
run('node scripts/extract-release-notes.js');
run('node scripts/generate-licenses.js');

// --- git commit → タグ → push ---
run('git add package.json package-lock.json');
run(`git commit -m "chore: release v${version}"`);
run(`git tag v${version}`);
run('git push');
run('git push --tags');

// --- ビルド & GitHub Releases へアップロード ---
run('electron-builder build --publish always');

console.log(`\n✅ v${version} のリリースが完了しました`);
