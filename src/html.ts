/**
 * Canvas page bodies are HTML, and in most units they are where the course actually
 * lives: the weekly-content table linking every lecture PDF, the assessment overview,
 * the FAQ. The API hands that back as a raw HTML blob, so a server that stops at
 * "here is the body" leaves the caller no better off.
 *
 * Two jobs here. Render the body as text a reader can follow — tables included, since
 * weekly-content pages are almost always tables. And resolve every link to something
 * actionable: a Canvas file link becomes a file_id that read_file accepts, so material
 * reachable only from a page stops being unreachable.
 */

export type PageLinkKind =
  | 'file'
  | 'page'
  | 'assignment'
  | 'quiz'
  | 'discussion'
  | 'module_item'
  | 'external_tool'
  | 'external';

export interface PageLink {
  /** 1-based marker number, matching the `[->N]` marker left in the rendered text. */
  index: number;
  text: string;
  kind: PageLinkKind;
  /** Numeric Canvas id for files, assignments, quizzes, discussions, module items. */
  id?: number;
  /** Slug for page links — what read_page's `page` argument wants. */
  slug?: string;
  url: string;
  /** The follow-up call that reads this link, when one exists. */
  next_step?: string;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '-', mdash: '-', hellip: '...', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', middot: '·', bull: '•',
  times: '×', deg: '°', trade: '™', copy: '©', reg: '®',
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'))
    ?? tag.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i'));
  return match ? decodeEntities(match[1]) : undefined;
}

/**
 * Work out what a link points at. `data-api-endpoint` is the reliable source when
 * Canvas supplies it — the visible href is a signed download URL whose shape varies —
 * so it is tried first and the href is the fallback.
 */
export function classifyLink(href: string, apiEndpoint?: string): Omit<PageLink, 'index' | 'text'> {
  const candidates = [apiEndpoint, href].filter((u): u is string => Boolean(u));

  for (const candidate of candidates) {
    const path = candidate.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api\/v1/, '');

    const file = path.match(/\/files\/(\d+)/);
    if (file) {
      return {
        kind: 'file',
        id: Number(file[1]),
        url: href,
        next_step: `read_file(file_id: ${file[1]}) or download_file(file_id: ${file[1]}, dest_path: ...)`,
      };
    }

    const page = path.match(/\/courses\/\d+\/pages\/([^/?#]+)/);
    if (page) {
      const slug = decodeURIComponent(page[1]);
      return { kind: 'page', slug, url: href, next_step: `read_page(page: "${slug}")` };
    }

    const assignment = path.match(/\/courses\/\d+\/assignments\/(\d+)/);
    if (assignment) {
      return {
        kind: 'assignment',
        id: Number(assignment[1]),
        url: href,
        next_step: `get_assignment(assignment_id: ${assignment[1]})`,
      };
    }

    const quiz = path.match(/\/courses\/\d+\/quizzes\/(\d+)/);
    if (quiz) return { kind: 'quiz', id: Number(quiz[1]), url: href };

    const discussion = path.match(/\/courses\/\d+\/discussion_topics\/(\d+)/);
    if (discussion) {
      return {
        kind: 'discussion',
        id: Number(discussion[1]),
        url: href,
        next_step: `get_discussion_entries(topic_id: ${discussion[1]})`,
      };
    }

    const moduleItem = path.match(/\/courses\/\d+\/modules\/items\/(\d+)/);
    if (moduleItem) return { kind: 'module_item', id: Number(moduleItem[1]), url: href };

    if (/\/external_tools\//.test(path)) {
      // LTI launches (Cogniti agents, Echo360, publisher tools) need a browser session;
      // say so rather than leaving the caller to retry an unreadable link.
      return { kind: 'external_tool', url: href, next_step: 'open in a browser — LTI tools need a Canvas session' };
    }
  }

  return { kind: 'external', url: href };
}

export interface RenderedPageBody {
  text: string;
  links: PageLink[];
}

/**
 * Render a page body as text, leaving a `[->N]` marker where each link sat so the
 * numbered link list at the end can be read back against the surrounding prose.
 */
export function renderPageBody(html: string): RenderedPageBody {
  const links: PageLink[] = [];

  let working = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

  // Links first: the anchor's inner HTML has to be captured before tags are stripped.
  working = working.replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    (whole, attrs: string, inner: string) => {
      const href = attr(attrs, 'href');
      if (!href) return inner;

      const classified = classifyLink(href, attr(attrs, 'data-api-endpoint'));
      // Canvas file links often wrap only a download glyph, so fall back to the
      // title attribute, which carries the filename.
      const text = stripTags(inner) || attr(attrs, 'title') || attr(attrs, 'aria-label') || href;

      links.push({ index: links.length + 1, text, ...classified });
      return ` ${text} [->${links.length}] `;
    }
  );

  const text = working
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr|section|article|blockquote|pre)>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<\/(table|ul|ol)>/gi, '\n')
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const alt = attr(tag, 'alt');
      return alt ? `[image: ${alt}]` : '';
    })
    .replace(/<[^>]*>/g, '');

  const cleaned = decodeEntities(text)
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').replace(/\s*\|\s*$/, '').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text: cleaned, links };
}
