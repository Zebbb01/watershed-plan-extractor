'use client';

import { FileUp } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { cn } from '@/lib/cn';
import { buttonClass } from './button';

/*
 * Drag-and-drop plus a Browse button, with the limits stated before anything is chosen.
 * The native file input stays underneath (hidden) so keyboards and screen readers work.
 */
export function Dropzone({
  onFile,
  disabled,
  error,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    disabled,
    noClick: true,
    onDrop: (accepted, rejected) => {
      const file = accepted[0] ?? rejected[0]?.file;
      if (file) onFile(file);
    },
  });

  return (
    <div>
      <div
        {...getRootProps({
          className: cn(
            'flex flex-col items-center justify-center gap-3 rounded-panel border-2 border-dashed px-6 py-10 text-center transition-colors sm:py-14',
            isDragActive ? 'border-primary-500 bg-primary-50' : 'border-slate-300 bg-white',
            disabled && 'opacity-60',
          ),
        })}
      >
        <input {...getInputProps({ 'aria-label': 'Choose a PDF file' })} />
        <span className="grid size-11 place-items-center rounded-panel bg-primary-50 text-primary-600">
          <FileUp className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-[15px] font-semibold text-slate-900">{isDragActive ? 'Drop the PDF to start' : 'Drop a watershed plan PDF here'}</p>
          <p className="mt-1 text-[13px] text-slate-500">PDF · up to 300 MB · text or scanned</p>
        </div>
        <button type="button" onClick={open} disabled={disabled} className={buttonClass('primary', 'md')}>
          Browse files
        </button>
      </div>
      <p role="alert" aria-live="assertive" className={cn('mt-2 min-h-5 text-[13px] text-negative-700', !error && 'invisible')}>
        {error ?? ''}
      </p>
    </div>
  );
}
