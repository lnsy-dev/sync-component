import "./qr-code.js"
import "./peerjs.min.js";
import "./localforage.min.js";

class PeerComponent extends HTMLElement {
  connectedCallback(){
    this.target = this.getAttribute('target');
    this.innerHTML = `
      <button class="connect_to_peer_button">Connect to ${this.target}</button>
      <div class="peer_status">Connected</div>
    `
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
      this.peer_status = this.querySelector('.peer_status');
      this.querySelector('.send_message').addEventListener('click', () => {
        const peer_message = this.querySelector('.peer_message');
        const message = peer_message.value; 
        this.sendMessageToPeer(message);
        peer_message.value = '';
      })
    })
  }

  handleMessage(message){
    this.peer_status = this.querySelector('.peer_status');
    this.peer_status.innerHTML = `
      <div>
        <h3>Message recieved:</h3>
        <p>${message}</p>
      </div>
    `
  }

  sendMessageToPeer(message){
    this.connection.send(message);
    this.peer_status.innerHTML = `
      <div>
        <h3>Sent Message:</h3>
        <p>${message}</p>
      </div>
    `
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
    this.createConnection();
    if(this.options.target){
      const new_peer = document.createElement('peer-component');
      new_peer.setAttribute('target', this.options.target);
      this.appendChild(new_peer);
    }
  }

  async createConnection(){
    this.peer = new Peer(await this.getUUID());
    sync_status.innerText += `Connection created with id ${this.uuid}`;
    this.peer.on('connection', (conn) => {
      // check if there is a peer component
      // if there isn't, create a new peer component button
      let peer = this.querySelector(`[target="${conn.peer}"]`);
      if(peer === null){
        peer = document.createElement('peer-component');
        peer.setAttribute('target', conn.peer);
        this.appendChild(peer);
      }
      conn.on('data', (data) => {
        peer.handleMessage(data)
      })    
    })
  }

  broadcastMessage(message){
    const peers = this.querySelectorAll('peer-component');
    [...peers].forEach(peer => {
      peer.sendMessageToPeer(message)
    })
  }

  async getUUID(){
    if(this.uuid){
      console.log(this.uuid)
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


