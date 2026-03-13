(() => {
  if (window.__adalov3HookInstalled) {
    return;
  }
  window.__adalov3HookInstalled = true;

  const TARGET_REGEX =
    /^https:\/\/apiv2\.inteli\.edu\.br\/sections\/[^/]+\/userdata(?:\?.*)?$/i;

  function toAbsoluteUrl(input) {
    try {
      return new URL(input, window.location.href).href;
    } catch (error) {
      return "";
    }
  }

  function shouldCapture(url) {
    return TARGET_REGEX.test(toAbsoluteUrl(url));
  }

  function sendPayload(payload) {
    window.postMessage(
      {
        source: "adalov3-hook",
        type: "ADALOV3_API_RESPONSE",
        payload,
      },
      "*"
    );
  }

  function safeJsonParse(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const requestInfo = args[0];
      const requestUrl =
        typeof requestInfo === "string"
          ? requestInfo
          : requestInfo && typeof requestInfo.url === "string"
            ? requestInfo.url
            : "";

      if (shouldCapture(requestUrl)) {
        response
          .clone()
          .text()
          .then((body) => {
            const parsed = safeJsonParse(body);
            if (parsed) {
              sendPayload(parsed);
            }
          })
          .catch(() => {});
      }
    } catch (error) {}

    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__adalov3RequestUrl = toAbsoluteUrl(url);
    return originalOpen.call(this, method, url, ...rest);
  };

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        if (!shouldCapture(this.__adalov3RequestUrl)) {
          return;
        }

        if (this.responseType !== "" && this.responseType !== "text") {
          return;
        }

        const parsed = safeJsonParse(this.responseText);
        if (parsed) {
          sendPayload(parsed);
        }
      } catch (error) {}
    });

    return originalSend.apply(this, args);
  };
})();
