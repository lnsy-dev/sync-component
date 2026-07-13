import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../src/sync-component.js';
import { checksum } from '../src/file-transfer.js';

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

  it('does not emit PEER-MESSAGE for file protocol messages', () => {
    const handler = vi.fn();
    el.addEventListener('PEER-MESSAGE', handler);
    el.peer_connection = { send: vi.fn() };

    el.handleNewMessage({ type: 'file-meta', transferId: 't1' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('receives a chunked file and emits FILE-RECEIVED with a Blob', () => {
    window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    const send = vi.fn();
    el.peer_connection = { send };
    el.innerHTML = '<p class="file-download"></p>';
    const receivedHandler = vi.fn();
    el.addEventListener('FILE-RECEIVED', receivedHandler);

    const data = new Uint8Array([4, 5, 6, 7]);
    el.handleNewMessage({
      type: 'file-meta',
      transferId: 't1',
      name: 'photo.png',
      mimeType: 'image/png',
      size: 4,
      totalChunks: 1,
      fileChecksum: checksum(data)
    });
    el.handleNewMessage({
      type: 'file-chunk',
      transferId: 't1',
      index: 0,
      checksum: checksum(data),
      data
    });

    expect(receivedHandler).toHaveBeenCalledOnce();
    const detail = receivedHandler.mock.calls[0][0].detail;
    expect(detail.name).toBe('photo.png');
    expect(detail.size).toBe(4);
    expect(detail.blob).toBeInstanceOf(Blob);
    expect(send).toHaveBeenCalledWith({ type: 'file-complete', transferId: 't1' });
    expect(el.querySelector('.file-download a')?.download).toBe('photo.png');
  });

  it('routes acks and resend requests to the active sender', () => {
    el.fileSender = { handleMessage: vi.fn() };

    const ack = { type: 'file-window-ack', transferId: 't1', windowEnd: 16 };
    el.handleNewMessage(ack);

    expect(el.fileSender.handleMessage).toHaveBeenCalledWith(ack);
  });

  it('sends a file through the peer connection in chunks', async () => {
    const send = vi.fn();
    el.peer_connection = { send };

    el.sendFile(new File(['hello'], 'hello.txt', { type: 'text/plain' }), { timeout: 50 });
    await new Promise((resolve) => setTimeout(resolve, 10));

    const meta = send.mock.calls.map(([msg]) => msg).find((msg) => msg.type === 'file-meta');
    expect(meta).toMatchObject({
      name: 'hello.txt',
      mimeType: 'text/plain',
      size: 5,
      totalChunks: 1
    });
    expect(send.mock.calls.some(([msg]) => msg.type === 'file-chunk')).toBe(true);
  });

  it('rejects when sending a file without a connection', async () => {
    await expect(el.sendFile(new Blob(['x']))).rejects.toThrow('No peer connected');
  });

  it('calls handleNewConnection when the peer connection opens', async () => {
    vi.useFakeTimers();
    try {
      let openCb;
      const conn = {
        on: vi.fn((event, cb) => { if (event === 'open') openCb = cb; }),
        close: vi.fn()
      };
      el.peer = { connect: vi.fn(() => conn) };
      el.handleNewConnection = vi.fn();

      const promise = el.connectToPeer('target-peer');
      openCb();
      await promise;

      expect(el.handleNewConnection).toHaveBeenCalledWith(conn);
      expect(conn.close).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries and finally errors when the connection never opens', async () => {
    vi.useFakeTimers();
    try {
      const conn = { on: vi.fn(), close: vi.fn() };
      el.peer = { connect: vi.fn(() => conn) };
      const errHandler = vi.fn();
      const retryHandler = vi.fn();
      el.addEventListener('PEER-CONNECTION-ERROR', errHandler);
      el.addEventListener('PEER-CONNECTION-RETRY', retryHandler);

      const promise = el.connectToPeer('target-peer');
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(10000);
      }
      await promise;

      expect(el.peer.connect).toHaveBeenCalledTimes(3);
      expect(conn.close).toHaveBeenCalled();
      expect(retryHandler).toHaveBeenCalledTimes(2);
      expect(errHandler).toHaveBeenCalledOnce();
      expect(errHandler.mock.calls[0][0].detail.type).toBe('connect-timeout');
      expect(el.innerHTML).toContain('timed out');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stands down when the peer is reported unavailable mid-connect', async () => {
    vi.useFakeTimers();
    try {
      const conn = { on: vi.fn(), close: vi.fn() };
      el.peer = { connect: vi.fn(() => conn) };
      const errHandler = vi.fn();
      el.addEventListener('PEER-CONNECTION-ERROR', errHandler);

      const promise = el.connectToPeer('ghost-peer');
      el.handleError(new Error('Could not connect to peer ghost-peer'));
      await vi.advanceTimersByTimeAsync(10000);
      await promise;

      // No retry: the peer-level error already reported the failure.
      expect(el.peer.connect).toHaveBeenCalledOnce();
      expect(conn.close).toHaveBeenCalledOnce();
      expect(errHandler).toHaveBeenCalledOnce();
      expect(el.innerHTML).toContain('Please check the link');
    } finally {
      vi.useRealTimers();
    }
  });
});
