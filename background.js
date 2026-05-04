const IGNORE_ACTIVITY_URL = "https://www.inteli.edu.br/";
const ACTIVITY_TYPE_LABELS = {
  1: "Aula",
  2: "Aula",
  11: "Ponderada",
  21: "Artefato",
  31: "Avaliação",
};

function classifyActivityType(activity) {
  if (Number(activity.exam) === 1) {
    return "Prova";
  }
  if (Number(activity.makeup_exam) === 1) {
    return "Prova Sub";
  }
  return ACTIVITY_TYPE_LABELS[Number(activity.type)] || "Outro";
}

let volatileLastSignature = "";
const MESSAGE_HANDLERS = {
  ADALOV3_PROCESS_PAYLOAD: processPayload,
  ADALOV3_DOWNLOAD_LATEST: exportLatestRows,
  ADALOV3_DOWNLOAD_GRADES: exportLatestGrades,
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    latestRows: [],
    latestGradeRows: [],
    gradesSummary: null,
    rowCount: 0,
    allCapturedUrls: [],
    attendanceSummary: null,
    capturedAt: null,
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }

  const handler = MESSAGE_HANDLERS[message.type];
  if (!handler) {
    return;
  }

  Promise.resolve(handler(message))
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
});

async function processPayload(message) {
  const rows = extractRows(message.payload);
  const attendanceSummary = calculateAttendanceSummary(message.payload);
  const gradesData = extractGradesData(message.payload);
  const signature = buildSignature(rows, attendanceSummary, gradesData);
  if (signature && signature === volatileLastSignature) {
    return { ok: true, rowCount: rows.length };
  }

  if (signature) {
    volatileLastSignature = signature;
  }

  const stored = await chrome.storage.local.get(["allCapturedUrls"]);
  const incomingUrls = extractValidUrlsFromRows(rows);
  const mergedUrls = mergeUniqueUrls(stored.allCapturedUrls, incomingUrls);

  await chrome.storage.local.set({
    latestRows: rows,
    latestGradeRows: gradesData.rows,
    gradesSummary: gradesData.summary,
    rowCount: rows.length,
    allCapturedUrls: mergedUrls,
    attendanceSummary,
    capturedAt: message.capturedAt || new Date().toISOString(),
  });

  return { ok: true, rowCount: rows.length };
}

async function exportLatestRows() {
  return exportStoredRows(
    "latestRows",
    "Nenhum dado foi capturado ainda.",
    exportRowsToCsv
  );
}

async function exportLatestGrades() {
  return exportStoredRows(
    "latestGradeRows",
    "Nenhuma nota foi capturada ainda.",
    exportGradeRowsToCsv
  );
}

async function loadStoredRowsState(storageKey) {
  const stored = await chrome.storage.local.get([storageKey, "capturedAt"]);
  return {
    rows: Array.isArray(stored[storageKey]) ? stored[storageKey] : [],
    capturedAt: stored.capturedAt,
  };
}

async function exportStoredRows(storageKey, emptyError, exporter) {
  const stored = await loadStoredRowsState(storageKey);

  if (stored.rows.length === 0) {
    return { ok: false, error: emptyError };
  }

  await exporter(stored.rows, stored.capturedAt);
  return { ok: true, rowCount: stored.rows.length };
}

function extractRows(payload) {
  const rowsByUuid = new Map();
  const activities = collectActivityLikeObjects(payload);

  for (const activity of activities) {
    const studentActivityUuid = toStringSafe(activity.studentActivityUuid);
    if (!studentActivityUuid) {
      continue;
    }

    const professorName = toStringSafe(activity.professorName).trim();
    if (!professorName) {
      continue;
    }

    const basicActivityURL = toStringSafe(activity.basicActivityURL).trim();
    if (isIgnoredBasicUrl(basicActivityURL)) {
      continue;
    }

    rowsByUuid.set(studentActivityUuid, {
      studentActivityUuid,
      caption: toStringSafe(activity.caption),
      folderCaption: toStringSafe(activity.folderCaption),
      description: sanitizeDescriptionForSpreadsheet(activity.description),
      basicActivityURL,
      professorName,
    });
  }

  return Array.from(rowsByUuid.values());
}

function calculateAttendanceSummary(payload) {
  const activities = collectActivityLikeObjects(payload);
  const uniqueAttendanceActivities = new Map();

  const attendanceFields = ["attendance1", "attendance2", "attendance3"];

  for (const activity of activities) {
    const studentActivityUuid = toStringSafe(activity.studentActivityUuid);
    if (!studentActivityUuid) {
      continue;
    }

    const type = Number(activity.type);
    if (type !== 1 && type !== 2) {
      continue;
    }

    uniqueAttendanceActivities.set(studentActivityUuid, activity);
  }

  let present = 0;
  let absent = 0;
  let pending = 0;

  for (const activity of uniqueAttendanceActivities.values()) {
    for (const fieldName of attendanceFields) {
      const value = Number(activity[fieldName]);
      if (value === -1) {
        pending += 1;
        continue;
      }
      if (value === 10) {
        present += 1;
        continue;
      }
      if (value === 0) {
        absent += 1;
      }
    }
  }

  const totalCheckIns = present + absent + pending;
  const doneCheckIns = present + absent;
  const maxAbsences = Math.floor(totalCheckIns * 0.2);
  const remainingAbsences = Math.max(0, maxAbsences - absent);

  return {
    totalCheckIns,
    doneCheckIns,
    pendingCheckIns: pending,
    absences: absent,
    maxAbsences,
    remainingAbsences,
  };
}

function extractGradesData(payload) {
  const rowsByUuid = new Map();
  const activities = collectActivityLikeObjects(payload);
  const studentStatus = findStudentStatus(payload);

  for (const activity of activities) {
    const studentActivityUuid = toStringSafe(activity.studentActivityUuid);
    if (!studentActivityUuid) {
      continue;
    }

    const gradeWeight = toFiniteNumber(activity.gradeWeight);
    if (!Number.isFinite(gradeWeight) || gradeWeight === 0) {
      continue;
    }

    const numericGradeResult = toFiniteNumber(activity.gradeResult);
    rowsByUuid.set(studentActivityUuid, {
      studentActivityUuid,
      activityName: toStringSafe(activity.caption).trim(),
      folderCaption: toStringSafe(activity.folderCaption).trim(),
      professorName: toStringSafe(activity.professorName).trim(),
      activityType: classifyActivityType(activity),
      gradeWeight,
      gradeResult: toStringSafe(activity.gradeResult).trim(),
      numericGradeResult,
    });
  }

  const summary = calculateGradesSummary(
    Array.from(rowsByUuid.values()),
    studentStatus
  );

  const rows = Array.from(rowsByUuid.values()).map((row) => ({
    activityName: row.activityName,
    folderCaption: row.folderCaption,
    professorName: row.professorName,
    activityType: row.activityType,
    gradeWeight: row.gradeWeight,
    gradeResult: row.gradeResult,
  }));

  return { rows, summary };
}

function calculateGradesSummary(rows, studentStatus) {
  const totalWeight = rows.reduce(
    (sum, row) => sum + toFiniteNumber(row.gradeWeight, 0),
    0
  );
  const gradedRows = rows.filter((row) => row.numericGradeResult >= 0);
  const gradedWeight = gradedRows.reduce(
    (sum, row) => sum + toFiniteNumber(row.gradeWeight, 0),
    0
  );
  const weightedScoreTotal = gradedRows.reduce(
    (sum, row) =>
      sum +
      toFiniteNumber(row.numericGradeResult, 0) *
        toFiniteNumber(row.gradeWeight, 0),
    0
  );

  const computedCurrentGrade =
    gradedWeight > 0 ? weightedScoreTotal / gradedWeight : 0;
  const computedGeneralGrade =
    totalWeight > 0 ? weightedScoreTotal / totalWeight : 0;

  const apiCurrentGrade = toFiniteNumber(studentStatus?.doneEvaluationResult);
  const apiGeneralGrade = toFiniteNumber(studentStatus?.evaluationResult);

  return {
    currentGrade: pickGradeValue(apiCurrentGrade, computedCurrentGrade),
    generalGrade: pickGradeValue(apiGeneralGrade, computedGeneralGrade),
    apiCurrentGrade,
    apiGeneralGrade,
    computedCurrentGrade,
    computedGeneralGrade,
    gradedWeight,
    totalWeight,
  };
}

function collectActivityLikeObjects(payload) {
  const results = [];

  const visit = (node) => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (Object.prototype.hasOwnProperty.call(node, "studentActivityUuid")) {
      results.push(node);
    }

    for (const value of Object.values(node)) {
      visit(value);
    }
  };

  visit(payload);
  return results;
}

function findStudentStatus(payload) {
  const visit = (node) => {
    if (!node || typeof node !== "object") {
      return null;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        const match = visit(item);
        if (match) {
          return match;
        }
      }
      return null;
    }

    if (
      Object.prototype.hasOwnProperty.call(node, "doneEvaluationResult") &&
      Object.prototype.hasOwnProperty.call(node, "evaluationResult")
    ) {
      return node;
    }

    for (const value of Object.values(node)) {
      const match = visit(value);
      if (match) {
        return match;
      }
    }

    return null;
  };

  return visit(payload);
}

function isIgnoredBasicUrl(value) {
  if (!value) {
    return false;
  }
  return (
    normalizeComparableUrl(value) ===
    normalizeComparableUrl(IGNORE_ACTIVITY_URL)
  );
}

function normalizeComparableUrl(value) {
  return toStringSafe(value).trim().replace(/\/+$/, "").toLowerCase();
}

function toStringSafe(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  return String(value);
}

function sanitizeDescriptionForSpreadsheet(value) {
  const raw = toStringSafe(value);
  if (!raw) {
    return "";
  }

  const withLineBreaks = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|td|h1|h2|h3|h4|h5|h6)>/gi, "\n");
  const withoutTags = withLineBreaks.replace(/<[^>]*>/g, " ");
  const decoded = decodeHtmlEntities(withoutTags);

  return decoded
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  const namedEntities = {
    amp: "&",
    apos: "'",
    nbsp: " ",
    quot: '"',
    lt: "<",
    gt: ">",
    aacute: "á",
    acirc: "â",
    agrave: "à",
    atilde: "ã",
    auml: "ä",
    ccedil: "ç",
    eacute: "é",
    ecirc: "ê",
    egrave: "è",
    euml: "ë",
    iacute: "í",
    icirc: "î",
    igrave: "ì",
    iuml: "ï",
    ntilde: "ñ",
    oacute: "ó",
    ocirc: "ô",
    ograve: "ò",
    otilde: "õ",
    ouml: "ö",
    uacute: "ú",
    ucirc: "û",
    ugrave: "ù",
    uuml: "ü",
  };

  return toStringSafe(value).replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g,
    (match, entity) => {
      const token = toStringSafe(entity);
      if (!token) {
        return match;
      }

      if (token[0] === "#") {
        const isHex = token[1] === "x" || token[1] === "X";
        const numericValue = Number.parseInt(
          token.slice(isHex ? 2 : 1),
          isHex ? 16 : 10
        );
        if (!Number.isInteger(numericValue) || numericValue < 0) {
          return match;
        }
        try {
          return String.fromCodePoint(numericValue);
        } catch (error) {
          return match;
        }
      }

      const normalizedEntity = token.toLowerCase();
      if (
        !Object.prototype.hasOwnProperty.call(namedEntities, normalizedEntity)
      ) {
        return match;
      }
      return namedEntities[normalizedEntity];
    }
  );
}

function toFiniteNumber(value, fallback = Number.NaN) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function pickGradeValue(apiValue, computedValue) {
  if (
    Number.isFinite(apiValue) &&
    Number.isFinite(computedValue) &&
    Math.abs(apiValue - computedValue) <= 0.05
  ) {
    return apiValue;
  }

  if (Number.isFinite(apiValue) && !Number.isFinite(computedValue)) {
    return apiValue;
  }

  if (Number.isFinite(computedValue)) {
    return computedValue;
  }

  return apiValue;
}

function formatGradeValue(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return value.toFixed(2);
}

function buildSignature(rows, attendanceSummary, gradesData) {
  const rowSignature = rows
    .map(
      (row) =>
        `${row.studentActivityUuid}|${row.caption}|${row.folderCaption}|${row.basicActivityURL}|${row.professorName}`
    )
    .sort()
    .join("||");

  const attendanceSignature = attendanceSummary
    ? [
        attendanceSummary.totalCheckIns,
        attendanceSummary.doneCheckIns,
        attendanceSummary.pendingCheckIns,
        attendanceSummary.absences,
        attendanceSummary.maxAbsences,
        attendanceSummary.remainingAbsences,
      ].join("|")
    : "";

  const gradeRowSignature = Array.isArray(gradesData?.rows)
    ? gradesData.rows
        .map((row) =>
          [
            row.activityName,
            row.folderCaption,
            row.professorName,
            row.activityType,
            row.gradeWeight,
            row.gradeResult,
          ].join("|")
        )
        .sort()
        .join("||")
    : "";

  const gradeSummarySignature = gradesData?.summary
    ? [
        formatGradeValue(gradesData.summary.currentGrade),
        formatGradeValue(gradesData.summary.generalGrade),
        formatGradeValue(gradesData.summary.computedCurrentGrade),
        formatGradeValue(gradesData.summary.computedGeneralGrade),
        formatGradeValue(gradesData.summary.apiCurrentGrade),
        formatGradeValue(gradesData.summary.apiGeneralGrade),
        gradesData.summary.gradedWeight,
        gradesData.summary.totalWeight,
      ].join("|")
    : "";

  return `${rowSignature}##${attendanceSignature}##${gradeRowSignature}##${gradeSummarySignature}`;
}

function extractValidUrlsFromRows(rows) {
  const urls = [];
  for (const row of rows) {
    const value = toStringSafe(row.basicActivityURL).trim();
    if (!value || isIgnoredBasicUrl(value)) {
      continue;
    }
    if (!isHttpUrl(value)) {
      continue;
    }
    urls.push(value);
  }
  return urls;
}

function mergeUniqueUrls(existingUrls, incomingUrls) {
  const output = [];
  const seen = new Set();
  const sources = [
    Array.isArray(existingUrls) ? existingUrls : [],
    Array.isArray(incomingUrls) ? incomingUrls : [],
  ];

  for (const source of sources) {
    for (const item of source) {
      const value = toStringSafe(item).trim();
      if (!value) {
        continue;
      }
      const normalized = normalizeComparableUrl(value);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      output.push(value);
    }
  }

  return output;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (error) {
    return false;
  }
}

async function exportRowsToCsv(rows, capturedAt) {
  const headers = [
    "studentActivityUuid",
    "caption",
    "folderCaption",
    "description",
    "basicActivityURL",
    "professorName",
  ];
  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(
      [
        row.studentActivityUuid,
        row.caption,
        row.folderCaption,
        row.description,
        row.basicActivityURL,
        row.professorName,
      ]
        .map((value) => csvEscape(value))
        .join(",")
    );
  }

  const csv = lines.join("\r\n");
  const filename = `activities-${toFileTimestamp(capturedAt)}.csv`;
  const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;

  await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: true,
  });
}

async function exportGradeRowsToCsv(rows, capturedAt) {
  const delimiter = ";";
  const headers = [
    "activityName",
    "folderCaption",
    "professorName",
    "activityType",
    "gradeWeight",
    "gradeResult",
    "currentGrade",
    "generalGrade",
  ];
  const lines = [headers.join(delimiter)];
  const formulas = buildGradeSheetFormulas(rows.length);

  for (const row of rows) {
    lines.push(
      [
        row.activityName,
        row.folderCaption,
        row.professorName,
        row.activityType || "",
        row.gradeWeight,
        formatGradeResultForSheet(row.gradeResult),
        formulas.currentGrade,
        formulas.generalGrade,
      ]
        .map((value) => delimitedEscape(value, delimiter))
        .join(delimiter)
    );
  }

  const csv = lines.join("\r\n");
  const filename = `grades-${toFileTimestamp(capturedAt)}.csv`;
  const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;

  await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: true,
  });
}

function buildGradeSheetFormulas(rowCount) {
  const firstDataRow = 2;
  const lastDataRow = Math.max(firstDataRow, rowCount + 1);
  const weightRange = `$E$${firstDataRow}:$E$${lastDataRow}`;
  const resultRange = `$F$${firstDataRow}:$F$${lastDataRow}`;
  const completedMask = `--(${resultRange}>=0)`;
  const weightedCompleted = `SUMPRODUCT(${weightRange};${completedMask};${resultRange})`;
  const completedWeight = `SUMPRODUCT(${weightRange};${completedMask})`;
  const totalWeight = `SUM(${weightRange})`;

  return {
    currentGrade: `=IFERROR(ROUND(${weightedCompleted}/${totalWeight};2);0)`,
    generalGrade: `=IFERROR(ROUND(${weightedCompleted}/${completedWeight};2);0)`,
  };
}

function formatGradeResultForSheet(value) {
  const normalized = toStringSafe(value).trim();
  if (!normalized) {
    return "";
  }

  return normalized.replace(/\./g, ",");
}

function delimitedEscape(value, delimiter) {
  const normalized = toStringSafe(value).replace(/\r?\n/g, " ");
  if (
    normalized.includes(delimiter) ||
    normalized.includes('"') ||
    /^\s|\s$/.test(normalized)
  ) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function csvEscape(value) {
  const normalized = toStringSafe(value).replace(/\r?\n/g, " ");
  return `"${normalized.replace(/"/g, '""')}"`;
}

function toFileTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
}
