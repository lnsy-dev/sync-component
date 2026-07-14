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

1. **Install the Package:**
   ```bash
   npm install @lnsy/sync-component
   ```

2. **Import the Component:**
   Import the component in your project — it self-registers as the
   `sync-component` custom element upon import:
   ```javascript
   import '@lnsy/sync-component';
   ```

## Development

To work on the component itself:

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

## Usage

Include the custom tag in your HTML:

```html
<sync-component></sync-component>
```

The component initializes itself and connects to the PeerJS signaling
server automatically. From there:

1. It shows a dialog with an 8-character **sync code** (also exposed as the
   `peer-id` attribute, and as a shareable URL in the `peer-link` attribute).
2. A second browser connects by entering that code in its own dialog, or by
   opening the `peer-link` URL (the `?peer-id=` query parameter triggers an
   automatic connection attempt, with retries on timeout).
3. Once connected, the element displays a file picker for sending files, and
   your app can exchange messages through the API and events below.

```javascript
const sync = document.querySelector('sync-component');

sync.addEventListener('PEER-CONNECTED', () => {
  sync.sendMessage({ text: 'hello from this browser' });
});

sync.addEventListener('PEER-MESSAGE', (e) => {
  console.log('peer says:', e.detail.message);
});

sync.addEventListener('FILE-RECEIVED', (e) => {
  const { blob, name } = e.detail;
  // e.g. offer the blob as a download
});
```

## API

All methods and attributes live on the `<sync-component>` element instance.

**Attributes** (set by the component, useful to observe):

- `peer-id` — this browser's sync code, available after the server
  connection opens.
- `peer-link` — a shareable URL that auto-connects whoever opens it.

**Methods:**

- `sendMessage(message)` — send any JSON-serializable value to the
  connected peer. It arrives on the other side as a `PEER-MESSAGE` event.
- `sendFile(file)` — send a `Blob`/`File` to the connected peer in
  checksummed chunks, with progress events and automatic retransmission of
  missing chunks. Resolves when the peer confirms receipt.
- `connectToPeer(code)` — connect to a peer by sync code programmatically
  (what the dialog and `?peer-id=` URL parameter use internally).

## Configuration

By default the component uses the public PeerJS cloud server. To use your
own signaling server, set `window.SYNC_COMPONENT_PEER_CONFIG` **before** the
element connects; its contents are passed through as PeerJS options:

```html
<script>
  window.SYNC_COMPONENT_PEER_CONFIG = {
    host: 'localhost',
    port: 9000,
    path: '/'
  };
</script>
<sync-component></sync-component>
```

## Events Emitted

The component dispatches `CustomEvent`s from the element itself (they do
not bubble), with payloads in `event.detail`:

- **SERVER-CONNECTION-OPEN** — connected to the signaling server and ready
  to accept peers. No detail.
- **PEER-CONNECTED** — a data connection with a peer is established.
  No detail. (May fire more than once per connection.)
- **PEER-MESSAGE** — a message arrived from the peer. `detail` is
  `{ message: value }`, where `value` is what the peer passed to
  `sendMessage`.
- **PEER-CONNECTION-RETRY** — a connection attempt timed out and is being
  retried. `detail`: `{ peerId, attempt }`.
- **PEER-CONNECTION-ERROR** — connecting to a peer failed (unknown code or
  repeated timeouts). `detail` is the error object.
- **FILE-TRANSFER-PROGRESS** — progress for an in-flight transfer. When
  sending, `detail`: `{ name, sent, total }` (chunk counts; `total` is `0`
  while the transfer starts). When receiving, `detail`:
  `{ received, total, transferId }`.
- **FILE-TRANSFER-COMPLETE** — the peer confirmed receipt of a file you
  sent. `detail`: `{ name, size }`.
- **FILE-TRANSFER-ERROR** — a transfer failed (timeout or checksum
  mismatch). `detail`: `{ error }`.
- **FILE-RECEIVED** — a file from the peer was reassembled and verified.
  `detail`: `{ blob, name, mimeType, size }`.

These events are dispatched via the `dtrmEvent` method of the
`DataroomElement` base class, which `SyncComponent` extends.

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
component picks up custom PeerJS options from
`window.SYNC_COMPONENT_PEER_CONFIG` (see Configuration above), which the
tests inject via Playwright — no configuration is needed to run them.

Before running e2e tests for the first time, install the browser:

```bash
npx playwright install chromium
```

## Customizing SyncComponent

You can extend or modify the `SyncComponent` class to suit your application-specific needs. For advanced usage, consider overriding methods or adding new functionalities as per your requirements.

---

# Prior Work
Peer JS https://peerjs.com/
Local Forage https://github.com/localForage/localForage


