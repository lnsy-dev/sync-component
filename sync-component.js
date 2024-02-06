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
 *   - PeerJS for peer-to-peer connection
 *   - DataroomElement for custom element structure
 *   - helpers.js for URL parsing
 */

import { getURLValues } from './vendor/helpers.js';
import "./vendor/peerjs.min.js";
import { DataroomElement } from "./vendor/dataroom-element.js";

class SyncComponent extends DataroomElement {
  /**
   * Initialize the component and setup peer connections.
   * It listens to various events like 'open', 'error', 'connection', and 'disconnected'
   * to handle different states of peer-to-peer communication.
   */
  async initialize(){
    this.peer = new Peer();
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
   * Otherwise, it displays a connection link.
   * @param {string} id - The peer ID.
   */
  handleServerOpen(id){
    const urlValues = getURLValues();
    const target_id = urlValues["peer-id"]
    if(target_id !== undefined){
      this.innerHTML = `Connecting to peer id: ${urlValues["peer-id"]}`
      this.connectToPeer(target_id)
    } else {
      this.innerHTML = `<div>
        <p>Connected to server. Waiting for peer.</p>
      </div>`
      this.setAttribute('peer-link', `${window.location.href}?&peer-id=${id}`);
      this.dtrmEvent('SERVER-CONNECTION-OPEN');
    }
  }

  /**
   * Handle errors, specifically focusing on connection errors.
   * Updates the HTML content to display the error message.
   * @param {Object} err - The error object.
   */
  handleError(err){
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
