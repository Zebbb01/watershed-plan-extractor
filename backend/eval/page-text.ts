import { buildPageModel } from '../src/layout/page-model';
import { renderMarkup, stripMarkup } from '../src/layout/markup';
import type { RawPage } from '../src/schema';

/** Plain text of every page, as the verifier sees it (layout tags removed, nothing dropped). */
export function pageTexts(pages: RawPage[]): Map<number, string> {
  return new Map(pages.map((p) => [p.n, stripMarkup(renderMarkup(buildPageModel(p)))]));
}
