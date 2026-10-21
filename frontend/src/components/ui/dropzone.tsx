'use client';

import { CircleAlert, FileUp, Info, Loader2 } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { cn } from '@/lib/cn';
import { buttonClass } from './button';

/*
 * Drag-and-drop plus a Browse button, with the limits stated before anything is chosen.
 * Four states: waiting, a file over it, opening a file, and a file that cannot be used (with
 * what to do instead). The native file input stays underneath so keyboards and screen
 * readers work.
 */
export function Dropzone({
  onFile,
  disabled,
  error,
  notice,
  busy,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
  error?: string | null;
  /** neutral news, such as a run the user stopped */
  notice?: string | null;
  /** name of the file being opened */
  busy?: string | null;
}) {
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    disabled: disabled || Boolean(busy),
    noClick: true,
    onDrop: (accepted, rejected) => {
      const file = accepted[0] ?? rejected[0]?.file;
      if (file) onFile(file);
    },
  });

  return (
    <div className="rounded-card bg-white p-2 shadow-card ring-1 ring-slate-200/70">
      <div
        {...getRootProps({
          className: cn(
            'relative flex min-h-64 flex-col items-center justify-center gap-4 rounded-[10px] border-2 border-dashed px-6 py-9 text-center transition-colors',
            isDragActive ? 'border-primary-500 bg-primary-50' : 'border-slate-300 bg-slate-50/60',
            disabled && 'opacity-60',
          ),
        })}
      >
        <input {...getInputProps({ 'aria-label': 'Choose a PDF file' })} />
        {busy ? (
          <div role="status" className="flex flex-col items-center gap-3">
            <Loader2 className="size-8 text-primary-600 motion-safe:animate-spin" aria-hidden />
            <p className="text-[15px] font-semibold text-slate-900">Opening {busy}</p>
            <p className="text-[13px] text-slate-500">Reading pages in your browser…</p>
          </div>
        ) : (
          <>
            <span
              className={cn(
                'grid size-14 place-items-center rounded-full text-primary-600 transition-transform',
                isDragActive ? 'scale-110 bg-primary-100' : 'bg-primary-50',
              )}
            >
              <FileUp className="size-6" aria-hidden />
            </span>
            <div>
              <p className="text-[16px] font-semibold text-slate-900">{isDragActive ? 'Release to upload' : 'Drop your watershed plan PDF'}</p>
              <p className="mt-1 text-[13px] text-slate-500">PDF · up to 300 MB · text or scanned</p>
            </div>
            <button type="button" onClick={open} disabled={disabled} className={buttonClass('primary', 'lg')}>
              Browse files
            </button>
          </>
        )}
      </div>
      {notice && !error && (
        <p role="status" className="mt-2 flex items-start gap-2 rounded-panel bg-slate-100 px-3 py-2.5 text-[13px] text-slate-700">
          <Info className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 flex items-start gap-2 rounded-panel bg-negative-50 px-3 py-2.5 text-[13px] text-negative-700">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={open} className="shrink-0 font-semibold underline-offset-2 hover:underline">
            Choose another file
          </button>
        </p>
      )}
    </div>
  );
}
