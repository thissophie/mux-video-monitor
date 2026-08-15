import { isFailure, isSuccess, successValue } from '../../helpers/result';
import { TAG_DEMO, TAG_ORDER, TAG_SHOW, TAG_TITLE } from './AdminStream';
import { parseTagEdits } from './parseTagEdits';

const demos = ['offline', 'fake-stream'];

const planFor = (request: Parameters<typeof parseTagEdits>[0]) => {
  const result = parseTagEdits(request, demos);
  if (!isSuccess(result)) {
    throw new Error(`Expected success, got failure: ${result.value.message}`);
  }
  return successValue(result);
};

describe('parseTagEdits', () => {
  it('returns an empty plan for an empty request', () => {
    expect(planFor({})).toEqual({ set: {}, remove: [] });
  });

  it('writes order from a number', () => {
    expect(planFor({ order: 5 }).set[TAG_ORDER]).toBe('5');
  });

  it('writes order from a numeric string', () => {
    expect(planFor({ order: '5' }).set[TAG_ORDER]).toBe('5');
  });

  it('accepts a negative order', () => {
    expect(planFor({ order: '-2' }).set[TAG_ORDER]).toBe('-2');
  });

  it('rejects a partially numeric order rather than truncating it', () => {
    expect(isFailure(parseTagEdits({ order: '12abc' }, demos))).toBe(true);
  });

  it('rejects a non-integer order', () => {
    expect(isFailure(parseTagEdits({ order: 1.5 }, demos))).toBe(true);
  });

  it('rejects an empty order', () => {
    expect(isFailure(parseTagEdits({ order: '' }, demos))).toBe(true);
  });

  it('writes show as the literal string true', () => {
    expect(planFor({ show: true }).set[TAG_SHOW]).toBe('true');
  });

  it('writes show as the literal string false', () => {
    expect(planFor({ show: false }).set[TAG_SHOW]).toBe('false');
  });

  it('trims the title', () => {
    expect(planFor({ title: '  Room One  ' }).set[TAG_TITLE]).toBe('Room One');
  });

  it('removes the title tag when the title is blank', () => {
    const plan = planFor({ title: '   ' });
    expect(plan.remove).toContain(TAG_TITLE);
    expect(plan.set[TAG_TITLE]).toBeUndefined();
  });

  it('accepts a known demo', () => {
    expect(planFor({ demo: 'fake-stream' }).set[TAG_DEMO]).toBe('fake-stream');
  });

  it('rejects an unknown demo', () => {
    expect(isFailure(parseTagEdits({ demo: 'nope' }, demos))).toBe(true);
  });

  it('removes the demo tag when demo is null', () => {
    const plan = planFor({ demo: null });
    expect(plan.remove).toContain(TAG_DEMO);
    expect(plan.set[TAG_DEMO]).toBeUndefined();
  });

  it('handles a full edit in one plan', () => {
    const plan = planFor({ title: 'Main Hall', order: 1, show: true, demo: null });
    expect(plan.set).toEqual({
      [TAG_TITLE]: 'Main Hall',
      [TAG_ORDER]: '1',
      [TAG_SHOW]: 'true',
    });
    expect(plan.remove).toEqual([TAG_DEMO]);
  });
});
