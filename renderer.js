const { ipcRenderer, shell } = require("electron");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

// PDF.jsのローカルロード設定 (Electron nodeIntegration対応)
const pdfjsLib = require("pdfjs-dist/build/pdf.js");
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/build/pdf.worker.js");

const stampDir = "static/img/stamp";
const stampFolder = path.join(__dirname, stampDir);

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

// ビジュアル個別押印の状態
let currentVisualIndex = 0;
// 各ファイルに対する配置スタンプ情報。構造: [ { fileIndex: 0, stamps: [ { stampFile: 'xxx.png', x: 100, y: 200, px: 50, py: 100 } ] } ]
let visualStampsSettings = []; 
let lastVisualStamps = []; // 直前に配置決定したスタンプ情報のキャッシュ
let lastPdfOrientation = null; // 直前のPDFの向き（'portrait' または 'landscape'）

// A4基準のPDFサイズ (pt)
const A4_WIDTH_PT = 595.27;
const A4_HEIGHT_PT = 841.89;
const PREVIEW_WIDTH_PX = 480;  // プレビュー表示サイズを大型化
const PREVIEW_HEIGHT_PX = 678; // A4アスペクト比 (480 * 1.414 ≒ 678)

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

// --- マスタデータの初期化と読み込み ---
function initMasterData() {
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
  // 1. 印影画像一覧 (プレビューカード化)
  masterStampList.innerHTML = "";
  stampImages.forEach((img, idx) => {
    const card = document.createElement("div");
    card.className = "stamp-card";
    const isDefaultSquare = img === "square.png";
    
    card.innerHTML = `
      <div class="stamp-thumbnail-wrapper ${isDefaultSquare ? 'square-wrapper' : ''}">
        <img src="static/img/stamp/${img}?t=${Date.now()}" class="stamp-thumbnail" onerror="this.src='static/img/icon/32x32.ico'" />
      </div>
      <div class="stamp-card-name" title="${img}">${img}</div>
      <div class="stamp-card-actions">
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
    alert("印影画像を登録しました！");
    renderMasterView();
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

  loadedPdfFiles.forEach((file, index) => {
    const card = document.createElement("div");
    card.className = "file-card";
    
    let displayFileName = file.name;
    if (displayFileName.length > 26) {
      displayFileName = displayFileName.slice(0, 18) + "..." + displayFileName.slice(-6);
    }

    card.innerHTML = `
      <div class="file-card-info">
        <i class="fa-regular fa-file-pdf"></i>
        <div class="file-card-details">
          <span class="file-card-name" title="${file.name}">${displayFileName}</span>
          <span class="file-card-size">${(file.size / 1024).toFixed(1)} KB</span>
        </div>
      </div>
      <button class="delete-btn" data-index="${index}" title="削除">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    `;
    fileGrid.appendChild(card);
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
    // Web環境やElectronでのpath属性の差異に対応するため、nameとsizeで重複を判定
    if (!loadedPdfFiles.some(f => f.name === file.name && f.size === file.size)) {
      loadedPdfFiles.push(file);
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

  loadedPdfFiles.forEach((file, index) => {
    let displayFileName = file.name;
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
  visualStampsSettings = loadedPdfFiles.map((f, idx) => ({
    fileIndex: idx,
    stamps: []
  }));
  // 初回起動時は引き継ぎキャッシュをクリア
  lastVisualStamps = [];
  lastPdfOrientation = null;
  renderVisualStep();
}

async function renderPdfToCanvas(file) {
  const canvas = document.getElementById("pdfPreviewCanvas");
  const ctx = canvas.getContext("2d");
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    
    const viewport = page.getViewport({ scale: 1.0 });
    const ptWidth = viewport.width;
    const ptHeight = viewport.height;

    // 現在のファイルのPDF実サイズ（ポイント単位）を記録
    if (visualStampsSettings[currentVisualIndex]) {
      visualStampsSettings[currentVisualIndex].ptWidth = ptWidth;
      visualStampsSettings[currentVisualIndex].ptHeight = ptHeight;
    }

    // アスペクト比判定に基づき、プレビューコンテナのサイズを設定
    let currentPreviewWidth = PREVIEW_WIDTH_PX;
    let currentPreviewHeight = PREVIEW_HEIGHT_PX;

    if (ptWidth > ptHeight) {
      // 横向きの場合 (幅678px × 高さ480px に設定)
      currentPreviewWidth = PREVIEW_HEIGHT_PX;
      currentPreviewHeight = PREVIEW_WIDTH_PX;
    }

    visualPreviewArea.style.width = currentPreviewWidth + "px";
    visualPreviewArea.style.height = currentPreviewHeight + "px";
    
    // Canvasアスペクト比率に合わせる
    const scale = Math.min(currentPreviewWidth / ptWidth, currentPreviewHeight / ptHeight);
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

  const currentFile = loadedPdfFiles[currentVisualIndex];
  visualProgress.textContent = `PDF ${currentVisualIndex + 1} / ${loadedPdfFiles.length} (${currentFile.name})`;

  // プレビューエリアの初期化
  const stamps = visualPreviewArea.querySelectorAll(".draggable-stamp");
  stamps.forEach(s => s.remove());

  // PDF.jsで実際のPDFを描画する（完了を待ってから座標計算や配置を行う）
  await renderPdfToCanvas(currentFile);

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
  const currentPreviewWidth = parseFloat(visualPreviewArea.style.width) || PREVIEW_WIDTH_PX;
  const currentPreviewHeight = parseFloat(visualPreviewArea.style.height) || PREVIEW_HEIGHT_PX;

  const currentOrientation = ptWidth > ptHeight ? 'landscape' : 'portrait';

  // もしこのファイルのスタンプがまだ未配置、かつ直前のスタンプ情報が存在し、かつ向きが一致していれば引き継ぐ
  if (savedSettings.stamps.length === 0 && lastVisualStamps.length > 0 && lastPdfOrientation === currentOrientation) {
    savedSettings.stamps = lastVisualStamps.map(last => ({
      stampFile: last.stampFile,
      pdfX: last.pdfX,
      pdfY: last.pdfY,
      width: last.width,
      height: last.height
    }));
  }

  // 保存済みのスタンプがあれば再現
  savedSettings.stamps.forEach(saved => {
    // 保存されたPDF座標から現在のプレビュー上のピクセル位置を計算して配置
    const stampHeight = saved.stampFile === "square.png" ? 90 : 45;
    const px = (saved.pdfX / ptWidth) * currentPreviewWidth;
    const py = currentPreviewHeight - ((saved.pdfY / ptHeight) * currentPreviewHeight) - stampHeight;
    createVisualStampElement(saved.stampFile, px, py);
  });
}

// プレビュー上にスタンプ要素を生成する
function createVisualStampElement(stampFile, startX = null, startY = null) {
  const stampEl = document.createElement("div");
  stampEl.className = "draggable-stamp";
  
  const stampWidth = stampFile === "square.png" ? 90 : 45;
  const stampHeight = stampFile === "square.png" ? 90 : 45;

  if (stampFile === "square.png") {
    stampEl.classList.add("square-stamp");
    stampEl.style.width = "90px";
    stampEl.style.height = "90px";
  }

  // ファイルの拡張子抜き名をラベルに
  const label = path.basename(stampFile, path.extname(stampFile));
  
  // テキスト表示用のスパン
  const labelSpan = document.createElement("span");
  labelSpan.textContent = label.slice(0, 4); // 4文字まで表示
  stampEl.appendChild(labelSpan);

  // 削除用「×」バッジを追加
  const deleteBadge = document.createElement("button");
  deleteBadge.className = "stamp-delete-badge";
  deleteBadge.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  deleteBadge.title = "このスタンプを削除";
  
  // ドラッグの開始（mousedown）を伝播させない
  deleteBadge.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });
  
  deleteBadge.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`この印影「${label}」をプレビューから削除しますか？`)) {
      stampEl.remove();
      saveCurrentVisualStamps();
    }
  });
  stampEl.appendChild(deleteBadge);

  const currentPreviewWidth = parseFloat(visualPreviewArea.style.width) || PREVIEW_WIDTH_PX;
  const currentPreviewHeight = parseFloat(visualPreviewArea.style.height) || PREVIEW_HEIGHT_PX;

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

    // プレビュー境界制限
    const stampWidth = stampEl.offsetWidth;
    const stampHeight = stampEl.offsetHeight;
    const currentPreviewWidth = parseFloat(visualPreviewArea.style.width) || PREVIEW_WIDTH_PX;
    const currentPreviewHeight = parseFloat(visualPreviewArea.style.height) || PREVIEW_HEIGHT_PX;

    if (x < 0) x = 0;
    if (x > currentPreviewWidth - stampWidth) x = currentPreviewWidth - stampWidth;
    if (y < 0) y = 0;
    if (y > currentPreviewHeight - stampHeight) y = currentPreviewHeight - stampHeight;

    stampEl.style.left = x + "px";
    stampEl.style.top = y + "px";

    // リアルタイム座標表示
    updateVisualCoordinates(x, y, stampWidth, stampHeight);
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      stampEl.style.zIndex = "";
      saveCurrentVisualStamps();
    }
  });

  // 右クリックでも同様に削除できるように残す
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
  
  const currentPreviewWidth = parseFloat(visualPreviewArea.style.width) || PREVIEW_WIDTH_PX;
  const currentPreviewHeight = parseFloat(visualPreviewArea.style.height) || PREVIEW_HEIGHT_PX;

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
  
  const currentPreviewWidth = parseFloat(visualPreviewArea.style.width) || PREVIEW_WIDTH_PX;
  const currentPreviewHeight = parseFloat(visualPreviewArea.style.height) || PREVIEW_HEIGHT_PX;

  stampEls.forEach(el => {
    const px = parseFloat(el.style.left) || 0;
    const py = parseFloat(el.style.top) || 0;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const stampFile = el.dataset.stampFile;

    // PDF座標計算
    const pdfX = Math.round((px / currentPreviewWidth) * ptWidth);
    const pdfY = Math.round(((currentPreviewHeight - py - height) / currentPreviewHeight) * ptHeight);

    savedList.push({
      stampFile,
      px,
      py,
      pdfX,
      pdfY,
      width: stampFile === "square.png" ? 80 : 30, // PDFに実際に書き込むサイズ
      height: stampFile === "square.png" ? 80 : 30
    });
  });

  if (visualStampsSettings[currentVisualIndex]) {
    visualStampsSettings[currentVisualIndex].stamps = savedList;
  }
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
  lastPdfOrientation = ptWidth > ptHeight ? 'landscape' : 'portrait';

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
      const file = loadedPdfFiles[fileIdx];
      processList.push({
        file,
        stamps: setting.stamps.map(s => ({
          stampFile: s.stampFile,
          x: s.pdfX,
          y: s.pdfY,
          width: s.width,
          height: s.height
        }))
      });
    });
  } else if (isIndividualMode) {
    // 個別設定からビルド
    const selects = document.querySelectorAll(".indiv-doc-select");
    for (let index = 0; index < loadedPdfFiles.length; index++) {
      const file = loadedPdfFiles[index];
      const docId = selects[index].value;
      const doc = docTypes.find(d => d.id === docId);

      if (!doc) {
        alert(`${file.name} に対する書類種別が設定されていません。`);
        return;
      }

      processList.push({
        file,
        stamps: doc.rules.map(r => ({
          stampFile: r.stamp,
          x: r.x,
          y: r.y,
          width: r.stamp === "square.png" ? 80 : 30,
          height: r.stamp === "square.png" ? 80 : 30
        }))
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

    loadedPdfFiles.forEach(file => {
      processList.push({
        file,
        stamps: doc.rules.map(r => ({
          stampFile: r.stamp,
          x: r.x,
          y: r.y,
          width: r.stamp === "square.png" ? 80 : 30,
          height: r.stamp === "square.png" ? 80 : 30
        }))
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

    for (const item of processList) {
      const { file, stamps } = item;
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

      const updatedPdfBytes = await pdfDoc.save();
      const outputFilePath = path.join(outputFolderPath, file.name);
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


// --- アプリケーション起動時の初期処理 ---
window.addEventListener("DOMContentLoaded", () => {
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
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
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

    measurePreviewWrapper.style.width = currentPreviewWidth + "px";
    measurePreviewWrapper.style.height = currentPreviewHeight + "px";
    
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

    // 照準の初期位置を設定（中央）
    const targetWidth = measureDraggable.offsetWidth;
    const targetHeight = measureDraggable.offsetHeight;
    const initX = (currentPreviewWidth - targetWidth) / 2;
    const initY = (currentPreviewHeight - targetHeight) / 2;
    measureDraggable.style.left = initX + "px";
    measureDraggable.style.top = initY + "px";

    measurePreviewWrapper.classList.remove("hidden");
    measureResultFields.classList.remove("hidden");
    applyMeasureBtn.disabled = false;

    calculateAndShowMeasureCoords(initX, initY, targetWidth, targetHeight);

  } catch (err) {
    console.error("テストPDF読み込みエラー: ", err);
    alert("テストPDFの読み込みに失敗しました。");
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
