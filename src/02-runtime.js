import { SlateTermExtension } from './01-core.js';

SlateTermExtension.prototype.setupRuntimeHooks = function () {
  if (typeof Scratch !== 'undefined' && Scratch.vm) {
    Scratch.vm.runtime.on('PROJECT_START', () => {
      this.startTime = Date.now();
    });
  }
};

SlateTermExtension.prototype.setupCanvas = function () {
  this.canvas = document.createElement('canvas');
  this.ctx = this.canvas.getContext('2d');

  this.canvas.style.position = 'absolute';
  this.canvas.style.backgroundColor = 'transparent';
  this.canvas.style.zIndex = '400';
  this.canvas.style.display = 'none';
  this.canvas.style.cursor = 'text';
};

SlateTermExtension.prototype.setupInputHandlers = function () {
  this.canvas.addEventListener('wheel', e => {
    if (!this.visible) return;
    e.preventDefault();
    this.scrollOffset -= Math.sign(e.deltaY);
    this.draw();
  });

  document.addEventListener('keydown', e => {
    if (!this.visible || !this.isAsking) return;

    if (e.key === 'Backspace' || e.key === 'Enter' || e.key.length === 1) {
      e.preventDefault();
    }

    if (e.key === 'Enter') {
      const finalInput = this.currentInput;
      const displayInput = this.isPassword ? '*'.repeat(finalInput.length) : finalInput;
      const rawLine = this.rawPrompt + displayInput;

      this.addLog('Headless', rawLine, '');

      this.currentInput = '';
      this.isAsking = false;
      this.isPassword = false;
      this.promptSegments = [];
      this.rawPrompt = '';

      if (this.resolveAsk) {
        this.resolveAsk(finalInput);
        this.resolveAsk = null;
      }
    } else if (e.key === 'Backspace') {
      this.currentInput = this.currentInput.slice(0, -1);
    } else if (e.key.length === 1) {
      this.currentInput += e.key;
    }

    this.scrollOffset = 0;
    this.draw();
  });
};

SlateTermExtension.prototype.startRenderLoop = function () {
  this.renderLoop = () => {
    if (this.visible) {
      if (
        typeof Scratch !== 'undefined' &&
        Scratch.vm &&
        Scratch.vm.runtime &&
        Scratch.vm.runtime.renderer
      ) {
        const stageCanvas = Scratch.vm.runtime.renderer.canvas;
        const wrapper = stageCanvas.parentElement;

        if (this.canvas.parentElement !== wrapper) {
          wrapper.appendChild(this.canvas);
        }

        const rect = stageCanvas.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();

        const stageWidth = Scratch.vm.runtime.stageWidth || 480;
        const stageHeight = Scratch.vm.runtime.stageHeight || 360;

        const topOffset = rect.top - wrapperRect.top;
        const leftOffset = rect.left - wrapperRect.left;

        if (
          this.canvas.style.width !== `${rect.width}px` ||
          this.canvas.style.height !== `${rect.height}px` ||
          this.canvas.style.top !== `${topOffset}px` ||
          this.canvas.style.left !== `${leftOffset}px`
        ) {
          this.canvas.style.top = `${topOffset}px`;
          this.canvas.style.left = `${leftOffset}px`;
          this.canvas.style.width = `${rect.width}px`;
          this.canvas.style.height = `${rect.height}px`;
        }

        const dpr = window.devicePixelRatio || 1;
        const physicalWidth = Math.floor(rect.width * dpr);
        const physicalHeight = Math.floor(rect.height * dpr);

        if (
          this.logicalWidth !== stageWidth ||
          this.logicalHeight !== stageHeight ||
          this.canvas.width !== physicalWidth ||
          this.canvas.height !== physicalHeight
        ) {
          this.logicalWidth = stageWidth;
          this.logicalHeight = stageHeight;
          this.canvas.width = physicalWidth;
          this.canvas.height = physicalHeight;

          this.ctx.scale(physicalWidth / stageWidth, physicalHeight / stageHeight);
          this.ctx.font = `${this.fontSize}px "Consolas", "Courier New", Courier, monospace`;
          this.ctx.textBaseline = 'top';
          this.charWidth = this.ctx.measureText('M').width;

          this.recalculateVisualLines();
          this.draw();
        }
      }

      if (this.activeLoaders.length > 0) {
        const currentFrame = Math.floor(Date.now() / 200) % 5;
        if (currentFrame !== this.lastAnimFrame) {
          this.lastAnimFrame = currentFrame;
          this.recalculateVisualLines();
          this.draw();
        }
      }

      if (this.isAsking) {
        this.draw();
      }
    }
    requestAnimationFrame(this.renderLoop);
  };

  this.renderLoop();
};
