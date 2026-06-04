/**
 * リリーススクリプト
 *
 * 使い方:
 *   npm run release
 *
 * 事前準備（必須）:
 *   CHANGELOG.md の先頭に新バージョンのセクションを追加してから実行する。
 *   例:
 *     ## v1.1.0 (2026-06-05)
 *     ### 追加
 *     - ○○機能を追加
 *     ---
 *
 * 実行内容:
 *   1. CHANGELOG.md の最新バージョンを読み取り、package.json に反映
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

// --- GH_TOKEN チェック ---
if (!process.env.GH_TOKEN) {
  console.error(`
エラー: GH_TOKEN 環境変数が設定されていません。

GitHub Releases へのアップロードにはトークンが必要です。
以下の手順で設定してください：

1. https://github.com/settings/personal-access-tokens/new で PAT を作成
   - Repository access: sign-flow のみ
   - Permissions > Contents: Read and write

【macOS / Linux】
2. ~/.zshrc に追加:
   export GH_TOKEN=発行されたトークン

3. 反映:
   source ~/.zshrc

【Windows (PowerShell)】
2. 一時的に設定（現在のセッションのみ）:
   $env:GH_TOKEN = "発行されたトークン"

   永続的に設定（システム環境変数）:
   [System.Environment]::SetEnvironmentVariable("GH_TOKEN", "発行されたトークン", "User")
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

// --- CHANGELOG.md から最新バージョンを読み取る ---
const changelogPath = path.join(ROOT, 'CHANGELOG.md');
if (!fs.existsSync(changelogPath)) {
  console.error('エラー: CHANGELOG.md が見つかりません。');
  process.exit(1);
}
const changelog = fs.readFileSync(changelogPath, 'utf8');
const versionMatch = changelog.match(/^## v(\d+\.\d+\.\d+)/m);
if (!versionMatch) {
  console.error(`
エラー: CHANGELOG.md にバージョンのセクションが見つかりません。

先頭に以下の形式で追加してください：

## v1.x.x (${new Date().toISOString().slice(0, 10)})

### 追加
- 新機能の説明

### 修正
- バグ修正の説明

---
`);
  process.exit(1);
}
const version = versionMatch[1];

// --- 現在の package.json バージョンと比較 ---
const currentVersion = readJson(path.join(ROOT, 'package.json')).version;
if (currentVersion === version) {
  console.error(`
エラー: package.json のバージョン (v${currentVersion}) と CHANGELOG.md の最新バージョン (v${version}) が同じです。

CHANGELOG.md に新しいバージョンのセクションを追加してください。
`);
  process.exit(1);
}

// --- package.json のバージョンを CHANGELOG.md に合わせて更新 ---
const pkg = readJson(path.join(ROOT, 'package.json'));
pkg.version = version;
fs.writeFileSync(path.join(ROOT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log(`\nバージョンを v${currentVersion} → v${version} に更新しました`);
console.log(`\n🚀 リリース: v${version}`);

// --- リリースノート・ライセンス生成 ---
run('node scripts/extract-release-notes.js');
run('node scripts/generate-licenses.js');

// --- git commit → タグ → push ---
run('git add package.json package-lock.json CHANGELOG.md');
try {
  run(`git commit -m "chore: release v${version}"`);
} catch {
  console.log('コミットするものがありません（スキップ）');
}
const existingTag = execSync(`git tag -l v${version}`, { cwd: ROOT }).toString().trim();
if (!existingTag) {
  run(`git tag v${version}`);
} else {
  console.log(`タグ v${version} は既に存在します（スキップ）`);
}
run('git push');
run('git push --tags');

// --- ビルド & GitHub Releases へアップロード ---
run('electron-builder build --publish always');

console.log(`\n✅ v${version} のリリースが完了しました`);
