import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCanvasClient } from '../canvas-client.js';
import { renderPageBody, type PageLink } from '../html.js';
import type { Page } from '../types/canvas.js';

function fail(action: string, error: unknown) {
  return {
    content: [{
      type: 'text' as const,
      text: `Error ${action}: ${error instanceof Error ? error.message : String(error)}`,
    }],
    isError: true,
  };
}

function summarise(page: Page) {
  return {
    page_id: page.page_id,
    title: page.title,
    url: page.url,
    updated_at: page.updated_at,
    front_page: page.front_page ?? false,
    locked_for_user: page.locked_for_user ?? false,
  };
}

function formatLinks(links: PageLink[]): string {
  if (links.length === 0) return 'No links on this page.';
  return links
    .map(link => {
      const target =
        link.kind === 'file' ? `file ${link.id}`
        : link.kind === 'page' ? `page "${link.slug}"`
        : link.id !== undefined ? `${link.kind} ${link.id}`
        : link.kind;
      const step = link.next_step ? ` — ${link.next_step}` : ` — ${link.url}`;
      return `[->${link.index}] ${link.text}  (${target})${step}`;
    })
    .join('\n');
}

interface PageCollection {
  pages: Page[];
  /** 'index' = the Pages API; 'modules' = rebuilt from module items. */
  source: 'index' | 'modules';
  note?: string;
}

/**
 * List a course's pages, falling back to module items when the Pages index is
 * disabled — which many units do, exactly as they hide the Files index. The
 * fallback can only match titles, so say so rather than reporting a thin result
 * as if it were the whole course.
 */
async function collectPages(
  courseId: number,
  params: { search_term?: string; sort?: 'title' | 'created_at' | 'updated_at'; order?: 'asc' | 'desc' } = {}
): Promise<PageCollection> {
  const client = getCanvasClient();
  try {
    return { pages: await client.listPages(courseId, params), source: 'index' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/40[34]/.test(message)) throw error;

    const viaModules = await client.listPagesViaModules(courseId);
    const needle = params.search_term?.toLowerCase();
    return {
      pages: needle ? viaModules.filter(p => p.title.toLowerCase().includes(needle)) : viaModules,
      source: 'modules',
      note:
        'This course disables the Pages index, so the list was rebuilt from module items. ' +
        'Only pages linked from a module appear, and search_term matched titles only, not page bodies. ' +
        'Individual pages still read fine with read_page.',
    };
  }
}

/**
 * Resolve a page by slug, numeric id, or title. Canvas only accepts the first two, but
 * a caller reading a link out of a module listing usually has the human title, and
 * failing on that is a pointless dead end.
 */
async function resolvePage(courseId: number, identifier: string | number): Promise<Page> {
  const client = getCanvasClient();
  try {
    return await client.getPage(courseId, identifier);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('404')) throw error;

    const wanted = String(identifier).trim().toLowerCase();
    const { pages: candidates } = await collectPages(courseId, { search_term: String(identifier) });
    const match =
      candidates.find(p => p.title.toLowerCase() === wanted) ??
      candidates.find(p => p.title.toLowerCase().includes(wanted));

    if (!match) {
      throw new Error(
        `No page "${identifier}" in course ${courseId}. ` +
          `Call list_pages(course_id: ${courseId}) to see the available slugs.`
      );
    }
    return client.getPage(courseId, match.url);
  }
}

export function registerPageTools(server: McpServer) {
  const client = getCanvasClient();

  // Pages are where most units keep weekly content, assessment overviews and FAQs.
  server.tool(
    'list_pages',
    {
      course_id: z.number().describe('The Canvas course ID'),
      search_term: z.string().optional()
        .describe('Canvas matches this against page title AND body, so it finds pages that merely mention the term'),
      sort: z.enum(['title', 'created_at', 'updated_at']).optional().describe('Field to sort by'),
      order: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
    },
    async ({ course_id, search_term, sort, order }) => {
      try {
        const { pages, source, note } = await collectPages(course_id, { search_term, sort, order });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ source, note, count: pages.length, pages: pages.map(summarise) }, null, 2),
          }],
        };
      } catch (error) {
        return fail('listing pages', error);
      }
    }
  );

  // The page body, as text, with every link resolved to something callable.
  server.tool(
    'read_page',
    {
      course_id: z.number().describe('The Canvas course ID'),
      page: z.union([z.string(), z.number()]).optional()
        .describe('Page URL slug (module items report it as page_url), numeric page_id, or the page title. Omit for the course front page.'),
      max_chars: z.number().optional().default(20000)
        .describe('Truncate the rendered body at this many characters'),
      links_only: z.boolean().optional().default(false)
        .describe('Skip the body text and return only the resolved link list — use when hunting for a file_id on a long page'),
    },
    async ({ course_id, page, max_chars, links_only }) => {
      try {
        const found = page === undefined
          ? await client.getFrontPage(course_id)
          : await resolvePage(course_id, page);

        if (found.locked_for_user) {
          throw new Error(
            `Page "${found.title}" is locked. ${found.lock_explanation ?? ''}`.trim()
          );
        }

        const { text, links } = renderPageBody(found.body ?? '');
        const header = `${found.title} — page "${found.url}"` +
          (found.updated_at ? `, updated ${found.updated_at}` : '') +
          `, ${links.length} link(s)`;

        const truncated = text.length > max_chars;
        const body = links_only
          ? '[body omitted — links_only]'
          : truncated
            ? `${text.slice(0, max_chars)}\n\n[truncated at ${max_chars} characters — raise max_chars for the rest]`
            : text;

        return {
          content: [{
            type: 'text',
            text: `${header}\n\n${body}\n\n--- links ---\n${formatLinks(links)}`,
          }],
        };
      } catch (error) {
        return fail('reading page', error);
      }
    }
  );

  // Units routinely hide the Files index (list_course_files 403s) while still linking
  // every lecture PDF from a page. Walking the pages rebuilds the catalogue.
  server.tool(
    'list_linked_files',
    {
      course_id: z.number().describe('The Canvas course ID'),
      search_term: z.string().optional()
        .describe('Only walk pages whose title or body matches this, e.g. "weekly"'),
      max_pages: z.number().optional().default(40)
        .describe('Cap on how many pages to open (each is one API call)'),
    },
    async ({ course_id, search_term, max_pages }) => {
      try {
        const { pages, source, note } = await collectPages(course_id, { search_term });
        const walked = pages.slice(0, max_pages);

        const byFileId = new Map<number, { file_id: number; name: string; on_pages: string[] }>();
        const failures: string[] = [];

        for (const listed of walked) {
          let body: string;
          try {
            body = (await client.getPage(course_id, listed.url)).body ?? '';
          } catch (error) {
            failures.push(`${listed.url}: ${error instanceof Error ? error.message : String(error)}`);
            continue;
          }

          for (const link of renderPageBody(body).links) {
            if (link.kind !== 'file' || link.id === undefined) continue;
            const existing = byFileId.get(link.id);
            if (existing) {
              if (!existing.on_pages.includes(listed.url)) existing.on_pages.push(listed.url);
            } else {
              byFileId.set(link.id, { file_id: link.id, name: link.text, on_pages: [listed.url] });
            }
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              source,
              note,
              pages_found: pages.length,
              pages_walked: walked.length,
              truncated: pages.length > walked.length,
              files: [...byFileId.values()].sort((a, b) => a.name.localeCompare(b.name)),
              failures: failures.length > 0 ? failures : undefined,
            }, null, 2),
          }],
        };
      } catch (error) {
        return fail('listing linked files', error);
      }
    }
  );
}
