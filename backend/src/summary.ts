import type { ExtractedReport, UnitItems } from './schema';

/*
 * Every summary figure is counted here, in code, from verified items. The model never
 * computes a total, a rate or a sentence that states one.
 */

export function computeSummary(r: UnitItems): { summary: ExtractedReport['summary']; completionBasis: string } {
  const totalGoals = r.goals.filter((g) => g.kind === 'main').length;
  const totalBMPs = r.bmps.filter((b) => b.kind !== 'example').length;
  const total = r.implementation.length;
  const withStatus = r.implementation.filter((a) => a.status !== null).length;
  const completed = r.implementation.filter((a) => a.status === 'completed').length;

  if (total === 0) return { summary: { totalGoals, totalBMPs, completionRate: 0 }, completionBasis: 'No implementation activities found' };
  if (withStatus === 0) {
    return { summary: { totalGoals, totalBMPs, completionRate: 0 }, completionBasis: 'No completion status reported in this document' };
  }
  return {
    summary: { totalGoals, totalBMPs, completionRate: Math.round((completed / total) * 1000) / 1000 },
    completionBasis: `${completed} of ${total} activities reported completed`,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The one-line overview at the top of a report, filled from counts. */
export function overviewSentence(r: ExtractedReport, title: string | null): string {
  const primary = r.geographicAreas.filter((a) => a.role === 'primary').map((a) => a.name);
  const covering = primary.length ? `, covering ${primary.slice(0, 3).join(', ')}${primary.length > 3 ? ` and ${primary.length - 3} more` : ''}` : '';
  return (
    `${title ?? 'This plan'} sets ${plural(r.summary.totalGoals, 'goal')} and ${plural(r.summary.totalBMPs, 'BMP')}, ` +
    `with ${plural(r.implementation.length, 'implementation activity', 'implementation activities')}, ` +
    `${plural(r.monitoring.length, 'monitoring metric')} and ${plural(r.outreach.length, 'outreach activity', 'outreach activities')}${covering}.`
  );
}
