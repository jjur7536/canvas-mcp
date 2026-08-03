import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCanvasClient } from '../canvas-client.js';

export function registerSubmissionTools(server: McpServer) {
  const client = getCanvasClient();

  // Get submission details including feedback
  server.tool(
    'get_submission',
    {
      course_id: z.number().describe('The Canvas course ID'),
      assignment_id: z.number().describe('The assignment ID'),
      include_comments: z.boolean().optional().default(true)
        .describe('Include submission comments/feedback'),
    },
    async ({ course_id, assignment_id, include_comments }) => {
      try {
        const include = ['submission_comments', 'rubric_assessment'];
        
        const submission = await client.getSubmission(
          course_id,
          assignment_id,
          'self',
          include
        );

        const result: Record<string, unknown> = {
          id: submission.id,
          assignment_id: submission.assignment_id,
          user_id: submission.user_id,
          submitted_at: submission.submitted_at,
          attempt: submission.attempt,
          workflow_state: submission.workflow_state,
          grade: submission.grade,
          score: submission.score,
          graded_at: submission.graded_at,
          late: submission.late,
          missing: submission.missing,
          excused: submission.excused,
          points_deducted: submission.points_deducted,
          submission_type: submission.submission_type,
          body: submission.body,
          url: submission.url,
          preview_url: submission.preview_url,
        };

        if (submission.attachments && submission.attachments.length > 0) {
          result.attachments = submission.attachments.map(att => ({
            id: att.id,
            filename: att.filename,
            display_name: att.display_name,
            url: att.url,
            size: att.size,
            content_type: att.content_type,
          }));
        }

        if (include_comments && submission.submission_comments) {
          result.comments = submission.submission_comments.map(comment => ({
            id: comment.id,
            author_name: comment.author_name,
            comment: comment.comment,
            created_at: comment.created_at,
          }));
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting submission: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

}
