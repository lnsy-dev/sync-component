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


import "./qr-code.js"
import "./peerjs.min.js";
import "./localforage.min.js";

class PeerComponent extends HTMLElement {
  connectedCallback(){
    const verbose = this.getAttribute('verbose');
    if(verbose === null){
      this.verbose = false;
    } else {
      this.verbose = true;
    }
    this.target = this.getAttribute('target');
    if(this.target === null){
      return console.error("Peer Component Requires a Target ID");
    }
    this.innerHTML = `
      <button class="connect_to_peer_button">Connect to ${this.target}</button>
      <div class="peer_status">Connected</div>
    `
    this.peer_status = this.querySelector('.peer_status');
    this.querySelector('.connect_to_peer_button').addEventListener('click', (e)=>{
      this.connectToPeer()
    })
  }

  async connectToPeer(){
    this.connection = this.parentNode.peer.connect(this.target);
    this.connection.on('open', () => {
      this.innerHTML = `
        <textarea class="peer_message"></textarea>
        <button class="send_message">Send</button>
        <div class="peer_status">Connected</div>
      `

      this.querySelector('.send_message').addEventListener('click', () => {
        const peer_message = this.querySelector('.peer_message');
        const message = peer_message.value; 
        this.sendMessageToPeer(message);
        peer_message.value = '';
      })
    })
  }

  updateView(update){
    console.log(update, this.verbose)
    if(!this.verbose) return
    this.peer_status = this.querySelector('.peer_status');
    this.peer_status.innerHTML = update
  }

  handleMessage(message){
    this.peer_status = this.querySelector('.peer_status');
    this.updateView(`
      <div>
        <h3>Message recieved:</h3>
        <p>${message}</p>
      </div>
    `)
    this.dispatchEvent(new CustomEvent("MESSAGE RECEIVED", {
      detail: { message }
    }));
  }

  sendMessageToPeer(message){
    this.connection.send(message);
    this.updateView(`
      <div>
        <h3>Sent Message:</h3>
        <p>${message}</p>
      </div>
    `)
  }

}
customElements.define('peer-component', PeerComponent)


class SyncComponent extends HTMLElement {
  async initialize(){
    this.qr_code = document.createElement('qr-code');
    this.appendChild(this.qr_code);
    this.uuid = await this.getUUID();
    this.qr_code.setAttribute('value', `${window.location.href}?&target=${this.uuid}`);
    this.options = this.getURLValues();

    // Control Buttons
    const detail = this.detail = document.createElement('details');
    detail.setAttribute('open', true)
    detail.innerHTML = `
      <div id="sync_status">Initialized</div>
      <details>
        <summary style="color:red">DANGER</summary>
        <button id="cycle_keys">Cycle Keys</button>
      </details>
    `
    this.appendChild(detail);
    cycle_keys.addEventListener('click', (e) => {
      this.generateNewKey();
    });

    this.peer = new Peer(await this.getUUID());
    sync_status.innerText += `Connection created with id ${this.uuid}`;
    this.peer.on('connection', (conn) => {
      this.handleNewDevice(conn)
    })

    if(this.options.target){
      this.createNewPeerElement(this.options.target);
    }
  }

  createNewPeerElement(target){
    let peer = this.querySelector(`[target="${target}"]`);
    if(peer === null){
      peer = document.createElement('peer-component');
      peer.setAttribute('target', target);
      peer.setAttribute('verbose', true);
      this.appendChild(peer);
      this.storeDevice(target);
    }
    return peer;
  }

  async handleNewDevice(conn){
    const peer = this.createNewPeerElement(conn.peer);      
    conn.on('data', (data) => {
      peer.handleMessage(data)
    });
  }

  async storeDevice(id){
    let peers = await localforage.getItem(this.uuid); 
    if(peers === null){
      peers = [];
    }

    if(peers.indexOf(id) > -1){
      return
    } else {
      peers.push(id);
      localforage.setItem(this.uuid, peers);
    }
  }

  broadcastMessage(message){
    const peers = this.querySelectorAll('peer-component');
    [...peers].forEach(peer => {
      peer.sendMessageToPeer(message)
    })
  }

  async getUUID(){
    if(this.uuid){
      return this.uuid;
    } else {
      const uuid = await localforage.getItem(window.location.host);
      if(uuid === null){
        await this.generateNewKey();
        return this.uuid;
      } else {
        return uuid
      }
    }
  }

  async generateNewKey(){
    this.uuid = self.crypto.randomUUID();
    await localforage.setItem(window.location.host, this.uuid);
    this.qr_code.setAttribute('value',  `${window.location.href}?&target=${this.uuid}`);
    this.createConnection();
  }

  getURLValues(URL = window.location.href ){
    const search_params = new URLSearchParams(URL)
    let options = {}
    for (const [key, unparsed_value] of search_params) {
      if(key !== window.location.origin + window.location.pathname + '?' ){
        try {
          const value = JSON.parse(decodeURI(unparsed_value))
          options[key] = value
        } catch {
          options[key] = decodeURI(unparsed_value)
        }
      }
    }
    return options
  }

  connectedCallback(){
    this.initialize()
  }
}

customElements.define('sync-component', SyncComponent)


