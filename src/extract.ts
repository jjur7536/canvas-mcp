/**
 * Text extraction for course materials.
 *
 * Lecture slides are PDFs and tutorial sheets are .docx, so a server that only
 * downloads bytes still leaves the caller unable to read anything. Everything here
 * returns page-addressable text, because the common request is "explain slide 12 of
 * lecture 5" rather than "give me the whole deck".
 */

import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';

export interface ExtractedDocument {
  /** One entry per page for PDFs; a single entry for formats without pagination. */
  pages: string[];
  totalPages: number;
  /** True when the format has no page concept, so `pages` holds one blob. */
  paginated: boolean;
}

/**
 * Parse a page selector like "3", "2-5" or "1,4,7-9" into 1-based page numbers.
 * Returns null for an empty selector, meaning "every page".
 */
export function parsePageRange(spec: string | undefined, totalPages: number): number[] | null {
  if (!spec || !spec.trim()) return null;

  const wanted = new Set<number>();
  for (const part of spec.split(',')) {
    const chunk = part.trim();
    if (!chunk) continue;

    const range = chunk.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      if (from > to) throw new Error(`Invalid page range "${chunk}": start is after end`);
      for (let p = from; p <= to; p++) wanted.add(p);
      continue;
    }

    if (!/^\d+$/.test(chunk)) {
      throw new Error(`Invalid page selector "${chunk}". Use forms like "3", "2-5" or "1,4,7-9".`);
    }
    wanted.add(Number(chunk));
  }

  const pages = [...wanted].sort((a, b) => a - b);
  const overflow = pages.filter(p => p < 1 || p > totalPages);
  if (overflow.length > 0) {
    throw new Error(
      `Page(s) ${overflow.join(', ')} out of range — the document has ${totalPages} page(s).`
    );
  }
  return pages;
}

function looksLikeText(contentType: string, filename: string): boolean {
  if (contentType.startsWith('text/')) return true;
  if (/^application\/(json|xml|x-tex|javascript)/.test(contentType)) return true;
  return /\.(txt|md|csv|tsv|json|xml|tex|m|py|c|h|cpp|v|sv|ino|log)$/i.test(filename);
}

/**
 * Turn a downloaded file into page-addressable text.
 * `filename` is only used to disambiguate when Canvas/Ed report a generic content type.
 */
export async function extractDocument(
  data: Uint8Array,
  filename: string,
  contentType = ''
): Promise<ExtractedDocument> {
  const isPdf = contentType.includes('pdf') || /\.pdf$/i.test(filename);
  const isDocx =
    contentType.includes('wordprocessingml') || /\.docx$/i.test(filename);

  if (isPdf) {
    const pdf = await getDocumentProxy(data);
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    return { pages: text as string[], totalPages, paginated: true };
  }

  if (isDocx) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    return { pages: [value], totalPages: 1, paginated: false };
  }

  if (looksLikeText(contentType, filename)) {
    const value = Buffer.from(data).toString('utf8');
    return { pages: [value], totalPages: 1, paginated: false };
  }

  if (/\.doc$/i.test(filename)) {
    throw new Error(
      `Cannot extract text from legacy .doc "${filename}". Only .docx is supported — ` +
        `download it with download_file and convert it, or ask the unit for a PDF.`
    );
  }

  throw new Error(
    `No text extractor for "${filename}" (content type "${contentType || 'unknown'}"). ` +
      `Supported: PDF, .docx, and plain-text formats. ` +
      `Use download_file to fetch it to disk and open it another way.`
  );
}

export interface RenderOptions {
  /** Page selector such as "12" or "4-9". Ignored for unpaginated formats. */
  pages?: string;
  /** Truncate the rendered text at this many characters. */
  maxChars?: number;
}

export interface RenderedDocument {
  text: string;
  totalPages: number;
  pagesReturned: number[] | 'all';
  truncated: boolean;
}

/**
 * Render selected pages as labelled text. Page markers are kept in the output so a
 * later answer can cite "slide 12" and be checkable against the source.
 */
export function renderDocument(doc: ExtractedDocument, options: RenderOptions = {}): RenderedDocument {
  const { pages: spec, maxChars = 20000 } = options;
  const selected = doc.paginated ? parsePageRange(spec, doc.totalPages) : null;

  const chosen = selected ?? doc.pages.map((_, i) => i + 1);
  const body = doc.paginated
    ? chosen.map(p => `--- page ${p} ---\n${(doc.pages[p - 1] ?? '').trim()}`).join('\n\n')
    : doc.pages.join('\n\n').trim();

  const truncated = body.length > maxChars;
  return {
    text: truncated
      ? `${body.slice(0, maxChars)}\n\n[truncated at ${maxChars} characters — request specific pages for the rest]`
      : body,
    totalPages: doc.totalPages,
    pagesReturned: selected ?? 'all',
    truncated,
  };
}
