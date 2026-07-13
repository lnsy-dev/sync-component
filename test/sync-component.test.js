import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../src/sync-component.js';

/**
 * Creates a sync-component element without attaching it to the DOM,
 * so `connectedCallback`/`initialize` (which opens a PeerJS connection)
 * never runs. Methods are then exercised directly.
 */
function createElement() {
  return document.createElement('sync-component');
}

describe('sync-component', () => {
  let el;

  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    el = createElement();
  });

  it('is registered as a custom element', () => {
    expect(customElements.get('sync-component')).toBeDefined();
  });

  it('emits PEER-MESSAGE with the received message as detail', () => {
    const handler = vi.fn();
    el.addEventListener('PEER-MESSAGE', handler);

    const msg = { message: 'hello' };
    el.handleNewMessage(msg);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail).toBe(msg);
  });

  it('shows a warning on disconnection', () => {
    el.handleDisconnection();
    expect(el.innerHTML).toContain('Peer disconnected');
  });

  it('emits SERVER-CONNECTION-OPEN and sets peer-link when no target is in the URL', () => {
    const handler = vi.fn();
    el.addEventListener('SERVER-CONNECTION-OPEN', handler);

    el.handleServerOpen('my-peer-id');

    expect(handler).toHaveBeenCalledOnce();
    expect(el.getAttribute('peer-link')).toContain('peer-id=my-peer-id');
    expect(el.innerHTML).toContain('Waiting for peer');
  });

  it('opens the sync dialog with our code when no target is in the URL', () => {
    el.handleServerOpen('ABC12345');

    const dialog = el.querySelector('dialog');
    expect(dialog).not.toBeNull();
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('.sync-code').textContent).toBe('ABC12345');
    expect(dialog.querySelector('.sync-code-input')).not.toBeNull();
  });

  it('connects to the normalized code entered in the dialog', () => {
    el.connectToPeer = vi.fn();
    el.handleServerOpen('ABC12345');

    const dialog = el.querySelector('dialog');
    dialog.querySelector('.sync-code-input').value = '  xyz98765 ';
    dialog.querySelector('.sync-connect-form').dispatchEvent(new Event('submit'));

    expect(el.connectToPeer).toHaveBeenCalledWith('XYZ98765');
    expect(dialog.open).toBe(false);
  });

  it('does not connect when the dialog code is empty', () => {
    el.connectToPeer = vi.fn();
    el.handleServerOpen('ABC12345');

    const dialog = el.querySelector('dialog');
    dialog.querySelector('.sync-code-input').value = '   ';
    dialog.querySelector('.sync-connect-form').dispatchEvent(new Event('submit'));

    expect(el.connectToPeer).not.toHaveBeenCalled();
  });

  it('retries with a new code when the generated id is taken', () => {
    const destroy = vi.fn();
    el.peer = { destroy };
    el.initialize = vi.fn();

    el.handleError({ type: 'unavailable-id', message: 'ID is taken' });

    expect(destroy).toHaveBeenCalledOnce();
    expect(el.initialize).toHaveBeenCalledOnce();
  });

  it('connects to the peer id from the URL when present', () => {
    window.history.replaceState({}, '', '/?peer-id=target-peer');
    el.connectToPeer = vi.fn();

    el.handleServerOpen('my-peer-id');

    expect(el.connectToPeer).toHaveBeenCalledWith('target-peer');
    expect(el.innerHTML).toContain('Connecting to peer id: target-peer');
  });

  it('emits PEER-CONNECTION-ERROR and shows an error for failed connections', () => {
    const handler = vi.fn();
    el.addEventListener('PEER-CONNECTION-ERROR', handler);

    const err = new Error('Could not connect to peer unknown-id');
    el.handleError(err);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail).toBe(err);
    expect(el.innerHTML).toContain('Could not connect to peer');
  });

  it('ignores errors unrelated to peer connections', () => {
    const handler = vi.fn();
    el.addEventListener('PEER-CONNECTION-ERROR', handler);

    el.handleError(new Error('Lost connection to server'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('wires data events on a new connection and emits PEER-CONNECTED', () => {
    const connectedHandler = vi.fn();
    el.addEventListener('PEER-CONNECTED', connectedHandler);

    let dataCallback;
    const conn = {
      on: vi.fn((event, cb) => {
        if (event === 'data') dataCallback = cb;
      })
    };

    el.handleNewConnection(conn);

    expect(el.peer_connection).toBe(conn);
    expect(conn.on).toHaveBeenCalledWith('data', expect.any(Function));
    expect(connectedHandler).toHaveBeenCalledOnce();

    const messageHandler = vi.fn();
    el.addEventListener('PEER-MESSAGE', messageHandler);
    dataCallback({ message: 'from peer' });
    expect(messageHandler).toHaveBeenCalledOnce();
  });

  it('sends a message through the peer connection', () => {
    const send = vi.fn();
    el.peer_connection = { send };

    el.sendMessage('ping');

    expect(send).toHaveBeenCalledWith({ message: 'ping' });
  });
});
