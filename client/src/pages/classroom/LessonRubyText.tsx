import type { PinyinToken } from '@shared/api.interface';

export default function LessonRubyText({ tokens, className }: { tokens: PinyinToken[]; className?: string }) {
  const paragraphs: PinyinToken[][] = [];
  let paragraph: PinyinToken[] = [];
  for (const token of tokens) {
    if (/[\r\n]/u.test(token.text)) {
      if (paragraph.some(item => item.text.trim())) paragraphs.push(paragraph);
      paragraph = [];
    } else {
      paragraph.push(token);
    }
  }
  if (paragraph.some(item => item.text.trim())) paragraphs.push(paragraph);

  return <p className={`lesson-ruby-text${className ? ` ${className}` : ''}`}>
    {paragraphs.map((line, lineIndex) => <span className="lesson-ruby-paragraph" key={lineIndex}>
      {line.map((token, index) => token.pinyin
        ? <ruby key={index}>{token.text}<rt>{token.pinyin}</rt></ruby>
        : <span key={index}>{token.text}</span>)}
    </span>)}
  </p>;
}
