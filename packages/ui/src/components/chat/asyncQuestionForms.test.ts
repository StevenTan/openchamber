import { describe, expect, test } from 'bun:test';
import type { FormRequest } from '@/lib/opencode/model';
import { groupAsyncQuestionForms, retainAsyncQuestionValues, splitAsyncQuestionAnswers } from './asyncQuestionForms';
import { buildFormAnswer, initialFormValues } from './formCardState';

const question = (id: string, order: number, sessionID = 'ses_1'): FormRequest => ({
    id, sessionID, title: id, metadata: { kind: 'openchamber-async-question', order },
    fields: [{ key: 'q0', type: 'string', title: id, required: true }],
});

describe('asynchronous question groups', () => {
    test('combines requests by owning session and keeps native forms separate', () => {
        const first = question('frm_first', 1);
        const second = question('frm_second', 2);
        const other = question('frm_child', 3, 'ses_child');
        const native: FormRequest = { id: 'native', sessionID: 'ses_1', title: 'Native', fields: [{ key: 'q0', type: 'boolean' }] };
        const groups = groupAsyncQuestionForms([first, native, second, other]);
        expect(groups.map(group => group.asyncForms?.map(form => form.id) ?? [group.form.id])).toEqual([['frm_first', 'frm_second'], ['native'], ['frm_child']]);
        const form = groups[0].form;
        const values = initialFormValues(form.fields);
        values[form.fields[0].key].text = 'Blue';
        values[form.fields[1].key].text = 'Green';
        expect(splitAsyncQuestionAnswers([first, second], buildFormAnswer(form.fields, values))).toEqual({ frm_first: { q0: 'Blue' }, frm_second: { q0: 'Green' } });
    });

    test('retains the filled answer when another request joins the group', () => {
        const first = question('frm_first', 1);
        const original = groupAsyncQuestionForms([first])[0].form;
        const values = initialFormValues(original.fields);
        values[original.fields[0].key].text = 'Saved answer';
        const extended = groupAsyncQuestionForms([first, question('frm_second', 2)])[0].form;
        expect(extended.id).toBe(original.id);
        const retained = retainAsyncQuestionValues(extended.fields, values);
        expect(retained[original.fields[0].key].text).toBe('Saved answer');
        expect(retained[extended.fields[1].key].text).toBe('');
    });
});
