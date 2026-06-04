const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const outputPath = path.join(ROOT, 'release-notes.md');

try {
  // CHANGELOG.md を優先（GitHub Actions 環境でも使える）
  const changelogPath = path.join(ROOT, 'CHANGELOG.md');
  if (fs.existsSync(changelogPath)) {
    const content = fs.readFileSync(changelogPath, 'utf-8');
    // "## v" でセクション分割して最初のセクションを取得
    const sections = content.split(/(?=## v\d+\.\d+\.\d+)/);
    const latest = sections.find(s => s.startsWith('## v'));
    if (latest) {
      // "---" より前の部分だけを使う（次のバージョンとの区切り線より前）
      const body = latest.split(/\n---\n/)[0].trim();
      fs.writeFileSync(outputPath, body, 'utf-8');
      console.log('Successfully generated release-notes.md from CHANGELOG.md');
      process.exit(0);
    }
  }

  // フォールバック: private/HISTORY.md（ローカル開発環境のみ）
  const historyPath = path.join(ROOT, 'private', 'HISTORY.md');
  if (fs.existsSync(historyPath)) {
    const content = fs.readFileSync(historyPath, 'utf-8');
    const sections = content.split(/(?=## \d{4}-\d{2}-\d{2})/);
    if (sections.length > 1) {
      const latestSection = sections[sections.length - 1].trim();
      fs.writeFileSync(outputPath, latestSection, 'utf-8');
      console.log('Successfully generated release-notes.md from private/HISTORY.md');
      process.exit(0);
    }
  }

  // どちらも見つからない場合
  fs.writeFileSync(outputPath, 'New release.', 'utf-8');
  console.warn('No release notes source found, using default.');
} catch (err) {
  console.error('Failed to extract release notes:', err);
  process.exit(1);
}
