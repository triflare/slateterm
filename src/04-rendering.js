import { SlateTermExtension } from './01-core.js';

SlateTermExtension.prototype.parseFormatting = function (text) {
  const segments = [];
  const regex = /@([chbi])(?:([^:]*))?:(.*?)\s*@\1/g;
  let lastIndex = 0;
  const defaultStyle = { color: '#FFFFFF', bg: null, bold: false, italic: false };
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.substring(lastIndex, match.index), ...defaultStyle });
    }

    const tagType = match[1];
    const arg = match[2];
    const content = match[3];

    const seg = { text: content, ...defaultStyle };

    if (tagType === 'c' && arg) seg.color = arg.trim();
    else if (tagType === 'h' && arg) seg.bg = arg.trim();
    else if (tagType === 'b') seg.bold = true;
    else if (tagType === 'i') seg.italic = true;

    segments.push(seg);
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.substring(lastIndex), ...defaultStyle });
  }

  return segments.length > 0 ? segments : [{ text: text, ...defaultStyle }];
};

SlateTermExtension.prototype.draw = function () {
  if (!this.ctx || !this.visible) return;

  this.ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);
  this.ctx.fillStyle = `rgba(0, 0, 0, ${this.opacity})`;
  this.ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);

  this.ctx.textBaseline = 'top';

  const displayInput = this.isPassword
    ? '*'.repeat(this.currentInput.length)
    : this.currentInput;
  const promptWrapped = this.isAsking
    ? this.getWrappedLines([
        [
          ...this.promptSegments,
          {
            text: displayInput,
            color: '#FFFFFF',
            bg: null,
            bold: false,
            italic: false,
          },
        ],
      ])
    : [];

  const totalVisualLines = this.visualLines.concat(promptWrapped);

  const maxVisibleLines = Math.floor(
    (this.logicalHeight - this.padding * 2) / this.lineHeight
  );
  const activeLinesCount = totalVisualLines.length;

  const maxScroll = Math.max(0, activeLinesCount - maxVisibleLines);
  this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));

  let startIndex = 0;
  if (activeLinesCount > maxVisibleLines) {
    startIndex = activeLinesCount - maxVisibleLines - this.scrollOffset;
  }

  const endIndex = startIndex + maxVisibleLines;
  let y = this.padding;

  for (let i = startIndex; i < endIndex && i < totalVisualLines.length; i++) {
    let x = this.padding;
    const line = totalVisualLines[i];

    for (const seg of line) {
      const segWidth = seg.text.length * this.charWidth;

      if (seg.bg) {
        this.ctx.fillStyle = seg.bg;
        this.ctx.fillRect(x, y, segWidth, this.lineHeight);
      }

      let fontStyle = '';
      if (seg.italic) fontStyle += 'italic ';
      if (seg.bold) fontStyle += 'bold ';
      this.ctx.font = `${fontStyle}${this.fontSize}px "Consolas", "Courier New", Courier, monospace`;

      this.ctx.fillStyle = seg.color;
      this.ctx.fillText(seg.text, x, y);

      x += segWidth;
    }

    this.ctx.font = `${this.fontSize}px "Consolas", "Courier New", Courier, monospace`;

    if (this.isAsking && i === totalVisualLines.length - 1) {
      if (Date.now() % 1000 < 500) {
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillText('_', x, y);
      }
    }

    y += this.lineHeight;
  }
};
