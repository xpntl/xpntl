// packages/ui/src/primitives/TextArea.tsx
//
// Multi-line text input. Styled like Input but taller. Focus ring via
// focus-within on the wrapper label.

import type { TextareaHTMLAttributes, Ref } from 'react';

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  size?: 'sm' | 'md';
  ref?: Ref<HTMLTextAreaElement>;
}

export function TextArea({
  size = 'md',
  disabled,
  style,
  className,
  ref,
  ...rest
}: TextAreaProps) {
  const minH = size === 'sm' ? 'min-h-[60px]' : 'min-h-[80px]';
  return (
    <label
      className={`inline-flex w-full rounded-xp-sm bg-xp-surface border border-xp-input outline-none transition-[box-shadow,border-color] duration-[var(--xp-dur-fast)] ease-[var(--xp-ease)] focus-within:shadow-[var(--xp-focus-ring)] focus-within:border-[var(--xp-focus-border)] ${disabled ? 'opacity-50' : ''} ${className ?? ''}`}
      style={style}
    >
      <textarea
        ref={ref}
        disabled={disabled}
        className={`flex-1 border-0 outline-0 bg-transparent font-mono text-[12.5px] text-xp-ink tracking-[var(--xp-track-snug)] p-[10px] resize-y ${minH}`}
        {...rest}
      />
    </label>
  );
}
