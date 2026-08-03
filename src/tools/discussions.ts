import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCanvasClient } from '../canvas-client.js';

export function registerDiscussionTools(server: McpServer) {
  const client = getCanvasClient();

  // List discussion topics for a course
  server.tool(
    'list_discussions',
    {
      course_id: z.number().describe('The Canvas course ID'),
      order_by: z.enum(['position', 'recent_activity', 'title']).optional()
        .describe('Order discussions by field'),
    },
    async ({ course_id, order_by }) => {
      try {
        const topics = await client.listDiscussionTopics(course_id, order_by);

        const formattedTopics = topics.map(topic => ({
          id: topic.id,
          title: topic.title,
          message: topic.message,
          posted_at: topic.posted_at,
          last_reply_at: topic.last_reply_at,
          author: topic.user_name,
          discussion_subentry_count: topic.discussion_subentry_count,
          read_state: topic.read_state,
          unread_count: topic.unread_count,
          subscribed: topic.subscribed,
          published: topic.published,
          locked: topic.locked,
          pinned: topic.pinned,
          assignment_id: topic.assignment_id,
          html_url: topic.html_url,
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(formattedTopics, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error listing discussions: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // Get discussion entries/replies
  server.tool(
    'get_discussion_entries',
    {
      course_id: z.number().describe('The Canvas course ID'),
      topic_id: z.number().describe('The discussion topic ID'),
    },
    async ({ course_id, topic_id }) => {
      try {
        // Get the topic details first
        const topic = await client.getDiscussionTopic(course_id, topic_id);
        
        // Get the entries
        const entries = await client.listDiscussionEntries(course_id, topic_id);

        const result = {
          topic: {
            id: topic.id,
            title: topic.title,
            message: topic.message,
            author: topic.user_name,
            posted_at: topic.posted_at,
            require_initial_post: topic.require_initial_post,
          },
          entries: entries.map(entry => ({
            id: entry.id,
            user_name: entry.user_name,
            message: entry.message,
            created_at: entry.created_at,
            read_state: entry.read_state,
            replies: entry.recent_replies?.map(reply => ({
              id: reply.id,
              user_name: reply.user_name,
              message: reply.message,
              created_at: reply.created_at,
            })),
            has_more_replies: entry.has_more_replies,
          })),
        };

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
            text: `Error getting discussion entries: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

}
