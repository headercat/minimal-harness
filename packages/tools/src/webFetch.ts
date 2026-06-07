import * as cheerio from 'cheerio';
import { z } from 'zod';
import type { Tool } from '@minimal-harness/core';

function extractText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, nav, header, footer, noscript').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

export function webFetchTool(): Tool {
  return {
    name: 'webFetch',
    description:
      'Fetch a URL and extract its text content. ' +
      'Returns the visible text with HTML tags, scripts, and styles removed.',
    inputSchema: z.object({
      url: z.string().describe('The URL to fetch'),
      headers: z
        .record(z.string(), z.string())
        .optional()
        .describe('Custom HTTP headers to include in the request'),
      maxContentLength: z
        .number()
        .optional()
        .default(10000)
        .describe('Maximum characters of text content to return'),
    }),
    handler: async (params) => {
      const {
        url,
        headers: customHeaders,
        maxContentLength = 10000,
      } = params as {
        url: string;
        headers?: Record<string, string>;
        maxContentLength?: number;
      };

      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; MinimalHarness/1.0; +https://github.com/headercat/minimal-harness)',
          ...customHeaders,
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      const content = extractText(html).slice(0, maxContentLength);

      return { url, content };
    },
  };
}
