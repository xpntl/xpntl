import { describe, expect, it } from 'vitest';
import { type ParsedFilter, parseFromSearchParams, toApiQuery, toSearchParams } from './filter-url';

describe('filter-url', () => {
  it('parses search params into normalized filter state', () => {
    const parsed = parseFromSearchParams(
      new URLSearchParams(
        'q=search&state=a,b&stateType=started,wat&priority=1,4,9&assignee=me,user-2&sort=priority_asc&group=assignee&view=list',
      ),
    );

    expect(parsed).toEqual({
      q: 'search',
      stateIds: ['a', 'b'],
      stateTypes: ['started'],
      priorities: [1, 4],
      assigneeIds: ['me', 'user-2'],
      project: '',
      sort: 'priority_asc',
      group: 'assignee',
      view: 'list',
    });
  });

  it('serializes only non-default filters into API query params', () => {
    expect(
      toApiQuery({
        q: 'search',
        stateIds: ['a'],
        stateTypes: ['started'],
        priorities: [2],
        assigneeIds: ['me'],
        project: '',
        sort: 'updated_desc',
        group: 'none',
        view: 'board',
      }),
    ).toEqual({
      q: 'search',
      state: 'a',
      stateType: 'started',
      priority: '2',
      assignee: 'me',
      sort: 'updated_desc',
    });
  });

  it('round-trips filter state through URLSearchParams', () => {
    const original: ParsedFilter = {
      q: 'follow up',
      stateIds: ['triage-id'],
      stateTypes: ['triage'],
      priorities: [0, 3],
      assigneeIds: ['user-1'],
      project: '',
      sort: 'key_asc',
      group: 'priority',
      view: 'roadmap',
    };

    const roundTripped = parseFromSearchParams(toSearchParams(original));
    expect(roundTripped).toEqual(original);
  });
});
