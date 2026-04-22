class SlateTermExtension {
  constructor() {
    this.visible = false;

    this.padding = 4;
    this.fontSize = 12;
    this.lineHeight = 16;
    this.charWidth = 0;
    this.opacity = 0.85;

    this.logicalWidth = 480;
    this.logicalHeight = 360;

    this.startTime = Date.now();
    this.history = [];
    this.visualLines = [];
    this.historyLimit = 1000;
    this.scrollOffset = 0;

    this.verboseEnabled = false;
    this.activeLoaders = [];
    this.lastAnimFrame = 0;
    this.animFrames = ['[=  ]', '[== ]', '[ ==]', '[  =]', '[   ]'];

    this.typeStyles = {
      Info: { tag: '( i )', color: '#00FFFF' },
      Hint: { tag: '[ i ]', color: '#55FF55' },
      Warning: { tag: '{ ! }', color: '#FFFF55' },
      Error: { tag: '{ + }', color: '#FF5555' },
      Complete: { tag: '{ X }', color: '#00FF00' },
      Verbose: { tag: '{ ~ }', color: '#AAAAAA' },
      Loading: { tag: '', color: '#FF55FF' },
    };

    this.isAsking = false;
    this.isPassword = false;
    this.currentInput = '';
    this.promptSegments = [];
    this.rawPrompt = '';
    this.resolveAsk = null;

    this.setupRuntimeHooks();
    this.setupCanvas();
    this.setupInputHandlers();
    this.startRenderLoop();
  }

  getInfo() {
    return {
      id: 'tfSlateTerm',
      name: Scratch.translate('SlateTerm'),
      color1: '#4bbbd1',
      color2: '#2d95a9',
      menuIconURI: mint.assets.get('icons/menu.svg'),
      blocks: [
        {
          opcode: 'manageTerminal',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('[ACTION] terminal'),
          arguments: {
            ACTION: {
              type: Scratch.ArgumentType.STRING,
              menu: 'terminalActionsMenu',
              defaultValue: 'show',
            },
          },
        },
        {
          opcode: 'setOpacity',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('set terminal opacity to [OPACITY] %'),
          arguments: {
            OPACITY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 85 },
          },
        },
        {
          opcode: 'setVerbose',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('set verbose logging [STATE]'),
          arguments: {
            STATE: {
              type: Scratch.ArgumentType.STRING,
              menu: 'onOffMenu',
              defaultValue: 'on',
            },
          },
        },
        {
          opcode: 'logMessage',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('log [MESSAGE] as [TYPE]'),
          arguments: {
            MESSAGE: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: 'System operational.',
            },
            TYPE: {
              type: Scratch.ArgumentType.STRING,
              menu: 'logTypesMenu',
              defaultValue: 'Info',
            },
          },
        },
        {
          opcode: 'replaceLastLine',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('replace last log message with [MESSAGE]'),
          arguments: {
            MESSAGE: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: 'Replacement text',
            },
          },
        },
        {
          opcode: 'askPrompt',
          blockType: Scratch.BlockType.REPORTER,
          text: Scratch.translate('ask [PROMPT] as [TYPE] and wait'),
          arguments: {
            PROMPT: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '@c #FFFF00:root@tw:~$ @c',
            },
            TYPE: {
              type: Scratch.ArgumentType.STRING,
              menu: 'askTypesMenu',
              defaultValue: 'text',
            },
          },
        },
        {
          opcode: 'getHistory',
          blockType: Scratch.BlockType.REPORTER,
          text: Scratch.translate('terminal history'),
        },
      ],
      menus: {
        terminalActionsMenu: {
          acceptReporters: false,
          items: ['show', 'hide', 'clear'],
        },
        logTypesMenu: {
          acceptReporters: true,
          items: [
            'Info',
            'Hint',
            'Warning',
            'Error',
            'Complete',
            'Verbose',
            'Loading',
            'Headless',
          ],
        },
        onOffMenu: {
          acceptReporters: true,
          items: ['on', 'off'],
        },
        askTypesMenu: {
          acceptReporters: false,
          items: ['text', 'password'],
        },
      },
    };
  }

  // --- Block Implementations ---

  manageTerminal(args) {
    const action = args.ACTION;
    if (action === 'show') {
      this.visible = true;
      this.canvas.style.display = 'block';
      this.draw();
    } else if (action === 'hide') {
      this.visible = false;
      this.canvas.style.display = 'none';
    } else if (action === 'clear') {
      this.history = [];
      this.visualLines = [];
      this.activeLoaders = [];
      this.scrollOffset = 0;
      this.draw();
    }
  }

  setOpacity(args) {
    let val = Number(args.OPACITY);
    if (isNaN(val)) val = 85;
    this.opacity = Math.max(0, Math.min(100, val)) / 100;
    this.draw();
  }

  setVerbose(args) {
    this.verboseEnabled = args.STATE === 'on';
    this.recalculateVisualLines();
    this.draw();
  }

  logMessage(args, util) {
    const msg = args.MESSAGE.toString();
    const type = args.TYPE.toString();
    const spriteName = util.target.isStage ? 'Stage' : util.target.sprite.name;
    this.addLog(type, msg, spriteName);
  }

  replaceLastLine(args) {
    if (this.history.length > 0) {
      const lastLog = this.history[this.history.length - 1];
      lastLog.message = args.MESSAGE.toString();
      this.recalculateVisualLines();
      this.draw();
    }
  }

  askPrompt(args) {
    return new Promise(resolve => {
      this.rawPrompt = args.PROMPT.toString();
      this.promptSegments = this.parseFormatting(this.rawPrompt);
      this.isAsking = true;
      this.isPassword = args.TYPE === 'password';
      this.currentInput = '';
      this.scrollOffset = 0;
      this.resolveAsk = resolve;
      this.draw();
    });
  }

  getHistory() {
    return this.history
      .map(log => {
        if (log.type === 'Headless') {
          return ' '.repeat(log.indent) + log.message;
        }

        const indentStr = ' '.repeat(log.indent);
        const tsStr = this.formatTimestamp(log.realTime - this.startTime);
        let tagStr = this.typeStyles[log.type] ? this.typeStyles[log.type].tag : '';

        if (log.type === 'Loading') {
          tagStr = log.isFinalizedLoading ? '[ = ]' : '[=  ]';
        }

        const spriteStr = log.spriteName.padEnd(11, ' ').substring(0, 11);

        return `${tsStr} ${tagStr} ${spriteStr} : ${indentStr}${log.message}`;
      })
      .join('\n');
  }
}

export { SlateTermExtension };
