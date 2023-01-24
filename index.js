import "./qr-code.js"
import "./peerjs.min.js";
import "./localforage.min.js";

class SyncComponent extends HTMLElement {
  async initialize(){
    this.qr_code = document.createElement('qr-code');
    this.appendChild(this.qr_code);
    this.uuid = await this.getUUID();
    this.qr_code.setAttribute('value', `${window.location.href}?&target=${this.uuid}`);
    this.options = this.getURLValues();
    // Control Buttons
    const detail = document.createElement('details');
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
      detail.innerHTML += `
        <button id="connect_to_peer">Connect to Peer</button>
      `
      connect_to_peer.addEventListener('click', (e) => {
        this.connectToPeer(this.options.target);        
      });
    }
  }

  async createConnection(){
    this.peer = new Peer(await this.getUUID());
    console.log(this.uuid);
    sync_status.innerText += `Connection created with id ${this.uuid}`;
    this.peer.on('connection', (conn) => {
      console.log(conn);  
      conn.on('data', (data) => {
        console.log(data)
      })    
    })
  }

  async connectToPeer(peerID){
    sync_status.innerText = `Connecting to ${peerID}`
    const conn = this.peer.connect(peerID);
    conn.on('open', () => {
      sync_status.innerText = `CONNECTION OPENED`;
      conn.send('HELLO');
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


