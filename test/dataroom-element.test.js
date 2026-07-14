import { describe, it, expect } from 'vitest';
import { DataroomElement } from '../src/dataroom-element.js';

let tagIndex = 0;

/**
 * Registers a one-off custom element extending DataroomElement so we can
 * attach it to jsdom and remove it without side effects from SyncComponent's
 * PeerJS initialization.
 */
function registerTestElement() {
  const tag = `test-dataroom-${tagIndex++}`;
  class TestDataroomElement extends DataroomElement {}
  customElements.define(tag, TestDataroomElement);
  return tag;
}

describe('dataroom-element', () => {
  it('can be removed from the DOM without throwing', () => {
    const tag = registerTestElement();
    const el = document.createElement(tag);

    document.body.appendChild(el);
    expect(() => document.body.removeChild(el)).not.toThrow();
  });

  it('fires NODE-ADDED and NODE-CHANGED callbacks after connection', async () => {
    const tag = registerTestElement();
    const el = document.createElement(tag);
    const events = [];
    el.addEventListener('NODE-ADDED', (e) => events.push({ type: 'NODE-ADDED', node: e.detail.node }));
    el.addEventListener('NODE-CHANGED', (e) => events.push({ type: 'NODE-CHANGED', attribute: e.detail.attribute }));

    el.innerHTML = '<span data-test="1"></span>';
    document.body.appendChild(el);
    el.setAttribute('data-foo', 'bar');

    // MutationObserver callbacks are delivered asynchronously.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(events.some((ev) => ev.type === 'NODE-ADDED')).toBe(true);
    expect(events.some((ev) => ev.type === 'NODE-CHANGED' && ev.attribute === 'data-foo')).toBe(true);

    document.body.removeChild(el);
  });
});
