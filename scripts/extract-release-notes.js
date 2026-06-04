const fs = require('fs');
const path = require('path');

try {
  const historyPath = path.join(__dirname, '..', 'HISTORY.md');
  const outputPath = path.join(__dirname, '..', 'release-notes.md');

  if (!fs.existsSync(historyPath)) {
    console.error('HISTORY.md not found');
    process.exit(1);
  }

  const content = fs.readFileSync(historyPath, 'utf-8');
  
  // "## YYYY-MM-DD" のセクションで分割し、最後の（最新の）セクションを取得
  const sections = content.split(/(?=## \d{4}-\d{2}-\d{2})/);
  
  if (sections.length > 1) {
    const latestSection = sections[sections.length - 1].trim();
    fs.writeFileSync(outputPath, latestSection, 'utf-8');
    console.log('Successfully generated release-notes.md from the latest section of HISTORY.md');
  } else {
    console.warn('Could not find latest release notes in HISTORY.md. Falling back to default.');
    fs.writeFileSync(outputPath, 'New release patch notes.', 'utf-8');
  }
} catch (err) {
  console.error('Failed to extract release notes:', err);
  process.exit(1);
}
