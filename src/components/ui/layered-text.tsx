import type { CSSProperties } from 'react';
import './layered-text.css';

/**
 * LayeredText — React port of the 21st.dev "layered-text" effect.
 *
 * The staggered hover reveal is driven entirely by CSS transitions (no GSAP
 * dependency). Each line stacks a "top" and "bottom" word inside an
 * overflow-clipped, isometrically-skewed row; hovering rolls every row up by
 * exactly one line height to reveal the next word.
 */

interface Line {
  top: string;
  bottom: string;
}

interface LayeredTextProps {
  lines?: Line[];
  fontSize?: string;
  fontSizeMd?: string;
  lineHeight?: number;
  lineHeightMd?: number;
  baseOffset?: number;
  baseOffsetMd?: number;
  className?: string;
}

const DEFAULT_LINES: Line[] = [
  { top: ' ', bottom: 'INFINITE' },
  { top: 'INFINITE', bottom: 'PROGRESS' },
  { top: 'PROGRESS', bottom: 'INNOVATION' },
  { top: 'INNOVATION', bottom: 'FUTURE' },
  { top: 'FUTURE', bottom: 'DREAMS' },
  { top: 'DREAMS', bottom: 'ACHIEVEMENT' },
  { top: 'ACHIEVEMENT', bottom: ' ' },
];

export function LayeredText({
  lines = DEFAULT_LINES,
  fontSize = '80px',
  fontSizeMd = '36px',
  lineHeight = 60,
  lineHeightMd = 35,
  baseOffset = 35,
  baseOffsetMd = 20,
  className,
}: LayeredTextProps) {
  const centerIndex = Math.floor(lines.length / 2);

  const rootStyle = {
    '--lt-font': fontSize,
    '--lt-font-md': fontSizeMd,
    '--lt-lh': `${lineHeight}px`,
    '--lt-lh-md': `${lineHeightMd}px`,
    '--lt-shift': `-${lineHeight}px`,
    '--lt-shift-md': `-${lineHeightMd}px`,
  } as CSSProperties;

  const lineStyle = (index: number): CSSProperties => {
    const even = index % 2 === 0;
    const skew = even
      ? 'skew(60deg, -30deg) scaleY(0.66667)'
      : 'skew(0deg, -30deg) scaleY(1.33333)';
    return {
      '--lt-skew': skew,
      '--lt-tx': `${(index - centerIndex) * baseOffset}px`,
      '--lt-tx-md': `${(index - centerIndex) * baseOffsetMd}px`,
    } as CSSProperties;
  };

  return (
    <div className={`layered-text${className ? ` ${className}` : ''}`} style={rootStyle}>
      <ul className="layered-text__list">
        {lines.map((line, index) => (
          <li key={index} className="layered-text__line" style={lineStyle(index)}>
            <div
              className="layered-text__col"
              style={{ '--lt-delay': `${index * 0.08}s` } as CSSProperties}
            >
              <p className="layered-text__word">{line.top}</p>
              <p className="layered-text__word">{line.bottom}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default LayeredText;
