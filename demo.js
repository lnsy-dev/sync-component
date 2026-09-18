/*
 * demo.js — wiring for the "Share Files and Chat" demo page ONLY.
 *
 * Uses the sync-component's public API (sendMessage) and events
 * (PEER-CONNECTED, PEER-MESSAGE, peer-link attribute). Nothing here is
 * part of the library.
 *
 * The third-party demo elements (github-icon, qr-code) and the Fira Code
 * font are injected after window load so they never delay the page's load
 * event or the component's startup.
 */

const THIRD_PARTY_SCRIPTS = [
  'https://lnsy-dev.github.io/simple-github-icon/github-icon.min.js',
  'https://unpkg.com/@lnsy/qr-code/dist/qr-code.min.js'
];
const FONT_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Fira+Code:wght@300..700&display=swap';

function loadThirdPartyAssets() {
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = FONT_STYLESHEET;
  document.head.appendChild(fontLink);

  for (const src of THIRD_PARTY_SCRIPTS) {
    const script = document.createElement('script');
    script.src = src;
    document.head.appendChild(script);
  }
}

if (document.readyState === 'complete') {
  loadThirdPartyAssets();
} else {
  window.addEventListener('load', loadThirdPartyAssets);
}

function getUsername() {
  let name = localStorage.getItem('demo-username');
  if (!name) {
    name = `guest-${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem('demo-username', name);
  }
  return name;
}

function initDemo() {
  const syncComponent = document.querySelector('sync-component');
  const usernameInput = document.querySelector('.demo-username-input');
  const chatLog = document.querySelector('.demo-chat-log');
  const chatForm = document.querySelector('.demo-chat-form');
  const chatInput = document.querySelector('.demo-chat-input');
  const chatButton = chatForm.querySelector('button');
  const qrCode = document.querySelector('qr-code');

  // --- Username ---
  usernameInput.value = getUsername();
  usernameInput.addEventListener('input', () => {
    const name = usernameInput.value.trim();
    if (name) localStorage.setItem('demo-username', name);
  });

  // --- Chat log helpers ---
  function addMessage(className, name, text) {
    const li = document.createElement('li');
    li.className = className;
    if (name) {
      const strong = document.createElement('span');
      strong.className = 'demo-msg-name';
      strong.textContent = `${name}: `;
      li.appendChild(strong);
    }
    li.appendChild(document.createTextNode(text));
    chatLog.appendChild(li);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  addMessage('demo-msg-system', null, 'Not connected — sync with a peer to chat.');

  // --- QR code: encode the peer link once the component has one ---
  function updateQR() {
    const link = syncComponent.getAttribute('peer-link');
    if (link) qrCode.setAttribute('value', link);
  }
  updateQR();
  new MutationObserver(updateQR).observe(syncComponent, {
    attributes: true,
    attributeFilter: ['peer-link']
  });

  // --- Chat ---
  // The component can emit PEER-CONNECTED more than once per connection;
  // only announce it in the chat log the first time.
  let peerAnnounced = false;
  syncComponent.addEventListener('PEER-CONNECTED', () => {
    chatInput.disabled = false;
    chatButton.disabled = false;
    fileButton.disabled = false;
    document.querySelector('.demo-qr').hidden = true;
    if (!peerAnnounced) {
      peerAnnounced = true;
      addMessage('demo-msg-system', null, 'Peer connected.');
    }
  });

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || !syncComponent.peer_connection) return;
    const username = usernameInput.value.trim() || getUsername();
    syncComponent.sendMessage({ username, text });
    addMessage('demo-msg-own', username, text);
    chatInput.value = '';
  });

  syncComponent.addEventListener('PEER-MESSAGE', (e) => {
    const msg = e.detail?.message;
    if (msg && typeof msg === 'object' && 'text' in msg) {
      addMessage('demo-msg-peer', msg.username || 'peer', msg.text);
    } else {
      addMessage('demo-msg-peer', 'peer', String(msg));
    }
  });

  // --- Files ---
  // The library routes transfer acknowledgements to a single active
  // FileSender, so selected files are queued and sent one at a time.
  const fileForm = document.querySelector('.demo-file-form');
  const fileInput = document.querySelector('.demo-file-input');
  const fileButton = fileForm.querySelector('button');
  const fileList = document.querySelector('.demo-file-list');
  const fileStatus = document.querySelector('.demo-file-transfer-status');

  fileButton.disabled = true;

  function addFileEntry(name) {
    const li = document.createElement('li');
    li.appendChild(document.createTextNode(name));
    const status = document.createElement('span');
    status.className = 'demo-file-status';
    li.appendChild(status);
    fileList.appendChild(li);
    fileList.scrollTop = fileList.scrollHeight;
    return li;
  }

  const sendQueue = [];
  let sending = false;
  let activeSendEntry = null;

  fileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!syncComponent.peer_connection) return;
    const files = Array.from(fileInput.files);
    if (!files.length) return;
    for (const file of files) {
      const li = addFileEntry(file.name);
      li.querySelector('.demo-file-status').textContent = ' — queued';
      sendQueue.push({ file, li });
    }
    fileInput.value = '';
    pumpSendQueue();
  });

  async function pumpSendQueue() {
    if (sending) return;
    sending = true;
    while (sendQueue.length) {
      const { file, li } = sendQueue.shift();
      activeSendEntry = li;
      li.querySelector('.demo-file-status').textContent = ' — sending…';
      await syncComponent.sendFile(file);
      activeSendEntry = null;
    }
    sending = false;
  }

  syncComponent.addEventListener('FILE-TRANSFER-PROGRESS', (e) => {
    const { sent, total, received, transferId } = e.detail;
    if (sent !== undefined) {
      // Sender-side progress belongs to whichever queue entry is active.
      if (!activeSendEntry) return;
      activeSendEntry.querySelector('.demo-file-status').textContent = total
        ? ` — sending ${sent}/${total} chunks`
        : ' — sending…';
    } else if (transferId !== undefined) {
      // Receiver-side progress; the file is listed once FILE-RECEIVED
      // arrives with its name.
      fileStatus.textContent = `Receiving file: ${received ?? 0}/${total} chunks`;
    }
  });

  syncComponent.addEventListener('FILE-TRANSFER-COMPLETE', (e) => {
    if (activeSendEntry) {
      activeSendEntry.querySelector('.demo-file-status').textContent =
        ` — sent (${e.detail.size} bytes)`;
    }
  });

  syncComponent.addEventListener('FILE-TRANSFER-ERROR', (e) => {
    if (activeSendEntry) {
      activeSendEntry.querySelector('.demo-file-status').textContent =
        ` — failed: ${e.detail.error}`;
    } else {
      fileStatus.textContent = `Transfer failed: ${e.detail.error}`;
    }
  });

  syncComponent.addEventListener('FILE-RECEIVED', (e) => {
    const { blob, name, size } = e.detail;
    fileStatus.textContent = '';
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.textContent = name;
    li.appendChild(link);
    const status = document.createElement('span');
    status.className = 'demo-file-status';
    status.textContent = ` — received (${size} bytes)`;
    li.appendChild(status);
    fileList.appendChild(li);
    fileList.scrollTop = fileList.scrollHeight;
  });

  // --- File transfer notices in the chat log ---
  syncComponent.addEventListener('FILE-TRANSFER-COMPLETE', (e) => {
    addMessage('demo-msg-system', null, `File sent: ${e.detail.name}`);
  });
  syncComponent.addEventListener('FILE-RECEIVED', (e) => {
    addMessage('demo-msg-system', null, `File received: ${e.detail.name}`);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDemo);
} else {
  initDemo();
}
