/** 本文件使用 AI Elements Sources 展示联网检索返回的真实网页来源。 */

import type { AiMessageWebSource } from '@workspace/contracts/ai';
import { ChevronDown, Globe2 } from 'lucide-react';

import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources';

/** 渲染当前回答实际使用并按地址去重的网页来源。 */
export function AiCitationList({ sources }: { sources: AiMessageWebSource[] }) {
  const uniqueSources = [...new Map(sources.map((source) => [source.url, source])).values()];
  if (uniqueSources.length === 0) return null;

  return (
    <Sources defaultOpen className="mb-0 pt-1 text-decision-meeting">
      <SourcesTrigger
        count={uniqueSources.length}
        className="w-fit text-decision-meeting hover:text-decision-meeting/80"
      >
        <Globe2 className="size-3.5" aria-hidden />
        <span>引用了 {uniqueSources.length} 个网页来源</span>
        <ChevronDown className="size-3.5" aria-hidden />
      </SourcesTrigger>
      <SourcesContent className="mt-2 flex w-full flex-col gap-1">
        {uniqueSources.map((source) => (
          <Source
            key={source.url}
            className="w-fit max-w-full text-decision-meeting hover:text-decision-meeting/80"
            href={source.url}
            title={source.title}
          />
        ))}
      </SourcesContent>
    </Sources>
  );
}
