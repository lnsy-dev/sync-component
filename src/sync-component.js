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
import { DataroomElement } from './dataroom-element.js';

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
   * @param {Object} msg - The message received from the peer.
   */
  handleNewMessage(msg){
    this.dtrmEvent('PEER-MESSAGE', msg);
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
      this.dtrmEvent('PEER-CONNECTION-ERROR', err);
      this.innerHTML = `<error>Could not connect to peer. Please check the link.</error>`
    }
  }

  /**
   * Handles a new connection by setting up data event listeners.
   * @param {Object} conn - The connection object to the peer.
   */
  handleNewConnection(conn){
    this.peer_connection = conn
    this.peer_connection.on('data', (msg) => {
      this.handleNewMessage(msg);
    });
    this.closeSyncDialog();
    this.dtrmEvent('PEER-CONNECTED')
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
   * @param {string} target_id - The target peer's ID.
   */
  async connectToPeer(target_id){
    const conn = await this.peer.connect(target_id);
    conn.on('open', (connection) => {
      this.dtrmEvent('PEER-CONNECTED');
      this.handleNewConnection(conn);
    })
  }
}

customElements.define('sync-component', SyncComponent);
