import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-400',
  ghost: 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
  danger: 'border border-negative-100 bg-white text-negative-700 hover:bg-negative-50',
  destructive: 'bg-negative-600 text-white hover:bg-negative-700 active:bg-negative-700',
};
const SIZES: Record<Size, string> = { sm: 'h-7 px-2.5 text-[13px]', md: 'h-8 px-3 text-[13px]' };

export const buttonClass = (variant: Variant = 'secondary', size: Size = 'md', extra?: string) =>
  cn(
    'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    extra,
  );

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ref,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; ref?: Ref<HTMLButtonElement> }) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...props} />;
}
