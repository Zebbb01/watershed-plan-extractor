'use client';

import { Upload } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, type ReactNode } from 'react';
import { buttonClass } from '@/components/ui/button';
import { pendingFile } from '@/lib/pending-file';

/**
 * Opens the file picker straight away, from any page. The chosen PDF goes to the home page,
 * which checks it and runs it, so every upload follows one path.
 */
export function UploadButton({ children, className, onPicked }: { children?: ReactNode; className?: string; onPicked?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const path = usePathname();
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} className={className ?? buttonClass('primary', 'md')}>
        {children ?? (
          <>
            <Upload className="size-3.5" aria-hidden />
            Upload PDF
          </>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        aria-label="Choose a PDF to extract"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          onPicked?.();
          pendingFile.put(file);
          if (path !== '/') router.push('/#upload');
        }}
      />
    </>
  );
}
