const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function buildContext(state) {
  function createElement() {
    return {
      dataset: {},
      textContent: "",
      disabled: false,
      hidden: false,
      addEventListener: function () {},
    };
  }

  const elements = {
    attendanceLine1: createElement(),
    attendanceLine2: createElement(),
    attendanceLine3: createElement(),
    rowCountValue: createElement(),
    urlsCountValue: createElement(),
    absencesValue: createElement(),
    maxAbsencesValue: createElement(),
    meta: createElement(),
    downloadBtn: createElement(),
    copyNotebookLmBtn: createElement(),
    downloadGradesBtn: createElement(),
    captureActionBtn: createElement(),
    captureActionText: createElement(),
    captureActionIcon: createElement(),
  };

  return {
    document: {
      getElementById: function (id) {
        return Object.prototype.hasOwnProperty.call(elements, id)
          ? elements[id]
          : null;
      },
      body: {
        appendChild: function () {},
      },
      createElement: function () {
        return {
          setAttribute: function () {},
          style: {},
          select: function () {},
          remove: function () {},
        };
      },
      execCommand: function () {
        return true;
      },
    },
    chrome: {
      storage: {
        local: {
          get: function (_keys, callback) {
            callback(state);
          },
        },
      },
      runtime: {
        sendMessage: function () {},
      },
      tabs: {
        query: function (_queryInfo, callback) {
          callback([]);
        },
        reload: function () {},
        update: function () {},
        create: function () {},
      },
    },
    navigator: {},
    URL: URL,
    Date: Date,
    Number: Number,
    Promise: Promise,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    elements,
  };
}

function executePopupScript(state) {
  const scriptPath = path.join(__dirname, "popup.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  const context = buildContext(state);
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.elements;
}

test("disables Copiar URLs when there are no captured URLs", function () {
  const elements = executePopupScript({
    latestRows: [],
    latestGradeRows: [],
    rowCount: 0,
    attendanceSummary: null,
    capturedAt: null,
    allCapturedUrls: [],
  });

  assert.equal(elements.copyNotebookLmBtn.disabled, true);
});

test("enables Copiar URLs when there are captured URLs", function () {
  const elements = executePopupScript({
    latestRows: [],
    latestGradeRows: [],
    rowCount: 0,
    attendanceSummary: null,
    capturedAt: null,
    allCapturedUrls: ["https://example.com/a"],
  });

  assert.equal(elements.copyNotebookLmBtn.disabled, false);
});
