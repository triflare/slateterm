import { SlateTermExtension } from './01-core.js';

SlateTermExtension.prototype.formatTimestamp = function (ms) {
  const sec = Math.max(0, ms / 1000);
  let str;

  if (sec < 10) {
    str = sec.toFixed(4);
  } else if (sec < 100) {
    str = sec.toFixed(3);
  } else if (sec < 1000) {
    str = sec.toFixed(2);
  } else if (sec < 10000) {
    str = sec.toFixed(1);
  } else {
    str = Math.floor(sec).toString().padEnd(6, ' ');
  }

  return '[' + str.substring(0, 6) + ']';
};

SlateTermExtension.prototype.addLog = function (type, message, spriteName) {
  if (type === 'Error' || type === 'Complete') {
    if (this.activeLoaders.length > 0) {
      const loader = this.activeLoaders.pop();
      loader.isFinalizedLoading = true;
    }
  }

  const indent = this.activeLoaders.length * 2;

  const log = {
    id: Date.now() + Math.random(),
    type,
    message,
    spriteName,
    indent,
    realTime: Date.now(),
    isFinalizedLoading: false,
  };

  this.history.push(log);

  if (this.history.length > this.historyLimit) {
    const removed = this.history.shift();
    this.activeLoaders = this.activeLoaders.filter(l => l.id !== removed.id);
  }

  if (type === 'Loading') {
    this.activeLoaders.push(log);
  }

  this.scrollOffset = 0;
  this.recalculateVisualLines();
  this.draw();
};

SlateTermExtension.prototype.recalculateVisualLines = function () {
  if (!this.charWidth) return;

  const logicalLines = [];

  for (const log of this.history) {
    if (log.type === 'Verbose' && !this.verboseEnabled) continue;

    let segments = [];

    if (log.type === 'Headless') {
      const indentStr = ' '.repeat(log.indent);
      segments = this.parseFormatting(indentStr + log.message);
    } else {
      const style = this.typeStyles[log.type] || this.typeStyles['Info'];
      const indentStr = ' '.repeat(log.indent);
      const tsStr = this.formatTimestamp(log.realTime - this.startTime);

      let tagStr = style.tag;
      if (log.type === 'Loading') {
        tagStr = log.isFinalizedLoading ? '[ = ]' : this.animFrames[this.lastAnimFrame];
      }

      const spriteStr = log.spriteName.padEnd(11, ' ').substring(0, 11);

      segments.push({
        text: `${tsStr} ${tagStr}`,
        color: style.color,
        bg: null,
        bold: false,
        italic: false,
      });
      segments.push({
        text: ` ${spriteStr} : ${indentStr}`,
        color: style.color,
        bg: null,
        bold: false,
        italic: false,
      });
      segments.push(...this.parseFormatting(log.message));
    }

    logicalLines.push(segments);
  }

  this.visualLines = this.getWrappedLines(logicalLines);
};

SlateTermExtension.prototype.getWrappedLines = function (logicalLines) {
  const maxChars = Math.max(
    1,
    Math.floor((this.logicalWidth - this.padding * 2) / this.charWidth)
  );
  const wrappedLines = [];

  for (const logicalLine of logicalLines) {
    let currentLine = [];
    let currentLineLength = 0;

    for (const seg of logicalLine) {
      let text = seg.text;
      while (text.length > 0) {
        const spaceLeft = maxChars - currentLineLength;
        const chunk = text.substring(0, spaceLeft);

        if (chunk.length > 0) {
          currentLine.push({ ...seg, text: chunk });
          currentLineLength += chunk.length;
        }

        text = text.substring(spaceLeft);

        if (currentLineLength >= maxChars) {
          wrappedLines.push(currentLine);
          currentLine = [];
          currentLineLength = 0;
        }
      }
    }

    if (
      currentLine.length > 0 ||
      logicalLine.length === 0 ||
      (logicalLine.length === 1 && logicalLine[0].text === '')
    ) {
      wrappedLines.push(currentLine);
    }
  }

  return wrappedLines;
};
