import { describe, expect, it } from 'vitest';
import { joinLines, pickHighlightRuns } from './highlight';

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

describe('pickHighlightRuns on words read off a scanned page', () => {
  const words = (line: string, y: number) => line.split(' ').map((str, i) => ({ str, x: i * 60, y, w: 50, h: 10 }));
  const quote = 'Conduct at least 1 informational field day/tour to inform the public about the project';
  // Item 13 of a scanned milestone list, as OCR reads it: two letters wrong, a stray space.
  const item13 = words('Conduct at leasl 1 informational field day/tour to inforrn the public about the project .', 300);
  const item14 = words('Establish at least 1 demonstration farm. (Month 13-24)', 314);

  it('marks the quote despite misread letters', () => {
    // Every word of the quote; the lone full stop after it is not part of it.
    expect(pickHighlightRuns([...item13, ...item14], [quote], { fuzzy: true })).toEqual(item13.slice(0, -1));
  });

  it('marks nothing where the quote is not, even with fuzzy matching', () => {
    expect(pickHighlightRuns(item14, [quote], { fuzzy: true })).toEqual([]);
  });

  it('needs the exact words without fuzzy matching', () => {
    expect(pickHighlightRuns(item13, [quote])).toEqual([]);
  });

  it('marks a table row whose cell wraps, as Tesseract reads it (the second line of the cell last)', () => {
    // Buttahatchee 2004 p. 32, Table 3.4, in Tesseract's order.
    const at = (str: string, x: number, y: number) => ({ str, x, y, w: 40, h: 10 });
    const row = [at('Fix', 90, 444), at('failing', 115, 444), at('onsite', 150, 444), at('$3,300', 265, 444), at('72', 385, 444), at('systems', 400, 444), at('$237,600', 470, 444)];
    const wrapped = [at('wastewater', 90, 456), at('systems', 145, 456)];
    const below = [at('*Avg', 90, 470), at('on', 112, 470), at('previous', 125, 470), at('319', 165, 470), at('project', 185, 470)];
    const marked = pickHighlightRuns([...row, ...wrapped, ...below], ['Fix failing onsite wastewater systems $3,300 72 systems $237,600'], { fuzzy: true });
    expect(marked).toEqual([...row, ...wrapped]);
  });

  it('marks a row read in another order only when nearly all its words are there', () => {
    const at = (str: string, x: number, y: number) => ({ str, x, y, w: 40, h: 10 });
    const cells = [at('$2,500/pond', 300, 372), at('10', 385, 372), at('ponds', 400, 372), at('$25,000', 470, 372)];
    // The practice name was not read at all: 4 of 7 words are too few to point at.
    expect(pickHighlightRuns(cells, ['Livestock watering ponds $2,500/pond 10 ponds $25,000'], { fuzzy: true })).toEqual([]);
  });
});

describe('joinLines', () => {
  it('draws the marked words of each line as one box', () => {
    const marked = [
      { str: 'Conduct', x: 0, y: 100, w: 40, h: 10 },
      { str: 'at', x: 46, y: 101, w: 10, h: 10 },
      { str: 'least', x: 0, y: 114, w: 30, h: 10 },
    ];
    expect(joinLines(marked)).toEqual([
      { x: 0, y: 100, w: 56, h: 11 },
      { x: 0, y: 114, w: 30, h: 10 },
    ]);
  });
});
