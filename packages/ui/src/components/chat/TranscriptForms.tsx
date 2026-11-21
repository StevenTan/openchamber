import React from 'react';
import { useRecoveredQuestions, useScopedForms } from '@/sync/sync-context';
import { dispatchPageWaiting } from './lib/scroll/timelineScrollIntent';
import { FormCard } from './FormCard';
import { groupAsyncQuestionForms } from './asyncQuestionForms';
import { formWaitingBlockId } from './formsInChat';

export const TranscriptForms: React.FC<{ sessionId: string; directory?: string }> = ({ sessionId, directory }) => {
    const forms = useScopedForms(sessionId, directory);
    const presented = React.useMemo(() => groupAsyncQuestionForms(forms), [forms]);
    const recovered = useRecoveredQuestions(sessionId, directory);
    return (
        <>
            {presented.map(({ form, asyncForms }) => (
                <WaitingBlock key={formWaitingBlockId(form)} id={formWaitingBlockId(form)}>
                    <FormCard form={form} asyncForms={asyncForms} inChat directory={directory} />
                </WaitingBlock>
            ))}
            {recovered.map((question) => (
                <WaitingBlock key={formWaitingBlockId(question.form)} id={formWaitingBlockId(question.form)}>
                    <FormCard form={question.form} recovered={question} inChat directory={directory} />
                </WaitingBlock>
            ))}
        </>
    );
};

const WaitingBlock: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => {
    const ref = React.useRef<HTMLDivElement | null>(null);
    React.useEffect(() => {
        dispatchPageWaiting(ref.current);
    }, [id]);
    return <div ref={ref} data-waiting-page={id}>{children}</div>;
};
