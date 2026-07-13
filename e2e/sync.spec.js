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
  'PEER-MESSAGE',
  'PEER-CONNECTION-ERROR'
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

test('emits SERVER-CONNECTION-OPEN and shows waiting state', async ({ page }) => {
  await instrument(page);
  await page.goto('/');

  await waitForEvent(page, 'SERVER-CONNECTION-OPEN');

  const peerId = await page.getAttribute('sync-component', 'peer-id');
  expect(peerId).toBeTruthy();

  const peerLink = await page.getAttribute('sync-component', 'peer-link');
  expect(peerLink).toContain(`peer-id=${peerId}`);

  await expect(page.locator('sync-component')).toContainText('Waiting for peer');
});

test('two peers connect and exchange messages in both directions', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await instrument(pageA);
  await instrument(pageB);

  try {
    // Peer A: wait for its id from the signaling server
    await pageA.goto('/');
    await pageA.waitForFunction(() =>
      document.querySelector('sync-component')?.getAttribute('peer-id')
    );
    const peerIdA = await pageA.getAttribute('sync-component', 'peer-id');

    // Peer B: connect to A via the URL parameter
    await pageB.goto(`/?peer-id=${peerIdA}`);
    await expect(pageB.locator('sync-component')).toContainText(
      `Connecting to peer id: ${peerIdA}`
    );

    // Both sides should report PEER-CONNECTED
    await waitForEvent(pageA, 'PEER-CONNECTED');
    await waitForEvent(pageB, 'PEER-CONNECTED');
    await expect(pageA.locator('sync-component')).toContainText('connected to peer');

    // A -> B
    await pageA.evaluate(() =>
      document.querySelector('sync-component').sendMessage('hello from A')
    );
    await waitForEvent(pageB, 'PEER-MESSAGE');
    const msgB = await pageB.evaluate(
      () => window.__syncEvents.find((e) => e.name === 'PEER-MESSAGE').detail
    );
    expect(msgB).toEqual({ message: 'hello from A' });

    // B -> A
    await pageB.evaluate(() =>
      document.querySelector('sync-component').sendMessage('hello from B')
    );
    await waitForEvent(pageA, 'PEER-MESSAGE');
    const msgA = await pageA.evaluate(
      () => window.__syncEvents.find((e) => e.name === 'PEER-MESSAGE').detail
    );
    expect(msgA).toEqual({ message: 'hello from B' });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('emits PEER-CONNECTION-ERROR when connecting to an unknown peer', async ({ page }) => {
  await instrument(page);
  await page.goto('/?peer-id=peer-that-does-not-exist');

  await waitForEvent(page, 'PEER-CONNECTION-ERROR');

  await expect(page.locator('sync-component')).toContainText(
    'Could not connect to peer'
  );
});
