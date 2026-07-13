/*
 * file-transfer.js
 *
 * Splits large Blobs/Files into chunks small enough for a WebRTC data
 * channel and transfers them with simple error checking:
 *
 *  - every chunk carries an FNV-1a checksum; corrupt chunks are treated
 *    as missing
 *  - after the final window the receiver tells the sender exactly which
 *    chunk indices never arrived (`file-missing`) and the sender
 *    retransmits only those
 *  - the reassembled file is verified against the whole-file checksum
 *    from the `file-meta` message before it is delivered
 *
 * The module is transport-agnostic: both sides are constructed with a
 * `send(msg)` function, so it can be unit-tested with an in-memory pipe
 * and used over a PeerJS DataConnection in the browser.
 *
 * Protocol messages (all carry `transferId`):
 *   file-meta        { name, mimeType, size, totalChunks, fileChecksum }
 *   file-chunk       { index, checksum, data }
 *   file-window-end  { windowEnd }            sender: window flushed
 *   file-window-ack  { windowEnd }            receiver: window seen
 *   file-missing     { indices }              receiver: resend these
 *   file-complete    {}                       receiver: file verified
 */

// 16 KiB stays safely under the practical per-message limit of browser
// WebRTC data channels, including serialization overhead.
export const CHUNK_SIZE = 16 * 1024;
export const WINDOW_SIZE = 16;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a 32-bit checksum. Pass the previous return value as `hash` to
 * continue hashing across chunk boundaries.
 * @param {Uint8Array} bytes
 * @param {number} [hash]
 * @return {number}
 */
export const checksum = (bytes, hash = FNV_OFFSET) => {
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
};

/**
 * Slice a Blob into Uint8Array chunks.
 * @param {Blob} blob
 * @param {number} [chunkSize]
 * @return {Promise<Uint8Array[]>}
 */
export const chunkBlob = async (blob, chunkSize = CHUNK_SIZE) => {
  const chunks = [];
  for (let offset = 0; offset < blob.size; offset += chunkSize) {
    const buffer = await blob.slice(offset, offset + chunkSize).arrayBuffer();
    chunks.push(new Uint8Array(buffer));
  }
  return chunks;
};

const generateTransferId = () =>
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends a Blob/File in checksummed chunks, window by window, and
 * retransmits whatever the receiver reports missing.
 */
export class FileSender {
  /**
   * @param {(msg: Object) => void} send transport
   * @param {Blob} file the file to send
   * @param {Object} [options]
   * @param {number} [options.windowSize] chunks per window
   * @param {number} [options.timeout] ms to wait for acks/completion
   * @param {(progress: {sent: number, total: number}) => void} [options.onProgress]
   * @param {() => number} [options.getBufferedAmount] data channel buffer
   *   level; sending pauses while it exceeds bufferThreshold
   * @param {number} [options.bufferThreshold]
   */
  constructor(send, file, options = {}) {
    this.send = send;
    this.file = file;
    this.windowSize = options.windowSize ?? WINDOW_SIZE;
    this.timeout = options.timeout ?? 30000;
    this.onProgress = options.onProgress ?? (() => {});
    this.getBufferedAmount = options.getBufferedAmount ?? null;
    this.bufferThreshold = options.bufferThreshold ?? 1024 * 1024;
    this.transferId = generateTransferId();
    this.chunks = [];
    this.waiters = [];
    this.controlQueue = [];
    this.controlWaiter = null;
  }

  /**
   * Run the transfer. Resolves once the receiver confirms the reassembled
   * file checksum; rejects on timeout.
   * @return {Promise<void>}
   */
  async start() {
    this.chunks = await chunkBlob(this.file);
    let fileChecksum = FNV_OFFSET;
    for (const chunk of this.chunks) {
      fileChecksum = checksum(chunk, fileChecksum);
    }
    this.send({
      type: 'file-meta',
      transferId: this.transferId,
      name: this.file.name || 'file',
      mimeType: this.file.type || 'application/octet-stream',
      size: this.file.size,
      totalChunks: this.chunks.length,
      fileChecksum
    });
    await this.sendWindows(0, this.chunks.length);
    await this.waitForComplete();
  }

  /**
   * Route an incoming protocol message (acks, missing lists, completion).
   * @param {Object} msg
   */
  handleMessage(msg) {
    if (msg?.transferId !== this.transferId) return;
    if (msg.type === 'file-complete' || msg.type === 'file-missing') {
      if (this.controlWaiter) {
        const waiter = this.controlWaiter;
        this.controlWaiter = null;
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      } else {
        // Can arrive before waitForComplete() registers its waiter.
        this.controlQueue.push(msg);
      }
      return;
    }
    for (const waiter of [...this.waiters]) {
      if (waiter.type === msg.type && waiter.predicate(msg)) {
        clearTimeout(waiter.timer);
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(msg);
      }
    }
  }

  async sendWindows(start, end) {
    let index = start;
    while (index < end) {
      const windowEnd = Math.min(index + this.windowSize, end);
      const ack = this.waitFor('file-window-ack', (m) => m.windowEnd === windowEnd);
      for (let i = index; i < windowEnd; i++) {
        await this.sendChunk(i);
      }
      this.send({ type: 'file-window-end', transferId: this.transferId, windowEnd });
      await ack;
      index = windowEnd;
      this.onProgress({ sent: index, total: this.chunks.length });
    }
  }

  async sendChunk(index) {
    if (this.getBufferedAmount) {
      while (this.getBufferedAmount() > this.bufferThreshold) {
        await sleep(10);
      }
    }
    const data = this.chunks[index];
    this.send({
      type: 'file-chunk',
      transferId: this.transferId,
      index,
      checksum: checksum(data),
      data
    });
  }

  async waitForComplete() {
    for (;;) {
      const msg = await this.waitForControl();
      if (msg.type === 'file-complete') return;
      await this.resend(msg.indices);
    }
  }

  async resend(indices) {
    for (const index of indices) {
      await this.sendChunk(index);
    }
  }

  waitForControl() {
    const queued = this.controlQueue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.controlWaiter = null;
        reject(new Error('Timed out waiting for file transfer to complete'));
      }, this.timeout);
      this.controlWaiter = { resolve, timer };
    });
  }

  waitFor(type, predicate) {
    return new Promise((resolve, reject) => {
      const waiter = { type, predicate, resolve };
      waiter.timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(new Error(`Timed out waiting for ${type}`));
      }, this.timeout);
      this.waiters.push(waiter);
    });
  }
}

/**
 * Receives chunked transfers: verifies per-chunk checksums, asks for
 * missing chunks, and verifies the reassembled file before delivering it
 * via onComplete.
 */
export class FileReceiver {
  /**
   * @param {(msg: Object) => void} send transport (for acks/resend requests)
   * @param {Object} [options]
   * @param {number} [options.idleTimeout] ms without progress before onError
   * @param {(progress: {received: number, total: number, transferId: string}) => void} [options.onProgress]
   * @param {(file: {blob: Blob, name: string, mimeType: string, size: number, transferId: string}) => void} [options.onComplete]
   * @param {(error: Error) => void} [options.onError]
   */
  constructor(send, options = {}) {
    this.send = send;
    this.idleTimeout = options.idleTimeout ?? 30000;
    this.onProgress = options.onProgress ?? (() => {});
    this.onComplete = options.onComplete ?? (() => {});
    this.onError = options.onError ?? (() => {});
    this.transfers = new Map();
  }

  /**
   * Route an incoming protocol message (meta, chunks, window markers).
   * @param {Object} msg
   */
  handleMessage(msg) {
    if (!msg?.type) return;
    switch (msg.type) {
    case 'file-meta':
      this.handleMeta(msg);
      break;
    case 'file-chunk':
      this.handleChunk(msg);
      break;
    case 'file-window-end':
      this.handleWindowEnd(msg);
      break;
    }
  }

  handleMeta(msg) {
    const state = {
      transferId: msg.transferId,
      name: msg.name,
      mimeType: msg.mimeType,
      size: msg.size,
      totalChunks: msg.totalChunks,
      fileChecksum: msg.fileChecksum,
      chunks: new Array(msg.totalChunks).fill(null),
      received: 0,
      done: false,
      idleTimer: null
    };
    this.transfers.set(msg.transferId, state);
    this.resetIdleTimer(state);
    if (msg.totalChunks === 0) {
      this.finish(state);
    }
  }

  handleChunk(msg) {
    const state = this.transfers.get(msg.transferId);
    if (!state || state.done) return;
    if (!Number.isInteger(msg.index) || msg.index < 0 || msg.index >= state.totalChunks) return;
    const data = msg.data instanceof Uint8Array ? msg.data : new Uint8Array(msg.data);
    if (checksum(data) !== msg.checksum) {
      // Corrupt chunk: treat as missing, it will be re-requested.
      return;
    }
    if (state.chunks[msg.index] === null) {
      state.chunks[msg.index] = data;
      state.received++;
      this.onProgress({
        received: state.received,
        total: state.totalChunks,
        transferId: state.transferId
      });
    }
    this.resetIdleTimer(state);
    if (state.received === state.totalChunks) {
      this.finish(state);
    }
  }

  handleWindowEnd(msg) {
    const state = this.transfers.get(msg.transferId);
    if (!state) return;
    // Always ack, even when the transfer already completed: the sender
    // waits for this before checking for completion.
    this.send({ type: 'file-window-ack', transferId: msg.transferId, windowEnd: msg.windowEnd });
    if (!state.done && msg.windowEnd >= state.totalChunks && state.received < state.totalChunks) {
      const indices = [];
      for (let i = 0; i < state.totalChunks; i++) {
        if (state.chunks[i] === null) indices.push(i);
      }
      this.send({ type: 'file-missing', transferId: state.transferId, indices });
    }
  }

  finish(state) {
    state.done = true;
    clearTimeout(state.idleTimer);
    let hash = FNV_OFFSET;
    for (const chunk of state.chunks) {
      hash = checksum(chunk, hash);
    }
    if (hash !== state.fileChecksum) {
      this.onError(new Error(`File checksum mismatch for "${state.name}"`));
      return;
    }
    this.send({ type: 'file-complete', transferId: state.transferId });
    const blob = new Blob(state.chunks, { type: state.mimeType });
    this.onComplete({
      blob,
      name: state.name,
      mimeType: state.mimeType,
      size: state.size,
      transferId: state.transferId
    });
  }

  resetIdleTimer(state) {
    clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => {
      if (!state.done) {
        state.done = true;
        this.onError(new Error(`File transfer "${state.name}" timed out`));
      }
    }, this.idleTimeout);
  }
}
