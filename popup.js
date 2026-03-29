var ACADEMIC_LIFE_URL = "https://adalove.inteli.edu.br/academic-life";
var ACADEMIC_LIFE_PATH = "/academic-life";
var ADALOVE_HOST = "adalove.inteli.edu.br";

var attendanceLine1El = document.getElementById("attendanceLine1");
var attendanceLine2El = document.getElementById("attendanceLine2");
var attendanceLine3El = document.getElementById("attendanceLine3");
var rowCountValueEl = document.getElementById("rowCountValue");
var urlsCountValueEl = document.getElementById("urlsCountValue");
var absencesValueEl = document.getElementById("absencesValue");
var maxAbsencesValueEl = document.getElementById("maxAbsencesValue");
var metaEl = document.getElementById("meta");
var downloadButton = document.getElementById("downloadBtn");
var copyNotebookLmButton = document.getElementById("copyNotebookLmBtn");
var downloadGradesButton = document.getElementById("downloadGradesBtn");
var toggleGradesButton = document.getElementById("toggleGradesBtn");
var gradesSummaryBlock = document.getElementById("gradesSummaryBlock");
var gradesTableBlock = document.getElementById("gradesTableBlock");
var gradesTableBody = document.getElementById("gradesTableBody");
var currentGradeValueEl = document.getElementById("currentGradeValue");
var generalGradeValueEl = document.getElementById("generalGradeValue");
var simCurrentGradeEl = document.getElementById("simCurrentGrade");
var simGeneralGradeEl = document.getElementById("simGeneralGrade");
var captureActionButton = document.getElementById("captureActionBtn");
var captureActionTextEl = document.getElementById("captureActionText");
var captureActionIconEl = document.getElementById("captureActionIcon");

var gradesTableVisible = false;
var cachedGradeRows = [];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isValidDate(value) {
  var date = value ? new Date(value) : null;
  return Boolean(date && !Number.isNaN(date.getTime()));
}

function hasCapturedData(state, rowCount, gradeRows) {
  return rowCount > 0 || gradeRows.length > 0 || isValidDate(state.capturedAt);
}

function setCaptureAction(hasData) {
  captureActionButton.dataset.captureState = hasData ? "update" : "capture";
  captureActionTextEl.textContent = hasData
    ? "Atualizar"
    : "Capturar dados - voce sera direcionado para a Adalove";
  captureActionIconEl.hidden = !hasData;
}

function toUrl(value) {
  try {
    return new URL(value);
  } catch (error) {
    return null;
  }
}

function isAcademicLifeUrl(value) {
  var url = toUrl(value);
  return Boolean(
    url && url.hostname === ADALOVE_HOST && url.pathname === ACADEMIC_LIFE_PATH
  );
}

function isAdaloveUrl(value) {
  var url = toUrl(value);
  return Boolean(url && url.hostname === ADALOVE_HOST);
}

function openAcademicLifeForActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var activeTab = Array.isArray(tabs) ? tabs[0] : null;

    if (!activeTab || typeof activeTab.url !== "string") {
      chrome.tabs.create({ url: ACADEMIC_LIFE_URL });
      return;
    }

    if (isAcademicLifeUrl(activeTab.url) && typeof activeTab.id === "number") {
      chrome.tabs.reload(activeTab.id);
      return;
    }

    if (isAdaloveUrl(activeTab.url) && typeof activeTab.id === "number") {
      chrome.tabs.update(activeTab.id, { url: ACADEMIC_LIFE_URL });
      return;
    }

    chrome.tabs.create({ url: ACADEMIC_LIFE_URL });
  });
}

function handleDownloadRowsClick() {
  downloadButton.disabled = true;

  chrome.runtime.sendMessage(
    {
      type: "ADALOV3_DOWNLOAD_LATEST",
    },
    function () {
      loadState();
    }
  );
}

function handleCopyUrlsClick() {
  chrome.storage.local.get(["allCapturedUrls"], function (state) {
    var urls = asArray(state.allCapturedUrls);

    if (urls.length === 0) {
      return;
    }

    copyText(urls.join("\n"));
  });
}

function handleDownloadGradesClick() {
  downloadGradesButton.disabled = true;

  chrome.runtime.sendMessage(
    {
      type: "ADALOV3_DOWNLOAD_GRADES",
    },
    function () {
      loadState();
    }
  );
}

function handleCaptureActionClick() {
  openAcademicLifeForActiveTab();
}

function loadState() {
  chrome.storage.local.get(
    [
      "latestRows",
      "latestGradeRows",
      "gradesSummary",
      "rowCount",
      "attendanceSummary",
      "capturedAt",
      "allCapturedUrls",
    ],
    function (state) {
      var rows = asArray(state.latestRows);
      var gradeRows = asArray(state.latestGradeRows);
      var allCapturedUrls = asArray(state.allCapturedUrls);
      var rowCount = Number.isFinite(state.rowCount)
        ? state.rowCount
        : rows.length;
      var attendanceSummary =
        state.attendanceSummary && typeof state.attendanceSummary === "object"
          ? state.attendanceSummary
          : null;
      var capturedData = hasCapturedData(state, rowCount, gradeRows);

      downloadButton.disabled = rowCount <= 0;
      copyNotebookLmButton.disabled = allCapturedUrls.length === 0;
      downloadGradesButton.disabled = gradeRows.length === 0;
      toggleGradesButton.disabled = gradeRows.length === 0;

      cachedGradeRows = gradeRows;

      rowCountValueEl.textContent = String(rowCount);
      urlsCountValueEl.textContent = String(allCapturedUrls.length);

      setCaptureAction(capturedData);
      setCapturedAt(state.capturedAt);
      setAttendance(attendanceSummary);
      setGradesSummary(state.gradesSummary);

      if (gradesTableVisible && gradeRows.length > 0) {
        renderGradesTable(gradeRows);
      }
    }
  );
}

function setCapturedAt(value) {
  var capturedAt = value ? new Date(value) : null;
  metaEl.textContent =
    capturedAt && !Number.isNaN(capturedAt.getTime())
      ? capturedAt.toLocaleString()
      : "-";
}

function setAttendance(attendanceSummary) {
  var attendanceLines = buildAttendanceLines(attendanceSummary);
  var absences = Number(attendanceSummary ? attendanceSummary.absences : NaN);
  var maxAbsences = Number(
    attendanceSummary ? attendanceSummary.maxAbsences : NaN
  );

  attendanceLine1El.textContent = attendanceLines.line1;
  attendanceLine2El.textContent = attendanceLines.line2;
  attendanceLine3El.textContent = attendanceLines.line3;
  absencesValueEl.textContent = Number.isFinite(absences)
    ? String(absences)
    : "-";
  maxAbsencesValueEl.textContent = Number.isFinite(maxAbsences)
    ? String(maxAbsences)
    : "-";
}

function buildAttendanceLines(attendanceSummary) {
  if (!attendanceSummary || typeof attendanceSummary !== "object") {
    return {
      line1: "",
      line2: "",
      line3: "",
    };
  }

  var remaining = Number(attendanceSummary.remainingAbsences);
  var totalCheckIns = Number(attendanceSummary.totalCheckIns);

  if (!Number.isFinite(remaining)) {
    return {
      line1: "",
      line2: "",
      line3: "",
    };
  }

  var remainingSafe = Math.max(0, remaining);
  var daysValue = remainingSafe / 3;
  var daysText = Number.isInteger(daysValue)
    ? String(daysValue)
    : daysValue.toFixed(1).replace(".", ",");
  var percentPerCheckIn =
    Number.isFinite(totalCheckIns) && totalCheckIns > 0
      ? (100 / totalCheckIns).toFixed(2).replace(".", ",")
      : "0,00";

  return {
    line1: "Você ainda pode perder " + remainingSafe + " check-ins",
    line2: "Isso equivale a " + daysText + " dias (1 dia = 3 check-ins)",
    line3: "Cada check-in vale " + percentPerCheckIn + "% da presença",
  };
}

function copyText(value) {
  if (
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    return navigator.clipboard.writeText(value).then(
      function () {
        return true;
      },
      function () {
        return legacyCopyText(value);
      }
    );
  }

  return Promise.resolve(legacyCopyText(value));
}

function legacyCopyText(value) {
  try {
    var textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();

    var copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch (error) {
    return false;
  }
}

function handleToggleGradesClick() {
  gradesTableVisible = !gradesTableVisible;
  gradesTableBlock.hidden = !gradesTableVisible;
  toggleGradesButton.textContent = gradesTableVisible
    ? "Fechar simulador"
    : "Simular notas";

  if (gradesTableVisible && cachedGradeRows.length > 0) {
    renderGradesTable(cachedGradeRows);
  }
}

function clearChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function renderGradesTable(rows) {
  clearChildren(gradesTableBody);

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var tr = document.createElement("tr");

    var tdName = document.createElement("td");
    tdName.textContent = row.activityName || row.folderCaption || "-";
    tdName.title =
      (row.activityName || "") +
      (row.folderCaption ? " (" + row.folderCaption + ")" : "");

    var tdProf = document.createElement("td");
    tdProf.textContent = row.professorName || "-";

    var tdWeight = document.createElement("td");
    tdWeight.textContent = row.gradeWeight;

    var tdGrade = document.createElement("td");
    var input = document.createElement("input");
    input.type = "number";
    input.className = "grade-input";
    input.min = "0";
    input.max = "10";
    input.step = "0.1";
    input.dataset.index = String(i);
    input.dataset.original = row.gradeResult || "";

    var numericResult = parseFloat(row.gradeResult);
    if (isFinite(numericResult) && numericResult >= 0) {
      input.value = numericResult.toFixed(1);
    } else {
      input.placeholder = "-";
    }

    input.addEventListener("input", handleGradeInputChange);
    tdGrade.appendChild(input);

    tr.appendChild(tdName);
    tr.appendChild(tdProf);
    tr.appendChild(tdWeight);
    tr.appendChild(tdGrade);
    gradesTableBody.appendChild(tr);
  }

  recalculateSimulation();
}

function handleGradeInputChange(event) {
  var input = event.target;
  var original = input.dataset.original || "";
  var originalNum = parseFloat(original);
  var currentNum = parseFloat(input.value);

  var isSimulated =
    input.value !== "" &&
    (!isFinite(originalNum) ||
      originalNum < 0 ||
      Math.abs(currentNum - originalNum) > 0.01);
  input.classList.toggle("simulated", isSimulated);

  recalculateSimulation();
}

function recalculateSimulation() {
  var inputs = gradesTableBody.querySelectorAll(".grade-input");
  var totalWeight = 0;
  var gradedWeight = 0;
  var weightedScore = 0;

  for (var i = 0; i < inputs.length; i++) {
    var input = inputs[i];
    var idx = parseInt(input.dataset.index, 10);
    var weight = parseFloat(cachedGradeRows[idx].gradeWeight) || 0;
    totalWeight += weight;

    var value = parseFloat(input.value);
    if (isFinite(value) && value >= 0) {
      gradedWeight += weight;
      weightedScore += value * weight;
    }
  }

  var simCurrent = gradedWeight > 0 ? weightedScore / gradedWeight : 0;
  var simGeneral = totalWeight > 0 ? weightedScore / totalWeight : 0;

  simCurrentGradeEl.textContent = simCurrent.toFixed(2);
  simGeneralGradeEl.textContent = simGeneral.toFixed(2);
}

function setGradesSummary(summary) {
  if (!summary || typeof summary !== "object") {
    gradesSummaryBlock.hidden = true;
    currentGradeValueEl.textContent = "-";
    generalGradeValueEl.textContent = "-";
    return;
  }

  var current = Number(summary.currentGrade);
  var general = Number(summary.generalGrade);

  currentGradeValueEl.textContent = isFinite(current)
    ? current.toFixed(2)
    : "-";
  generalGradeValueEl.textContent = isFinite(general)
    ? general.toFixed(2)
    : "-";
  gradesSummaryBlock.hidden = false;
}

downloadButton.addEventListener("click", handleDownloadRowsClick);
copyNotebookLmButton.addEventListener("click", handleCopyUrlsClick);
downloadGradesButton.addEventListener("click", handleDownloadGradesClick);
toggleGradesButton.addEventListener("click", handleToggleGradesClick);
captureActionButton.addEventListener("click", handleCaptureActionClick);

loadState();
