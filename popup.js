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

var progressBlockEl = document.getElementById("progressBlock");
var progressBarFillEl = document.getElementById("progressBarFill");
var progressTextEl = document.getElementById("progressText");
var categoryBreakdownEl = document.getElementById("categoryBreakdown");
var categoryListEl = document.getElementById("categoryList");
var examProjectionEl = document.getElementById("examProjection");
var targetGradeSliderEl = document.getElementById("targetGradeSlider");
var targetGradeDisplayEl = document.getElementById("targetGradeDisplay");
var projectionResultEl = document.getElementById("projectionResult");
var participationBlockEl = document.getElementById("participationBlock");
var participationRowEl = document.getElementById("participationRow");
var applyProjectionToggleEl = document.getElementById("applyProjectionToggle");
var applyProjectionCheckEl = document.getElementById("applyProjectionCheck");

var PARTICIPATION_MULTIPLIERS = [
  { letter: "+5%", multiplier: 1.05 },
  { letter: "0%", multiplier: 1.00 },
  { letter: "-5%", multiplier: 0.95 },
  { letter: "-10%", multiplier: 0.90 },
  { letter: "-15%", multiplier: 0.85 },
];

var gradesTableVisible = false;
var cachedGradeRows = [];
var cachedGradesSummary = null;

// ---- Tab switching ----

var tabButtons = document.querySelectorAll(".tab");
var tabContents = document.querySelectorAll(".tab-content");

for (var t = 0; t < tabButtons.length; t++) {
  tabButtons[t].addEventListener("click", handleTabClick);
}

function handleTabClick(event) {
  var targetTab = event.currentTarget.dataset.tab;

  for (var i = 0; i < tabButtons.length; i++) {
    tabButtons[i].classList.toggle("active", tabButtons[i].dataset.tab === targetTab);
  }
  for (var j = 0; j < tabContents.length; j++) {
    tabContents[j].classList.toggle("active", tabContents[j].id === "tab-" + targetTab);
  }
}

// ---- Utilities ----

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
    : "Capturar dados - você será direcionado para a Adalove";
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

// ---- Handlers ----

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

// ---- State loading ----

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
      cachedGradesSummary = state.gradesSummary || null;

      rowCountValueEl.textContent = String(rowCount);
      urlsCountValueEl.textContent = String(allCapturedUrls.length);

      setCaptureAction(capturedData);
      setCapturedAt(state.capturedAt);
      setAttendance(attendanceSummary);
      setGradesSummary(state.gradesSummary);
      setProgressIndicator(state.gradesSummary);
      setCategoryBreakdown(gradeRows);
      setExamProjection(gradeRows, state.gradesSummary);
      setParticipation(state.gradesSummary);

      if (gradesTableVisible && gradeRows.length > 0) {
        renderGradesTable(gradeRows);
      }
    }
  );
}

// ---- Attendance ----

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

// ---- Clipboard ----

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

// ---- Grades Summary ----

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

// ---- Progress Indicator ----

function setProgressIndicator(summary) {
  if (!summary || typeof summary !== "object") {
    progressBlockEl.hidden = true;
    return;
  }

  var graded = Number(summary.gradedWeight);
  var total = Number(summary.totalWeight);

  if (!isFinite(total) || total <= 0) {
    progressBlockEl.hidden = true;
    return;
  }

  var percentage = isFinite(graded) ? (graded / total) * 100 : 0;
  var clamped = Math.min(100, Math.max(0, percentage));

  progressBarFillEl.style.width = clamped.toFixed(1) + "%";
  progressTextEl.textContent =
    (isFinite(graded) ? graded : 0) +
    " / " +
    total +
    " avaliado (" +
    Math.round(clamped) +
    "%)";
  progressBlockEl.hidden = false;
}

// ---- Category Breakdown ----

function setCategoryBreakdown(gradeRows) {
  if (!gradeRows || gradeRows.length === 0) {
    categoryBreakdownEl.hidden = true;
    return;
  }

  var groups = {};
  for (var i = 0; i < gradeRows.length; i++) {
    var row = gradeRows[i];
    var type = row.activityType || "Outro";
    if (!groups[type]) {
      groups[type] = { totalWeight: 0, weightedScore: 0, gradedWeight: 0 };
    }
    var weight = parseFloat(row.gradeWeight) || 0;
    groups[type].totalWeight += weight;

    var grade = parseFloat(row.gradeResult);
    if (isFinite(grade) && grade >= 0) {
      groups[type].weightedScore += grade * weight;
      groups[type].gradedWeight += weight;
    }
  }

  var types = Object.keys(groups);
  if (types.length === 0) {
    categoryBreakdownEl.hidden = true;
    return;
  }

  clearChildren(categoryListEl);

  for (var j = 0; j < types.length; j++) {
    var typeName = types[j];
    var group = groups[typeName];
    var avg = group.gradedWeight > 0 ? group.weightedScore / group.gradedWeight : 0;
    var barPercent = Math.min(100, (avg / 10) * 100);

    var item = document.createElement("div");
    item.className = "category-item";

    var label = document.createElement("span");
    label.className = "category-label";
    label.textContent = typeName;

    var barTrack = document.createElement("div");
    barTrack.className = "category-bar-track";
    var barFill = document.createElement("div");
    barFill.className = "category-bar-fill " + categoryTypeClass(typeName);
    barFill.style.width = barPercent.toFixed(1) + "%";
    barTrack.appendChild(barFill);

    var value = document.createElement("span");
    value.className = "category-value";
    value.textContent = group.gradedWeight > 0 ? avg.toFixed(1) : "-";

    item.appendChild(label);
    item.appendChild(barTrack);
    item.appendChild(value);
    categoryListEl.appendChild(item);
  }

  categoryBreakdownEl.hidden = false;
}

function categoryTypeClass(typeName) {
  var normalized = typeName.toLowerCase()
    .replace(/\s+/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalized === "ponderada") return "type-ponderada";
  if (normalized === "artefato") return "type-artefato";
  if (normalized === "prova" || normalized === "provasub") return "type-prova";
  if (normalized === "avaliacao") return "type-avaliacao";
  return "type-outro";
}

// ---- Exam Projection ----

var cachedProjectionState = null;

function setExamProjection(gradeRows, summary) {
  cachedProjectionState = null;

  if (!gradeRows || gradeRows.length === 0 || !summary) {
    examProjectionEl.hidden = true;
    applyProjectionToggleEl.hidden = true;
    return;
  }

  var currentAvg = Number(summary.currentGrade) || 0;
  var totalWeight = Number(summary.totalWeight) || 0;
  var examWeight = 0;
  var examGraded = true;
  var accumulatedNonExam = 0;

  for (var i = 0; i < gradeRows.length; i++) {
    var row = gradeRows[i];
    var type = (row.activityType || "").toLowerCase();
    var weight = parseFloat(row.gradeWeight) || 0;
    var grade = parseFloat(row.gradeResult);
    var isExam = type === "prova" || type === "prova sub";
    var isGraded = isFinite(grade) && grade >= 0;

    if (isExam) {
      examWeight += weight;
      if (!isGraded) examGraded = false;
    } else {
      var effectiveGrade = isGraded ? grade : currentAvg;
      accumulatedNonExam += effectiveGrade * weight;
    }
  }

  if (examWeight <= 0 || examGraded) {
    examProjectionEl.hidden = true;
    applyProjectionToggleEl.hidden = true;
    return;
  }

  cachedProjectionState = {
    totalWeight: totalWeight,
    accumulatedNonExam: accumulatedNonExam,
    examWeight: examWeight,
  };

  examProjectionEl.hidden = false;
  applyProjectionToggleEl.hidden = false;
  renderProjection();
}

function renderProjection() {
  if (!cachedProjectionState) return;

  var s = cachedProjectionState;
  var target = parseFloat(targetGradeSliderEl.value) || 0;
  targetGradeDisplayEl.textContent = target.toFixed(1);

  var rawRequired = (target * s.totalWeight - s.accumulatedNonExam) / s.examWeight;
  var required = Math.max(0, Math.min(10, rawRequired));

  var statusClass;
  if (rawRequired <= 0) {
    statusClass = "status-comfortable";
  } else if (rawRequired <= 7) {
    statusClass = "status-comfortable";
  } else if (rawRequired <= 10) {
    statusClass = "status-challenging";
  } else {
    statusClass = "status-impossible";
  }

  clearChildren(projectionResultEl);
  projectionResultEl.className = "projection-result " + statusClass;

  var valueSpan = document.createElement("span");
  valueSpan.className = "result-value";
  valueSpan.textContent = required.toFixed(1);
  projectionResultEl.appendChild(valueSpan);

  updateParticipationFromProjection();
}

function getProjectedGeneralGrade() {
  if (!cachedProjectionState) return null;
  var s = cachedProjectionState;
  var target = parseFloat(targetGradeSliderEl.value) || 0;
  var rawRequired = (target * s.totalWeight - s.accumulatedNonExam) / s.examWeight;
  var examScore = Math.max(0, Math.min(10, rawRequired));
  return (s.accumulatedNonExam + examScore * s.examWeight) / s.totalWeight;
}

// ---- Participation ----

function setParticipation(summary) {
  if (!summary || typeof summary !== "object") {
    participationBlockEl.hidden = true;
    return;
  }

  var general = Number(summary.generalGrade);
  if (!isFinite(general)) {
    participationBlockEl.hidden = true;
    return;
  }

  renderParticipation(general);
  participationBlockEl.hidden = false;
}

function updateParticipationFromProjection() {
  if (!applyProjectionCheckEl.checked) return;
  var projected = getProjectedGeneralGrade();
  if (projected !== null && isFinite(projected)) {
    renderParticipation(projected);
  }
}

function renderParticipation(baseGrade) {
  clearChildren(participationRowEl);

  for (var i = 0; i < PARTICIPATION_MULTIPLIERS.length; i++) {
    var entry = PARTICIPATION_MULTIPLIERS[i];
    var adjusted = baseGrade * entry.multiplier;
    var diff = adjusted - baseGrade;

    var item = document.createElement("div");
    item.className = "participation-item";

    var letter = document.createElement("span");
    letter.className = "participation-letter";
    letter.textContent = entry.letter;

    var value = document.createElement("span");
    var diffText;
    var valueClass;
    if (Math.abs(diff) < 0.005) {
      diffText = adjusted.toFixed(2);
      valueClass = "neutral";
    } else if (diff > 0) {
      diffText = adjusted.toFixed(2) + " (+" + diff.toFixed(2) + ")";
      valueClass = "positive";
    } else {
      diffText = adjusted.toFixed(2) + " (" + diff.toFixed(2) + ")";
      valueClass = "negative";
    }
    value.className = "participation-value " + valueClass;
    value.textContent = diffText;

    item.appendChild(letter);
    item.appendChild(value);
    participationRowEl.appendChild(item);
  }
}

// ---- Grades Table & Simulation ----

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

    var tdType = document.createElement("td");
    tdType.textContent = row.activityType || "-";
    tdType.className = "col-type-cell";

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
    tr.appendChild(tdType);
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

// ---- Event Listeners ----

downloadButton.addEventListener("click", handleDownloadRowsClick);
copyNotebookLmButton.addEventListener("click", handleCopyUrlsClick);
downloadGradesButton.addEventListener("click", handleDownloadGradesClick);
toggleGradesButton.addEventListener("click", handleToggleGradesClick);
captureActionButton.addEventListener("click", handleCaptureActionClick);

targetGradeSliderEl.addEventListener("input", function () {
  renderProjection();
});

applyProjectionCheckEl.addEventListener("change", function () {
  if (!cachedGradesSummary) return;
  if (applyProjectionCheckEl.checked) {
    updateParticipationFromProjection();
  } else {
    var general = Number(cachedGradesSummary.generalGrade);
    if (isFinite(general)) renderParticipation(general);
  }
});

loadState();
