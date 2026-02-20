import { describe, it, expect } from 'vitest';
import { buildInputsBinding } from '../src/tools/enrichments.js';

describe('buildInputsBinding', () => {
  it('wraps plain field IDs in {{...}}', () => {
    const result = buildInputsBinding(
      { email: 'f_abc123' },
      undefined,
      'some-action',
    );
    expect(result).toEqual([
      { name: 'email', formulaText: '{{f_abc123}}' },
    ]);
  });

  it('passes through values already wrapped in {{...}}', () => {
    const result = buildInputsBinding(
      { email: '{{f_abc123}}' },
      undefined,
      'some-action',
    );
    expect(result).toEqual([
      { name: 'email', formulaText: '{{f_abc123}}' },
    ]);
  });

  it('passes through values already wrapped in "..."', () => {
    const result = buildInputsBinding(
      { tableId: '"t_abc"' },
      undefined,
      'some-action',
    );
    expect(result).toEqual([
      { name: 'tableId', formulaText: '"t_abc"' },
    ]);
  });

  it('wraps literalInputs values in "..."', () => {
    const result = buildInputsBinding(
      { query: 'f_field1' },
      { tableId: 't_abc123' },
      'some-action',
    );
    expect(result).toContainEqual({ name: 'query', formulaText: '{{f_field1}}' });
    expect(result).toContainEqual({ name: 'tableId', formulaText: '"t_abc123"' });
  });

  it('literalInputs wins over inputMapping for same key', () => {
    const result = buildInputsBinding(
      { tableId: 'f_wrong' },
      { tableId: 't_correct' },
      'some-action',
    );
    expect(result).toEqual([
      { name: 'tableId', formulaText: '"t_correct"' },
    ]);
  });

  it('does not double-wrap literalInputs already quoted', () => {
    const result = buildInputsBinding(
      {},
      { tableId: '"already_quoted"' },
      'some-action',
    );
    expect(result).toEqual([
      { name: 'tableId', formulaText: '"already_quoted"' },
    ]);
  });

  it('auto-detects known literal inputs for lookup-field-in-other-table-new-ui', () => {
    const result = buildInputsBinding(
      {
        tableId: 't_abc123',
        targetColumn: 'f_col456',
        filterOperator: 'equals',
        lookupValue: 'f_myField',
      },
      undefined,
      'lookup-field-in-other-table-new-ui',
    );
    // tableId, targetColumn, filterOperator → auto-literal
    expect(result).toContainEqual({ name: 'tableId', formulaText: '"t_abc123"' });
    expect(result).toContainEqual({ name: 'targetColumn', formulaText: '"f_col456"' });
    expect(result).toContainEqual({ name: 'filterOperator', formulaText: '"equals"' });
    // lookupValue → normal field reference
    expect(result).toContainEqual({ name: 'lookupValue', formulaText: '{{f_myField}}' });
  });

  it('auto-detect does not apply to unknown action keys', () => {
    const result = buildInputsBinding(
      { tableId: 't_abc123' },
      undefined,
      'other-action-key',
    );
    // No auto-detect, so treated as field reference
    expect(result).toEqual([
      { name: 'tableId', formulaText: '{{t_abc123}}' },
    ]);
  });

  it('auto-detect is skipped when value is already wrapped', () => {
    const result = buildInputsBinding(
      { tableId: '{{f_myField}}' },
      undefined,
      'lookup-field-in-other-table-new-ui',
    );
    // Already wrapped in {{...}}, so keep as field reference even though it's a known literal
    expect(result).toEqual([
      { name: 'tableId', formulaText: '{{f_myField}}' },
    ]);
  });
});
