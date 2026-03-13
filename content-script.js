(() => {
  if (window.__adalov3ContentScriptInstalled) {
    return;
  }
  window.__adalov3ContentScriptInstalled = true;

  const bridgeScript = document.createElement("script");
  bridgeScript.src = chrome.runtime.getURL("page-hook.js");
  bridgeScript.async = false;
  (document.documentElement || document.head).appendChild(bridgeScript);
  bridgeScript.remove();

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    if (
      !data ||
      data.source !== "adalov3-hook" ||
      data.type !== "ADALOV3_API_RESPONSE"
    ) {
      return;
    }

    chrome.runtime.sendMessage({
      type: "ADALOV3_PROCESS_PAYLOAD",
      payload: data.payload,
      capturedAt: new Date().toISOString(),
    });
  });
})();
