# Canvas LMS MCP Server for Claude

An MCP (Model Context Protocol) server that connects Claude to Canvas LMS, letting you read your
coursework — assignments, modules, announcements, and **the lecture PDFs and tutorial sheets
themselves** — through natural conversation.

**Ask Claude things like:**
- "What assignments do I have due this week?"
- "Read me pages 10-14 of the week 5 lecture"
- "Show me the rubric for my essay assignment"
- "What did my professor say in the feedback?"
- "Are there any overdue assignments?"

This is a **read-only fork** of [`lucanardinocchi/canvas-mcp`](https://github.com/lucanardinocchi/canvas-mcp)
with pagination fixes, honest error reporting, and file reading added. See
[Fork changes](#fork-changes).

---

## Install (agent-executable)

If you are an AI agent setting this up for a user, run these steps in order. Everything below
is deterministic except the two values the user must supply (`CANVAS_API_TOKEN`,
`CANVAS_BASE_URL`) — ask for those, never guess them.

```bash
# 1. Clone and build (requires Node >= 18)
git clone https://github.com/jjur7536/canvas-mcp.git ~/dev/canvas-mcp
cd ~/dev/canvas-mcp
npm install
npm run build          # dist/ is gitignored — this step is REQUIRED

# 2. Sanity check: the server must exit 1 with a clear message when unconfigured
node dist/index.js     # expect: "Error: Missing required environment variables: ..."
```

**3. Get the user's Canvas API token** (they must do this themselves — it is a secret):
Canvas → profile picture → **Settings** → **Approved Integrations** → **+ New Access Token** →
name it "Claude", set an expiry, **Generate Token**, copy it once.

**4. Determine `CANVAS_BASE_URL`** — the origin the user sees when logged into Canvas, with no
trailing slash. Examples: `https://canvas.sydney.edu.au`, `https://canvas.instructure.com`.

**5. Register the server** with whichever client the user runs:

<details open>
<summary><b>Claude Code (CLI)</b></summary>

```bash
claude mcp add canvas \
  --scope user \
  --env CANVAS_API_TOKEN=THE_TOKEN \
  --env CANVAS_BASE_URL=https://your-school.instructure.com \
  -- node /absolute/path/to/canvas-mcp/dist/index.js
```

`--scope user` makes it available in every project. Use `--scope project` to share it via a
repo's `.mcp.json` instead — but never commit a token; use `${CANVAS_API_TOKEN}` expansion and
set the variable in the shell. Verify with `claude mcp list`.
</details>

<details>
<summary><b>Claude Desktop</b></summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "canvas": {
      "command": "node",
      "args": ["/FULL/PATH/TO/canvas-mcp/dist/index.js"],
      "env": {
        "CANVAS_API_TOKEN": "THE_TOKEN",
        "CANVAS_BASE_URL": "https://your-school.instructure.com"
      }
    }
  }
}
```

Then quit Claude Desktop **completely** (Cmd+Q / Alt+F4) and reopen it.
</details>

**6. Verify end to end.** Ask the client to call `list_courses`. A non-empty list means the
token and base URL are both right. A `401` means the token is wrong; a network error means the
base URL is wrong.

**WSL note:** if the user runs Claude Code inside WSL, clone and build inside WSL and give the
Linux path (`/home/<user>/dev/canvas-mcp/dist/index.js`). A Windows client cannot execute a
`\\wsl$\...` path reliably.

---

## Quick Start (manual)

### 1. Get Your Canvas API Token

1. Log in to Canvas
2. Click your **profile picture** → **Settings**
3. Scroll to **Approved Integrations**
4. Click **+ New Access Token**
5. Name it (e.g., "Claude") and click **Generate Token**
6. **Copy the token** - you won't see it again!

### 2. Install the MCP Server

```bash
# Clone this repository
git clone https://github.com/jjur7536/canvas-mcp.git
cd canvas-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

### 3. Configure Claude Desktop

Open Claude Desktop's config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add (or merge) this configuration:

```json
{
  "mcpServers": {
    "canvas": {
      "command": "node",
      "args": ["/FULL/PATH/TO/canvas-mcp/dist/index.js"],
      "env": {
        "CANVAS_API_TOKEN": "YOUR_TOKEN_HERE",
        "CANVAS_BASE_URL": "https://your-school.instructure.com"
      }
    }
  }
}
```

**Replace:**
- `/FULL/PATH/TO/canvas-mcp` with the actual path where you cloned this repo
- `YOUR_TOKEN_HERE` with your Canvas API token
- `https://your-school.instructure.com` with your Canvas URL

**Common Canvas URLs:**
| University | Canvas URL |
|------------|------------|
| University of Sydney | `https://canvas.sydney.edu.au` |
| Generic Instructure | `https://canvas.instructure.com` |
| Your school | Check your browser when logged into Canvas |

### 4. Restart Claude Desktop

Quit Claude Desktop completely (Cmd+Q / Alt+F4) and reopen it.

You should now see Canvas tools available in Claude!

---

## What Can It Do?

### 📚 Courses
- List all your enrolled courses
- Get course details and syllabi

### 📝 Assignments
- List assignments (filter by upcoming, overdue, etc.)
- View full assignment details and instructions
- See rubrics and grading criteria
- Check your grades and submission status

### 💬 Discussions
- View discussion boards and read posts
- Read course announcements

### 📤 Submissions
- View your submission status and grade
- Read instructor feedback and comments

### 📄 Files
- Browse course modules and the files attached to them
- **Read a lecture PDF or `.docx` as text, page by page**
- Download a file to disk

### 📃 Pages
- **Read a Canvas page as text, with every link resolved to a `file_id` you can act on**
- Rebuild a course's file catalogue from its pages when the Files tab is hidden

### 🔍 Search
- Find assignments by due date
- Search course content
- Get all upcoming work across all courses

---

## All Available Tools

**This fork is read-only.** Every tool below only reads from Canvas. See
[Fork changes](#fork-changes) for why the upstream write tools were removed.

| Tool | What it does |
|------|--------------|
| `list_courses` | List your enrolled courses |
| `get_course` | Get details about a specific course |
| `list_assignments` | List assignments (with filters) |
| `get_assignment` | Get full assignment details + rubric |
| `get_rubric` | Get grading rubric for an assignment |
| `get_submission` | View your submission and feedback |
| `list_modules` | Browse course modules |
| `list_announcements` | Get course announcements |
| `list_discussions` | View discussion topics |
| `get_discussion_entries` | Read discussion posts |
| `find_assignments_by_due_date` | Find assignments in a date range |
| `get_upcoming_assignments` | Get work due in the next N days |
| `get_overdue_assignments` | Find past-due work |
| `search_course_content` | Search module items, assignment names, and page titles + bodies |
| `get_all_upcoming_work` | Upcoming work across ALL courses |
| `list_course_files` | List a course's files (403s where the Files tab is hidden) |
| `get_file` | File metadata, including lock/unlock state |
| `read_file` | **Read a lecture PDF or `.docx` as text, by page** |
| `download_file` | Save a file to disk |
| `list_pages` | List a course's pages (falls back to module items where the Pages index is off) |
| `read_page` | **Read a page as text, with links resolved to file IDs** |
| `list_linked_files` | Every file linked from any page — the catalogue when `list_course_files` 403s |

### Reading course material

`read_file` is the one that makes the server useful for studying. Canvas serves files from a
signed URL rather than the API host, so metadata alone leaves you unable to read anything.

```
list_modules(course_id: 74261)      → a File item's content_id IS the file_id
read_file(file_id: 51641317, pages: "12-14")
```

PDFs come back page-addressable with `--- page N ---` markers, so an answer can cite
"lecture 5, slide 12" and be checked. `.docx` tutorial sheets extract whole. Text extraction
uses `unpdf` for PDFs and `mammoth` for `.docx`; anything else returns a clear error naming
the format, and you can fall back to `download_file`.

Locked files fail loudly with their unlock date rather than returning empty text — units gate
tutorial solutions until partway through the week, and that gate is worth preserving.

`list_course_files` 403s in units that hide the student Files tab, which is common. The error
says so and points at `list_modules`, which always works.

### Material that lives inside a page

Modules are not where most units put their material. A typical unit has a *Weekly Unit
Content* page holding a table with one row per week, and every lecture PDF, lab handout and
task brief hangs off that table as an inline link. None of it is a module item, and in units
that hide the Files tab none of it is in `list_course_files` either. Read the page:

```
list_modules(course_id: 73895)                 → a Page item reports its slug as page_url
read_page(course_id: 73895, page: "weekly-unit-content")
read_file(file_id: 52075212)                   → a file_id straight out of the link list
```

`read_page` renders the body as text — tables included, since weekly-content pages are almost
always tables — leaving a `[->N]` marker wherever a link sat, and appends a numbered list
resolving each one:

```
[->29] Lec 4A - C++xx _ Pointers.pdf  (file 52060667) — read_file(file_id: 52060667)
[->33] Task 4 Agent  (page "task-4-agent") — read_page(page: "task-4-agent")
[->48] Practice Exam  (assignment 690430) — get_assignment(assignment_id: 690430)
```

File, page, assignment, quiz, discussion, module-item and LTI links are each classified from
`data-api-endpoint` where Canvas supplies it and the href otherwise. `links_only: true` skips
the body when you are only after an ID on a long page.

`list_linked_files` walks every page in a course and returns the deduplicated set of files
linked from them. That is the real answer to a hidden Files tab: it reconstructs the catalogue
the unit meant you to have.

Units disable the Pages *index* as readily as the Files tab — `/pages` returns *"That page has
been disabled for this course"* — but individual pages stay readable. So `list_pages` and
`list_linked_files` fall back to enumerating pages from module items, and label the result
`source: "modules"` with a note saying what the fallback cannot do (match page bodies, or see
pages no module links).

---

## Fork changes

This fork diverges from `lucanardinocchi/canvas-mcp` in four ways.

**1. Pagination on every list endpoint.** Canvas returns 10 items per page by
default. Upstream only paginated `/courses`; every other list call took the
first page and returned it as if it were the whole set — silently, with no
error and no truncation marker. Verified against a real account: a course with
20 assignments reported 10, and a course with 17 modules reported 10. That
turns "am I missing any assignments?" into a confidently wrong "you're all
caught up", which is the worst way for this tool to fail.

**2. `get_all_upcoming_work` reports failed courses.** Upstream wrapped each
course in `catch { continue }`, so a course that errored vanished from the
results while still being counted in `courses_checked`. It now returns
`complete`, `courses_searched`, and a `failed_courses` list.

**3. Write tools removed.** Upstream shipped `submit_assignment`,
`upload_file`, `post_discussion_entry`, and `reply_to_discussion`. An agent
that misreads a prompt could submit coursework or post publicly under your
name. These are deleted at the source — client methods included — rather than
being blocked by config, so no permission slip can reinstate them.

**4. File reading added.** Upstream exposed no file tools at all, so lecture slides and
tutorial sheets — the actual content of a unit — were unreachable. `read_file`,
`download_file`, `get_file` and `list_course_files` close that gap. See
[Reading course material](#reading-course-material).

**5. Page reading added.** Files and modules were still not enough: units keep their weekly
content, assessment overviews and FAQs in Canvas *pages*, and the material hangs off those
pages as inline links. Neither `list_modules` nor `list_course_files` can see any of it, so a
whole class of course material was invisible. `read_page`, `list_pages` and `list_linked_files`
close that gap, and `search_course_content` now searches page bodies. See
[Material that lives inside a page](#material-that-lives-inside-a-page).

Run `node scripts/smoke-test.mjs` against a real token to re-verify the first three.

## Troubleshooting

### "Canvas tools not showing up"
1. Did you run `npm run build`? `dist/` is gitignored, so a fresh clone has no server to run.
2. Make sure you restarted Claude Desktop completely (Claude Code: `claude mcp list`)
3. Check that the path in your config is **absolute** and points at `dist/index.js`
4. Verify your `claude_desktop_config.json` is valid JSON

### "401 Unauthorized" errors
Your API token is invalid or expired. Generate a new one in Canvas settings.

### "403 Forbidden" errors
You don't have access to that resource. The course may have ended, or you're not enrolled.

### "Connection refused" or network errors
Check that your `CANVAS_BASE_URL` is correct (no trailing slash).

---

## Security Notes

⚠️ **Keep your API token secret!**
- Never commit your token to git
- Don't share your token with others
- Set an expiration date when creating tokens
- Revoke tokens you no longer use (Canvas Settings → Approved Integrations)

Your API token has the same access as your Canvas account - anyone with it can view your grades, submit assignments, etc.

---

## Development

```bash
# Install dependencies
npm install

# Build once
npm run build

# Watch mode (auto-rebuild on changes)
npm run dev
```

### Project Structure
```
canvas-mcp/
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── canvas-client.ts   # Canvas API wrapper (handles pagination)
│   ├── extract.ts         # PDF/.docx → page-addressable text
│   ├── html.ts            # page body → text + resolved links
│   ├── tools/             # Tool implementations
│   │   ├── courses.ts
│   │   ├── assignments.ts
│   │   ├── submissions.ts
│   │   ├── discussions.ts
│   │   ├── modules.ts
│   │   ├── files.ts       # read_file / download_file / get_file
│   │   ├── pages.ts       # read_page / list_pages / list_linked_files
│   │   └── search.ts
│   └── types/
│       └── canvas.ts      # TypeScript types
├── scripts/
│   └── smoke-test.mjs     # verifies pagination + failure reporting
├── dist/                  # Compiled output (gitignored — run `npm run build`)
├── package.json
└── tsconfig.json
```

---

## Contributing

Contributions welcome! Feel free to:
- Report bugs
- Suggest new features
- Submit pull requests

---

## License

MIT - Use it however you want!

---

## Acknowledgments

Built with:
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Canvas LMS REST API](https://canvas.instructure.com/doc/api/)
