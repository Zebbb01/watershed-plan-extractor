'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Dialog, Popover } from 'radix-ui';
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/cn';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  group?: string;
  hint?: string;
  count?: number;
}

/*
 * A select built from a popover and a listbox, styled like the rest of the app instead of the
 * browser's native control. The trigger shows "Label · Value" so it answers "what am I looking
 * at?" without opening. Keyboard: arrows, Home/End, Enter/Space, Esc, and type-ahead.
 * On narrow screens the list opens as a bottom sheet.
 */
export function PopoverSelect<T extends string>({
  label,
  icon,
  value,
  options,
  onChange,
  align = 'start',
  className,
}: {
  label: string;
  icon?: ReactNode;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  align?: 'start' | 'end';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const narrow = useMediaQuery('(max-width: 639px)');
  const selected = options.find((o) => o.value === value);
  const trigger = (
    <button
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      className={cn(
        'inline-flex h-8 max-w-full items-center gap-1.5 rounded-control border border-slate-300 bg-white px-2.5 text-[13px] text-slate-800',
        'hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
        className,
      )}
    >
      {icon}
      <span className="text-slate-500">{label}</span>
      <span aria-hidden className="text-slate-300">
        ·
      </span>
      <span className="truncate font-medium">{selected?.label ?? 'None'}</span>
      <ChevronDown className="ml-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden />
    </button>
  );
  const pick = (v: T) => {
    onChange(v);
    setOpen(false);
  };
  const list = <OptionList label={label} value={value} options={options} onPick={pick} />;

  if (narrow) {
    return (
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/30" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-xl bg-white p-2 pb-6 shadow-overlay">
            <Dialog.Title className="px-3 pb-2 pt-3 text-[13px] font-semibold text-slate-900">{label}</Dialog.Title>
            <Dialog.Description className="sr-only">Choose one option</Dialog.Description>
            {list}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={4}
          collisionPadding={12}
          className="z-50 max-h-80 min-w-56 overflow-y-auto rounded-panel border border-slate-200 bg-white p-1 shadow-overlay"
        >
          {list}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function OptionList<T extends string>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onPick: (v: T) => void;
}) {
  const id = useId();
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const typed = useRef({ text: '', at: 0 });
  const groups = useMemo(() => {
    const out: { group?: string; items: { option: SelectOption<T>; index: number }[] }[] = [];
    options.forEach((option, index) => {
      const last = out[out.length - 1];
      if (last && last.group === option.group) last.items.push({ option, index });
      else out.push({ group: option.group, items: [{ option, index }] });
    });
    return out;
  }, [options]);

  const move = (to: number) => {
    const next = (to + options.length) % options.length;
    setActive(next);
    document.getElementById(`${id}-${next}`)?.scrollIntoView({ block: 'nearest' });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'ArrowDown') move(active + 1);
    else if (e.key === 'ArrowUp') move(active - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(options.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') onPick(options[active].value);
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const now = Date.now();
      const text = (now - typed.current.at < 600 ? typed.current.text : '') + e.key.toLowerCase();
      typed.current = { text, at: now };
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(text));
      if (hit >= 0) move(hit);
    } else return;
    e.preventDefault();
  };

  return (
    <ul
      role="listbox"
      aria-label={label}
      tabIndex={0}
      autoFocus
      aria-activedescendant={`${id}-${active}`}
      onKeyDown={onKeyDown}
      className="outline-none"
    >
      {groups.map((g, gi) => (
        <li key={gi} role="presentation">
          {g.group && (
            <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.group}</div>
          )}
          <ul role="presentation">
            {g.items.map(({ option, index }) => (
              <li
                key={option.value}
                id={`${id}-${index}`}
                role="option"
                aria-selected={option.value === value}
                onClick={() => onPick(option.value)}
                onMouseMove={() => setActive(index)}
                className={cn(
                  'flex min-h-8 cursor-pointer items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-[13px] text-slate-800',
                  index === active && 'bg-slate-100',
                )}
              >
                <Check className={cn('size-3.5 shrink-0 text-primary-600', option.value !== value && 'invisible')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  {option.hint && <span className="block text-[12px] text-slate-500">{option.hint}</span>}
                </span>
                {option.count !== undefined && <span className="tabular text-[12px] text-slate-400">{option.count}</span>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
