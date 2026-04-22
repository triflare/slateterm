/**
 * Unit tests for SlateTermExtension and its split module behavior.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installScratchMock } from './helpers/mock-scratch.js';
import { SlateTermExtension } from '../src/01-core.js';
import '../src/02-runtime.js';
import '../src/03-logging.js';
import '../src/04-rendering.js';

function installDomMock() {
  const originalDocument = globalThis.document;
  const originalRaf = globalThis.requestAnimationFrame;
  const listeners = new Map();

  const ctx = {
    scale: () => {},
    clearRect: () => {},
    fillRect: () => {},
    fillText: () => {},
    measureText: () => ({ width: 8 }),
  };

  globalThis.document = {
    createElement() {
      return {
        style: {},
        addEventListener(event, callback) {
          listeners.set(event, callback);
        },
        getContext() {
          return ctx;
        },
      };
    },
    addEventListener(event, callback) {
      listeners.set(event, callback);
    },
  };

  globalThis.requestAnimationFrame = () => 0;

  return {
    triggerKeydown(event) {
      const callback = listeners.get('keydown');
      if (callback) callback({ preventDefault: () => {}, ...event });
    },
    restore() {
      if (originalDocument === undefined) delete globalThis.document;
      else globalThis.document = originalDocument;
      if (originalRaf === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = originalRaf;
    },
  };
}

describe('SlateTermExtension', () => {
  let extension;
  let restoreScratch;
  let dom;

  before(() => {
    const scratch = installScratchMock();
    restoreScratch = scratch.restore;
    dom = installDomMock();
    extension = new SlateTermExtension();
    extension.draw = () => {};
  });

  after(() => {
    restoreScratch();
    dom.restore();
  });

  it('initializes with expected default state', () => {
    assert.equal(extension.visible, false);
    assert.equal(extension.opacity, 0.85);
    assert.equal(extension.history.length, 0);
    assert.equal(extension.historyLimit, 1000);
  });

  it('exposes the correct block opcodes in getInfo()', () => {
    const opcodes = extension.getInfo().blocks.map(block => block.opcode);
    assert.ok(opcodes.includes('manageTerminal'));
    assert.ok(opcodes.includes('setOpacity'));
    assert.ok(opcodes.includes('setVerbose'));
    assert.ok(opcodes.includes('logMessage'));
    assert.ok(opcodes.includes('replaceLastLine'));
    assert.ok(opcodes.includes('askPrompt'));
    assert.ok(opcodes.includes('getHistory'));
  });

  it('manageTerminal show/hide/clear modifies extension state', () => {
    extension.manageTerminal({ ACTION: 'show' });
    assert.equal(extension.visible, true);
    assert.equal(extension.canvas.style.display, 'block');

    extension.manageTerminal({ ACTION: 'hide' });
    assert.equal(extension.visible, false);
    assert.equal(extension.canvas.style.display, 'none');

    extension.history.push({
      type: 'Info',
      message: 'hello',
      spriteName: 'Stage',
      indent: 0,
      realTime: Date.now(),
      isFinalizedLoading: false,
    });
    extension.manageTerminal({ ACTION: 'clear' });
    assert.equal(extension.history.length, 0);
    assert.equal(extension.activeLoaders.length, 0);
  });

  it('setOpacity clamps values to a valid range', () => {
    extension.setOpacity({ OPACITY: '200' });
    assert.equal(extension.opacity, 1);

    extension.setOpacity({ OPACITY: '-100' });
    assert.equal(extension.opacity, 0);

    extension.setOpacity({ OPACITY: '50' });
    assert.equal(extension.opacity, 0.5);
  });

  it('setVerbose toggles verbose state and updates visual lines', () => {
    let called = false;
    extension.recalculateVisualLines = () => { called = true; };
    extension.setVerbose({ STATE: 'on' });
    assert.equal(extension.verboseEnabled, true);
    assert.equal(called, true);
  });

  it('logMessage records messages using the sprite name from util.target', () => {
    extension.history = [];
    extension.logMessage(
      { MESSAGE: 'test message', TYPE: 'Info' },
      { target: { isStage: false, sprite: { name: 'Player' } } }
    );

    const lastLog = extension.history[extension.history.length - 1];
    assert.equal(lastLog.message, 'test message');
    assert.equal(lastLog.spriteName, 'Player');
    assert.equal(lastLog.type, 'Info');
  });

  it('replaceLastLine updates the final log entry text', () => {
    extension.history = [{
      type: 'Info',
      message: 'first',
      spriteName: 'Stage',
      indent: 0,
      realTime: Date.now(),
      isFinalizedLoading: false,
    }];

    extension.replaceLastLine({ MESSAGE: 'updated' });
    assert.equal(extension.history[0].message, 'updated');
  });

  it('askPrompt enters prompt mode and resolves after Enter', async () => {
    extension.visible = true;
    const promptPromise = extension.askPrompt({ PROMPT: '> ', TYPE: 'text' });

    dom.triggerKeydown({ key: 'a' });
    dom.triggerKeydown({ key: 'Enter' });

    const result = await promptPromise;
    assert.equal(result, 'a');
    assert.equal(extension.isAsking, false);
    assert.ok(extension.history.some(log => log.type === 'Headless' && log.message.includes('> a')));
  });

  it('getHistory returns a formatted history string', () => {
    extension.history = [{
      type: 'Headless',
      message: 'hello world',
      indent: 2,
      realTime: Date.now(),
      spriteName: '',
      isFinalizedLoading: false,
    }];

    const history = extension.getHistory();
    assert.equal(history, '  hello world');
  });
});
