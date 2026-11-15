import type { FormRequest } from '@/lib/opencode/model';
import type { FormAnswer } from '@/sync/session-actions';
import { isAsyncQuestion, orderAsyncQuestions } from '@/sync/async-questions';
import { initialFormValues, type FormValues } from './formCardState';

export type PresentedForm = { form: FormRequest; asyncForms?: FormRequest[] };

const fieldKey = (form: FormRequest, key: string) => `${form.id}:${key}`;

export function groupAsyncQuestionForms(forms: FormRequest[]): PresentedForm[] {
    const ordered = orderAsyncQuestions(forms);
    const grouped = new Set<string>();
    return ordered.flatMap((form): PresentedForm[] => {
        if (!isAsyncQuestion(form)) return [{ form }];
        if (grouped.has(form.sessionID)) return [];
        grouped.add(form.sessionID);
        const asyncForms = ordered.filter(candidate => candidate.sessionID === form.sessionID && isAsyncQuestion(candidate));
        return [{
            form: { ...form, id: `async-question:${form.sessionID}`, fields: [
                { ...form.fields[0], key: fieldKey(form, form.fields[0].key) },
                ...form.fields.slice(1).map(field => ({ ...field, key: fieldKey(form, field.key) })),
                ...asyncForms.slice(1).flatMap(source => source.fields.map(field => ({ ...field, key: fieldKey(source, field.key) }))),
            ] },
            asyncForms,
        }];
    });
}

export function splitAsyncQuestionAnswers(forms: FormRequest[], answer: FormAnswer): Record<string, FormAnswer> {
    return Object.fromEntries(forms.map(form => [form.id, Object.fromEntries(form.fields.map(field => [field.key, answer[fieldKey(form, field.key)]]))]));
}

export function retainAsyncQuestionValues(fields: FormRequest['fields'], values: FormValues): FormValues {
    const initial = initialFormValues(fields);
    return Object.fromEntries(fields.map(field => [field.key, values[field.key] ?? initial[field.key]]));
}
