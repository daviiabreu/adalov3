const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadBackgroundContext(options = {}) {
  const source = fs.readFileSync(path.join(__dirname, "background.js"), "utf8");
  const storageState = options.storageState || {};
  const context = {
    chrome: {
      runtime: {
        onInstalled: { addListener: function () {} },
        onMessage: { addListener: function () {} },
      },
      storage: {
        local: {
          set: async function () {},
          get: async function () {
            return storageState;
          },
        },
      },
      downloads: {
        download: async function () {},
      },
    },
    URL: URL,
    Date: Date,
    Number: Number,
    String: String,
    Math: Math,
    Map: Map,
    Set: Set,
    Object: Object,
    Array: Array,
    Promise: Promise,
    encodeURIComponent: encodeURIComponent,
    console: console,
  };

  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

test("loadStoredRowsState normalizes missing arrays", async function () {
  const context = loadBackgroundContext({
    storageState: {
      latestRows: "not-an-array",
      capturedAt: "2026-03-11T12:00:00.000Z",
    },
  });

  const stored = await context.loadStoredRowsState("latestRows");

  assert.equal(Array.isArray(stored.rows), true);
  assert.equal(stored.rows.length, 0);
  assert.equal(stored.capturedAt, "2026-03-11T12:00:00.000Z");
});

test("extractRows formats HTML description for spreadsheet output", function () {
  const context = loadBackgroundContext();
  const payload = {
    data: [
      {
        studentActivityUuid: "uuid-1",
        caption: "Atividade",
        folderCaption: "Pasta",
        professorName: "Prof",
        basicActivityURL: "https://example.com/activity",
        description:
          "<p>Protocolos da camada de aplica&ccedil;&atilde;o.</p>" +
          "<p>Utiliza&ccedil;&atilde;o da ferramenta Docker e sua utiliza&ccedil;&atilde;o para desenvolver aplica&ccedil;&otilde;es.</p>" +
          '<div id="simple-translate" class="simple-translate-system-theme"><div><div class="simple-translate-button isShow">&nbsp;</div></div></div>',
      },
    ],
  };

  const rows = context.extractRows(payload);

  assert.equal(
    rows[0].description,
    "Protocolos da camada de aplicação. Utilização da ferramenta Docker e sua utilização para desenvolver aplicações."
  );
});
