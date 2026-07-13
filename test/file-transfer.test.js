import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CHUNK_SIZE,
  checksum,
  chunkBlob,
  FileSender,
  FileReceiver
} from '../src/file-transfer.js';

/**
 * Build a deterministic blob whose bytes are a simple pattern.
 */
function makeBlob(size, pattern = (i) => (i * 7 + 13) % 251) {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = pattern(i);
  return new Blob([bytes], { type: 'application/octet-stream' });
}

async function blobBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Wire a FileSender and FileReceiver together with an in-memory pipe.
 * `drop`/`corrupt` hold chunk indices to sabotage on their FIRST
 * transmission only, so retransmissions get through.
 */
function makePair(file, { drop = [], corrupt = [], ...options } = {}) {
  const droppedOnce = new Set();
  const corruptedOnce = new Set();
  const dropSet = new Set(drop);
  const corruptSet = new Set(corrupt);

  const received = { file: null };
  const receiverSend = vi.fn((msg) => queueMicrotask(() => sender.handleMessage(msg)));
  const receiver = new FileReceiver(receiverSend, {
    onProgress: options.onProgress,
    onError: options.onError,
    onComplete: (file) => { received.file = file; }
  });

  const sender = new FileSender((msg) => {
    queueMicrotask(() => {
      if (msg.type === 'file-chunk') {
        if (dropSet.has(msg.index) && !droppedOnce.has(msg.index)) {
          droppedOnce.add(msg.index);
          return;
        }
        if (corruptSet.has(msg.index) && !corruptedOnce.has(msg.index)) {
          corruptedOnce.add(msg.index);
          const data = Uint8Array.from(msg.data);
          data[0] ^= 0xff;
          msg = { ...msg, data };
        }
      }
      receiver.handleMessage(msg);
    });
  }, file, { windowSize: options.windowSize ?? 4 });

  return { sender, receiver, received, receiverSend };
}

describe('checksum', () => {
  it('is deterministic', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    expect(checksum(bytes)).toBe(checksum(bytes));
  });

  it('changes when a byte changes', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 5]);
    expect(checksum(a)).not.toBe(checksum(b));
  });

  it('streams across chunk boundaries', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5, 6]);
    const whole = new Uint8Array([1, 2, 3, 4, 5, 6]);
    expect(checksum(b, checksum(a))).toBe(checksum(whole));
  });
});

describe('chunkBlob', () => {
  it('splits an exact multiple of CHUNK_SIZE into equal chunks', async () => {
    const blob = makeBlob(CHUNK_SIZE * 3);
    const chunks = await chunkBlob(blob);
    expect(chunks).toHaveLength(3);
    for (const chunk of chunks) {
      expect(chunk.length).toBe(CHUNK_SIZE);
    }
  });

  it('handles a trailing partial chunk', async () => {
    const blob = makeBlob(CHUNK_SIZE * 2 + 100);
    const chunks = await chunkBlob(blob);
    expect(chunks).toHaveLength(3);
    expect(chunks[2].length).toBe(100);
  });

  it('returns no chunks for an empty blob', async () => {
    expect(await chunkBlob(makeBlob(0))).toEqual([]);
  });

  it('reassembles to the original bytes', async () => {
    const blob = makeBlob(CHUNK_SIZE * 2 + 777);
    const chunks = await chunkBlob(blob);
    const reassembled = new Blob(chunks);
    expect(await blobBytes(reassembled)).toEqual(await blobBytes(blob));
  });
});

describe('FileSender / FileReceiver', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('transfers a multi-chunk file intact', async () => {
    const blob = makeBlob(CHUNK_SIZE * 3 + 500);
    const { sender, received } = makePair(blob);

    await sender.start();

    expect(received.file).not.toBeNull();
    expect(received.file.size).toBe(blob.size);
    expect(await blobBytes(received.file.blob)).toEqual(await blobBytes(blob));
  });

  it('reports receive progress', async () => {
    const blob = makeBlob(CHUNK_SIZE * 3);
    const onProgress = vi.fn();
    const { sender, received } = makePair(blob, { onProgress });

    await sender.start();

    expect(received.file).not.toBeNull();
    expect(onProgress).toHaveBeenCalled();
    expect(onProgress.mock.calls.at(-1)[0]).toMatchObject({ received: 3, total: 3 });
  });

  it('retransmits dropped chunks after a file-missing request', async () => {
    const blob = makeBlob(CHUNK_SIZE * 6);
    const { sender, receiver, received, receiverSend } = makePair(blob, {
      drop: [1, 4]
    });

    await sender.start();

    const missingRequests = receiverSend.mock.calls
      .map(([msg]) => msg)
      .filter((msg) => msg.type === 'file-missing');
    expect(missingRequests).toHaveLength(1);
    expect(missingRequests[0].indices).toEqual([1, 4]);
    expect(await blobBytes(received.file.blob)).toEqual(await blobBytes(blob));
  });

  it('recovers from a corrupted chunk via per-chunk checksums', async () => {
    const blob = makeBlob(CHUNK_SIZE * 5);
    const { sender, received } = makePair(blob, { corrupt: [2] });

    await sender.start();

    expect(received.file).not.toBeNull();
    expect(await blobBytes(received.file.blob)).toEqual(await blobBytes(blob));
  });

  it('errors when the reassembled file checksum does not match the meta', () => {
    const onError = vi.fn();
    const onComplete = vi.fn();
    const receiver = new FileReceiver(vi.fn(), { onError, onComplete });
    const data = new Uint8Array([9, 9, 9]);

    receiver.handleMessage({
      type: 'file-meta',
      transferId: 'bad',
      name: 'bad.bin',
      mimeType: 'application/octet-stream',
      size: 3,
      totalChunks: 1,
      fileChecksum: checksum(data) + 1
    });
    receiver.handleMessage({
      type: 'file-chunk',
      transferId: 'bad',
      index: 0,
      checksum: checksum(data),
      data
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toContain('checksum mismatch');
  });

  it('errors when the transfer goes idle', () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const receiver = new FileReceiver(vi.fn(), { onError, idleTimeout: 1000 });

    receiver.handleMessage({
      type: 'file-meta',
      transferId: 'idle',
      name: 'idle.bin',
      mimeType: 'application/octet-stream',
      size: CHUNK_SIZE * 3,
      totalChunks: 3,
      fileChecksum: 123
    });

    vi.advanceTimersByTime(1000);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toContain('timed out');
  });

  it('transfers an empty file', async () => {
    const blob = makeBlob(0);
    const { sender, received } = makePair(blob);

    await sender.start();

    expect(received.file).not.toBeNull();
    expect(received.file.size).toBe(0);
  });
});
