/*
  
  **** BEGIN ASCII ART ****
     _______  ___   ________
    / ___/\ \/ / | / / ____/
    \__ \  \  /  |/ / /
   ___/ /  / / /|  / /___
  /____/  /_/_/ |_/\____/
  COMPONENT
  
  **** END ASCII ART ****

  This component is an easy way to sync
  two web browsers using only an HTML Element.

  To use, include this index.js file and linked
  JS files. 

  Use like :

    <sync-component></sync-component>

  Sync Component has no concept of a "user", 
  and it never will. It should be used and reasoned 
  about as two specific devices and how they will interact. 

*/

import { getURLValues } from './vendor/helpers.js';
import "./vendor/peerjs.min.js";
import { DataroomElement } from "./vendor/dataroom-element.js";

class SyncComponent extends DataroomElement {
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

  handleNewMessage(msg){
    this.dtrmEvent('PEER-MESSAGE', msg);
  }

  handleDisconnection(){
    this.innerHTML = '<warn>Peer disconnected</warn>'
  }

  handleServerOpen(id){
    const urlValues = getURLValues();
    const target_id = urlValues["peer-id"]
    if(target_id !== undefined){
      this.innerHTML = `Connecting to peer id: ${urlValues["peer-id"]}`
      this.connectToPeer(target_id)
    } else {
      this.innerHTML = `<div>
        <p>Connect to device here</p>
        <p>https://${window.location.host}?&peer-id=${id}</p>
      </div>`
    }
  }

  handleError(err){
    if(err.message.startsWith('Could not connect to peer')){
      this.dtrmEvent('PEER-CONNECTION-ERROR', err);
      this.innerHTML = `<error>Could not connect to peer. Please check the link.</error>`
    }
  }

  handleNewConnection(conn){
    this.peer_connection = conn
    this.peer_connection.on('data', (msg) => {
      this.handleNewMessage(msg);
    });
  }

  sendMessage(message){
    this.peer_connection.send({message});
  }

  async connectToPeer(target_id){
    const conn = await this.peer.connect(target_id);
    conn.on('open', (connection) => {
      this.dtrmEvent('PEER-CONNECTED', {});
      this.handleNewConnection(conn);
    })
  }
}

customElements.define('sync-component', SyncComponent)