#!/usr/bin/env node
/**
 * Smoke test against a real Canvas instance.
 *
 * Run:  CANVAS_API_TOKEN=... CANVAS_BASE_URL=https://canvas.sydney.edu.au \
 *         node scripts/smoke-test.mjs
 *
 * The point of this test is the pagination fix. Canvas defaults to 10 items
 * per page, so any course reporting >10 assignments/modules/items is a case
 * the pre-fork code silently truncated. Those are marked PAGINATED below —
 * seeing at least one is what proves the fix is load-bearing on this account.
 *
 * Never hardcode the token here. It is password-equivalent.
 */
import { getCanvasClient } from '../dist/canvas-client.js';

const client = getCanvasClient();
let paginationProven = false;
const fail = (msg) => { console.error(`  FAIL: ${msg}`); process.exitCode = 1; };

const mark = (n) => {
  if (n > 10) { paginationProven = true; return `${n}  <-- PAGINATED (old code capped at 10)`; }
  return `${n}`;
};

console.log('=== 1. Identity ===');
const me = await client.getCurrentUser();
console.log(`  ${me.name} (id ${me.id})`);

console.log('\n=== 2. Active courses ===');
const courses = await client.listCourses({
  enrollment_state: 'active',
  state: ['available'],
});
console.log(`  ${courses.length} active courses`);
if (courses.length === 0) fail('no active courses — cannot exercise the rest');
for (const c of courses) console.log(`   - [${c.id}] ${c.name}`);

console.log('\n=== 3. Assignments per course (pagination check) ===');
for (const c of courses) {
  try {
    const all = await client.listAssignments(c.id, { include: ['submission'] });
    console.log(`  ${c.name}: ${mark(all.length)}`);
  } catch (e) {
    console.log(`  ${c.name}: ERROR ${e.message.slice(0, 80)}`);
  }
}

console.log('\n=== 4. Modules + items per course (pagination check) ===');
for (const c of courses) {
  try {
    const mods = await client.listModules(c.id);
    console.log(`  ${c.name}: ${mark(mods.length)} modules`);
    for (const m of mods.slice(0, 3)) {
      const items = await client.listModuleItems(c.id, m.id);
      console.log(`     - "${m.name}": ${mark(items.length)} items`);
    }
  } catch (e) {
    console.log(`  ${c.name}: ERROR ${e.message.slice(0, 80)}`);
  }
}

console.log('\n=== 5. Upcoming work (next 14 days) ===');
let upcoming = 0;
for (const c of courses) {
  try {
    const due = await client.getUpcomingAssignments(c.id, 14);
    for (const a of due) {
      upcoming++;
      console.log(`  ${a.due_at} — ${c.name}: ${a.name}`);
    }
  } catch (e) {
    console.log(`  ${c.name}: ERROR ${e.message.slice(0, 80)}`);
  }
}
if (upcoming === 0) console.log('  (nothing due in the next 14 days)');

console.log('\n=== 6. Overdue / unsubmitted ===');
for (const c of courses) {
  try {
    const overdue = await client.getOverdueAssignments(c.id);
    if (overdue.length) {
      console.log(`  ${c.name}: ${mark(overdue.length)} overdue`);
      for (const a of overdue.slice(0, 5)) console.log(`     - ${a.name} (due ${a.due_at})`);
    }
  } catch (e) {
    console.log(`  ${c.name}: ERROR ${e.message.slice(0, 80)}`);
  }
}

console.log('\n=== 7. Rubric + feedback on a graded submission ===');
let rubricSeen = false, feedbackSeen = false;
outer:
for (const c of courses) {
  let assignments;
  try {
    assignments = await client.listAssignments(c.id, { include: ['submission'] });
  } catch { continue; }
  for (const a of assignments) {
    if (a.submission?.workflow_state !== 'graded') continue;
    try {
      const sub = await client.getSubmission(c.id, a.id, 'self', [
        'submission_comments',
        'rubric_assessment',
      ]);
      const comments = sub.submission_comments ?? [];
      console.log(`  ${c.name} / ${a.name}: score ${sub.score}, ${comments.length} comment(s)`);
      if (comments.length) {
        feedbackSeen = true;
        console.log(`     feedback: "${comments[0].comment?.slice(0, 100)}"`);
      }
      if (a.rubric) { rubricSeen = true; console.log(`     rubric: ${a.rubric.length} criteria`); }
      if (feedbackSeen && rubricSeen) break outer;
    } catch { /* keep looking */ }
  }
}
if (!rubricSeen) console.log('  (no rubric found on any graded assignment)');
if (!feedbackSeen) console.log('  (no marker comments found on any graded assignment)');

console.log('\n=== RESULT ===');
console.log(paginationProven
  ? '  Pagination fix CONFIRMED — at least one list exceeded 10 items.'
  : '  WARNING: no list exceeded 10 items, so the fix is unproven on this account.');
console.log(process.exitCode ? '  Some checks FAILED.' : '  All checks passed.');
