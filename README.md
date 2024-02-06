# sync-component
A simple component for syncing two browsers with WebRTC

This component is an easy way to sync
two web browsers using only an HTML Element.

To use, include this index.js file and linked
JS files. 

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

2. **Include Dependencies:**
   Ensure that `peerjs.min.js`, `dataroom-element.js`, and `helpers.js` are included in your project.

3. **Import the Component:**
   Import the `SyncComponent` class in your project:
   ```javascript
   import { SyncComponent } from './path/to/SyncComponent.js';
   ```

4. **Custom Element Registration:**
   The component is automatically registered as a custom element named `sync-component` upon importing.

## Usage

To use the `SyncComponent`, simply include the custom tag in your HTML:

```html
<sync-component></sync-component>
```

The component handles its initialization and peer-to-peer connection setup automatically.

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


