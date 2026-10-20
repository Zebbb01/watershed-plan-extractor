import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReportView } from '@/components/report/report-view';

export const metadata: Metadata = { title: 'Report' };

// The report is stored in this browser (or is a bundled sample), so it is loaded client-side.
export default async function Page({ params }: PageProps<'/report/[id]'>) {
  const { id } = await params;
  return (
    <Suspense>
      <ReportView id={decodeURIComponent(id)} />
    </Suspense>
  );
}
