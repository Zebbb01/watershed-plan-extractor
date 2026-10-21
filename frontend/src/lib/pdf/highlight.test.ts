import { describe, expect, it } from 'vitest';
import { pickHighlightRuns } from './highlight';

const run = (str: string, y: number) => ({ str, x: 0, y, w: 100, h: 10 });

describe('pickHighlightRuns', () => {
  it('marks the cells of a quoted table row', () => {
    const runs = [run('Cover Crop', 100), run('ac', 100), run('2500', 100), run('$55.86', 100), run('$139,650.00', 100)];
    expect(pickHighlightRuns(runs, ['Cover Crop ac 2500 $55.86 $139,650.00'])).toEqual(runs);
  });

  it('marks one long line that holds the whole quote', () => {
    const line = run('One of the goals of the watershed partnership was to develop and implement a solution-oriented, action plan. We have two primary objectives:', 200);
    expect(pickHighlightRuns([line], ['One of the goals of the watershed partnership was to develop and implement a solution-oriented, action plan.'])).toEqual([line]);
  });

  it('marks every line a quote wraps over', () => {
    const quote = 'the following actions will need to be taken to reduce sediment loads to streams';
    const first = run('As discussed above, the following actions will need to be taken', 300);
    const second = run('to reduce sediment loads to streams in the watershed.', 314);
    expect(pickHighlightRuns([first, second], [quote])).toEqual([first, second]);
  });

  it('leaves the same words elsewhere on the page unmarked', () => {
    const header = run('Broken Pumpkin Creek Watershed Plan', 20);
    const other = run('The Broken Pumpkin Creek watershed is located in Noxubee and Lowndes counties', 100);
    const target = run('a reduction in sediment of 77% to 97% is recommended in the Broken Pumpkin Creek watershed.', 400);
    const lone = run('2500', 500);
    const marked = pickHighlightRuns([header, other, target, lone], ['a reduction in sediment of 77% to 97% is recommended in the Broken Pumpkin Creek watershed']);
    expect(marked).toEqual([target]);
  });

  it('marks nothing without a quote, or when the quote is not on the page', () => {
    expect(pickHighlightRuns([run('Cover Crop', 100)], [])).toEqual([]);
    expect(pickHighlightRuns([run('Cover Crop', 100)], ['Fencing 20000 ft'])).toEqual([]);
  });
});
