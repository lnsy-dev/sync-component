# sync-component
A simple component for syncing two browsers with WebRTC

This component is an easy way to sync
two web browsers using only an HTML Element.

To use, import the component (see Installation below).

Use like :
```html
  <sync-component></sync-component>
```

Sync Component has no concept of a "user", 
and it never will. It should be used and reasoned 
about as two specific devices and how they will interact. 


## Installation

1. **Clone the Repository:**
   Clone or download the repository to your local machine.

2. **Install Dependencies:**
   ```bash
   npm install
   ```
   This installs `peerjs` (the only runtime dependency) and Vite (the build tool).

3. **Run the Demo:**
   ```bash
   npm run dev
   ```
   Open the printed local URL to see `<sync-component>` in action.

4. **Build the Library Bundle:**
   ```bash
   npm run build
   ```
   Outputs a self-contained, minified bundle (with peerjs included) to:
   - `build/sync-component.min.js` (ES module)

5. **Import the Component:**
   Import the component in your project — it self-registers as the
   `sync-component` custom element upon import:
   ```javascript
   import './path/to/sync-component.js';
   ```

## Usage

To use the `SyncComponent`, simply include the custom tag in your HTML:

```html
<sync-component></sync-component>
```

The component handles its initialization and peer-to-peer connection setup automatically.

## Testing

The project has both unit and end-to-end tests:

```bash
npm test        # unit tests (Vitest + jsdom)
npm run test:e2e  # end-to-end tests (Playwright)
npm run test:all  # both
```

The e2e suite starts the Vite dev server and a local PeerJS signaling
server (`peer` package, see `e2e/peer-server.mjs`) automatically. Tests run
two real browser peers that connect and exchange WebRTC messages. The
component picks up test-only PeerJS options from
`window.SYNC_COMPONENT_PEER_CONFIG`, which the tests inject via Playwright —
no configuration is needed to run them.

Before running e2e tests for the first time, install the browser:

```bash
npx playwright install chromium
```

## Events Emitted

The `SyncComponent` emits several custom events using the `dtrmEvent` method to inform about different states and actions. Here's a list of these events:

1. **PEER-CONNECTED:**
   - Emitted when a connection with a peer is successfully established.
   - Usage: `this.dtrmEvent('PEER-CONNECTED')`

2. **PEER-MESSAGE:**
   - Emitted when a new message is received from the connected peer.
   - Usage: `this.dtrmEvent('PEER-MESSAGE', msg)`

3. **PEER-CONNECTION-ERROR:**
   - Emitted when there is an error in connecting to a peer.
   - Usage: `this.dtrmEvent('PEER-CONNECTION-ERROR', err)`

The `dtrmEvent` method is a part of the `DataroomElement` class, which `SyncComponent` extends. It is used to dispatch custom events which can be listened to by the parent application for appropriate handling and UI updates.

## Customizing SyncComponent

You can extend or modify the `SyncComponent` class to suit your application-specific needs. For advanced usage, consider overriding methods or adding new functionalities as per your requirements.

---

This README provides a comprehensive guide for anyone looking to integrate and understand the `SyncComponent`. It covers the basics of installation, usage, and provides details on the custom events that the component emits, making it easier for developers to implement and debug the component in their projects.

# Prior Work
Peer JS https://peerjs.com/
Local Forage https://github.com/localForage/localForage


