import { test, expect } from '@playwright/test';

// PeerJS options pointing at the local peerjs-server (see e2e/peer-server.mjs).
const PEER_CONFIG = {
  host: 'localhost',
  port: 9000,
  path: '/peerjs',
  secure: false
};

const EVENT_NAMES = [
  'SERVER-CONNECTION-OPEN',
  'PEER-CONNECTED',
  'FILE-TRANSFER-PROGRESS',
  'FILE-TRANSFER-COMPLETE',
  'FILE-TRANSFER-ERROR',
  'FILE-RECEIVED'
];

/**
 * Adds init scripts to a page so that:
 *  - the component connects to the local peerjs-server
 *  - all dtrm events are collected into `window.__syncEvents`
 */
async function instrument(page) {
  await page.addInitScript((config) => {
    window.SYNC_COMPONENT_PEER_CONFIG = config;
  }, PEER_CONFIG);

  await page.addInitScript((eventNames) => {
    window.__syncEvents = [];
    document.addEventListener('DOMContentLoaded', () => {
      const el = document.querySelector('sync-component');
      for (const name of eventNames) {
        el.addEventListener(name, (e) => {
          window.__syncEvents.push({ name, detail: e.detail });
        });
      }
    });
  }, EVENT_NAMES);
}

function waitForEvent(page, name) {
  return page.waitForFunction(
    (eventName) => window.__syncEvents?.some((e) => e.name === eventName),
    name
  );
}

/**
 * Connect two browser pages over the local peerjs-server.
 * Returns both contexts (caller must close them) and pages.
 */
async function connectPair(browser) {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await instrument(pageA);
  await instrument(pageB);

  await pageA.goto('/');
  await pageA.waitForFunction(() =>
    document.querySelector('sync-component')?.getAttribute('peer-id')
  );
  const peerIdA = await pageA.getAttribute('sync-component', 'peer-id');

  await pageB.goto(`/?peer-id=${peerIdA}`);
  await waitForEvent(pageA, 'PEER-CONNECTED');
  await waitForEvent(pageB, 'PEER-CONNECTED');

  return { contextA, contextB, pageA, pageB };
}

/**
 * On the receiving page, arm a promise that resolves with the size,
 * name and FNV-1a checksum of the next received file.
 */
async function armReceiver(page) {
  await page.evaluate(() => {
    window.__fileReceived = new Promise((resolve, reject) => {
      const el = document.querySelector('sync-component');
      el.addEventListener('FILE-RECEIVED', async (e) => {
        const bytes = new Uint8Array(await e.detail.blob.arrayBuffer());
        const { checksum } = await import('/src/file-transfer.js');
        resolve({
          name: e.detail.name,
          size: e.detail.size,
          checksum: checksum(bytes)
        });
      });
      el.addEventListener('FILE-TRANSFER-ERROR', (e) =>
        reject(new Error(e.detail.error))
      );
    });
  });
}

/**
 * On the sending page, build a deterministic file of `size` bytes and
 * send it. Resolves with the expected checksum once the receiver has
 * confirmed the transfer.
 */
async function sendGeneratedFile(page, size, name) {
  return page.evaluate(
    async ({ size, name }) => {
      const bytes = new Uint8Array(size);
      for (let i = 0; i < size; i++) bytes[i] = (i * 7 + 13) % 251;
      const file = new File([bytes], name, { type: 'application/octet-stream' });
      const { checksum } = await import('/src/file-transfer.js');
      const expectedChecksum = checksum(bytes);

      const el = document.querySelector('sync-component');
      await new Promise((resolve, reject) => {
        el.addEventListener('FILE-TRANSFER-COMPLETE', () => resolve());
        el.addEventListener('FILE-TRANSFER-ERROR', (e) =>
          reject(new Error(e.detail.error))
        );
        el.sendFile(file).catch(reject);
      });
      return { expectedChecksum };
    },
    { size, name }
  );
}

test('transfers a multi-chunk file between two browsers', async ({ browser }) => {
  const { contextA, contextB, pageA, pageB } = await connectPair(browser);
  try {
    await armReceiver(pageB);
    const { expectedChecksum } = await sendGeneratedFile(pageA, 512 * 1024, 'data.bin');

    const received = await pageB.evaluate(() => window.__fileReceived);
    expect(received.name).toBe('data.bin');
    expect(received.size).toBe(512 * 1024);
    expect(received.checksum).toBe(expectedChecksum);

    // Both sides should have reported progress.
    await waitForEvent(pageA, 'FILE-TRANSFER-PROGRESS');
    await waitForEvent(pageB, 'FILE-TRANSFER-PROGRESS');
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('sends a file chosen in the file input and shows a download link', async ({
  browser
}) => {
  const { contextA, contextB, pageA, pageB } = await connectPair(browser);
  try {
    // 100 KB of deterministic content: large enough to span several chunks.
    const size = 100 * 1024;
    const buffer = Buffer.alloc(size);
    for (let i = 0; i < size; i++) buffer[i] = (i * 3 + 7) % 253;

    await armReceiver(pageB);

    const expectedChecksum = await pageA.evaluate(async (bytes) => {
      const { checksum } = await import('/src/file-transfer.js');
      return checksum(new Uint8Array(bytes));
    }, Array.from(buffer));

    await pageA.setInputFiles('sync-component .file-input', {
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer
    });
    await pageA.click('sync-component .file-send-form button[type="submit"]');

    const received = await pageB.evaluate(() => window.__fileReceived);
    expect(received.name).toBe('notes.txt');
    expect(received.size).toBe(size);
    expect(received.checksum).toBe(expectedChecksum);

    const downloadLink = pageB.locator('sync-component .file-download a');
    await expect(downloadLink).toHaveText(`Download notes.txt (${size} bytes)`);
    await expect(downloadLink).toHaveAttribute('download', 'notes.txt');
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('transfers a 5 MB file without flooding the data channel', async ({
  browser
}) => {
  test.setTimeout(90000);
  const { contextA, contextB, pageA, pageB } = await connectPair(browser);
  try {
    await armReceiver(pageB);
    const { expectedChecksum } = await sendGeneratedFile(pageA, 5 * 1024 * 1024, 'big.bin');

    const received = await pageB.evaluate(() => window.__fileReceived);
    expect(received.size).toBe(5 * 1024 * 1024);
    expect(received.checksum).toBe(expectedChecksum);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
