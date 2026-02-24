import {
  fieldsInMarquee,
  selectByGroupId,
  selectByRow,
  selectByColumn,
} from '../multiSelectUtils';

const sampleFields = [
  { id: 'a', x: 10, y: 10, width: 20, height: 50, group_id: 'g1' },
  { id: 'b', x: 60, y: 12, width: 20, height: 50, group_id: 'g1' },
  { id: 'c', x: 10, y: 60, width: 20, height: 50, group_id: 'g2' },
];

const toSortedArray = (set) => [...set].sort();

describe('multiSelectUtils', () => {
  test('fieldsInMarquee selects by center inside rect', () => {
    const rect = { x1: 0, y1: 0, x2: 50, y2: 50 };
    const result = fieldsInMarquee(sampleFields, rect, 200);
    expect(toSortedArray(result)).toEqual(['a']);
  });

  test('fieldsInMarquee handles reversed rect coordinates', () => {
    const rect = { x1: 80, y1: 30, x2: 0, y2: 0 };
    const result = fieldsInMarquee(sampleFields, rect, 200);
    expect(toSortedArray(result)).toEqual(['a', 'b']);
  });

  test('selectByGroupId returns fields with matching group_id', () => {
    const result = selectByGroupId(sampleFields, 'g1');
    expect(toSortedArray(result)).toEqual(['a', 'b']);
  });

  test('selectByRow returns fields within tolerance', () => {
    const result = selectByRow(sampleFields, 11, 3);
    expect(toSortedArray(result)).toEqual(['a', 'b']);
  });

  test('selectByColumn returns fields within tolerance', () => {
    const result = selectByColumn(sampleFields, 10, 1);
    expect(toSortedArray(result)).toEqual(['a', 'c']);
  });
});
