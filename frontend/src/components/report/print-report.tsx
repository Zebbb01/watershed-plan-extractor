import { CATEGORY_KEYS, categoryByKey, overviewSentence, type AnyItem, type ExtractionResult } from '@app/backend';

/** The printable report: shown only when printing (or saving as PDF from the print dialog). */
export function PrintReport({ result }: { result: ExtractionResult }) {
  const { report, document: doc } = result;
  return (
    <div className="print-only">
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>{doc.title ?? doc.fileName}</h1>
      <p style={{ margin: '4px 0 12px' }}>{overviewSentence(report, doc.title)}</p>
      <p style={{ marginBottom: 12, color: '#475569' }}>
        {doc.pages} pages · completion{' '}
        {result.quality.completionBasis.startsWith('No ')
          ? 'not reported'
          : `${Math.round(report.summary.completionRate * 100)}% (${result.quality.completionBasis})`}{' '}
        · every item verified against its page
      </p>
      {CATEGORY_KEYS.map((k) => {
        const def = categoryByKey(k);
        const items = report[k] as AnyItem[];
        if (!items.length) return null;
        return (
          <section key={k} style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              {def.label} ({items.length})
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {def.columns.map((c) => (
                    <th key={c.key} style={{ textAlign: c.align, borderBottom: '1px solid #cbd5e1', padding: '3px 6px' }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    {def.columns.map((c) => (
                      <td key={c.key} style={{ textAlign: c.align, borderBottom: '1px solid #e2e8f0', padding: '3px 6px', verticalAlign: 'top' }}>
                        {c.get(i) ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
