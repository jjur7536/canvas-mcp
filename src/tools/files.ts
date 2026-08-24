import { z } from 'zod';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCanvasClient } from '../canvas-client.js';
import { extractDocument, renderDocument } from '../extract.js';
import type { FileAttachment } from '../types/canvas.js';

function summarise(file: FileAttachment) {
  return {
    id: file.id,
    display_name: file.display_name,
    content_type: file.content_type,
    size: file.size,
    updated_at: file.updated_at,
    folder_id: file.folder_id,
    locked_for_user: file.locked_for_user ?? false,
    unlock_at: file.unlock_at ?? null,
    lock_explanation: file.lock_explanation,
  };
}

function fail(action: string, error: unknown) {
  return {
    content: [{
      type: 'text' as const,
      text: `Error ${action}: ${error instanceof Error ? error.message : String(error)}`,
    }],
    isError: true,
  };
}

export function registerFileTools(server: McpServer) {
  const client = getCanvasClient();

  // Every file in a course, including ones not surfaced through a module.
  // Many units disable the student-facing Files index; list_modules is the fallback.
  server.tool(
    'list_course_files',
    {
      course_id: z.number()
        .describe('The Canvas course ID. If this returns 403, use list_modules instead — module items carry the file IDs.'),
      search_term: z.string().optional()
        .describe('Substring match on the file name, e.g. "Lecture" or "tut5"'),
      content_types: z.array(z.string()).optional()
        .describe('Canvas mime-class filters, e.g. ["pdf"], ["doc"], ["ppt"]'),
      sort: z.enum(['name', 'size', 'created_at', 'updated_at', 'content_type']).optional()
        .describe('Field to sort by'),
      order: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
    },
    async ({ course_id, search_term, content_types, sort, order }) => {
      try {
        const files = await client.listCourseFiles(course_id, {
          search_term,
          content_types,
          sort,
          order,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(files.map(summarise), null, 2) }],
        };
      } catch (error) {
        // Units routinely hide the Files tab from students; the modules listing still
        // exposes the same file IDs, so say so rather than leaving the caller stuck.
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('403')) {
          return fail(
            'listing course files',
            new Error(
              `${message}\nThis course hides its Files index from students. Two fallbacks:\n` +
                `1. list_modules(course_id: ${course_id}) — each File item's content_id is the file_id.\n` +
                `2. list_linked_files(course_id: ${course_id}) — walks the course's pages and ` +
                `returns every file_id linked from them, which is where units that hide Files ` +
                `usually keep the lecture PDFs.`
            )
          );
        }
        return fail('listing course files', error);
      }
    }
  );

  // Metadata for a single file, including whether it is still locked.
  server.tool(
    'get_file',
    {
      file_id: z.number().describe('The Canvas file ID (module items report it as content_id)'),
    },
    async ({ file_id }) => {
      try {
        const file = await client.getFile(file_id);
        return {
          content: [{ type: 'text', text: JSON.stringify(summarise(file), null, 2) }],
        };
      } catch (error) {
        return fail('getting file metadata', error);
      }
    }
  );

  // Read a lecture, tutorial or handout as text without it ever touching the repo.
  server.tool(
    'read_file',
    {
      file_id: z.number().describe('The Canvas file ID (module items report it as content_id)'),
      pages: z.string().optional()
        .describe('Page selector for PDFs, e.g. "12", "4-9" or "1,3,7-9". Omit for the whole document.'),
      max_chars: z.number().optional().default(20000)
        .describe('Truncate the returned text at this many characters'),
    },
    async ({ file_id, pages, max_chars }) => {
      try {
        const { file, data } = await client.downloadFile(file_id);
        const doc = await extractDocument(data, file.display_name, file.content_type);
        const rendered = renderDocument(doc, { pages, maxChars: max_chars });

        const header =
          `${file.display_name} — ${rendered.totalPages} page(s)` +
          (rendered.pagesReturned === 'all'
            ? ''
            : `, showing ${rendered.pagesReturned.join(', ')}`);

        return {
          content: [{ type: 'text', text: `${header}\n\n${rendered.text}` }],
        };
      } catch (error) {
        return fail('reading file', error);
      }
    }
  );

  // Save a file to disk — for things text extraction cannot serve, like circuit
  // diagrams that have to be looked at, or datasheets kept for offline reference.
  server.tool(
    'download_file',
    {
      file_id: z.number().describe('The Canvas file ID (module items report it as content_id)'),
      dest_path: z.string()
        .describe('Absolute path to write to. A trailing slash or an existing directory means "keep the Canvas file name".'),
    },
    async ({ file_id, dest_path }) => {
      try {
        const { file, data } = await client.downloadFile(file_id);

        const endsWithSeparator = /[\\/]$/.test(dest_path);
        const target = endsWithSeparator
          ? resolve(dest_path, file.display_name)
          : resolve(dest_path);

        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, data);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              path: target,
              bytes: data.byteLength,
              content_type: file.content_type,
              display_name: file.display_name,
            }, null, 2),
          }],
        };
      } catch (error) {
        return fail('downloading file', error);
      }
    }
  );
}
