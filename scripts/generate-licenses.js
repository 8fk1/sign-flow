/**
 * OSSライセンス一覧を LICENSES.txt として出力するスクリプト。
 * app:dist の前に実行し、インストーラーへ同梱する。
 *
 * 対象: package.json の dependencies（devDependencies は除外）
 */

const licenseChecker = require('license-checker');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'LICENSES.txt');

// package.json の dependencies キー一覧を取得
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const prodDeps = Object.keys(pkg.dependencies || {});

// Electronランタイム自体のライセンス（バイナリに含まれるため手動記載）
const ELECTRON_LICENSE = `
==============================================================
Electron
Copyright (c) 2013-2020 GitHub Inc.
License: MIT
https://github.com/electron/electron/blob/main/LICENSE

Chromium
Copyright 2015 The Chromium Authors. All rights reserved.
License: BSD and others
https://chromium.googlesource.com/chromium/src/+/HEAD/LICENSE

Node.js
Copyright Node.js contributors. All rights reserved.
License: MIT
https://github.com/nodejs/node/blob/main/LICENSE
==============================================================
`;

licenseChecker.init(
  {
    start: ROOT,
    production: true,        // devDependencies を除外
    excludePrivatePackages: true,
    customPath: {
      licenseText: '',
    },
  },
  (err, packages) => {
    if (err) {
      console.error('license-checker エラー:', err);
      process.exit(1);
    }

    const lines = [];
    lines.push('SignFlow — オープンソースソフトウェア ライセンス表記');
    lines.push('Open Source Software License Notices');
    lines.push('='.repeat(62));
    lines.push('');
    lines.push(
      '本ソフトウェアは以下のオープンソースソフトウェアを使用しています。'
    );
    lines.push('This software uses the following open source components.');
    lines.push('');
    lines.push(ELECTRON_LICENSE.trim());
    lines.push('');

    const sorted = Object.entries(packages).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    for (const [nameVer, info] of sorted) {
      // prodDeps に含まれるパッケージ（またはその依存）のみ
      const pkgName = nameVer.replace(/@[^@]+$/, '');
      const isProd = prodDeps.some(
        (d) => pkgName === d || pkgName.startsWith(d + '/')
      );
      if (!isProd) continue;

      lines.push('--------------------------------------------------------------');
      lines.push(`Package : ${nameVer}`);
      if (info.licenses) lines.push(`License : ${info.licenses}`);
      if (info.repository) lines.push(`Repository: ${info.repository}`);
      if (info.copyright) lines.push(`Copyright : ${info.copyright}`);
      lines.push('');
    }

    const content = lines.join('\n');
    fs.writeFileSync(OUTPUT, content, 'utf8');
    console.log(`✓ LICENSES.txt を生成しました (${content.length} chars)`);
  }
);
