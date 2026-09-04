/**
 * 本文件验证 Gateway 网页检索只持久化可公开展示的标题与 HTTP(S) 地址。
 */

import {
  toAiWebSearchOutputSummary,
  toAiWebSourcesFromSummary,
} from './ai-web-search';

describe('AI 网页检索摘要', () => {
  it('从 Gateway 结果提取网页来源并丢弃正文', () => {
    const summary = toAiWebSearchOutputSummary({
      searchId: 'search-1',
      results: [
        {
          title: 'Vercel AI SDK',
          url: 'https://ai-sdk.dev',
          excerpt: '不应持久化的网页正文',
        },
      ],
    });

    expect(summary).toEqual({
      webSources: [{ title: 'Vercel AI SDK', url: 'https://ai-sdk.dev' }],
    });
    expect(JSON.stringify(summary)).not.toContain('不应持久化的网页正文');
  });

  it('历史来源只恢复有效网页地址', () => {
    expect(
      toAiWebSourcesFromSummary({
        webSources: [
          { title: '官方文档', url: 'https://example.com' },
          { title: '非法来源', url: 'javascript:alert(1)' },
        ],
      }),
    ).toEqual([{ title: '官方文档', url: 'https://example.com' }]);
  });
});
