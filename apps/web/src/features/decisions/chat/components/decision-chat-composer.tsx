/**
 * 本文件实现决策群聊的文字输入、快捷发送和一级回复取消交互。
 */
'use client';

import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { SendHorizontal, X } from 'lucide-react';
import type { DecisionChatMessage } from '@workspace/contracts/decisions';

import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Textarea } from '@workspace/ui/components/textarea';

/** 决策群聊输入区属性。 */
type DecisionChatComposerProps = {
  /** 是否允许当前用户输入并发送新消息。 */
  canSend: boolean;
  /** 不可发送时展示的只读原因。 */
  readOnlyReason?: string;
  /** 当前一级回复目标。 */
  replyTo: DecisionChatMessage | null;
  /** 取消当前回复目标。 */
  onClearReply: () => void;
  /** 提交消息正文，有效内容成功入队时返回 `true`。 */
  onSend: (content: string) => boolean;
};

/** 渲染群聊输入框，并处理 Enter 发送与 Shift+Enter 换行。 */
export function DecisionChatComposer({
  canSend,
  readOnlyReason,
  replyTo,
  onClearReply,
  onSend,
}: DecisionChatComposerProps) {
  const [draft, setDraft] = useState('');
  const textareaId = useId();

  /** 提交去除首尾空白后的草稿，并在乐观入队成功后清空输入框。 */
  function submitDraft(): void {
    if (onSend(draft)) {
      setDraft('');
    }
  }

  /** 处理表单按钮提交。 */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submitDraft();
  }

  /** 处理输入框快捷键，中文输入法组合期间不拦截 Enter。 */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    submitDraft();
  }

  if (!canSend) {
    return (
      <div className="border-t p-4">
        <Alert>
          <AlertTitle>当前群聊为只读</AlertTitle>
          <AlertDescription>{readOnlyReason || '你可以查看历史消息，但当前不能发送新消息。'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <form className="space-y-3 border-t p-4" onSubmit={handleSubmit}>
      {replyTo ? (
        <div className="flex items-start justify-between gap-3 rounded-md bg-muted/60 px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium text-muted-foreground">
              回复 {replyTo.author?.name || `用户 ${replyTo.author?.id ?? '-'}`}
            </p>
            <p className="mt-1 truncate">{replyTo.content || '该消息已删除'}</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="取消回复" onClick={onClearReply}>
            <X aria-hidden />
          </Button>
        </div>
      ) : null}

      <label className="sr-only" htmlFor={textareaId}>
        输入群聊消息
      </label>
      <Textarea
        id={textareaId}
        value={draft}
        maxLength={2000}
        rows={3}
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        className="max-h-40 min-h-20 resize-none"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{draft.length}/2000</p>
        <Button type="submit" size="sm" disabled={!draft.trim()}>
          <SendHorizontal aria-hidden />
          发送
        </Button>
      </div>
    </form>
  );
}
