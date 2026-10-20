import { describe, expect, it } from 'vitest';
import { categoryNoun, tabState } from './category-tab';

describe('tabState', () => {
  it('reports an empty category only when the document has none', () => {
    expect(tabState({ total: 0, shown: 0 })).toBe('none-in-document');
  });

  it('treats filters that hide every item (an area, a search) as filtered, not empty', () => {
    expect(tabState({ total: 34, shown: 0 })).toBe('filtered-empty');
  });

  it('shows the rows otherwise', () => {
    expect(tabState({ total: 34, shown: 3 })).toBe('rows');
  });
});

describe('categoryNoun', () => {
  it('lowercases a word but keeps an acronym', () => {
    expect(categoryNoun('Goals')).toBe('goals');
    expect(categoryNoun('Geographic areas')).toBe('geographic areas');
    expect(categoryNoun('BMPs')).toBe('BMPs');
  });
});
