import { FileQuestion } from 'lucide-react';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { UploadButton } from '@/components/upload-button';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary-50 text-primary-600">
        <FileQuestion className="size-5" aria-hidden />
      </span>
      <h1 className="mt-4 text-[20px] font-semibold text-slate-900">This page does not exist</h1>
      <p className="mt-1 text-[14px] text-slate-600">The link may be old or mistyped.</p>
      <div className="mt-5 flex justify-center gap-2">
        <UploadButton className={buttonClass('primary', 'lg')}>Extract a PDF</UploadButton>
        <Link href="/#samples" className={buttonClass('secondary', 'lg')}>
          Open a sample
        </Link>
      </div>
    </div>
  );
}
