const { ipcRenderer } = require("electron");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

const stampDir = "static/img/stamp";

const dropArea = document.getElementById("dropArea");
const pdfInput = document.getElementById("pdfInput");
const fileList = document.getElementById("fileList");

// ファイルのリスト表示関数
function displayFiles(files) {
  fileList.innerHTML = ""; // リストをクリア

  const sum = document.createElement("p");
  sum.textContent = "選択ファイル数：" + files.length;
  fileList.appendChild(sum);

  files.forEach((file) => {
    const listItem = document.createElement("li");
    listItem.innerHTML = `<i class="fa-regular fa-file-pdf"></i> ${file.name}`;
    fileList.appendChild(listItem);
  });
}

// ドラッグオーバーとドラッグエンタ時のデフォルトイベントを無効にする
["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
  dropArea.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
});

// ドラッグオーバー時にエリアのスタイルを変更
["dragenter", "dragover"].forEach((eventName) => {
  dropArea.addEventListener(eventName, () => {
    dropArea.classList.add("is-dragover");
  });
});

// ドラッグが終わったらスタイルを元に戻す
["dragleave", "drop"].forEach((eventName) => {
  dropArea.addEventListener(eventName, () => {
    dropArea.classList.remove("is-dragover");
  });
});

// ファイルがドロップされた時の処理
dropArea.addEventListener("drop", (event) => {
  event.preventDefault();
  event.stopPropagation();
  const files = Array.from(event.dataTransfer.files);
  document.body.classList.remove("vh100");

  // 一つでもPDF以外のファイルがあるかチェック
  const hasNonPdfFiles = files.some((file) => file.type !== "application/pdf");

  if (hasNonPdfFiles) {
    alert("PDFファイルのみをドラッグ＆ドロップしてください。");
    return; // PDF以外のファイルがドロップされた場合は処理を中止
  }

  pdfInput.files = event.dataTransfer.files; // input要素にもファイルを追加
  displayFiles(files);
  // ファイルがドロップされた場合にラジオボタンを有効化
  if (files.length > 0) {
    enableRadioButtons();
    selectModeAll();
  } else {
    disableRadioButtons();
    selectNothing();
  }
});

// 通常のファイル選択も処理
pdfInput.addEventListener("change", (event) => {
  const files = Array.from(event.target.files);
  displayFiles(files);
  document.body.classList.remove("vh100");

  // ファイルが選択された場合にラジオボタンを有効化
  if (files.length > 0) {
    enableRadioButtons();
    selectModeAll();
  } else {
    disableRadioButtons();
    selectNothing();
  }
});

function displayIndividualFiles(files) {
  const sectionIndividual = document.getElementById("sectionIndividual");
  sectionIndividual.innerHTML = ""; // 既存の内容をクリア

  // ヘッダー行を追加
  const headerColumns = document.createElement("div");
  headerColumns.classList.add("columns", "is-mobile");

  headerColumns.innerHTML = `
        <div class="column text-center">ファイル名</div>
        <div class="column text-center">書類種別</div>
        <div class="column text-center">担当者</div>
        <div class="column text-center">承認者</div>
    `;

  sectionIndividual.appendChild(headerColumns);

  files.forEach((file) => {
    // ファイル名が長すぎる場合、省略する
    let displayFileName = file.name;
    if (displayFileName.length > 46) {
      // 先頭20文字 + ... + 末尾6文字 の合計26文字
      displayFileName =
        displayFileName.slice(0, 40) + "..." + displayFileName.slice(-6);
    }

    // 各要素を含むcolumnsを作成
    const columns = document.createElement("div");
    columns.classList.add("columns", "is-mobile");

    // ファイル名表示
    const fileNameColumn = document.createElement("div");
    fileNameColumn.classList.add("column");
    const fileNameElement = document.createElement("p");
    fileNameElement.textContent = displayFileName;
    fileNameColumn.appendChild(fileNameElement);

    // 書類種別選択セレクトボックス
    const docTypeColumn = document.createElement("div");
    docTypeColumn.classList.add("column");
    docTypeColumn.classList.add("align-center");
    const docTypeSelectDiv = document.createElement("div");
    docTypeSelectDiv.classList.add("select");
    const docTypeSelect = document.createElement("select");
    docTypeSelect.innerHTML = `
            <option value="estimate">見積書</option>
            <option value="invoice" selected>請求書</option>
        `;
    // 書類種別の変更イベント
    docTypeSelect.addEventListener("change", function () {
      const approverSelect = columns.children[3].querySelector("select"); // 承認者セレクトボックスを取得
      if (docTypeSelect.value === "invoice") {
        approverSelect.setAttribute("disabled", true); // 承認者セレクトボックスを無効化
        approverSelect.selectedIndex = 0; // 最初の選択肢を選択
      } else {
        approverSelect.removeAttribute("disabled"); // 有効化
      }
    });
    docTypeSelectDiv.appendChild(docTypeSelect);
    docTypeColumn.appendChild(docTypeSelectDiv);

    // 担当者選択セレクトボックス
    const managerColumn = document.createElement("div");
    managerColumn.classList.add("column");
    managerColumn.classList.add("align-center");
    const managerSelectDiv = document.createElement("div");
    managerSelectDiv.classList.add("select");
    const managerSelect = document.createElement("select");
    managerSelect.innerHTML =
      document.getElementById("stampSelectManager").innerHTML; // 担当者のスタンプリストをコピー
    managerSelectDiv.appendChild(managerSelect);
    managerColumn.appendChild(managerSelectDiv);

    // 承認者選択セレクトボックス
    const approverColumn = document.createElement("div");
    approverColumn.classList.add("column");
    approverColumn.classList.add("align-center");
    const approverSelectDiv = document.createElement("div");
    approverSelectDiv.classList.add("select");
    const approverSelect = document.createElement("select");
    approverSelect.innerHTML = document.getElementById(
      "stampSelectApprover"
    ).innerHTML; // 承認者のスタンプリストをコピー
    approverSelect.setAttribute("disabled", true);
    approverSelectDiv.appendChild(approverSelect);
    approverColumn.appendChild(approverSelectDiv);

    // columnsに各要素を追加
    columns.appendChild(fileNameColumn);
    columns.appendChild(docTypeColumn);
    columns.appendChild(managerColumn);
    columns.appendChild(approverColumn);

    // sectionIndividualに追加
    sectionIndividual.appendChild(columns);
  });
}

// スタンプフォルダから画像リストを読み込む
window.addEventListener("DOMContentLoaded", () => {
  const stampSelectManager = document.getElementById("stampSelectManager");
  const stampSelectApprover = document.getElementById("stampSelectApprover");
  const stampFolder = path.join(__dirname, stampDir);

  // 対応する画像ファイルの拡張子を指定
  const validImageExtensions = [".png", ".jpg", ".jpeg", ".gif"];

  fs.readdir(stampFolder, (err, files) => {
    if (err) {
      console.error("スタンプフォルダの読み込みエラー:", err);
      return;
    }

    files.forEach((file) => {
      const extension = path.extname(file).toLowerCase(); // ファイルの拡張子を取得して小文字に変換
      const fileNameWithoutExtension = path.basename(file, extension); // ファイル名から拡張子を除外

      // "square.png"を除外
      if (file === "square.png") {
        return; // このファイルは非表示にするため、何もしない
      }

      if (validImageExtensions.includes(extension)) {
        const optionManager = document.createElement("option");
        const optionApprover = document.createElement("option");

        optionManager.value = file;
        optionManager.textContent = fileNameWithoutExtension;

        optionApprover.value = file;
        optionApprover.textContent = fileNameWithoutExtension;

        stampSelectManager.appendChild(optionManager);
        stampSelectApprover.appendChild(optionApprover);
      }
    });
  });
});

// PDFファイルのリスト表示機能
document
  .getElementById("pdfInput")
  .addEventListener("change", function (event) {
    const fileList = document.getElementById("fileList");
    fileList.innerHTML = ""; // リストをクリア

    // 選択されたファイルをリスト表示
    const files = Array.from(event.target.files); // FileListを配列に変換
    console.log(files.length);
    const sum = document.createElement("p");
    sum.textContent = "選択ファイル数：" + files.length;
    fileList.appendChild(sum);
    files.forEach((file) => {
      const listItem = document.createElement("li");
      listItem.innerHTML = `<i class="fa-regular fa-file-pdf"></i> ${file.name}`;
      // listItem.textContent = file.name; // ファイル名を表示
      fileList.appendChild(listItem);
    });
  });

function enableRadioButtons() {
  const radioButtons = document.querySelectorAll('input[name="mode"]');
  radioButtons.forEach((radio) => {
    radio.removeAttribute("disabled");
  });
}
function disableRadioButtons() {
  const radioButtons = document.querySelectorAll('input[name="mode"]');
  radioButtons.forEach((radio) => {
    radio.setAttribute("disabled", true);
  });
}
function selectModeAll() {
  const radioAll = document.getElementById("radioAll");
  radioAll.checked = true;
  sectionAll = document.querySelector("#sectionAll");
  sectionIndividual = document.querySelector("#sectionIndividual");
  stampPdfBtn = document.querySelector("#stampPdfBtn");
  sectionIndividual.classList.add("hidden");
  sectionAll.classList.remove("hidden");
  stampPdfBtn.disabled = false;
}
function selectModeIndividual() {
  const radioIndividual = document.getElementById("radioIndividual");
  radioIndividual.checked = true;
  sectionAll = document.querySelector("#sectionAll");
  sectionIndividual = document.querySelector("#sectionIndividual");
  stampPdfBtn = document.querySelector("#stampPdfBtn");
  sectionAll.classList.add("hidden");
  sectionIndividual.classList.remove("hidden");
  stampPdfBtn.disabled = false;
}
function selectNothing() {
  sectionAll = document.querySelector("#sectionAll");
  sectionIndividual = document.querySelector("#sectionIndividual");
  stampPdfBtn = document.querySelector("#stampPdfBtn");
  sectionAll.classList.add("hidden");
  sectionIndividual.classList.add("hidden");
  stampPdfBtn.disabled = true;
}

// 「一括」「個別」ラジオボタンの制御
document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  sectionAll = document.querySelector("#sectionAll");
  sectionIndividual = document.querySelector("#sectionIndividual");

  radio.addEventListener("change", (event) => {
    if (event.target.id === "radioAll") {
      selectModeAll();
    } else if (event.target.id === "radioIndividual") {
      selectModeIndividual();
      // 個別モード選択時にファイルリストを表示
      const files = Array.from(pdfInput.files);
      if (files.length > 0) {
        displayIndividualFiles(files);
      }
    }
  });
});

// ドキュメント種別のselect要素変更時にX,Y座標を自動設定する処理
document
  .querySelector("#selectDocType")
  .addEventListener("change", function (event) {
    const selectedValue = event.target.value;
    const checkStampSquare = document.getElementById("checkStampSquare");
    console.log(event.target.value);
    // 選択肢が「見積書」または「請求書」の場合はチェックを入れる
    if (selectedValue === "estimate" || selectedValue === "invoice") {
      checkStampSquare.checked = true;
    } else {
      checkStampSquare.checked = false; // 他の選択肢の場合はチェックを外す
    }

    // X, Y座標のinput要素を取得
    const xPosManagerInput = document.getElementById("xPosManager");
    const yPosManagerInput = document.getElementById("yPosManager");
    const xPosApproverInput = document.getElementById("xPosApprover");
    const yPosApproverInput = document.getElementById("yPosApprover");
    const xPosSquareInput = document.getElementById("xPosSquare");
    const yPosSquareInput = document.getElementById("yPosSquare");

    // 見積書の場合、X,Y座標を999,999に設定
    if (selectedValue === "estimate") {
      xPosManagerInput.value = 495;
      yPosManagerInput.value = 540;
      xPosApproverInput.value = 395;
      yPosApproverInput.value = 540;
      xPosSquareInput.value = 475;
      yPosSquareInput.value = 620;
      xPosApproverInput.removeAttribute("disabled");
      yPosApproverInput.removeAttribute("disabled");
    }

    // 請求書の場合、X,Y座標を000,000に設定
    else if (selectedValue === "invoice") {
      xPosManagerInput.value = 485;
      yPosManagerInput.value = 545;
      xPosApproverInput.value = "";
      yPosApproverInput.value = "";
      xPosSquareInput.value = 475;
      yPosSquareInput.value = 620;
      xPosApproverInput.setAttribute("disabled", true);
      yPosApproverInput.setAttribute("disabled", true);
    } else {
      xPosManagerInput.value = "";
      yPosManagerInput.value = "";
      xPosApproverInput.value = "";
      yPosApproverInput.value = "";
      xPosSquareInput.value = "";
      yPosSquareInput.value = "";
      xPosApproverInput.removeAttribute("disabled");
      yPosApproverInput.removeAttribute("disabled");
    }
  });

// PDFにスタンプを追加するボタンの処理
document.getElementById("stampPdfBtn").addEventListener("click", async () => {
  const stampPdfBtn = document.getElementById("stampPdfBtn");

  try {
    const pdfFiles = Array.from(document.getElementById("pdfInput").files);
    const stampFileManager =
      document.getElementById("stampSelectManager").value;
    const stampFileApprover = document.getElementById(
      "stampSelectApprover"
    ).value;
    const stampWidthManager = 30;
    const stampHeightManager = 30;
    const stampWidthApprover = 30;
    const stampHeightApprover = 30;
    const stampWidthSquare = 80;
    const stampHeightSquare = 80;
    let xPosManager = parseInt(document.getElementById("xPosManager").value);
    let yPosManager = parseInt(document.getElementById("yPosManager").value);
    let xPosApprover = parseInt(document.getElementById("xPosApprover").value);
    let yPosApprover = parseInt(document.getElementById("yPosApprover").value);

    const isSquareStampChecked =
      document.getElementById("checkStampSquare").checked;
    let xPosSquare = isSquareStampChecked
      ? parseInt(document.getElementById("xPosSquare").value)
      : null;
    let yPosSquare = isSquareStampChecked
      ? parseInt(document.getElementById("yPosSquare").value)
      : null;

    // 個別モードの場合の処理
    const isIndividualMode = document.getElementById("radioIndividual").checked;

    if (isIndividualMode) {
      // 個別設定を取得
      const individualSettings = [];

      // 各ファイルに対する設定を取得
      const files = Array.from(pdfInput.files);
      const rows = document.querySelectorAll(
        "#sectionIndividual .columns.is-mobile"
      ); // 各ファイルの行を取得

      files.forEach((file, index) => {
        const row = rows[index + 1]; // ヘッダーの行をスキップして、個別行にアクセス
        const docTypeSelect = row.children[1].querySelector("select"); // 書類種別セレクトボックス
        const managerSelect = row.children[2].querySelector("select"); // 担当者セレクトボックス
        const approverSelect = row.children[3].querySelector("select"); // 承認者セレクトボックス

        const docType = docTypeSelect.value; // 正しいセレクトボックスから値を取得
        const manager = managerSelect.value;
        const approver = approverSelect.value;

        individualSettings.push({
          file,
          docType,
          manager,
          approver,
        });
      });

      // 保存先のディレクトリを選択
      const { canceled, filePaths } = await ipcRenderer.invoke(
        "show-open-dialog"
      );
      console.log(filePaths); // 選択されたパスを確認

      if (canceled || !filePaths || !filePaths.length) {
        console.log("保存がキャンセルされました");
        stampPdfBtn.classList.remove("is-loading"); // 処理が終わったらローディングクラスを削除
        return;
      }

      const selectedDirectory = filePaths[0]; // 選択されたディレクトリパス
      console.log(`選択されたフォルダ: ${selectedDirectory}`);

      // フォルダー選択後、画像貼り付け処理前に is-loading クラスを付与
      stampPdfBtn.classList.add("is-loading");

      // 日時ベースのフォルダ名を生成
      const generateFolderName = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const hours = String(now.getHours()).padStart(2, "0");
        const minutes = String(now.getMinutes()).padStart(2, "0");
        const seconds = String(now.getSeconds()).padStart(2, "0");
        return `Stamp_${year}${month}${day}_${hours}${minutes}${seconds}`;
      };
      const outputFolderName = generateFolderName(); // 「yyyymmdd_hhmmss_stamp」形式
      const outputFolderPath = path.join(selectedDirectory, outputFolderName);

      // 選択したフォルダの中に、日時ベースのフォルダを作成
      if (!fs.existsSync(outputFolderPath)) {
        fs.mkdirSync(outputFolderPath); // フォルダを作成
      }

      stampPdfBtn.classList.add("is-loadng"); // ローディングクラスを追加

      // ここから押印処理を行います
      for (const setting of individualSettings) {
        const { file, docType, manager, approver } = setting;
        console.log(
          `ファイル: ${file.name}, 書類種別: ${docType}, 担当者: ${manager}, 承認者: ${approver}`
        );

        if (docType === "estimate") {
          xPosManager = 495;
          yPosManager = 540;
          xPosApprover = 395;
          yPosApprover = 540;
          xPosSquare = 475;
          yPosSquare = 620;
        } else if (docType === "invoice") {
          xPosManager = 485;
          yPosManager = 545;
          xPosSquare = 475;
          yPosSquare = 620;
        } else {
        }

        // PDFの読み込みと押印処理をここで行います
        const pdfBytes = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const page = pdfDoc.getPages()[0];

        // スタンプ画像を読み込む
        const stampPathManager = path.join(__dirname, stampDir, manager); // 担当者スタンプのパス
        const stampBytesManager = fs.readFileSync(stampPathManager);
        const imageManager = await pdfDoc.embedPng(stampBytesManager);

        // 担当者のスタンプを指定された位置に描画
        // (xPosManager, yPosManagerは適切に設定する必要があります)
        page.drawImage(imageManager, {
          x: xPosManager,
          y: yPosManager,
          width: stampWidthManager,
          height: stampHeightManager,
        });

        if (docType === "estimate") {
          // 承認者スタンプの読み込み
          const stampPathApprover = path.join(__dirname, stampDir, approver); // 承認者スタンプのパス
          const stampBytesApprover = fs.readFileSync(stampPathApprover);
          const imageApprover = await pdfDoc.embedPng(stampBytesApprover);

          // 承認者のスタンプを描画
          page.drawImage(imageApprover, {
            x: xPosApprover,
            y: yPosApprover,
            width: stampWidthApprover,
            height: stampHeightApprover,
          });
        }

        // 角印のスタンプ処理
        const stampPathSquare = path.join(__dirname, stampDir, "square.png");
        const stampBytesSquare = fs.readFileSync(stampPathSquare);
        const imageSquare = await pdfDoc.embedPng(stampBytesSquare);

        page.drawImage(imageSquare, {
          x: xPosSquare,
          y: yPosSquare,
          width: stampWidthSquare, // 必要に応じて角印の幅と高さを調整
          height: stampHeightSquare,
        });

        // PDFの書き出し
        const updatedPdfBytes = await pdfDoc.save();
        const outputFilePath = path.join(outputFolderPath, `${file.name}`);
        fs.writeFileSync(outputFilePath, updatedPdfBytes);
        console.log("PDFが作成されました: " + outputFilePath);
      }

      alert(`PDFが保存されました: ${outputFolderPath}`);
    } else {
      // 従来の一括処理
      if (!pdfFiles.length || !stampFileManager || !stampFileApprover) {
        alert("すべてのフィールドを正しく入力してください。");
        stampPdfBtn.classList.remove("is-loading"); // 処理が終わったらローディングクラスを削除
        return;
      }

      // PDFの一括押印処理のロジックをここに追加

      // 保存先のディレクトリを選択
      const { canceled, filePaths } = await ipcRenderer.invoke(
        "show-open-dialog"
      );
      console.log(filePaths); // 選択されたパスを確認

      if (canceled || !filePaths || !filePaths.length) {
        console.log("保存がキャンセルされました");
        stampPdfBtn.classList.remove("is-loading"); // 処理が終わったらローディングクラスを削除
        return;
      }

      const selectedDirectory = filePaths[0]; // 選択されたディレクトリパス
      console.log(`選択されたフォルダ: ${selectedDirectory}`);

      // フォルダー選択後、画像貼り付け処理前に is-loading クラスを付与
      stampPdfBtn.classList.add("is-loading");

      // 日時ベースのフォルダ名を生成
      const generateFolderName = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const hours = String(now.getHours()).padStart(2, "0");
        const minutes = String(now.getMinutes()).padStart(2, "0");
        const seconds = String(now.getSeconds()).padStart(2, "0");
        return `Stamp_${year}${month}${day}_${hours}${minutes}${seconds}`;
      };
      const outputFolderName = generateFolderName(); // 「yyyymmdd_hhmmss_stamp」形式
      const outputFolderPath = path.join(selectedDirectory, outputFolderName);

      // 選択したフォルダの中に、日時ベースのフォルダを作成
      if (!fs.existsSync(outputFolderPath)) {
        fs.mkdirSync(outputFolderPath); // フォルダを作成
      }

      stampPdfBtn.classList.add("is-loadng"); // ローディングクラスを追加
      for (const pdfFile of pdfFiles) {
        const pdfBytes = await pdfFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const page = pdfDoc.getPages()[0];

        // 担当者のスタンプ画像を読み込む
        const stampPathManager = path.join(
          __dirname,
          stampDir,
          stampFileManager
        );
        const stampBytesManager = fs.readFileSync(stampPathManager);
        let imageManager;
        const extensionManager = stampFileManager
          .split(".")
          .pop()
          .toLowerCase();

        if (extensionManager === "jpeg" || extensionManager === "jpg") {
          imageManager = await pdfDoc.embedJpg(stampBytesManager);
        } else if (extensionManager === "png") {
          imageManager = await pdfDoc.embedPng(stampBytesManager);
        }

        // 担当者のスタンプを指定された位置に描画
        if (!isNaN(xPosManager) && !isNaN(yPosManager)) {
          page.drawImage(imageManager, {
            x: xPosManager,
            y: yPosManager,
            width: stampWidthManager, // 必要に応じてスタンプの幅と高さを調整
            height: stampHeightManager,
          });
        }

        // 承認者のスタンプ画像を読み込む
        const stampPathApprover = path.join(
          __dirname,
          stampDir,
          stampFileApprover
        );
        const stampBytesApprover = fs.readFileSync(stampPathApprover);
        let imageApprover;
        const extensionApprover = stampFileApprover
          .split(".")
          .pop()
          .toLowerCase();

        if (extensionApprover === "jpeg" || extensionApprover === "jpg") {
          imageApprover = await pdfDoc.embedJpg(stampBytesApprover);
        } else if (extensionApprover === "png") {
          imageApprover = await pdfDoc.embedPng(stampBytesApprover);
        }

        // 承認者のスタンプを指定された位置に描画
        if (!isNaN(xPosApprover) && !isNaN(yPosApprover)) {
          page.drawImage(imageApprover, {
            x: xPosApprover,
            y: yPosApprover,
            width: stampWidthApprover, // 必要に応じてスタンプの幅と高さを調整
            height: stampHeightApprover,
          });
        }

        // 角印がチェックされている場合
        if (isSquareStampChecked) {
          const stampPathSquare = path.join(__dirname, stampDir, "square.png"); // 角印のファイル名
          const stampBytesSquare = fs.readFileSync(stampPathSquare);
          const imageSquare = await pdfDoc.embedPng(stampBytesSquare); // 角印はPNG形式で読み込むと仮定

          // 角印を指定された位置に描画
          if (!isNaN(xPosSquare) && !isNaN(yPosSquare)) {
            page.drawImage(imageSquare, {
              x: xPosSquare,
              y: yPosSquare,
              width: stampWidthSquare, // 必要に応じて角印の幅と高さを調整
              height: stampHeightSquare,
            });
          }
        }

        // PDFを保存
        const updatedPdfBytes = await pdfDoc.save();
        const outputFilePath = path.join(outputFolderPath, `${pdfFile.name}`);
        fs.writeFileSync(outputFilePath, updatedPdfBytes);

        console.log("PDFが作成されました: " + outputFilePath);
      }
      alert(`PDFが保存されました: ${outputFolderPath}`);
    }
  } catch (error) {
    console.error("エラーが発生しました:", error);
    alert("エラーが発生しました。詳細はコンソールを確認してください。");
  } finally {
    stampPdfBtn.classList.remove("is-loading"); // 処理が終わったらローディングクラスを削除
  }
});
