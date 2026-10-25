import type { PinyinToken } from '@shared/api.interface';

export default function LessonRubyText({ tokens, className }: { tokens: PinyinToken[]; className?: string }) {
  return <p className={`lesson-ruby-text${className ? ` ${className}` : ''}`}>
    {tokens.map((token, index) => token.pinyin
      ? <ruby key={index}>{token.text}<rt>{token.pinyin}</rt></ruby>
      : <span key={index}>{token.text}</span>)}
  </p>;
}
