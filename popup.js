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
var captureActionButton = document.getElementById("captureActionBtn");
var captureActionTextEl = document.getElementById("captureActionText");
var captureActionIconEl = document.getElementById("captureActionIcon");

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isValidDate(value) {
  var date = value ? new Date(value) : null;
  return Boolean(date && !Number.isNaN(date.getTime()));
}

function hasCapturedData(state, rowCount, gradeRows) {
  return (
    rowCount > 0 ||
    gradeRows.length > 0 ||
    isValidDate(state.capturedAt)
  );
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
      "rowCount",
      "attendanceSummary",
      "capturedAt",
      "allCapturedUrls",
    ],
    function (state) {
      var rows = asArray(state.latestRows);
      var gradeRows = asArray(state.latestGradeRows);
      var allCapturedUrls = asArray(state.allCapturedUrls);
      var rowCount = Number.isFinite(state.rowCount) ? state.rowCount : rows.length;
      var attendanceSummary =
        state.attendanceSummary && typeof state.attendanceSummary === "object"
          ? state.attendanceSummary
          : null;
      var capturedData = hasCapturedData(state, rowCount, gradeRows);

      downloadButton.disabled = rowCount <= 0;
      copyNotebookLmButton.disabled = allCapturedUrls.length === 0;
      downloadGradesButton.disabled = gradeRows.length === 0;

      rowCountValueEl.textContent = String(rowCount);
      urlsCountValueEl.textContent = String(allCapturedUrls.length);

      setCaptureAction(capturedData);
      setCapturedAt(state.capturedAt);
      setAttendance(attendanceSummary);
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
  var maxAbsences = Number(attendanceSummary ? attendanceSummary.maxAbsences : NaN);

  attendanceLine1El.textContent = attendanceLines.line1;
  attendanceLine2El.textContent = attendanceLines.line2;
  attendanceLine3El.textContent = attendanceLines.line3;
  absencesValueEl.textContent = Number.isFinite(absences) ? String(absences) : "-";
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

downloadButton.addEventListener("click", handleDownloadRowsClick);
copyNotebookLmButton.addEventListener("click", handleCopyUrlsClick);
downloadGradesButton.addEventListener("click", handleDownloadGradesClick);
captureActionButton.addEventListener("click", handleCaptureActionClick);

loadState();
