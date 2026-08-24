import type {
  Course,
  Assignment,
  Submission,
  Module,
  ModuleItem,
  Announcement,
  DiscussionTopic,
  DiscussionEntry,
  ListCoursesParams,
  ListAssignmentsParams,
  ListModulesParams,
  ListAnnouncementsParams,
  ListFilesParams,
  FileAttachment,
  Page,
  ListPagesParams,
} from './types/canvas.js';

interface CanvasClientConfig {
  baseUrl: string;
  apiToken: string;
}

export class CanvasClient {
  private baseUrl: string;
  private apiToken: string;

  constructor(config: CanvasClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiToken = config.apiToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    
    const headers: HeadersInit = {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Canvas API error: ${response.status} ${response.statusText} - ${errorBody}`
      );
    }

    return response.json() as Promise<T>;
  }

  private parseLinkNext(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    // Link header format: <url>; rel="next", <url>; rel="last", ...
    const parts = linkHeader.split(',');
    for (const part of parts) {
      const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
      if (match) return match[1];
    }
    return null;
  }

  private async requestAllPages<T>(
    endpoint: string,
    params: object = {}
  ): Promise<T[]> {
    const mergedParams: Record<string, unknown> = { per_page: 100, ...(params as Record<string, unknown>) };
    const initialQuery = this.buildQueryString(mergedParams);
    let url: string | null = `${this.baseUrl}/api/v1${endpoint}${initialQuery}`;

    const headers: HeadersInit = {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };

    const results: T[] = [];

    while (url) {
      const response: Response = await fetch(url, { headers });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Canvas API error: ${response.status} ${response.statusText} - ${errorBody}`
        );
      }

      const page = (await response.json()) as T[];
      if (Array.isArray(page)) {
        results.push(...page);
      }

      url = this.parseLinkNext(response.headers.get('link'));
    }

    return results;
  }

  private buildQueryString(params: object): string {
    const searchParams = new URLSearchParams();
    
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      
      if (Array.isArray(value)) {
        value.forEach(v => searchParams.append(`${key}[]`, String(v)));
      } else {
        searchParams.append(key, String(value));
      }
    }
    
    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : '';
  }

  // ==================== COURSES ====================

  async listCourses(params: ListCoursesParams = {}): Promise<Course[]> {
    return this.requestAllPages<Course>('/courses', params);
  }

  async getCourse(courseId: number, include?: string[]): Promise<Course> {
    const query = include ? this.buildQueryString({ include }) : '';
    return this.request<Course>(`/courses/${courseId}${query}`);
  }

  // ==================== ASSIGNMENTS ====================

  async listAssignments(
    courseId: number,
    params: ListAssignmentsParams = {}
  ): Promise<Assignment[]> {
    return this.requestAllPages<Assignment>(
      `/courses/${courseId}/assignments`,
      params
    );
  }

  async getAssignment(
    courseId: number,
    assignmentId: number,
    include?: string[]
  ): Promise<Assignment> {
    const query = include ? this.buildQueryString({ include }) : '';
    return this.request<Assignment>(
      `/courses/${courseId}/assignments/${assignmentId}${query}`
    );
  }

  // ==================== SUBMISSIONS ====================

  async getSubmission(
    courseId: number,
    assignmentId: number,
    userId: number | 'self' = 'self',
    include?: string[]
  ): Promise<Submission> {
    const query = include ? this.buildQueryString({ include }) : '';
    return this.request<Submission>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}${query}`
    );
  }

  // ==================== MODULES ====================

  async listModules(
    courseId: number,
    params: ListModulesParams = {}
  ): Promise<Module[]> {
    return this.requestAllPages<Module>(`/courses/${courseId}/modules`, params);
  }

  async getModule(
    courseId: number,
    moduleId: number,
    include?: string[]
  ): Promise<Module> {
    const query = include ? this.buildQueryString({ include }) : '';
    return this.request<Module>(
      `/courses/${courseId}/modules/${moduleId}${query}`
    );
  }

  async listModuleItems(
    courseId: number,
    moduleId: number,
    include?: string[]
  ): Promise<ModuleItem[]> {
    return this.requestAllPages<ModuleItem>(
      `/courses/${courseId}/modules/${moduleId}/items`,
      { include }
    );
  }

  // ==================== ANNOUNCEMENTS ====================

  async listAnnouncements(
    params: ListAnnouncementsParams
  ): Promise<Announcement[]> {
    return this.requestAllPages<Announcement>('/announcements', params);
  }

  // ==================== DISCUSSIONS ====================

  async listDiscussionTopics(
    courseId: number,
    orderBy?: 'position' | 'recent_activity' | 'title'
  ): Promise<DiscussionTopic[]> {
    return this.requestAllPages<DiscussionTopic>(
      `/courses/${courseId}/discussion_topics`,
      { order_by: orderBy }
    );
  }

  async getDiscussionTopic(
    courseId: number,
    topicId: number
  ): Promise<DiscussionTopic> {
    return this.request<DiscussionTopic>(
      `/courses/${courseId}/discussion_topics/${topicId}`
    );
  }

  async listDiscussionEntries(
    courseId: number,
    topicId: number
  ): Promise<DiscussionEntry[]> {
    return this.requestAllPages<DiscussionEntry>(
      `/courses/${courseId}/discussion_topics/${topicId}/entries`
    );
  }

  // ==================== RUBRICS ====================

  async getRubric(
    courseId: number,
    rubricId: number,
    include?: ('assessments' | 'graded_assessments' | 'peer_assessments' | 'associations' | 'assignment_associations' | 'course_associations' | 'account_associations')[]
  ): Promise<unknown> {
    const query = include ? this.buildQueryString({ include }) : '';
    return this.request<unknown>(
      `/courses/${courseId}/rubrics/${rubricId}${query}`
    );
  }

  // ==================== SEARCH / UTILITY ====================

  async searchCourseContent(
    courseId: number,
    searchTerm: string
  ): Promise<{ modules: Module[]; assignments: Assignment[]; pages: Page[] }> {
    // Search modules
    const modules = await this.listModules(courseId, {
      search_term: searchTerm,
      include: ['items'],
    });

    // Search assignments
    const assignments = await this.listAssignments(courseId, {
      search_term: searchTerm,
    });

    // Search pages. Canvas matches search_term against page body as well as title,
    // so this is the only route to material that exists only inside a page.
    let pages: Page[] = [];
    try {
      pages = await this.listPages(courseId, { search_term: searchTerm });
    } catch {
      // Index disabled: fall back to module-listed pages, matched on title alone.
      const needle = searchTerm.toLowerCase();
      const viaModules = await this.listPagesViaModules(courseId).catch(() => []);
      pages = viaModules.filter(p => p.title.toLowerCase().includes(needle));
    }

    return { modules, assignments, pages };
  }

  async getUpcomingAssignments(
    courseId: number,
    daysAhead: number = 7
  ): Promise<Assignment[]> {
    const assignments = await this.listAssignments(courseId, {
      bucket: 'upcoming',
      include: ['submission'],
    });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

    return assignments.filter(a => {
      if (!a.due_at) return false;
      const dueDate = new Date(a.due_at);
      return dueDate <= cutoffDate;
    });
  }

  async getOverdueAssignments(courseId: number): Promise<Assignment[]> {
    return this.listAssignments(courseId, {
      bucket: 'overdue',
      include: ['submission'],
    });
  }

  async getAssignmentsByDateRange(
    courseId: number,
    startDate: Date,
    endDate: Date
  ): Promise<Assignment[]> {
    const assignments = await this.listAssignments(courseId, {
      include: ['submission'],
    });

    return assignments.filter(a => {
      if (!a.due_at) return false;
      const dueDate = new Date(a.due_at);
      return dueDate >= startDate && dueDate <= endDate;
    });
  }

  // ==================== FILES ====================

  async listCourseFiles(
    courseId: number,
    params: ListFilesParams = {}
  ): Promise<FileAttachment[]> {
    return this.requestAllPages<FileAttachment>(`/courses/${courseId}/files`, params);
  }

  async getFile(fileId: number): Promise<FileAttachment> {
    return this.request<FileAttachment>(`/files/${fileId}`);
  }

  /**
   * Fetch a file's bytes. Canvas hands back a short-lived signed URL rather than
   * serving content from the API host, and that URL carries its own verifier — so the
   * download deliberately goes out without the Authorization header.
   */
  async downloadFile(fileId: number): Promise<{ file: FileAttachment; data: Uint8Array }> {
    const file = await this.getFile(fileId);

    if (file.locked_for_user) {
      throw new Error(
        `File ${fileId} ("${file.display_name}") is locked${
          file.unlock_at ? ` until ${file.unlock_at}` : ''
        }. ${file.lock_explanation ?? ''}`.trim()
      );
    }

    if (!file.url) {
      throw new Error(
        `File ${fileId} ("${file.display_name}") has no download URL — it may be hidden or deleted.`
      );
    }

    const response = await fetch(file.url);
    if (!response.ok) {
      throw new Error(
        `Canvas file download failed: ${response.status} ${response.statusText} for file ${fileId}`
      );
    }

    return { file, data: new Uint8Array(await response.arrayBuffer()) };
  }

  // ==================== PAGES ====================

  async listPages(courseId: number, params: ListPagesParams = {}): Promise<Page[]> {
    return this.requestAllPages<Page>(`/courses/${courseId}/pages`, params);
  }

  /**
   * Fetch one page including its body. `pageIdentifier` is the page's URL slug or its
   * numeric page_id — module items report the slug as `page_url`.
   */
  async getPage(courseId: number, pageIdentifier: string | number): Promise<Page> {
    return this.request<Page>(
      `/courses/${courseId}/pages/${encodeURIComponent(String(pageIdentifier))}`
    );
  }

  async getFrontPage(courseId: number): Promise<Page> {
    return this.request<Page>(`/courses/${courseId}/front_page`);
  }

  /**
   * Rebuild the page list from module items. Units commonly disable the Pages index
   * ("That page has been disabled for this course") while still linking pages from
   * modules, and individual pages stay readable — so the index being off must not
   * mean the pages are unreachable. Titles only: there is no body to match against.
   */
  async listPagesViaModules(courseId: number): Promise<Page[]> {
    const modules = await this.listModules(courseId, { include: ['items'] });
    const seen = new Map<string, Page>();

    for (const mod of modules) {
      for (const item of mod.items ?? []) {
        if (item.type !== 'Page' || !item.page_url) continue;
        if (seen.has(item.page_url)) continue;
        seen.set(item.page_url, {
          page_id: item.id,
          url: item.page_url,
          title: item.title,
          html_url: item.html_url,
        });
      }
    }

    return [...seen.values()];
  }

  // ==================== USER INFO ====================

  async getCurrentUser(): Promise<{ id: number; name: string; email?: string }> {
    return this.request<{ id: number; name: string; email?: string }>('/users/self');
  }
}

// Singleton instance creator
let clientInstance: CanvasClient | null = null;

export function getCanvasClient(): CanvasClient {
  if (!clientInstance) {
    const baseUrl = process.env.CANVAS_BASE_URL;
    const apiToken = process.env.CANVAS_API_TOKEN;

    if (!baseUrl || !apiToken) {
      throw new Error(
        'Missing required environment variables: CANVAS_BASE_URL and CANVAS_API_TOKEN must be set'
      );
    }

    clientInstance = new CanvasClient({ baseUrl, apiToken });
  }

  return clientInstance;
}
