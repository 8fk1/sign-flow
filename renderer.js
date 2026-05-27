const { ipcRenderer, shell } = require("electron");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const fs = require("fs");
const path = require("path");

// PDF.jsのローカルロード設定 (Electron nodeIntegration対応)
const pdfjsLib = require("pdfjs-dist/build/pdf.js");
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/build/pdf.worker.js");

// 日本語PDFの文字レンダリングに必要なCMapファイルのパス
const _pdfjsDistPath = path.dirname(require.resolve("pdfjs-dist/package.json"));
const CMAP_URL = "file:///" + _pdfjsDistPath.replace(/\\/g, "/") + "/cmaps/";

// Windowsシステムの日本語フォントを埋め込む（TTF優先、次にTTC）
async function embedJapaneseFont(pdfDoc) {
  pdfDoc.registerFontkit(fontkit);
  const windir = process.env.WINDIR || "C:\\Windows";
  const candidates = [
    path.join(windir, "Fonts", "yumin.ttf"),       // 游明朝 Regular (TTF)
    path.join(windir, "Fonts", "yuminl.ttf"),      // 游明朝 Light (TTF)
    path.join(windir, "Fonts", "yumindb.ttf"),     // 游明朝 DemiBold (TTF)
    path.join(windir, "Fonts", "YuGothR.ttc"),     // 游ゴシック Regular (TTC)
    path.join(windir, "Fonts", "meiryo.ttc"),      // メイリオ (TTC)
    path.join(windir, "Fonts", "msgothic.ttc"),    // MS ゴシック (TTC)
    path.join(windir, "Fonts", "BIZ-UDGothicR.ttc"),
  ];
  for (const fontPath of candidates) {
    if (!fs.existsSync(fontPath)) continue;
    try {
      const bytes = fs.readFileSync(fontPath);
      const font = await pdfDoc.embedFont(bytes, { subset: true });
      console.log("Japanese font embedded:", path.basename(fontPath));
      return font;
    } catch (e) {
      console.warn("Font embed failed:", path.basename(fontPath), e.message);
    }
  }
  console.warn("No Japanese font found, falling back to Helvetica");
  return await pdfDoc.embedFont(StandardFonts.Helvetica);
}

const stampDir = "static/img/stamp";
// パッケージ化後も書き込めるよう、stampFolderはメインプロセスから取得する
let stampFolder = path.join(__dirname, stampDir); // 開発時のフォールバック


// DOM要素の取得
const tabBtnStamp = document.getElementById("tabBtnStamp");
const tabBtnMaster = document.getElementById("tabBtnMaster");
const tabContentStamp = document.getElementById("tabContentStamp");
const tabContentMaster = document.getElementById("tabContentMaster");

const dropArea = document.getElementById("dropArea");
const pdfInput = document.getElementById("pdfInput");
const fileList = document.getElementById("fileList");
const modeRadios = document.querySelectorAll('input[name="mode"]');

const sectionAll = document.getElementById("sectionAll");
const sectionIndividual = document.getElementById("sectionIndividual");
const sectionVisual = document.getElementById("sectionVisual");
const selectDocType = document.getElementById("selectDocType");
const docTypeSettingsArea = document.getElementById("docTypeSettingsArea");
const stampPdfBtn = document.getElementById("stampPdfBtn");

// ビジュアル押印用DOM
const visualProgress = document.getElementById("visualProgress");
const visualFileNameInput = document.getElementById("visualFileNameInput");
const visualPreviewArea = document.getElementById("visualPreviewArea");
const visualStampSelect = document.getElementById("visualStampSelect");
const addVisualStampBtn = document.getElementById("addVisualStampBtn");
const visualPrevBtn = document.getElementById("visualPrevBtn");
const visualNextBtn = document.getElementById("visualNextBtn");

// マスタ管理用DOM
const uploadStampBtn = document.getElementById("uploadStampBtn");
const masterStampList = document.getElementById("masterStampList");
const newDocTypeName = document.getElementById("newDocTypeName");
const addDocTypeBtn = document.getElementById("addDocTypeBtn");
const masterDocTypeContainer = document.getElementById("masterDocTypeContainer");

// アプリケーションの状態
let loadedPdfFiles = [];
let stampImages = [];
let docTypes = [];
let stampMeta = {}; // { "filename.png": { naturalWidth: 100, naturalHeight: 50 } }

// ビジュアル個別押印の状態
let currentVisualIndex = 0;
let currentZoom = 1.0; // PDFプレビューのズーム倍率（0.5〜3.0）
let _zoomRenderTimer = null; // ホイールズーム用デバウンスタイマー
// 各ファイルに対する配置スタンプ情報。構造: [ { fileIndex: 0, stamps: [ { stampFile: 'xxx.png', x: 100, y: 200, px: 50, py: 100 } ] } ]
let visualStampsSettings = [];
let lastVisualStamps = []; // 直前に配置決定したスタンプ情報のキャッシュ
let lastDateTexts = []; // 直前に配置決定した日付テキスト情報のキャッシュ
let lastDateRows = []; // 直前に配置決定した日付行情報のキャッシュ
let _renderVisualToken = null; // renderVisualStep の多重実行防止トークン
let lastPdfOrientation = null; // 直前のPDFの向き（'portrait' または 'landscape'）
let lastPdfPtWidth = 0;  // 直前のPDFのpt幅（相対位置変換に使用）
let lastPdfPtHeight = 0; // 直前のPDFのpt高さ（相対位置変換に使用）

// A4基準のPDFサイズ (pt)
const A4_WIDTH_PT = 595.27;
const A4_HEIGHT_PT = 841.89;
// プレビューサイズは固定値ではなく要素の実幅から動的に計算する
// PREVIEW_WIDTH_PX / PREVIEW_HEIGHT_PX は後方互換で残す（フォールバック用）
const PREVIEW_WIDTH_PX = 480;
const PREVIEW_HEIGHT_PX = 678;

// 現在のプレビュー表示幅を取得する（要素が描画されていれば実幅を使用）
function getPreviewWidth() {
  const el = document.getElementById("visualPreviewArea");
  if (el && el.offsetWidth > 0) return el.offsetWidth;
  return PREVIEW_WIDTH_PX;
}

// 座標自動測定用の状態
let activeMeasureDocIdx = null;
let activeMeasureRuleIdx = null;
let measurePtWidth = A4_WIDTH_PT;
let measurePtHeight = A4_HEIGHT_PT;

// --- タブの切り替え ---
tabBtnStamp.addEventListener("click", () => {
  tabBtnStamp.classList.add("is-active");
  tabBtnMaster.classList.remove("is-active");
  tabContentStamp.classList.remove("hidden");
  tabContentMaster.classList.add("hidden");
  loadSelectOptions(); // タブ切り替え時に選択肢を最新化
});

tabBtnMaster.addEventListener("click", () => {
  tabBtnMaster.classList.add("is-active");
  tabBtnStamp.classList.remove("is-active");
  tabContentMaster.classList.remove("hidden");
  tabContentStamp.classList.add("hidden");
  renderMasterView();
});

// 印影のサイズ・形状情報をメタデータから算出する
function getStampDimensions(stampFile) {
  if (stampFile === "square.png") {
    return { previewWidth: 90, previewHeight: 90, borderRadius: "4px", pdfWidth: 80, pdfHeight: 80 };
  }
  const meta = stampMeta[stampFile];
  const BASE_LONG = 90;
  const BASE_PDF = 60;
  if (!meta || !meta.naturalWidth || !meta.naturalHeight) {
    return { previewWidth: 45, previewHeight: 45, borderRadius: "50%", pdfWidth: 30, pdfHeight: 30 };
  }
  const { naturalWidth, naturalHeight } = meta;
  const ratio = naturalWidth / naturalHeight;
  let previewWidth, previewHeight, pdfWidth, pdfHeight;
  if (naturalWidth >= naturalHeight) {
    previewWidth = BASE_LONG;
    previewHeight = Math.max(20, Math.round(BASE_LONG / ratio));
    pdfWidth = BASE_PDF;
    pdfHeight = Math.max(10, Math.round(BASE_PDF / ratio));
  } else {
    previewHeight = BASE_LONG;
    previewWidth = Math.max(20, Math.round(BASE_LONG * ratio));
    pdfHeight = BASE_PDF;
    pdfWidth = Math.max(10, Math.round(BASE_PDF * ratio));
  }
  // 縦横比が 0.8〜1.25 の範囲なら円形、それ以外は角丸長方形
  const borderRadius = (ratio >= 0.8 && ratio <= 1.25) ? "50%" : "4px";
  return { previewWidth, previewHeight, borderRadius, pdfWidth, pdfHeight };
}

// メタデータが未収集の印影画像の縦横比を非同期で取得して保存する
function loadMissingStampMeta() {
  const missing = stampImages.filter(img => img !== "square.png" && !stampMeta[img]);
  if (missing.length === 0) return;
  missing.forEach(imgName => {
    const imgPath = path.join(stampFolder, imgName);
    const tempImg = new Image();
    tempImg.onload = () => {
      stampMeta[imgName] = { naturalWidth: tempImg.naturalWidth, naturalHeight: tempImg.naturalHeight };
      localStorage.setItem("stamp_meta", JSON.stringify(stampMeta));
    };
    tempImg.src = `file://${imgPath}?t=${Date.now()}`;
  });
}

// --- マスタデータの初期化と読み込み ---
function initMasterData() {
  const storedMeta = localStorage.getItem("stamp_meta");
  if (storedMeta) {
    try { stampMeta = JSON.parse(storedMeta); } catch(e) { stampMeta = {}; }
  }

  // LocalStorageから読み込み。なければデフォルトを生成
  const storedStamps = localStorage.getItem("stamp_images");
  if (storedStamps) {
    stampImages = JSON.parse(storedStamps);
  } else {
    // フォルダ内のファイルをチェック
    try {
      const files = fs.readdirSync(stampFolder);
      stampImages = files.filter(f => [".png", ".jpg", ".jpeg", ".gif"].includes(path.extname(f).toLowerCase()));
      localStorage.setItem("stamp_images", JSON.stringify(stampImages));
    } catch (e) {
      stampImages = ["square.png"];
      localStorage.setItem("stamp_images", JSON.stringify(stampImages));
    }
  }

  const storedDocTypes = localStorage.getItem("stamp_doc_types");
  if (storedDocTypes) {
    docTypes = JSON.parse(storedDocTypes);
  } else {
    // デフォルト書類種別
    docTypes = [
      {
        id: "estimate",
        name: "見積書",
        rules: [
          { name: "担当者印", stamp: stampImages[0] || "", x: 495, y: 540 },
          { name: "承認者印", stamp: stampImages[0] || "", x: 395, y: 540 },
          { name: "角印", stamp: "square.png", x: 475, y: 620 }
        ]
      },
      {
        id: "invoice",
        name: "請求書",
        rules: [
          { name: "担当者印", stamp: stampImages[0] || "", x: 485, y: 545 },
          { name: "角印", stamp: "square.png", x: 475, y: 620 }
        ]
      }
    ];
    localStorage.setItem("stamp_doc_types", JSON.stringify(docTypes));
  }
}

// 選択項目の更新
function loadSelectOptions() {
  // 一括設定用の書類種別セレクト
  selectDocType.innerHTML = '<option value="">書類種別を選択してください</option>';
  docTypes.forEach(doc => {
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = doc.name;
    selectDocType.appendChild(opt);
  });

  // ビジュアル押印用の印影セレクト
  visualStampSelect.innerHTML = "";
  stampImages.forEach(img => {
    const opt = document.createElement("option");
    opt.value = img;
    opt.textContent = path.basename(img, path.extname(img));
    visualStampSelect.appendChild(opt);
  });
}

// --- マスタ管理画面のレンダリング ---
function renderMasterView() {
  loadMissingStampMeta(); // 未取得のメタデータを非同期で収集

  // 1. 印影画像一覧 (プレビューカード化)
  masterStampList.innerHTML = "";
  stampImages.forEach((img, idx) => {
    const card = document.createElement("div");
    card.className = "stamp-card";
    const isDefaultSquare = img === "square.png";

    // サムネイルラッパーのスタイルをアスペクト比に基づいて動的設定
    let wrapperClass = "stamp-thumbnail-wrapper";
    let wrapperStyle = "";
    if (isDefaultSquare) {
      wrapperClass += " square-wrapper";
    } else {
      const meta = stampMeta[img];
      if (meta && meta.naturalWidth && meta.naturalHeight) {
        const ratio = meta.naturalWidth / meta.naturalHeight;
        const MAX_SIZE = 80;
        if (ratio >= 0.8 && ratio <= 1.25) {
          // 円形（デフォルトスタイルのまま）
        } else if (ratio > 1.25) {
          const h = Math.max(30, Math.round(MAX_SIZE / ratio));
          wrapperStyle = `width: ${MAX_SIZE}px; height: ${h}px; border-radius: 4px;`;
        } else {
          const w = Math.max(30, Math.round(MAX_SIZE * ratio));
          wrapperStyle = `width: ${w}px; height: ${MAX_SIZE}px; border-radius: 4px;`;
        }
      }
    }

    card.innerHTML = `
      <div class="${wrapperClass}" style="${wrapperStyle}">
        <img src="file://${path.join(stampFolder, img)}?t=${Date.now()}" class="stamp-thumbnail" onerror="this.src='static/img/icon/32x32.ico'" />
      </div>
      <div class="stamp-card-name" title="${img}">${path.basename(img, path.extname(img))}</div>
      <div class="stamp-card-actions">
        ${isDefaultSquare ? '' : `
        <button class="stamp-card-btn rename-stamp-btn" data-index="${idx}">
          <i class="fa-solid fa-pen"></i> リネーム
        </button>`}
        <button class="stamp-card-btn replace-btn" data-index="${idx}">
          <i class="fa-solid fa-arrows-rotate"></i> 変更
        </button>
        ${isDefaultSquare ? '' : `
        <button class="stamp-card-btn stamp-delete-btn" data-type="stamp" data-index="${idx}">
          <i class="fa-solid fa-trash-can"></i> 削除
        </button>`}
      </div>
    `;
    masterStampList.appendChild(card);
  });

  // 2. 書類種別一覧とルール編集
  masterDocTypeContainer.innerHTML = "";
  docTypes.forEach((doc, docIdx) => {
    const card = document.createElement("div");
    card.className = "setting-row";
    card.style.marginBottom = "16px";

    // 書類種別ヘッダー（削除ボタン付き）
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginBottom = "12px";
    header.innerHTML = `
      <span style="font-weight:700; color:var(--accent-color);"><i class="fa-solid fa-file-contract"></i> ${doc.name}</span>
      <button class="delete-btn" data-type="doctype" data-index="${docIdx}" style="padding: 2px 6px;">
        <i class="fa-solid fa-trash-can"></i> 削除
      </button>
    `;
    card.appendChild(header);

    // ルール（印影＋座標のペア）一覧
    const rulesList = document.createElement("div");
    doc.rules.forEach((rule, ruleIdx) => {
      const row = document.createElement("div");
      row.className = "pair-row";

      // 印影画像選択肢の生成
      let stampOptionsHtml = '<option value="">-- 印影未設定 --</option>';
      stampImages.forEach(img => {
        stampOptionsHtml += `<option value="${img}" ${rule.stamp === img ? 'selected' : ''}>${path.basename(img, path.extname(img))}</option>`;
      });

      row.innerHTML = `
        <div style="flex: 2;">
          <input type="text" class="input rule-name" data-doc="${docIdx}" data-rule="${ruleIdx}" value="${rule.name}" placeholder="役割名" />
        </div>
        <div style="flex: 3;">
          <div class="select">
            <select class="rule-stamp" data-doc="${docIdx}" data-rule="${ruleIdx}">
              ${stampOptionsHtml}
            </select>
          </div>
        </div>
        <div style="flex: 1.2;">
          <input type="number" class="input rule-x" data-doc="${docIdx}" data-rule="${ruleIdx}" value="${rule.x}" placeholder="X" />
        </div>
        <div style="flex: 1.2;">
          <input type="number" class="input rule-y" data-doc="${docIdx}" data-rule="${ruleIdx}" value="${rule.y}" placeholder="Y" />
        </div>
        <button class="btn-submit measure-pos-btn" data-doc="${docIdx}" data-rule="${ruleIdx}" data-tooltip="テストPDFで位置を測定する" style="flex: 0.8; background: #64748b; padding: 4px; display: flex; align-items: center; justify-content: center; height: 2.25em;">
          <i class="fa-solid fa-crosshairs"></i>
        </button>
        <button class="delete-btn delete-rule" data-doc="${docIdx}" data-rule="${ruleIdx}" style="flex: 0.5;">
          <i class="fa-solid fa-xmark"></i>
        </button>
      `;
      rulesList.appendChild(row);
    });

    card.appendChild(rulesList);

    // ペア追加ボタンと保存ボタン
    const footer = document.createElement("div");
    footer.style.display = "flex";
    footer.style.gap = "8px";
    footer.style.marginTop = "8px";
    footer.innerHTML = `
      <button class="btn-submit add-rule-btn" data-doc="${docIdx}" style="background:#475569; padding: 4px 8px; font-size:0.75rem;">+ 印影と座標の組みを追加</button>
      <button class="btn-submit save-doc-btn" data-doc="${docIdx}" style="padding: 4px 8px; font-size:0.75rem; width: 80px;">保存</button>
    `;
    card.appendChild(footer);

    masterDocTypeContainer.appendChild(card);
  });

  // イベント登録
  registerMasterEvents();
}

function registerMasterEvents() {
  // リネームボタンのイベント（インライン入力方式）
  document.querySelectorAll(".stamp-card .rename-stamp-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-index"));
      const oldName = stampImages[idx];
      const ext = path.extname(oldName);
      const baseName = path.basename(oldName, ext);

      // カード内のファイル名表示要素をインライン入力に切り替え
      const card = btn.closest(".stamp-card");
      const nameEl = card.querySelector(".stamp-card-name");
      if (nameEl.querySelector("input")) return; // 既に編集中なら無視

      const input = document.createElement("input");
      input.type = "text";
      input.value = baseName;
      input.className = "input";
      input.style.cssText = "font-size:0.72rem; padding:2px 4px; height:1.8em; width:100%; text-align:center;";
      // overflow:hidden / white-space:nowrap を解除してインプットが見えるようにする
      nameEl.style.overflow = "visible";
      nameEl.style.whiteSpace = "normal";
      nameEl.style.textOverflow = "clip";
      nameEl.innerHTML = "";
      nameEl.appendChild(input);
      input.focus();
      input.select();

      let committed = false; // blur と keydown Enter の二重発火を防ぐ
      const commit = () => {
        if (committed) return;
        committed = true;

        let newBase = input.value.trim();
        if (!newBase || (newBase + ext) === oldName || newBase === baseName) {
          renderMasterView();
          return;
        }

        // 拡張子が入力されていなければ元の拡張子を付与
        let newName = path.extname(newBase) ? newBase : newBase + ext;

        if (newName === oldName) {
          renderMasterView();
          return;
        }

        // 同名ファイルが既に存在するかチェック
        if (stampImages.includes(newName)) {
          showToast(`「${path.basename(newName, path.extname(newName))}」は既に登録されています。`, "error");
          renderMasterView();
          return;
        }

        const oldPath = path.join(stampFolder, oldName);
        const newPath = path.join(stampFolder, newName);

        try {
          fs.renameSync(oldPath, newPath);
        } catch (err) {
          showToast("ファイルのリネームに失敗しました: " + err.message, "error");
          renderMasterView();
          return;
        }

        // stampImages の更新
        stampImages[idx] = newName;
        localStorage.setItem("stamp_images", JSON.stringify(stampImages));

        // docTypes 内で参照している印影名を一括更新
        let docTypesChanged = false;
        docTypes.forEach(doc => {
          doc.rules.forEach(rule => {
            if (rule.stamp === oldName) {
              rule.stamp = newName;
              docTypesChanged = true;
            }
          });
        });
        if (docTypesChanged) {
          localStorage.setItem("stamp_doc_types", JSON.stringify(docTypes));
        }

        showToast(`「${baseName}」→「${path.basename(newName, path.extname(newName))}」にリネームしました。`, "success");
        renderMasterView();
      };

      input.addEventListener("blur", commit);
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { renderMasterView(); }
      });
    });
  });

  // 変更（画像置換）ボタンのイベント
  document.querySelectorAll(".stamp-card .replace-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const idx = parseInt(btn.getAttribute("data-index"));
      const currentImageName = stampImages[idx];

      const result = await ipcRenderer.invoke("show-image-dialog");
      if (result.canceled || !result.filePaths.length) return;

      const srcPath = result.filePaths[0];
      const destPath = path.join(stampFolder, currentImageName);

      try {
        fs.copyFileSync(srcPath, destPath);
        alert(`印影画像「${currentImageName}」を更新しました。`);
        renderMasterView();
      } catch (err) {
        alert("画像の置換に失敗しました: " + err.message);
      }
    });
  });

  // 座標自動測定ボタンのイベント登録
  document.querySelectorAll(".setting-row .measure-pos-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activeMeasureDocIdx = parseInt(btn.getAttribute("data-doc"));
      activeMeasureRuleIdx = parseInt(btn.getAttribute("data-rule"));
      openMeasureModal();
    });
  });

  // 削除ボタン（印影画像・書類種別）
  document.querySelectorAll(".stamp-card .stamp-delete-btn, .setting-row .delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-type");
      const index = parseInt(btn.getAttribute("data-index"));

      if (type === "stamp") {
        if (confirm("この印影画像を削除しますか？（書類種別で設定されている場合、正常に動作しなくなる可能性があります）")) {
          // 実ファイルも消去する場合
          const fileToDelete = stampImages[index];
          const fullPath = path.join(stampFolder, fileToDelete);
          if (fs.existsSync(fullPath) && fileToDelete !== "square.png") {
            try { fs.unlinkSync(fullPath); } catch(e) {}
          }
          stampImages.splice(index, 1);
          localStorage.setItem("stamp_images", JSON.stringify(stampImages));
          renderMasterView();
        }
      } else if (type === "doctype") {
        if (confirm("この書類種別を削除しますか？")) {
          docTypes.splice(index, 1);
          localStorage.setItem("stamp_doc_types", JSON.stringify(docTypes));
          renderMasterView();
        }
      }
    });
  });

  // ルール削除
  document.querySelectorAll(".delete-rule").forEach(btn => {
    btn.addEventListener("click", () => {
      const docIdx = parseInt(btn.getAttribute("data-doc"));
      const ruleIdx = parseInt(btn.getAttribute("data-rule"));
      docTypes[docIdx].rules.splice(ruleIdx, 1);
      localStorage.setItem("stamp_doc_types", JSON.stringify(docTypes));
      renderMasterView();
    });
  });

  // ルール追加
  document.querySelectorAll(".add-rule-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const docIdx = parseInt(btn.getAttribute("data-doc"));
      docTypes[docIdx].rules.push({ name: "新しい役割", stamp: stampImages[0] || "", x: 100, y: 100 });
      localStorage.setItem("stamp_doc_types", JSON.stringify(docTypes));
      renderMasterView();
    });
  });

  // ルール保存
  document.querySelectorAll(".save-doc-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const docIdx = parseInt(btn.getAttribute("data-doc"));
      const card = masterDocTypeContainer.children[docIdx];

      const names = card.querySelectorAll(".rule-name");
      const stamps = card.querySelectorAll(".rule-stamp");
      const xs = card.querySelectorAll(".rule-x");
      const ys = card.querySelectorAll(".rule-y");

      const newRules = [];
      names.forEach((nameInput, ruleIdx) => {
        newRules.push({
          name: nameInput.value,
          stamp: stamps[ruleIdx].value,
          x: parseInt(xs[ruleIdx].value) || 0,
          y: parseInt(ys[ruleIdx].value) || 0
        });
      });

      docTypes[docIdx].rules = newRules;
      localStorage.setItem("stamp_doc_types", JSON.stringify(docTypes));
      alert("設定を保存しました。");
      renderMasterView();
    });
  });
}

// 新規印影画像の登録
uploadStampBtn.addEventListener("click", async () => {
  const result = await ipcRenderer.invoke("show-image-dialog");
  if (result.canceled || !result.filePaths.length) return;

  const srcPath = result.filePaths[0];
  const destName = path.basename(srcPath);
  const destPath = path.join(stampFolder, destName);

  try {
    // フォルダがなければ作成
    if (!fs.existsSync(stampFolder)) {
      fs.mkdirSync(stampFolder, { recursive: true });
    }
    fs.copyFileSync(srcPath, destPath);

    if (!stampImages.includes(destName)) {
      stampImages.push(destName);
      localStorage.setItem("stamp_images", JSON.stringify(stampImages));
    }

    // 画像の縦横比をメタデータとして保存してからレンダリング
    const tempImg = new Image();
    tempImg.onload = () => {
      stampMeta[destName] = { naturalWidth: tempImg.naturalWidth, naturalHeight: tempImg.naturalHeight };
      localStorage.setItem("stamp_meta", JSON.stringify(stampMeta));
      alert("印影画像を登録しました！");
      renderMasterView();
    };
    tempImg.onerror = () => {
      alert("印影画像を登録しました！");
      renderMasterView();
    };
    tempImg.src = `file://${destPath}?t=${Date.now()}`;
  } catch (err) {
    alert("エラーが発生しました: " + err.message);
  }
});

// 新規書類種別の追加
addDocTypeBtn.addEventListener("click", () => {
  const name = newDocTypeName.value.trim();
  if (!name) {
    alert("書類名を入力してください。");
    return;
  }

  const newDoc = {
    id: "user_" + Date.now(),
    name: name,
    rules: [
      { name: "担当者", stamp: stampImages[0] || "", x: 100, y: 100 }
    ]
  };

  docTypes.push(newDoc);
  localStorage.setItem("stamp_doc_types", JSON.stringify(docTypes));
  newDocTypeName.value = "";
  renderMasterView();
});


// --- PDFファイルのリスト表示制御 ---
function displayFiles() {
  const fileListWrapper = document.getElementById("fileListWrapper");
  const fileGrid = document.getElementById("fileGrid");
  const fileCountBadge = document.getElementById("fileCountBadge");

  fileGrid.innerHTML = "";

  if (loadedPdfFiles.length === 0) {
    fileListWrapper.classList.add("hidden");
    disableRadioButtons();
    selectNothing();
    return;
  }

  fileListWrapper.classList.remove("hidden");
  fileCountBadge.textContent = loadedPdfFiles.length + " 件";

  loadedPdfFiles.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "file-card";
    card.dataset.index = index;

    let displayFileName = item.customName;
    if (displayFileName.length > 26) {
      displayFileName = displayFileName.slice(0, 18) + "..." + displayFileName.slice(-6);
    }

    card.innerHTML = `
      <div class="file-card-info">
        <i class="fa-regular fa-file-pdf"></i>
        <div class="file-card-details">
          <span class="file-card-name" title="${item.customName}">${displayFileName}</span>
          <span class="file-card-size">${(item.file.size / 1024).toFixed(1)} KB</span>
        </div>
      </div>
      <div style="display:flex; gap:4px; align-items:center;">
        <button class="rename-btn" data-index="${index}" title="ファイル名を変更" style="background:none; border:1px solid #64748b; border-radius:4px; padding:3px 7px; cursor:pointer; color:#94a3b8; font-size:0.75rem;">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="delete-btn" data-index="${index}" title="削除">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;
    fileGrid.appendChild(card);
  });

  // リネームボタンのイベント
  fileGrid.querySelectorAll(".rename-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-index"));
      const card = fileGrid.querySelector(`.file-card[data-index="${idx}"]`);
      const nameSpan = card.querySelector(".file-card-name");
      const currentName = loadedPdfFiles[idx].customName;

      // インライン編集に切り替え
      const input = document.createElement("input");
      input.type = "text";
      input.value = currentName;
      input.className = "input";
      input.style.cssText = "font-size:0.78rem; padding:2px 6px; height:1.8em; width:160px;";
      nameSpan.replaceWith(input);
      input.focus();
      input.select();

      const commit = () => {
        let newName = input.value.trim();
        if (!newName) newName = currentName;
        // .pdf 拡張子がなければ付ける
        if (!newName.toLowerCase().endsWith(".pdf")) newName += ".pdf";
        loadedPdfFiles[idx].customName = newName;
        displayFiles(); // 再レンダリング
      };

      input.addEventListener("blur", commit);
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { input.value = currentName; commit(); }
      });
    });
  });

  // イベントリスナーはDOM生成時に一括で委譲バインドするためここでは定義しません

  enableRadioButtons();
  updateActiveMode();
}

function addFiles(files) {
  const hasNonPdfFiles = files.some(file => !file.name.toLowerCase().endsWith(".pdf"));
  if (hasNonPdfFiles) {
    alert("PDFファイルのみを追加してください。");
    return;
  }

  files.forEach(file => {
    // 重複判定は元の File オブジェクトの name/size で行う
    if (!loadedPdfFiles.some(item => item.file.name === file.name && item.file.size === file.size)) {
      loadedPdfFiles.push({ file, customName: file.name });
    }
  });

  displayFiles();
}

// ドラッグ＆ドロップイベント
["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
  dropArea.addEventListener(eventName, e => {
    e.preventDefault();
    e.stopPropagation();
  });
});
["dragenter", "dragover"].forEach(eventName => {
  dropArea.addEventListener(eventName, () => dropArea.classList.add("is-dragover"));
});
["dragleave", "drop"].forEach(eventName => {
  dropArea.addEventListener(eventName, () => dropArea.classList.remove("is-dragover"));
});
dropArea.addEventListener("drop", e => {
  addFiles(Array.from(e.dataTransfer.files));
});
pdfInput.addEventListener("change", e => {
  addFiles(Array.from(e.target.files));
  pdfInput.value = "";
});


// --- モード切替の制御 ---
function enableRadioButtons() {
  modeRadios.forEach(r => r.removeAttribute("disabled"));
}
function disableRadioButtons() {
  modeRadios.forEach(r => r.setAttribute("disabled", true));
}

function updateActiveMode() {
  const selectedMode = document.querySelector('input[name="mode"]:checked');
  if (!selectedMode) return;

  sectionAll.classList.add("hidden");
  sectionIndividual.classList.add("hidden");
  sectionVisual.classList.add("hidden");
  stampPdfBtn.classList.remove("hidden"); // 一旦出力ボタンを表示状態にする
  stampPdfBtn.disabled = false;

  if (selectedMode.id === "radioAll") {
    sectionAll.classList.remove("hidden");
  } else if (selectedMode.id === "radioIndividual") {
    sectionIndividual.classList.remove("hidden");
    renderIndividualSettings();
  } else if (selectedMode.id === "radioVisual") {
    sectionVisual.classList.remove("hidden");
    stampPdfBtn.classList.add("hidden"); // ビジュアルモードでは下部ボタンを隠す
    initVisualMode();
  }
}

function selectNothing() {
  sectionAll.classList.add("hidden");
  sectionIndividual.classList.add("hidden");
  sectionVisual.classList.add("hidden");
  stampPdfBtn.disabled = true;
}

modeRadios.forEach(r => {
  r.addEventListener("change", updateActiveMode);
});


// --- 一括設定用の動的座標表示 ---
selectDocType.addEventListener("change", (e) => {
  const docId = e.target.value;
  docTypeSettingsArea.innerHTML = "";

  const doc = docTypes.find(d => d.id === docId);
  if (!doc) {
    docTypeSettingsArea.innerHTML = `<p class="text-center" style="color: var(--text-secondary); font-size: 0.8rem; padding: 10px;">書類種別を選択してください</p>`;
    return;
  }

  doc.rules.forEach(rule => {
    const row = document.createElement("div");
    row.style.fontSize = "0.8rem";
    row.style.padding = "6px 12px";
    row.style.background = "#f8fafc";
    row.style.border = "1px solid #e2e8f0";
    row.style.borderRadius = "4px";
    row.style.marginBottom = "4px";
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.innerHTML = `
      <span><strong style="color: var(--text-primary);">${rule.name}</strong><span style="color: var(--text-secondary); margin-left: 6px; font-size: 0.75rem;">(${rule.stamp || '設定なし'})</span></span>
      <span style="color: var(--text-secondary); font-weight: 500;">座標: X=${rule.x}, Y=${rule.y}</span>
    `;
    docTypeSettingsArea.appendChild(row);
  });
});


// --- 個別設定の描画 ---
function renderIndividualSettings() {
  sectionIndividual.innerHTML = "";
  if (loadedPdfFiles.length === 0) return;

  // 書類種別の選択リストHTML
  let docOptionsHtml = '<option value="">-- 書類種別を選択 --</option>';
  docTypes.forEach(doc => {
    docOptionsHtml += `<option value="${doc.id}">${doc.name}</option>`;
  });

  loadedPdfFiles.forEach((item, index) => {
    let displayFileName = item.customName;
    if (displayFileName.length > 30) {
      displayFileName = displayFileName.slice(0, 20) + "..." + displayFileName.slice(-6);
    }

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.background = "#f8fafc";
    row.style.border = "1px solid #e2e8f0";
    row.style.borderRadius = "6px";
    row.style.padding = "8px 12px";
    row.style.marginBottom = "6px";
    row.innerHTML = `
      <span style="font-size:0.8rem; font-weight:500;"><i class="fa-regular fa-file-pdf" style="color:#ef4444;"></i> ${displayFileName}</span>
      <div class="select" style="width:160px; height:2.2em;">
        <select class="indiv-doc-select" data-index="${index}">
          ${docOptionsHtml}
        </select>
      </div>
    `;
    sectionIndividual.appendChild(row);
  });
}


// --- 3. 個別ビジュアル連続押印機能の実装 ---
function initVisualMode() {
  currentVisualIndex = 0;
  currentZoom = 1.0;
  updateZoomDisplay();
  visualStampsSettings = loadedPdfFiles.map((f, idx) => ({
    fileIndex: idx,
    stamps: [],
    dateTexts: [],
    dateRows: []
  }));
  // 初回起動時は引き継ぎキャッシュをクリア
  lastVisualStamps = [];
  lastDateTexts = [];
  lastDateRows = [];
  lastPdfOrientation = null;
  lastPdfPtWidth = 0;
  lastPdfPtHeight = 0;

  // ファイル名入力欄のイベント（プロパティ代入で重複登録を防ぐ）
  const commitFileName = () => {
    if (loadedPdfFiles.length === 0) return;
    let newName = visualFileNameInput.value.trim();
    if (!newName) {
      // 空なら元の名前に戻す
      visualFileNameInput.value = loadedPdfFiles[currentVisualIndex].customName;
      return;
    }
    if (!newName.toLowerCase().endsWith(".pdf")) newName += ".pdf";
    loadedPdfFiles[currentVisualIndex].customName = newName;
    visualFileNameInput.value = newName;
  };

  visualFileNameInput.onblur = commitFileName;
  visualFileNameInput.onkeydown = e => {
    if (e.key === "Enter") { e.preventDefault(); commitFileName(); visualFileNameInput.blur(); }
    if (e.key === "Escape") {
      visualFileNameInput.value = loadedPdfFiles[currentVisualIndex].customName;
      visualFileNameInput.blur();
    }
  };

  renderVisualStep();
}

async function renderPdfToCanvas(file) {
  const canvas = document.getElementById("pdfPreviewCanvas");
  const ctx = canvas.getContext("2d");

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: CMAP_URL,
      cMapPacked: true,
    }).promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 1.0 });
    const ptWidth = viewport.width;
    const ptHeight = viewport.height;

    // 現在のファイルのPDF実サイズ（ポイント単位）を記録
    if (visualStampsSettings[currentVisualIndex]) {
      visualStampsSettings[currentVisualIndex].ptWidth = ptWidth;
      visualStampsSettings[currentVisualIndex].ptHeight = ptHeight;
    }

    // スクロールラッパーの幅（ズーム前の自然幅）を基準にし、ズーム倍率を乗じて描画幅を決定
    const scrollWrapper = document.getElementById("visualPreviewScrollWrapper");
    const naturalWidth = scrollWrapper
      ? (scrollWrapper.getBoundingClientRect().width || PREVIEW_WIDTH_PX)
      : PREVIEW_WIDTH_PX;
    const containerWidth = Math.max(100, Math.round(naturalWidth * currentZoom));
    const previewHeight = Math.round(containerWidth * (ptHeight / ptWidth));

    // プレビューエリアに明示的なサイズを設定（ズーム時はラッパーよりも大きくなりスクロール可能）
    visualPreviewArea.style.width = containerWidth + "px";
    visualPreviewArea.style.height = previewHeight + "px";

    // Canvas をプレビューエリアと同じサイズにスケールして描画
    const scale = containerWidth / ptWidth;
    const scaledViewport = page.getViewport({ scale: scale });

    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    const renderContext = {
      canvasContext: ctx,
      viewport: scaledViewport
    };
    await page.render(renderContext).promise;
  } catch (err) {
    console.error("PDFレンダリングエラー:", err);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ef4444";
    ctx.font = "12px sans-serif";
    ctx.fillText("プレビューの読み込みに失敗しました", 10, 30);
  }
}

async function renderVisualStep() {
  if (loadedPdfFiles.length === 0) return;

  // 多重実行防止：各呼び出しにユニークなトークンを割り当て
  const myToken = Symbol("renderVisualStep");
  _renderVisualToken = myToken;

  const currentItem = loadedPdfFiles[currentVisualIndex];
  visualProgress.textContent = `PDF ${currentVisualIndex + 1} / ${loadedPdfFiles.length}`;

  // ファイル名入力欄を現在のファイルに同期（編集中でなければ上書き）
  if (document.activeElement !== visualFileNameInput) {
    visualFileNameInput.value = currentItem.customName;
  }

  // プレビューエリアの全オーバーレイ要素を一括削除
  visualPreviewArea.querySelectorAll(
    ".draggable-stamp, .draggable-date-text, .draggable-date-row, .date-edit-popup"
  ).forEach(el => el.remove());

  // PDF.jsで実際のPDFを描画する（完了を待ってから座標計算や配置を行う）
  await renderPdfToCanvas(currentItem.file);

  // 非同期処理中に別のrenderVisualStepが開始されていた場合はキャンセル
  if (_renderVisualToken !== myToken) return;

  // 前へボタンの有効・無効
  visualPrevBtn.disabled = currentVisualIndex === 0;

  // 次へ/完了ボタンのテキスト変更
  if (currentVisualIndex === loadedPdfFiles.length - 1) {
    visualNextBtn.textContent = "配置完了（PDF出力先指定）";
  } else {
    visualNextBtn.textContent = "配置を決定して次へ";
  }

  const savedSettings = visualStampsSettings[currentVisualIndex];
  const ptWidth = savedSettings.ptWidth || A4_WIDTH_PT;
  const ptHeight = savedSettings.ptHeight || A4_HEIGHT_PT;
  // renderPdfToCanvas が高さを設定した後で実際のサイズを取得
  const rect = visualPreviewArea.getBoundingClientRect();
  const currentPreviewWidth = rect.width || PREVIEW_WIDTH_PX;
  const currentPreviewHeight = rect.height || PREVIEW_HEIGHT_PX;

  const currentOrientation = ptWidth > ptHeight ? 'landscape' : 'portrait';

  // 未配置かつ直前のスタンプ情報があれば常に引き継ぐ（向きが変わった場合は相対位置で変換）
  if (savedSettings.stamps.length === 0 && lastVisualStamps.length > 0) {
    const prevW = lastPdfPtWidth || (lastPdfOrientation === 'landscape' ? A4_HEIGHT_PT : A4_WIDTH_PT);
    const prevH = lastPdfPtHeight || (lastPdfOrientation === 'landscape' ? A4_WIDTH_PT : A4_HEIGHT_PT);
    savedSettings.stamps = lastVisualStamps.map(last => ({
      stampFile: last.stampFile,
      pdfX: Math.round((last.pdfX / prevW) * ptWidth),
      pdfY: Math.round((last.pdfY / prevH) * ptHeight),
      width: last.width,
      height: last.height
    }));
  }

  // 未配置かつ直前の日付テキストがあれば引き継ぐ
  if ((!savedSettings.dateTexts || savedSettings.dateTexts.length === 0) && lastDateTexts.length > 0) {
    const prevW = lastPdfPtWidth || A4_WIDTH_PT;
    const prevH = lastPdfPtHeight || A4_HEIGHT_PT;
    savedSettings.dateTexts = lastDateTexts.map(last => ({
      ...last,
      pdfX: Math.round((last.pdfX / prevW) * ptWidth),
      pdfY: Math.round((last.pdfY / prevH) * ptHeight),
    }));
  }

  // 未配置かつ直前の日付行があれば引き継ぐ
  if ((!savedSettings.dateRows || savedSettings.dateRows.length === 0) && lastDateRows.length > 0) {
    const prevW = lastPdfPtWidth || A4_WIDTH_PT;
    const prevH = lastPdfPtHeight || A4_HEIGHT_PT;
    savedSettings.dateRows = lastDateRows.map(last => ({
      ...last,
      pdfX: Math.round((last.pdfX / prevW) * ptWidth),
      pdfY: Math.round((last.pdfY / prevH) * ptHeight),
    }));
  }

  // 保存済みのスタンプがあれば再現（サイズも復元）
  savedSettings.stamps.forEach(saved => {
    // PDF pt → プレビュー px に逆変換してサイズを復元
    const previewStampW = saved.width ? Math.round((saved.width / ptWidth) * currentPreviewWidth) : null;
    const previewStampH = saved.height ? Math.round((saved.height / ptHeight) * currentPreviewHeight) : null;
    const restoreH = previewStampH || getStampDimensions(saved.stampFile).previewHeight;
    const px = (saved.pdfX / ptWidth) * currentPreviewWidth;
    const py = currentPreviewHeight - ((saved.pdfY / ptHeight) * currentPreviewHeight) - restoreH;
    createVisualStampElement(saved.stampFile, px, py, previewStampW, previewStampH);
  });

  // 保存済みの日付テキストがあれば再現
  (savedSettings.dateTexts || []).forEach(saved => {
    const scale = currentPreviewWidth / ptWidth;
    const displayFontSizePx = Math.max(8, Math.round(saved.fontSizePt * scale));
    const approxElH = displayFontSizePx + 8;
    // pdfX はテキスト開始位置なので、要素の left = pdfX変換値 - border(1) - padding(4)
    const textPx = (saved.pdfX / ptWidth) * currentPreviewWidth;
    const elPx = Math.max(0, textPx - 5);
    const py = currentPreviewHeight - (saved.pdfY / ptHeight) * currentPreviewHeight - approxElH;
    createDateTextElement(saved.text, elPx, py, saved.fontSizePt);
  });

  // 保存済みの日付行があれば再現
  (savedSettings.dateRows || []).forEach(saved => {
    const scale = currentPreviewWidth / ptWidth;
    const displayFontSizePx = Math.max(8, Math.round(saved.fontSizePt * scale));
    const approxElH = displayFontSizePx + 8;
    const gap1Px = Math.round((saved.gap1Pt / ptWidth) * currentPreviewWidth);
    const gap2Px = Math.round((saved.gap2Pt / ptWidth) * currentPreviewWidth);
    const px = (saved.pdfX / ptWidth) * currentPreviewWidth;
    const py = currentPreviewHeight - (saved.pdfY / ptHeight) * currentPreviewHeight - approxElH;
    createDateRowElement(saved.year, saved.month, saved.day, saved.fontSizePt, gap1Px, gap2Px, px, py);
  });
}

// プレビュー上にスタンプ要素を生成する（initialWidth/Height: 復元時のピクセルサイズ）
function createVisualStampElement(stampFile, startX = null, startY = null, initialWidth = null, initialHeight = null) {
  const stampEl = document.createElement("div");
  stampEl.className = "draggable-stamp";

  const dims = getStampDimensions(stampFile);
  const stampWidth = initialWidth || dims.previewWidth;
  const stampHeight = initialHeight || dims.previewHeight;

  stampEl.style.width = stampWidth + "px";
  stampEl.style.height = stampHeight + "px";
  stampEl.style.borderRadius = dims.borderRadius;

  if (stampFile === "square.png") {
    stampEl.classList.add("square-stamp");
  }

  // ファイルの拡張子抜き名をラベルに
  const label = path.basename(stampFile, path.extname(stampFile));

  // テキスト表示用のスパン
  const labelSpan = document.createElement("span");
  labelSpan.textContent = label.slice(0, 4);
  stampEl.appendChild(labelSpan);

  // 削除用「×」バッジを追加
  const deleteBadge = document.createElement("button");
  deleteBadge.className = "stamp-delete-badge";
  deleteBadge.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  deleteBadge.title = "このスタンプを削除";
  deleteBadge.addEventListener("mousedown", (e) => { e.stopPropagation(); });
  deleteBadge.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`この印影「${label}」をプレビューから削除しますか？`)) {
      stampEl.remove();
      saveCurrentVisualStamps();
    }
  });
  stampEl.appendChild(deleteBadge);

  // リサイズハンドル（右下コーナー）
  const resizeHandle = document.createElement("div");
  resizeHandle.className = "stamp-resize-handle";
  resizeHandle.title = "ドラッグしてサイズを変更";
  resizeHandle.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();

    const startMouseX = e.clientX;
    const startW = stampEl.offsetWidth;
    const startH = stampEl.offsetHeight;
    const aspectRatio = startW / startH;
    stampEl.style.zIndex = 1000;

    const onResizeMove = (e) => {
      const dx = e.clientX - startMouseX;
      let newW = Math.max(24, startW + dx);
      let newH = Math.round(newW / aspectRatio);

      // プレビューエリアからはみ出さないよう制限
      const areaRect = visualPreviewArea.getBoundingClientRect();
      const areaW = areaRect.width || PREVIEW_WIDTH_PX;
      const areaH = parseFloat(visualPreviewArea.style.height) || areaRect.height || PREVIEW_HEIGHT_PX;
      const left = parseFloat(stampEl.style.left) || 0;
      const top = parseFloat(stampEl.style.top) || 0;
      newW = Math.min(newW, areaW - left);
      newH = Math.min(newH, areaH - top);

      stampEl.style.width = newW + "px";
      stampEl.style.height = newH + "px";
    };

    const onResizeUp = () => {
      stampEl.style.zIndex = "";
      document.removeEventListener("mousemove", onResizeMove);
      document.removeEventListener("mouseup", onResizeUp);
      saveCurrentVisualStamps();
    };

    document.addEventListener("mousemove", onResizeMove);
    document.addEventListener("mouseup", onResizeUp);
  });
  stampEl.appendChild(resizeHandle);

  const _initRect = visualPreviewArea.getBoundingClientRect();
  const currentPreviewWidth = (_initRect.width || PREVIEW_WIDTH_PX);
  const currentPreviewHeight = (parseFloat(visualPreviewArea.style.height) || _initRect.height || PREVIEW_HEIGHT_PX);

  // 位置の指定がなければ中央に配置
  if (startX === null) startX = (currentPreviewWidth - stampWidth) / 2;
  if (startY === null) startY = (currentPreviewHeight - stampHeight) / 2;

  stampEl.style.left = startX + "px";
  stampEl.style.top = startY + "px";
  stampEl.dataset.stampFile = stampFile;

  // ドラッグ＆ドロップ実装
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  stampEl.addEventListener("mousedown", (e) => {
    isDragging = true;
    const rect = stampEl.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    stampEl.style.zIndex = 1000;
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const areaRect = visualPreviewArea.getBoundingClientRect();
    let x = e.clientX - areaRect.left - offsetX;
    let y = e.clientY - areaRect.top - offsetY;

    const curW = stampEl.offsetWidth;
    const curH = stampEl.offsetHeight;
    const _dragRect = visualPreviewArea.getBoundingClientRect();
    const currentPreviewWidth = (_dragRect.width || PREVIEW_WIDTH_PX);
    const currentPreviewHeight = (parseFloat(visualPreviewArea.style.height) || _dragRect.height || PREVIEW_HEIGHT_PX);

    if (x < 0) x = 0;
    if (x > currentPreviewWidth - curW) x = currentPreviewWidth - curW;
    if (y < 0) y = 0;
    if (y > currentPreviewHeight - curH) y = currentPreviewHeight - curH;

    stampEl.style.left = x + "px";
    stampEl.style.top = y + "px";

    updateVisualCoordinates(x, y, curW, curH);
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      stampEl.style.zIndex = "";
      saveCurrentVisualStamps();
    }
  });

  stampEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (confirm("この印影を削除しますか？")) {
      stampEl.remove();
      saveCurrentVisualStamps();
    }
  });

  visualPreviewArea.appendChild(stampEl);
  saveCurrentVisualStamps();
}

// プレビュー座標からPDF上の座標(X, Y)を算出して表示
function updateVisualCoordinates(px, py, width, height) {
  document.getElementById("visualPosFields").classList.remove("hidden");

  const setting = visualStampsSettings[currentVisualIndex];
  const ptWidth = (setting && setting.ptWidth) ? setting.ptWidth : A4_WIDTH_PT;
  const ptHeight = (setting && setting.ptHeight) ? setting.ptHeight : A4_HEIGHT_PT;

  const _coordRect = visualPreviewArea.getBoundingClientRect();
  const currentPreviewWidth = (_coordRect.width || PREVIEW_WIDTH_PX);
  const currentPreviewHeight = (parseFloat(visualPreviewArea.style.height) || _coordRect.height || PREVIEW_HEIGHT_PX);

  // PDF-lib 座標系: 左下原点 (0,0)
  const x = Math.round((px / currentPreviewWidth) * ptWidth);
  const y = Math.round(((currentPreviewHeight - py - height) / currentPreviewHeight) * ptHeight);

  document.getElementById("visualXVal").textContent = x;
  document.getElementById("visualYVal").textContent = y;
}

// 現在のプレビュー上の全スタンプ座標をメモリに保存
function saveCurrentVisualStamps() {
  const savedList = [];
  const stampEls = visualPreviewArea.querySelectorAll(".draggable-stamp");

  const setting = visualStampsSettings[currentVisualIndex];
  const ptWidth = (setting && setting.ptWidth) ? setting.ptWidth : A4_WIDTH_PT;
  const ptHeight = (setting && setting.ptHeight) ? setting.ptHeight : A4_HEIGHT_PT;

  const _saveRect = visualPreviewArea.getBoundingClientRect();
  const currentPreviewWidth = (_saveRect.width || PREVIEW_WIDTH_PX);
  const currentPreviewHeight = (parseFloat(visualPreviewArea.style.height) || _saveRect.height || PREVIEW_HEIGHT_PX);

  stampEls.forEach(el => {
    const px = parseFloat(el.style.left) || 0;
    const py = parseFloat(el.style.top) || 0;
    const elW = el.offsetWidth;
    const elH = el.offsetHeight;
    const stampFile = el.dataset.stampFile;

    // PDF座標・サイズをプレビュー上の実寸から比例計算
    const pdfX = Math.round((px / currentPreviewWidth) * ptWidth);
    const pdfY = Math.round(((currentPreviewHeight - py - elH) / currentPreviewHeight) * ptHeight);
    const pdfStampW = Math.round((elW / currentPreviewWidth) * ptWidth);
    const pdfStampH = Math.round((elH / currentPreviewHeight) * ptHeight);

    savedList.push({
      stampFile,
      px,
      py,
      pdfX,
      pdfY,
      width: pdfStampW,
      height: pdfStampH
    });
  });

  if (visualStampsSettings[currentVisualIndex]) {
    visualStampsSettings[currentVisualIndex].stamps = savedList;
  }
}

// 現在のプレビュー上の全日付テキスト座標をメモリに保存
function saveDateTexts() {
  const savedList = [];
  const dateEls = visualPreviewArea.querySelectorAll(".draggable-date-text");

  const setting = visualStampsSettings[currentVisualIndex];
  const ptWidth = (setting && setting.ptWidth) ? setting.ptWidth : A4_WIDTH_PT;
  const ptHeight = (setting && setting.ptHeight) ? setting.ptHeight : A4_HEIGHT_PT;

  const areaRect = visualPreviewArea.getBoundingClientRect();
  const currentPreviewWidth = areaRect.width || PREVIEW_WIDTH_PX;
  const currentPreviewHeight = parseFloat(visualPreviewArea.style.height) || areaRect.height || PREVIEW_HEIGHT_PX;

  dateEls.forEach(el => {
    const px = parseFloat(el.style.left) || 0;
    const py = parseFloat(el.style.top) || 0;
    const text = el.dataset.text;
    const fontSizePt = parseFloat(el.dataset.fontSizePt) || 9;

    // X: 要素left + border-left(1px) + padding-left(4px) = テキスト表示開始位置
    const pdfX = Math.round(((px + 5) / currentPreviewWidth) * ptWidth);

    // Y: getBoundingClientRect でベースラインを測定、取得不可ならフォールバック
    const contentSpan = el.querySelector(".date-content");
    let pdfY;
    if (contentSpan && areaRect.width > 0) {
      const spanRect = contentSpan.getBoundingClientRect();
      const baseline = spanRect.bottom - areaRect.top - spanRect.height * 0.2;
      pdfY = Math.round(((currentPreviewHeight - baseline) / currentPreviewHeight) * ptHeight);
    } else {
      const elH = el.offsetHeight;
      pdfY = Math.round(((currentPreviewHeight - py - elH * 0.85) / currentPreviewHeight) * ptHeight);
    }

    savedList.push({ text, fontSizePt, px, py, pdfX, pdfY });
  });

  if (visualStampsSettings[currentVisualIndex]) {
    visualStampsSettings[currentVisualIndex].dateTexts = savedList;
  }
}

// 現在のプレビュー上の全日付行をメモリに保存
function saveDateRows() {
  const savedList = [];
  const rowEls = visualPreviewArea.querySelectorAll(".draggable-date-row");

  const setting = visualStampsSettings[currentVisualIndex];
  const ptWidth = (setting && setting.ptWidth) ? setting.ptWidth : A4_WIDTH_PT;
  const ptHeight = (setting && setting.ptHeight) ? setting.ptHeight : A4_HEIGHT_PT;
  const areaRect = visualPreviewArea.getBoundingClientRect();
  const currentPreviewWidth = areaRect.width || PREVIEW_WIDTH_PX;
  const currentPreviewHeight = parseFloat(visualPreviewArea.style.height) || areaRect.height || PREVIEW_HEIGHT_PX;

  rowEls.forEach(el => {
    const px = parseFloat(el.style.left) || 0;
    const py = parseFloat(el.style.top) || 0;
    const year = el.dataset.year;
    const month = el.dataset.month;
    const day = el.dataset.day;
    const fontSizePt = parseFloat(el.dataset.fontSizePt) || 8;
    const gap1Px = parseFloat(el.dataset.gap1Px) || 20;
    const gap2Px = parseFloat(el.dataset.gap2Px) || 20;

    // 年スパンの実際の描画位置をDOMから取得（paddingのズレを解消）
    const yearSpan = el.querySelector(".date-row-num");
    let pdfX, pdfY;
    if (yearSpan && areaRect.width > 0) {
      const spanRect = yearSpan.getBoundingClientRect();
      const actualX = spanRect.left - areaRect.left;
      // ベースライン ≈ spanの下端から上に約20%の位置
      const baseline = spanRect.bottom - areaRect.top - spanRect.height * 0.2;
      pdfX = Math.round((actualX / currentPreviewWidth) * ptWidth);
      pdfY = Math.round(((currentPreviewHeight - baseline) / currentPreviewHeight) * ptHeight);
    } else {
      // フォールバック（要素位置から推定）
      const elH = el.offsetHeight;
      pdfX = Math.round((px / currentPreviewWidth) * ptWidth);
      pdfY = Math.round(((currentPreviewHeight - py - elH * 0.85) / currentPreviewHeight) * ptHeight);
    }

    const gap1Pt = Math.round((gap1Px / currentPreviewWidth) * ptWidth);
    const gap2Pt = Math.round((gap2Px / currentPreviewWidth) * ptWidth);

    savedList.push({ year, month, day, fontSizePt, gap1Pt, gap2Pt, gap1Px, gap2Px, px, py, pdfX, pdfY });
  });

  if (visualStampsSettings[currentVisualIndex]) {
    visualStampsSettings[currentVisualIndex].dateRows = savedList;
  }
}

// プレビュー上に日付行要素（年・月・日を一行で）を生成する
function createDateRowElement(year, month, day, fontSizePt = 8, gap1Px = 24, gap2Px = 24, startX = null, startY = null) {
  const el = document.createElement("div");
  el.className = "draggable-date-row";
  el.dataset.year = year;
  el.dataset.month = month;
  el.dataset.day = day;
  el.dataset.fontSizePt = fontSizePt;
  el.dataset.gap1Px = gap1Px;
  el.dataset.gap2Px = gap2Px;

  const setting = visualStampsSettings[currentVisualIndex];
  const ptWidth = (setting && setting.ptWidth) ? setting.ptWidth : A4_WIDTH_PT;
  const _rect = visualPreviewArea.getBoundingClientRect();
  const currentPreviewWidth = _rect.width || PREVIEW_WIDTH_PX;
  const currentPreviewHeight = parseFloat(visualPreviewArea.style.height) || _rect.height || PREVIEW_HEIGHT_PX;
  const scale = currentPreviewWidth / ptWidth;
  const displayFontSize = Math.max(8, Math.round(fontSizePt * scale));

  el.style.fontSize = displayFontSize + "px";

  // 年スパン
  const yearSpan = makeEditableNumSpan(year, "year", el, displayFontSize);
  el.appendChild(yearSpan);

  // 間隔ハンドル1
  const gap1Handle = makeGapHandle(el, "gap1Px", gap1Px);
  el.appendChild(gap1Handle);

  // 月スパン
  const monthSpan = makeEditableNumSpan(month, "month", el, displayFontSize);
  el.appendChild(monthSpan);

  // 間隔ハンドル2
  const gap2Handle = makeGapHandle(el, "gap2Px", gap2Px);
  el.appendChild(gap2Handle);

  // 日スパン
  const daySpan = makeEditableNumSpan(day, "day", el, displayFontSize);
  el.appendChild(daySpan);

  // 削除バッジ
  const deleteBadge = document.createElement("button");
  deleteBadge.className = "date-text-delete-badge";
  deleteBadge.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  deleteBadge.title = "この日付行を削除";
  deleteBadge.addEventListener("mousedown", e => e.stopPropagation());
  deleteBadge.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    el.remove();
    saveDateRows();
  });
  el.appendChild(deleteBadge);

  if (startX === null) startX = (currentPreviewWidth - 120) / 2;
  if (startY === null) startY = (currentPreviewHeight - displayFontSize) / 2;
  el.style.left = startX + "px";
  el.style.top = startY + "px";

  // 要素全体のドラッグ（ギャップハンドル・削除バッジ以外から開始）
  el._isDragging = false;
  el._dragOffsetX = 0;
  el._dragOffsetY = 0;

  const startRowDrag = (e) => {
    el._isDragging = true;
    const elRect = el.getBoundingClientRect();
    el._dragOffsetX = e.clientX - elRect.left;
    el._dragOffsetY = e.clientY - elRect.top;
    el.style.zIndex = 1000;
    e.preventDefault();
  };

  el.addEventListener("mousedown", e => {
    if (e.target.classList.contains("date-row-gap-handle") || deleteBadge.contains(e.target)) return;
    startRowDrag(e);
  });

  document.addEventListener("mousemove", e => {
    if (!el._isDragging) return;
    const areaRect = visualPreviewArea.getBoundingClientRect();
    let x = e.clientX - areaRect.left - el._dragOffsetX;
    let y = e.clientY - areaRect.top - el._dragOffsetY;
    const areaW = areaRect.width || PREVIEW_WIDTH_PX;
    const areaH = parseFloat(visualPreviewArea.style.height) || areaRect.height || PREVIEW_HEIGHT_PX;
    x = Math.max(0, Math.min(x, areaW - el.offsetWidth));
    y = Math.max(0, Math.min(y, areaH - el.offsetHeight));
    el.style.left = x + "px";
    el.style.top = y + "px";
  });

  document.addEventListener("mouseup", () => {
    if (el._isDragging) {
      el._isDragging = false;
      el.style.zIndex = "";
      saveDateRows();
    }
  });

  visualPreviewArea.appendChild(el);
  saveDateRows();
}

// 日付行の編集可能な数字スパンを作成
function makeEditableNumSpan(value, partName, parentEl, displayFontSize) {
  const span = document.createElement("span");
  span.className = "date-row-num";
  span.dataset.part = partName;
  span.textContent = value;

  // 数字スパン上でもドラッグで親要素を移動できるよう、親要素のドラッグ状態を直接セット
  span.addEventListener("mousedown", e => {
    const elRect = parentEl.getBoundingClientRect();
    parentEl._dragOffsetX = e.clientX - elRect.left;
    parentEl._dragOffsetY = e.clientY - elRect.top;
    parentEl._isDragging = true;
    parentEl.style.zIndex = 1000;
    e.preventDefault();
  });

  // ダブルクリックで数値を編集
  span.addEventListener("dblclick", e => {
    e.stopPropagation();
    const currentVal = parentEl.dataset[partName];
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentVal;
    input.style.cssText = `font-size:${displayFontSize}px; border:none; outline:1px solid #7c3aed; outline-offset:1px; background:rgba(245,243,255,0.95); width:${Math.max(30, span.offsetWidth + 10)}px; color:#000; font-family:'Inter',sans-serif; text-align:center; border-radius:2px;`;
    span.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const newVal = input.value.trim() || currentVal;
      parentEl.dataset[partName] = newVal;
      span.textContent = newVal;
      input.replaceWith(span);
      saveDateRows();
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", ev => {
      ev.stopPropagation();
      if (ev.key === "Enter") { ev.preventDefault(); commit(); }
      if (ev.key === "Escape") { input.value = currentVal; commit(); }
    });
  });

  return span;
}

// 日付行の間隔調整ハンドルを作成（左右ドラッグで間隔を変更）
function makeGapHandle(parentEl, dataKey, initialWidthPx) {
  const handle = document.createElement("div");
  handle.className = "date-row-gap-handle";
  handle.style.width = Math.max(8, initialWidthPx) + "px";
  handle.title = "ドラッグして間隔を調整";

  let isResizing = false;
  let startMouseX = 0;
  let startWidth = 0;

  handle.addEventListener("mousedown", e => {
    e.stopPropagation();
    e.preventDefault();
    isResizing = true;
    startMouseX = e.clientX;
    startWidth = handle.offsetWidth;
    document.body.style.cursor = "ew-resize";
  });

  document.addEventListener("mousemove", e => {
    if (!isResizing) return;
    const dx = e.clientX - startMouseX;
    const newWidth = Math.max(4, startWidth + dx);
    handle.style.width = newWidth + "px";
    parentEl.dataset[dataKey] = newWidth;
  });

  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = "";
      saveDateRows();
    }
  });

  return handle;
}

// プレビュー上に日付テキスト要素を生成する
function createDateTextElement(text, startX = null, startY = null, fontSizePt = 12) {
  const el = document.createElement("div");
  el.className = "draggable-date-text";
  el.dataset.text = text;
  el.dataset.fontSizePt = fontSizePt;

  const setting = visualStampsSettings[currentVisualIndex];
  const ptWidth = (setting && setting.ptWidth) ? setting.ptWidth : A4_WIDTH_PT;
  const _rect = visualPreviewArea.getBoundingClientRect();
  const currentPreviewWidth = _rect.width || PREVIEW_WIDTH_PX;
  const currentPreviewHeight = parseFloat(visualPreviewArea.style.height) || _rect.height || PREVIEW_HEIGHT_PX;
  const scale = currentPreviewWidth / ptWidth;
  const displayFontSize = Math.max(8, Math.round(fontSizePt * scale));

  const contentSpan = document.createElement("span");
  contentSpan.className = "date-content";
  contentSpan.textContent = text;
  contentSpan.style.fontSize = displayFontSize + "px";
  el.appendChild(contentSpan);

  const deleteBadge = document.createElement("button");
  deleteBadge.className = "date-text-delete-badge";
  deleteBadge.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  deleteBadge.title = "このテキストを削除";
  deleteBadge.addEventListener("mousedown", e => e.stopPropagation());
  deleteBadge.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    el.remove();
    saveDateTexts();
  });
  el.appendChild(deleteBadge);

  if (startX === null) startX = (currentPreviewWidth - 50) / 2;
  if (startY === null) startY = (currentPreviewHeight - displayFontSize) / 2;

  el.style.left = startX + "px";
  el.style.top = startY + "px";

  let isDragging = false;
  let offsetX = 0, offsetY = 0;

  el.addEventListener("mousedown", e => {
    if (deleteBadge.contains(e.target)) return;
    isDragging = true;
    const elRect = el.getBoundingClientRect();
    offsetX = e.clientX - elRect.left;
    offsetY = e.clientY - elRect.top;
    el.style.zIndex = 1000;
    e.preventDefault();
  });

  document.addEventListener("mousemove", e => {
    if (!isDragging) return;
    const areaRect = visualPreviewArea.getBoundingClientRect();
    let x = e.clientX - areaRect.left - offsetX;
    let y = e.clientY - areaRect.top - offsetY;
    const areaW = areaRect.width || PREVIEW_WIDTH_PX;
    const areaH = parseFloat(visualPreviewArea.style.height) || areaRect.height || PREVIEW_HEIGHT_PX;
    x = Math.max(0, Math.min(x, areaW - el.offsetWidth));
    y = Math.max(0, Math.min(y, areaH - el.offsetHeight));
    el.style.left = x + "px";
    el.style.top = y + "px";
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      el.style.zIndex = "";
      saveDateTexts();
    }
  });

  // ダブルクリックでテキスト・フォントサイズ編集ポップアップ
  el.addEventListener("dblclick", e => {
    e.stopPropagation();
    // 既存のポップアップを削除
    visualPreviewArea.querySelectorAll(".date-edit-popup").forEach(p => p.remove());

    const currentText = el.dataset.text;
    const currentFontSizePt = parseFloat(el.dataset.fontSizePt) || 8;

    const popup = document.createElement("div");
    popup.className = "date-edit-popup";
    const elLeft = parseFloat(el.style.left) || 0;
    const elTop = parseFloat(el.style.top) || 0;
    const previewH = parseFloat(visualPreviewArea.style.height) || visualPreviewArea.getBoundingClientRect().height || PREVIEW_HEIGHT_PX;
    const popupTop = elTop + el.offsetHeight + 4;
    popup.style.cssText = `position:absolute; top:${Math.min(popupTop, previewH - 120)}px; left:${elLeft}px; background:#fff; border:1px solid #7c3aed; border-radius:6px; padding:8px; z-index:2000; display:flex; flex-direction:column; gap:6px; box-shadow:0 4px 12px rgba(0,0,0,0.15); min-width:170px;`;

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.value = currentText;
    textInput.placeholder = "テキスト";
    textInput.style.cssText = "border:1px solid #cbd5e1; border-radius:3px; padding:3px 6px; font-size:12px; width:100%; outline:none;";
    popup.appendChild(textInput);

    const sizeRow = document.createElement("div");
    sizeRow.style.cssText = "display:flex; align-items:center; gap:4px;";
    const sizeLabel = document.createElement("label");
    sizeLabel.textContent = "サイズ:";
    sizeLabel.style.cssText = "font-size:11px; color:#64748b; white-space:nowrap;";
    const sizeInput = document.createElement("input");
    sizeInput.type = "number";
    sizeInput.value = currentFontSizePt;
    sizeInput.min = 6;
    sizeInput.max = 72;
    sizeInput.style.cssText = "border:1px solid #cbd5e1; border-radius:3px; padding:3px 4px; font-size:12px; width:52px; outline:none;";
    const ptLabel = document.createElement("span");
    ptLabel.textContent = "pt";
    ptLabel.style.cssText = "font-size:11px; color:#64748b;";
    sizeRow.appendChild(sizeLabel);
    sizeRow.appendChild(sizeInput);
    sizeRow.appendChild(ptLabel);
    popup.appendChild(sizeRow);

    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = "✓ 確定";
    confirmBtn.style.cssText = "background:#7c3aed; color:#fff; border:none; border-radius:3px; padding:4px 8px; font-size:11px; cursor:pointer; font-weight:600;";
    popup.appendChild(confirmBtn);

    const commitEdit = () => {
      const newText = textInput.value.trim() || currentText;
      const newFontSizePt = Math.max(6, parseFloat(sizeInput.value) || currentFontSizePt);
      el.dataset.text = newText;
      el.dataset.fontSizePt = newFontSizePt;
      contentSpan.textContent = newText;

      const _s = visualStampsSettings[currentVisualIndex];
      const _ptW = (_s && _s.ptWidth) ? _s.ptWidth : A4_WIDTH_PT;
      const _pW = visualPreviewArea.getBoundingClientRect().width || PREVIEW_WIDTH_PX;
      const newDisplaySize = Math.max(8, Math.round(newFontSizePt * (_pW / _ptW)));
      contentSpan.style.fontSize = newDisplaySize + "px";

      popup.remove();
      saveDateTexts();
    };

    confirmBtn.addEventListener("click", ev => { ev.stopPropagation(); commitEdit(); });
    popup.addEventListener("keydown", ev => {
      ev.stopPropagation();
      if (ev.key === "Enter") { ev.preventDefault(); commitEdit(); }
      if (ev.key === "Escape") { popup.remove(); }
    });

    const closeHandler = ev => {
      if (!popup.contains(ev.target) && ev.target !== el && !el.contains(ev.target)) {
        popup.remove();
        document.removeEventListener("mousedown", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", closeHandler), 100);

    visualPreviewArea.appendChild(popup);
    textInput.focus();
    textInput.select();
  });

  visualPreviewArea.appendChild(el);
  saveDateTexts();
}

// スタンプ追加ボタン
addVisualStampBtn.addEventListener("click", () => {
  const selectedStamp = visualStampSelect.value;
  if (!selectedStamp) {
    alert("印影画像が選択されていません。設定画面で追加してください。");
    return;
  }
  createVisualStampElement(selectedStamp);
});

// 次へ / 決定
visualNextBtn.addEventListener("click", async () => {
  saveCurrentVisualStamps();

  // 直前の配置スタンプと用紙向きをキャッシュ
  const savedSettings = visualStampsSettings[currentVisualIndex];
  const ptWidth = savedSettings.ptWidth || A4_WIDTH_PT;
  const ptHeight = savedSettings.ptHeight || A4_HEIGHT_PT;

  lastVisualStamps = savedSettings.stamps.map(s => ({
    stampFile: s.stampFile,
    pdfX: s.pdfX,
    pdfY: s.pdfY,
    width: s.width,
    height: s.height
  }));
  lastDateTexts = (savedSettings.dateTexts || []).map(d => ({ ...d }));
  lastDateRows = (savedSettings.dateRows || []).map(d => ({ ...d }));
  lastPdfOrientation = ptWidth > ptHeight ? 'landscape' : 'portrait';
  lastPdfPtWidth = ptWidth;
  lastPdfPtHeight = ptHeight;

  if (currentVisualIndex < loadedPdfFiles.length - 1) {
    currentVisualIndex++;
    await renderVisualStep();
  } else {
    // 最終完了処理：保存先指定ダイアログを起動
    await processPdfOutput("visual");
  }
});

// 前へ
visualPrevBtn.addEventListener("click", async () => {
  saveCurrentVisualStamps();
  if (currentVisualIndex > 0) {
    currentVisualIndex--;
    await renderVisualStep();
  }
});


// --- PDF出力実行処理 ---
async function processPdfOutput(mode = "normal") {
  let processList = [];

  const isIndividualMode = document.getElementById("radioIndividual").checked;
  const isVisualMode = document.getElementById("radioVisual").checked;

  if (isVisualMode) {
    // ビジュアル連続押印設定からビルド
    visualStampsSettings.forEach((setting, fileIdx) => {
      const item = loadedPdfFiles[fileIdx];
      processList.push({
        file: item.file,
        customName: item.customName,
        stamps: setting.stamps.map(s => ({
          stampFile: s.stampFile,
          x: s.pdfX,
          y: s.pdfY,
          width: s.width,
          height: s.height
        })),
        dateTexts: (setting.dateTexts || []).map(d => ({
          text: d.text,
          x: d.pdfX,
          y: d.pdfY,
          fontSize: d.fontSizePt
        })),
        dateRows: (setting.dateRows || []).map(d => ({
          year: d.year, month: d.month, day: d.day,
          x: d.pdfX, y: d.pdfY,
          fontSize: d.fontSizePt,
          gap1Pt: d.gap1Pt, gap2Pt: d.gap2Pt
        }))
      });
    });
  } else if (isIndividualMode) {
    // 個別設定からビルド
    const selects = document.querySelectorAll(".indiv-doc-select");
    for (let index = 0; index < loadedPdfFiles.length; index++) {
      const item = loadedPdfFiles[index];
      const docId = selects[index].value;
      const doc = docTypes.find(d => d.id === docId);

      if (!doc) {
        alert(`${item.customName} に対する書類種別が設定されていません。`);
        return;
      }

      processList.push({
        file: item.file,
        customName: item.customName,
        stamps: doc.rules.map(r => {
          const dims = getStampDimensions(r.stamp);
          return { stampFile: r.stamp, x: r.x, y: r.y, width: dims.pdfWidth, height: dims.pdfHeight };
        }),
        dateTexts: [],
        dateRows: []
      });
    }
  } else {
    // 一括設定からビルド
    const docId = selectDocType.value;
    const doc = docTypes.find(d => d.id === docId);

    if (!doc) {
      alert("書類種別を選択してください。");
      return;
    }

    loadedPdfFiles.forEach(item => {
      processList.push({
        file: item.file,
        customName: item.customName,
        stamps: doc.rules.map(r => {
          const dims = getStampDimensions(r.stamp);
          return { stampFile: r.stamp, x: r.x, y: r.y, width: dims.pdfWidth, height: dims.pdfHeight };
        }),
        dateTexts: []
      });
    });
  }

  // 保存先選択ダイアログの表示
  const { canceled, filePaths } = await ipcRenderer.invoke("show-open-dialog");
  if (canceled || !filePaths || !filePaths.length) return;

  stampPdfBtn.classList.add("is-loading");
  stampPdfBtn.disabled = true;

  let processingToast = null;
  try {
    processingToast = showToast("PDFに出力・印影の合成処理を行っています...", "info", 0);

    const selectedDirectory = filePaths[0];
    const now = new Date();
    const folderName = `Stamp_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const outputFolderPath = path.join(selectedDirectory, folderName);

    if (!fs.existsSync(outputFolderPath)) {
      fs.mkdirSync(outputFolderPath);
    }

    for (const { file, customName, stamps, dateTexts, dateRows } of processList) {
      const pdfBytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const page = pdfDoc.getPages()[0];

      for (const stampInfo of stamps) {
        if (!stampInfo.stampFile) continue;
        const stampPath = path.join(stampFolder, stampInfo.stampFile);

        if (fs.existsSync(stampPath)) {
          const stampBytes = fs.readFileSync(stampPath);
          const ext = stampInfo.stampFile.split(".").pop().toLowerCase();

          let image;
          if (ext === "jpg" || ext === "jpeg") {
            image = await pdfDoc.embedJpg(stampBytes);
          } else {
            image = await pdfDoc.embedPng(stampBytes);
          }

          page.drawImage(image, {
            x: stampInfo.x,
            y: stampInfo.y,
            width: stampInfo.width,
            height: stampInfo.height,
          });
        }
      }

      // 日付テキスト・日付行の描画（日本語フォント対応）
      const hasDateContent = (dateTexts && dateTexts.length > 0) || (dateRows && dateRows.length > 0);
      if (hasDateContent) {
        const jpFont = await embedJapaneseFont(pdfDoc);

        // 任意テキストの描画
        for (const dt of (dateTexts || [])) {
          if (!dt.text) continue;
          try {
            page.drawText(dt.text, {
              x: dt.x,
              y: dt.y,
              size: dt.fontSize,
              font: jpFont,
              color: rgb(0, 0, 0),
            });
          } catch (e) {
            console.warn("テキスト描画スキップ:", dt.text, e.message);
          }
        }

        // 日付行（年・月・日）の描画
        for (const dr of (dateRows || [])) {
          try {
            const fontSize = dr.fontSize;
            // 年を描画
            page.drawText(String(dr.year), { x: dr.x, y: dr.y, size: fontSize, font: jpFont, color: rgb(0, 0, 0) });
            // 月を描画（年のテキスト幅 + gap1Pt 分右に）
            const yearW = jpFont.widthOfTextAtSize(String(dr.year), fontSize);
            const monthX = dr.x + yearW + dr.gap1Pt;
            page.drawText(String(dr.month), { x: monthX, y: dr.y, size: fontSize, font: jpFont, color: rgb(0, 0, 0) });
            // 日を描画（月のテキスト幅 + gap2Pt 分右に）
            const monthW = jpFont.widthOfTextAtSize(String(dr.month), fontSize);
            const dayX = monthX + monthW + dr.gap2Pt;
            page.drawText(String(dr.day), { x: dayX, y: dr.y, size: fontSize, font: jpFont, color: rgb(0, 0, 0) });
          } catch (e) {
            console.warn("日付行描画スキップ:", dr, e.message);
          }
        }
      }

      const updatedPdfBytes = await pdfDoc.save();
      const outputFilePath = path.join(outputFolderPath, customName);
      fs.writeFileSync(outputFilePath, updatedPdfBytes);
    }

    if (processingToast) processingToast.remove();
    showToast(
      `印影の合成処理が完了しました！\n出力先フォルダ:\n${outputFolderPath}`,
      "success",
      12000, // ユーザーがボタンを押せるよう少し長めの表示時間（12秒）に設定
      {
        text: "フォルダを開く",
        callback: () => {
          shell.openPath(outputFolderPath);
        }
      }
    );

  } catch (error) {
    if (processingToast) processingToast.remove();
    showToast("PDFの出力・印影合成中にエラーが発生しました。コンソールログを確認してください。", "error", 5000);
    console.error("PDF合成エラー: ", error);
  } finally {
    stampPdfBtn.classList.remove("is-loading");
    stampPdfBtn.disabled = false;
  }
}

stampPdfBtn.addEventListener("click", () => processPdfOutput("normal"));


// ズームインジケーターを更新する
function updateZoomDisplay() {
  const el = document.getElementById("zoomIndicator");
  if (el) el.textContent = Math.round(currentZoom * 100) + "%";
}

// ズームを変更してプレビューを即時再描画する
function changeZoom(delta) {
  if (sectionVisual.classList.contains("hidden") || loadedPdfFiles.length === 0) return;
  currentZoom = Math.max(0.5, Math.min(3.0, Math.round((currentZoom + delta) * 10) / 10));
  updateZoomDisplay();
  renderVisualStep();
}

// ホイール操作用：短時間に連続して来るイベントをデバウンスしてから再描画する
function changeZoomDebounced(delta) {
  if (sectionVisual.classList.contains("hidden") || loadedPdfFiles.length === 0) return;
  currentZoom = Math.max(0.5, Math.min(3.0, Math.round((currentZoom + delta) * 10) / 10));
  updateZoomDisplay();
  clearTimeout(_zoomRenderTimer);
  _zoomRenderTimer = setTimeout(() => renderVisualStep(), 80);
}

// F12キーでDevToolsを開く（デバッグ用）
document.addEventListener("keydown", (e) => {
  if (e.key === "F12") {
    ipcRenderer.send("open-devtools");
    return;
  }
  // Ctrl+↑↓ でズームイン・ズームアウト
  if (e.ctrlKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    changeZoom(e.key === "ArrowUp" ? 0.1 : -0.1);
  }
});

// --- アプリケーション起動時の初期処理 ---
window.addEventListener("DOMContentLoaded", async () => {
  // まず書き込み可能な印影フォルダパスを取得してから初期化
  try {
    const folder = await ipcRenderer.invoke("get-stamp-folder");
    stampFolder = folder;
  } catch (e) {
    console.warn("get-stamp-folder failed, using fallback:", e);
  }

  initMasterData();
  loadSelectOptions();
  displayFiles();

  // ファイル削除ボタンのイベント委譲（デリゲーション）登録
  const fileGrid = document.getElementById("fileGrid");
  fileGrid.addEventListener("click", (e) => {
    const deleteBtn = e.target.closest(".delete-btn");
    if (deleteBtn) {
      e.preventDefault();
      const idx = parseInt(deleteBtn.getAttribute("data-index"));
      loadedPdfFiles.splice(idx, 1);
      displayFiles();
    }
  });

  // 一括クリアボタンのイベント登録
  const clearAllFilesBtn = document.getElementById("clearAllFilesBtn");
  clearAllFilesBtn.addEventListener("click", (e) => {
    e.preventDefault();
    loadedPdfFiles = [];
    displayFiles();
  });

  // 座標測定モーダル制御のイベント登録
  initMeasureModalEvents();

  // 日付テキスト入力欄の初期値を今日の日付に設定
  const _today = new Date();
  document.getElementById("dateYearInput").value = _today.getFullYear();
  document.getElementById("dateMonthInput").value = _today.getMonth() + 1;
  document.getElementById("dateDayInput").value = _today.getDate();

  // フォントサイズの保存・復元（localStorage）
  const _fontSizeEl = document.getElementById("dateFontSizePt");
  const _savedFontSize = localStorage.getItem("date_font_size_pt");
  if (_savedFontSize !== null) _fontSizeEl.value = _savedFontSize;
  _fontSizeEl.addEventListener("change", () => {
    localStorage.setItem("date_font_size_pt", _fontSizeEl.value);
  });

  // 日付テキスト追加ボタンのイベント登録
  document.getElementById("addDateYearBtn").addEventListener("click", () => {
    if (loadedPdfFiles.length === 0) return;
    const val = document.getElementById("dateYearInput").value.trim();
    if (!val) return;
    const fs = parseFloat(document.getElementById("dateFontSizePt").value) || 8;
    createDateTextElement(val, null, null, fs);
  });

  document.getElementById("addDateMonthBtn").addEventListener("click", () => {
    if (loadedPdfFiles.length === 0) return;
    const val = document.getElementById("dateMonthInput").value.trim();
    if (!val) return;
    const fs = parseFloat(document.getElementById("dateFontSizePt").value) || 8;
    createDateTextElement(val, null, null, fs);
  });

  document.getElementById("addDateDayBtn").addEventListener("click", () => {
    if (loadedPdfFiles.length === 0) return;
    const val = document.getElementById("dateDayInput").value.trim();
    if (!val) return;
    const fs = parseFloat(document.getElementById("dateFontSizePt").value) || 8;
    createDateTextElement(val, null, null, fs);
  });

  document.getElementById("addDateCustomBtn").addEventListener("click", () => {
    if (loadedPdfFiles.length === 0) return;
    const val = document.getElementById("dateCustomInput").value.trim();
    if (!val) return;
    const fs = parseFloat(document.getElementById("dateFontSizePt").value) || 8;
    createDateTextElement(val, null, null, fs);
    document.getElementById("dateCustomInput").value = "";
  });

  document.getElementById("addDateRowBtn").addEventListener("click", () => {
    if (loadedPdfFiles.length === 0) return;
    const y = document.getElementById("dateYearInput").value.trim();
    const m = document.getElementById("dateMonthInput").value.trim();
    const d = document.getElementById("dateDayInput").value.trim();
    if (!y && !m && !d) return;
    const fs = parseFloat(document.getElementById("dateFontSizePt").value) || 8;
    const defaultGap = 24; // px (デフォルトの間隔)
    createDateRowElement(y || "　", m || "　", d || "　", fs, defaultGap, defaultGap);
  });

  // Ctrl+ホイールでズームイン・ズームアウト（プレビューエリア上）
  const _scrollWrapper = document.getElementById("visualPreviewScrollWrapper");
  if (_scrollWrapper) {
    _scrollWrapper.addEventListener("wheel", (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        changeZoomDebounced(e.deltaY < 0 ? 0.1 : -0.1);
      }
    }, { passive: false });
  }

  // ウィンドウリサイズ時にビジュアルモードのプレビューを再描画
  // document.body を observe するとプレビュー高さ変更でループするため
  // tabContentStamp（プレビューエリアの親で、ウィンドウ幅変化のみ検知）を observe する
  let resizeTimer = null;
  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      // 高さの変化は無視し、幅の変化のみ再描画トリガーとする
      const newWidth = entry.contentRect.width;
      if (!resizeObserver._lastWidth) resizeObserver._lastWidth = newWidth;
      if (Math.abs(newWidth - resizeObserver._lastWidth) < 2) return; // 2px未満の変化は無視
      resizeObserver._lastWidth = newWidth;

      if (!sectionVisual.classList.contains("hidden") && loadedPdfFiles.length > 0) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          renderVisualStep();
        }, 300);
      }
    }
  });
  resizeObserver.observe(tabContentStamp);
});

// --- 座標自動測定モーダル制御 ---
const measureModal = document.getElementById("measureModal");
const measurePdfInput = document.getElementById("measurePdfInput");
const measurePreviewWrapper = document.getElementById("measurePreviewWrapper");
const measurePdfCanvas = document.getElementById("measurePdfCanvas");
const measureDraggable = document.getElementById("measureDraggable");
const applyMeasureBtn = document.getElementById("applyMeasureBtn");
const measureResultFields = document.getElementById("measureResultFields");

function openMeasureModal() {
  measurePdfInput.value = "";
  measurePreviewWrapper.classList.add("hidden");
  measureResultFields.classList.add("hidden");
  applyMeasureBtn.disabled = true;
  measureModal.classList.add("is-active");
}

function closeMeasureModal() {
  measureModal.classList.remove("is-active");
}

function initMeasureModalEvents() {
  // モーダルを閉じる
  document.querySelectorAll(".close-measure-modal").forEach(el => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      closeMeasureModal();
    });
  });

  // テスト用PDF読み込み
  measurePdfInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await loadMeasurePdf(file);
  });

  // テスト用PDFドラッグ＆ドロップ
  const measureDropArea = document.getElementById("measureDropArea");
  if (measureDropArea) {
    ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
      measureDropArea.addEventListener(eventName, e => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
    ["dragenter", "dragover"].forEach(eventName => {
      measureDropArea.addEventListener(eventName, () => measureDropArea.classList.add("is-dragover"));
    });
    ["dragleave", "drop"].forEach(eventName => {
      measureDropArea.addEventListener(eventName, () => measureDropArea.classList.remove("is-dragover"));
    });
    measureDropArea.addEventListener("drop", async (e) => {
      const file = e.dataTransfer.files[0];
      if (file) {
        if (file.name.toLowerCase().endsWith(".pdf")) {
          await loadMeasurePdf(file);
        } else {
          alert("PDFファイルのみを追加してください。");
        }
      }
    });
  }

  // 照準のドラッグ＆ドロップ実装
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  measureDraggable.addEventListener("mousedown", (e) => {
    isDragging = true;
    const rect = measureDraggable.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    measureDraggable.style.zIndex = 1000;
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const areaRect = measurePreviewWrapper.getBoundingClientRect();
    let x = e.clientX - areaRect.left - offsetX;
    let y = e.clientY - areaRect.top - offsetY;

    const stampWidth = measureDraggable.offsetWidth;
    const stampHeight = measureDraggable.offsetHeight;
    const currentPreviewWidth = parseFloat(measurePreviewWrapper.style.width) || PREVIEW_WIDTH_PX;
    const currentPreviewHeight = parseFloat(measurePreviewWrapper.style.height) || PREVIEW_HEIGHT_PX;

    if (x < 0) x = 0;
    if (x > currentPreviewWidth - stampWidth) x = currentPreviewWidth - stampWidth;
    if (y < 0) y = 0;
    if (y > currentPreviewHeight - stampHeight) y = currentPreviewHeight - stampHeight;

    measureDraggable.style.left = x + "px";
    measureDraggable.style.top = y + "px";

    calculateAndShowMeasureCoords(x, y, stampWidth, stampHeight);
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      measureDraggable.style.zIndex = "";
    }
  });

  // 適用ボタン
  applyMeasureBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (activeMeasureDocIdx === null || activeMeasureRuleIdx === null) return;

    const xVal = parseInt(document.getElementById("measureXVal").textContent);
    const yVal = parseInt(document.getElementById("measureYVal").textContent);

    // フォームに適用
    docTypes[activeMeasureDocIdx].rules[activeMeasureRuleIdx].x = xVal;
    docTypes[activeMeasureDocIdx].rules[activeMeasureRuleIdx].y = yVal;

    localStorage.setItem("stamp_doc_types", JSON.stringify(docTypes));
    alert("座標をフォームに適用しました。保存ボタンを押して確定させてください。");

    closeMeasureModal();
    renderMasterView();
  });
}

function calculateAndShowMeasureCoords(px, py, width, height) {
  const currentPreviewWidth = parseFloat(measurePreviewWrapper.style.width) || PREVIEW_WIDTH_PX;
  const currentPreviewHeight = parseFloat(measurePreviewWrapper.style.height) || PREVIEW_HEIGHT_PX;

  // PDF-lib 座標系（左下原点）へのマッピング
  const x = Math.round((px / currentPreviewWidth) * measurePtWidth);
  const y = Math.round(((currentPreviewHeight - py - height) / currentPreviewHeight) * measurePtHeight);

  document.getElementById("measureXVal").textContent = x;
  document.getElementById("measureYVal").textContent = y;
}

async function loadMeasurePdf(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();

    // CMap付きでPDF読み込み（失敗した場合はCMapなしでリトライ）
    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({
        data: arrayBuffer,
        cMapUrl: CMAP_URL,
        cMapPacked: true,
      }).promise;
    } catch (cmapErr) {
      console.warn("CMap付きPDF読み込み失敗、CMapなしで再試行:", cmapErr);
      pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    }

    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 1.0 });
    measurePtWidth = viewport.width;
    measurePtHeight = viewport.height;

    // 縦横比に応じたプレビューサイズの設定
    let currentPreviewWidth = PREVIEW_WIDTH_PX;
    let currentPreviewHeight = PREVIEW_HEIGHT_PX;

    if (measurePtWidth > measurePtHeight) {
      currentPreviewWidth = PREVIEW_HEIGHT_PX;
      currentPreviewHeight = PREVIEW_WIDTH_PX;
    }

    // flex:1 (flex-basis:0%) がモーダルの縦flex内で height を無視するのを防ぐ
    measurePreviewWrapper.style.flex = "none";
    measurePreviewWrapper.style.width = currentPreviewWidth + "px";
    measurePreviewWrapper.style.height = currentPreviewHeight + "px";

    // ラッパーを先に表示してからcanvas描画（照準のoffsetWidth/Height取得も正確になる）
    measurePreviewWrapper.classList.remove("hidden");

    const canvasCtx = measurePdfCanvas.getContext("2d");
    const scale = Math.min(currentPreviewWidth / measurePtWidth, currentPreviewHeight / measurePtHeight);
    const scaledViewport = page.getViewport({ scale: scale });

    measurePdfCanvas.width = scaledViewport.width;
    measurePdfCanvas.height = scaledViewport.height;

    const renderContext = {
      canvasContext: canvasCtx,
      viewport: scaledViewport
    };
    await page.render(renderContext).promise;

    // 照準の初期位置を設定（中央）※ラッパー表示後なのでoffsetWidthが正確に取れる
    const targetWidth = measureDraggable.offsetWidth || 45;
    const targetHeight = measureDraggable.offsetHeight || 45;
    const initX = (currentPreviewWidth - targetWidth) / 2;
    const initY = (currentPreviewHeight - targetHeight) / 2;
    measureDraggable.style.left = initX + "px";
    measureDraggable.style.top = initY + "px";

    measureResultFields.classList.remove("hidden");
    applyMeasureBtn.disabled = false;

    calculateAndShowMeasureCoords(initX, initY, targetWidth, targetHeight);

  } catch (err) {
    console.error("テストPDF読み込みエラー: ", err);
    alert("テストPDFの読み込みに失敗しました。\n" + err.message);
  }
}

// トースト通知を表示する関数（アクションボタンの指定が可能）
function showToast(message, type = "info", duration = 3000, action = null) {
  const container = document.getElementById("toastContainer");
  if (!container) return null;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let iconHtml = '<i class="fa-solid fa-circle-info"></i>';
  if (type === "success") {
    iconHtml = '<i class="fa-solid fa-circle-check"></i>';
  } else if (type === "error") {
    iconHtml = '<i class="fa-solid fa-circle-exclamation"></i>';
  }

  const formattedMessage = message.replace(/\n/g, "<br>");

  let actionHtml = '';
  if (action) {
    actionHtml = `<button class="toast-action-btn" style="margin-top: 8px; background: var(--accent-color); color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 0.75rem; cursor: pointer; font-weight: 600; width: fit-content; display: inline-flex; align-items: center; gap: 4px; transition: background var(--transition-speed);">${action.text}</button>`;
  }

  toast.innerHTML = `
    ${iconHtml}
    <div style="flex: 1; display: flex; flex-direction: column; line-height: 1.4;">
      <div>${formattedMessage}</div>
      ${actionHtml}
    </div>
  `;

  container.appendChild(toast);

  if (action) {
    const btn = toast.querySelector(".toast-action-btn");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      action.callback();
      // クリックしたらトーストを閉じる
      toast.classList.remove("is-show");
      setTimeout(() => {
        toast.remove();
      }, 400);
    });
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "var(--accent-hover)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "var(--accent-color)";
    });
  }

  setTimeout(() => {
    toast.classList.add("is-show");
  }, 10);

  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.remove("is-show");
        setTimeout(() => {
          toast.remove();
        }, 400);
      }
    }, duration);
  }

  return toast;
}
