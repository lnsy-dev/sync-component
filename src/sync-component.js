/*
 * SyncComponent Class
 * 
 * This class extends the DataroomElement to create a custom web component for synchronizing two web browsers.
 * It uses the PeerJS library to establish peer-to-peer connections and does not require a concept of a "user".
 * Instead, it focuses on device-to-device interaction.
 * 
 * Usage:
 *   <sync-component></sync-component>
 *
 * Dependencies:
 *   - peerjs (npm) for peer-to-peer connection
 *   - ./dataroom-element.js for custom element structure
 *   - ./helpers.js for URL parsing
 */

import { Peer } from 'peerjs';
import { getURLValues, generatePeerCode } from './helpers.js';
import { FileSender, FileReceiver } from './file-transfer.js';
import { DataroomElement } from './dataroom-element.js';

// How long to wait for a peer data connection to open before retrying,
// and how many attempts to make before giving up (see connectToPeer).
const CONNECT_TIMEOUT_MS = 10000;
const MAX_CONNECT_ATTEMPTS = 3;

class SyncComponent extends DataroomElement {
  /**
   * Initialize the component and setup peer connections.
   * It listens to various events like 'open', 'error', 'connection', and 'disconnected'
   * to handle different states of peer-to-peer communication.
   *
   * Instead of letting PeerJS assign a long UUID, we generate a short
   * 8-character code and register it as the peer id. The code IS the id,
   * so sharing it needs no encoding/decoding step.
   *
   * PeerJS options can be injected via `window.SYNC_COMPONENT_PEER_CONFIG`
   * (defaults to the public PeerJS cloud server when unset).
   */
  async initialize(){
    const peerConfig = window.SYNC_COMPONENT_PEER_CONFIG || {};
    this.peer = new Peer(generatePeerCode(), peerConfig);
    this.peer.on('error', (e) => {
      this.handleError(e)
    })
    this.peer.on('open', (id) => {
      this.setAttribute('peer-id', id);
      this.handleServerOpen(id);
    });
    this.peer.on('connection', (conn) => {
      this.dtrmEvent('PEER-CONNECTED')
      this.innerHTML = 'connected to peer'
      this.handleNewConnection(conn);
    });

    this.peer.on('disconnected', () => {
      this.handleDisconnection();
    })
  }

  /**
   * Handle receiving new messages from the peer.
   * File-transfer protocol messages are routed to the active
   * FileSender/FileReceiver; everything else is emitted as PEER-MESSAGE.
   * @param {Object} msg - The message received from the peer.
   */
  handleNewMessage(msg){
    if(msg?.type?.startsWith('file-')){
      this.handleFileMessage(msg);
      return;
    }
    this.dtrmEvent('PEER-MESSAGE', msg);
  }

  /**
   * Route a file-transfer protocol message. Acknowledgements and resend
   * requests go to the active sender; metadata and chunks go to the
   * receiver, which is created lazily on the first `file-meta`.
   * @param {Object} msg - The file protocol message.
   */
  handleFileMessage(msg){
    if(msg.type === 'file-meta' && !this.fileReceiver){
      this.fileReceiver = new FileReceiver((m) => this.peer_connection.send(m), {
        onProgress: (progress) => this.dtrmEvent('FILE-TRANSFER-PROGRESS', progress),
        onComplete: (file) => this.handleFileReceived(file),
        onError: (err) => this.dtrmEvent('FILE-TRANSFER-ERROR', { error: err.message })
      });
    }
    if(['file-window-ack', 'file-missing', 'file-complete'].includes(msg.type)){
      this.fileSender?.handleMessage(msg);
    } else {
      this.fileReceiver?.handleMessage(msg);
    }
  }

  /**
   * Send a file to the connected peer in checksummed chunks.
   * Emits FILE-TRANSFER-PROGRESS, FILE-TRANSFER-COMPLETE and
   * FILE-TRANSFER-ERROR events.
   * @param {Blob} file - The file to send.
   * @param {Object} [options] - Options passed through to FileSender.
   * @return {Promise<void>} resolves when the peer confirms receipt.
   */
  async sendFile(file, options = {}){
    if(!this.peer_connection){
      throw new Error('No peer connected');
    }
    // Announce the transfer immediately so the UI can show a status even
    // for small files that finish in a single window.
    this.dtrmEvent('FILE-TRANSFER-PROGRESS', { name: file.name, sent: 0, total: 0 });
    this.fileSender = new FileSender((m) => this.peer_connection.send(m), file, {
      onProgress: (progress) => this.dtrmEvent('FILE-TRANSFER-PROGRESS', { name: file.name, ...progress }),
      getBufferedAmount: () => this.peer_connection?.dataChannel?.bufferedAmount ?? 0,
      ...options
    });
    try {
      await this.fileSender.start();
      this.dtrmEvent('FILE-TRANSFER-COMPLETE', { name: file.name, size: file.size });
    } catch (err) {
      this.dtrmEvent('FILE-TRANSFER-ERROR', { error: err.message });
    }
  }

  /**
   * Handle a fully received and verified file: offer it as a download
   * link and emit FILE-RECEIVED.
   * @param {Object} file - { blob, name, mimeType, size } from FileReceiver.
   */
  handleFileReceived({ blob, name, mimeType, size }){
    const container = this.querySelector('.file-download');
    if(container && URL.createObjectURL){
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.textContent = `Download ${name} (${size} bytes)`;
      container.innerHTML = '';
      container.appendChild(link);
    }
    this.dtrmEvent('FILE-RECEIVED', { blob, name, mimeType, size });
  }

  /**
   * Handle disconnection events by updating the HTML content.
   */
  handleDisconnection(){
    this.innerHTML = '<warn>Peer disconnected</warn>'
  }

  /**
   * Handles the event when the server connection is successfully opened.
   * If a target peer ID is provided in the URL, it attempts to connect to that peer.
   * Otherwise, it opens the sync dialog so the user can share their code
   * or enter another browser's code.
   * @param {string} id - The peer ID (our short sync code).
   */
  handleServerOpen(id){
    const urlValues = getURLValues();
    const target_id = urlValues["peer-id"]
    if(target_id !== undefined){
      this.innerHTML = `Connecting to peer id: ${urlValues["peer-id"]}`
      this.connectToPeer(target_id)
    } else {
      this.setAttribute('peer-link', `${window.location.href}?&peer-id=${id}`);
      this.openSyncDialog(id);
      this.dtrmEvent('SERVER-CONNECTION-OPEN');
    }
  }

  /**
   * Open the sync dialog showing our own code and letting the user
   * enter another browser's code to connect.
   * @param {string} id - Our peer ID / sync code.
   */
  openSyncDialog(id){
    this.innerHTML = `
      <dialog class="sync-dialog">
        <form method="dialog" class="sync-connect-form">
          <p>Your sync code:</p>
          <p><code class="sync-code">${id}</code>
            <button type="button" class="sync-copy-button">Copy</button></p>
          <p>Connected to server. Waiting for peer.</p>
          <label>
            Enter a code to connect:
            <input class="sync-code-input" type="text" maxlength="8"
                   autocomplete="off" placeholder="XXXXXXXX">
          </label>
          <button type="submit">Connect</button>
        </form>
      </dialog>`
    const dialog = this.querySelector('dialog');
    dialog.querySelector('.sync-copy-button').addEventListener('click', () => {
      if(navigator.clipboard?.writeText){
        navigator.clipboard.writeText(id);
      }
    });
    dialog.querySelector('.sync-connect-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = dialog.querySelector('.sync-code-input').value.trim().toUpperCase();
      if(code === '') return;
      this.closeSyncDialog();
      this.innerHTML = `Connecting to peer id: ${code}`;
      this.connectToPeer(code);
    });
    if(typeof dialog.showModal === 'function'){
      dialog.showModal();
    } else {
      dialog.open = true;
    }
  }

  /**
   * Close the sync dialog if it is currently open.
   */
  closeSyncDialog(){
    const dialog = this.querySelector('dialog');
    if(dialog?.open){
      if(typeof dialog.close === 'function'){
        dialog.close();
      } else {
        dialog.open = false;
      }
    }
  }

  /**
   * Handle errors, specifically focusing on connection errors.
   * If our generated code is already taken by another peer, we generate
   * a new one and reconnect. Connection errors update the HTML content
   * to display the error message.
   * @param {Object} err - The error object.
   */
  handleError(err){
    if(err.type === 'unavailable-id'){
      this.peer.destroy();
      this.initialize();
      return;
    }
    if(err.message.startsWith('Could not connect to peer')){
      // The peer doesn't exist (server sent EXPIRE); any in-flight
      // connectToPeer timeout checks this flag and stands down.
      this._connectFailed = true;
      this.dtrmEvent('PEER-CONNECTION-ERROR', err);
      this.innerHTML = `<error>Could not connect to peer. Please check the link.</error>`
    }
  }

  /**
   * Handles a new connection by setting up data event listeners
   * and showing the file transfer UI.
   * @param {Object} conn - The connection object to the peer.
   */
  handleNewConnection(conn){
    this.peer_connection = conn
    this.peer_connection.on('data', (msg) => {
      this.handleNewMessage(msg);
    });
    this.closeSyncDialog();
    this.openFileUI();
    this.dtrmEvent('PEER-CONNECTED')
  }

  /**
   * Show the file transfer UI: a file picker, transfer status and a
   * download area for received files.
   */
  openFileUI(){
    this.innerHTML = `
      <p>connected to peer</p>
      <form class="file-send-form">
        <input class="file-input" type="file">
        <button type="submit">Send file</button>
      </form>
      <p class="file-status"></p>
      <p class="file-download"></p>`
    this.querySelector('.file-send-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const file = this.querySelector('.file-input').files[0];
      if(file) this.sendFile(file);
    });
    this.addEventListener('FILE-TRANSFER-PROGRESS', (e) => {
      const { received, sent, total, name } = e.detail;
      if(sent !== undefined){
        this.querySelector('.file-status').textContent = total
          ? `Sending ${name}: ${sent}/${total} chunks`
          : `Sending ${name}…`;
        return;
      }
      this.querySelector('.file-status').textContent = `Transferring: ${received ?? 0}/${total} chunks`;
    });
    this.addEventListener('FILE-TRANSFER-COMPLETE', (e) => {
      const { name, size } = e.detail;
      this.querySelector('.file-status').textContent = `Sent ${name} (${size} bytes)`;
    });
    this.addEventListener('FILE-TRANSFER-ERROR', (e) => {
      this.querySelector('.file-status').textContent = `Transfer failed: ${e.detail.error}`;
    });
  }

  /**
   * Send a message to the connected peer.
   * @param {string} message - The message to be sent.
   */
  sendMessage(message){
    this.peer_connection.send({message});
  }

  /**
   * Connect to a specified peer by ID.
   *
   * WebRTC negotiation can fail silently (unreachable ICE candidates, a
   * lost answer): the data channel then never opens and PeerJS emits no
   * error, leaving the UI stuck on "Connecting…" forever. To avoid that,
   * we wait at most CONNECT_TIMEOUT_MS for the connection's 'open' event,
   * retry up to MAX_CONNECT_ATTEMPTS times, and finally give up with a
   * visible error and a PEER-CONNECTION-ERROR event.
   *
   * If the peer does not exist at all, the server tells us via a
   * peer-level 'peer-unavailable' error handled in handleError; the
   * _connectFailed flag lets the timeout path stand down in that case.
   * @param {string} target_id - The target peer's ID.
   * @param {number} [attempt] - Current attempt number (internal).
   */
  async connectToPeer(target_id, attempt = 1){
    if(attempt === 1){
      this._connectFailed = false;
    }
    const conn = this.peer.connect(target_id);
    const opened = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), CONNECT_TIMEOUT_MS);
      conn.on('open', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    if(this._connectFailed){
      conn.close();
      return;
    }
    if(opened){
      this.dtrmEvent('PEER-CONNECTED');
      this.handleNewConnection(conn);
      return;
    }
    conn.close();
    if(attempt < MAX_CONNECT_ATTEMPTS){
      this.dtrmEvent('PEER-CONNECTION-RETRY', { peerId: target_id, attempt: attempt + 1 });
      this.innerHTML = `Connecting to peer id: ${target_id} (attempt ${attempt + 1} of ${MAX_CONNECT_ATTEMPTS})`;
      return this.connectToPeer(target_id, attempt + 1);
    }
    const err = {
      type: 'connect-timeout',
      message: `Could not connect to peer ${target_id}: connection timed out`
    };
    this.dtrmEvent('PEER-CONNECTION-ERROR', err);
    this.innerHTML = `<error>Could not connect to peer. The connection timed out. Please check the link or try again.</error>`
  }
}

customElements.define('sync-component', SyncComponent);
