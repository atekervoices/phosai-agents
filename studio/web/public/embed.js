(function () {
  if (window.__PHOSAI_EMBED_LOADED__) return;
  window.__PHOSAI_EMBED_LOADED__ = true;

  var currentScript =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();

  if (!currentScript) return;

  var agentId = currentScript.getAttribute('data-agent-id');
  if (!agentId) {
    console.error('[PhosAI Embed] Missing data-agent-id attribute on script tag.');
    return;
  }

  var mode = currentScript.getAttribute('data-mode') || 'chat';
  var color = currentScript.getAttribute('data-color') || 'default';
  var position = currentScript.getAttribute('data-position') || 'bottom-right';
  var title = currentScript.getAttribute('data-title') || '';
  var autoOpen = currentScript.getAttribute('data-auto-open') || 'false';

  // Determine base URL from current script src
  var scriptUrl = new URL(currentScript.src);
  var baseUrl = scriptUrl.origin;

  var iframeUrl = new URL('/embed/' + encodeURIComponent(agentId), baseUrl);
  iframeUrl.searchParams.set('mode', mode);
  iframeUrl.searchParams.set('color', color);
  iframeUrl.searchParams.set('position', position);
  if (title) iframeUrl.searchParams.set('title', title);
  if (autoOpen === 'true') iframeUrl.searchParams.set('autoOpen', 'true');

  // Container styling
  var container = document.createElement('div');
  container.id = 'phosai-embed-container-' + agentId;
  container.style.position = 'fixed';
  container.style.zIndex = '999999';
  container.style.border = 'none';
  container.style.background = 'transparent';

  var isLeft = position === 'bottom-left';
  if (isLeft) {
    container.style.bottom = '20px';
    container.style.left = '20px';
  } else {
    container.style.bottom = '20px';
    container.style.right = '20px';
  }

  // Closed size
  container.style.width = '70px';
  container.style.height = '70px';

  var iframe = document.createElement('iframe');
  iframe.src = iframeUrl.toString();
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';
  iframe.style.background = 'transparent';
  iframe.style.colorScheme = 'none';
  iframe.allow = 'microphone';

  container.appendChild(iframe);
  document.body.appendChild(container);

  // Handle postMessage resize from iframe
  window.addEventListener('message', function (event) {
    if (event.origin !== baseUrl) return;
    try {
      var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data && (data.type === 'phosai-embed-resize' || data.type === 'feros-embed-resize')) {
        if (data.open) {
          container.style.width = '400px';
          container.style.height = '620px';
          container.style.maxWidth = 'calc(100vw - 20px)';
          container.style.maxHeight = 'calc(100vh - 20px)';
        } else {
          container.style.width = '70px';
          container.style.height = '70px';
        }
      }
    } catch (e) {
      /* ignore */
    }
  });
})();
