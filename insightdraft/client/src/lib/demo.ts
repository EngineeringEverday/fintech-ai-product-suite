// Demo-mode outputs. Hand-crafted to look like a senior PM ran the pipeline on
// the sample transcript. These ship without an API key so a recruiter can demo
// the full flow in under 60 seconds.

import type { PainPoint, Theme, FeatureCard } from './types';

export const DEMO_PAIN_POINTS: Omit<PainPoint, 'id'>[] = [
  {
    quote: 'I imported our spreadsheet and nothing mapped to the right fields. Statuses came in as plain text. I had to manually fix 180 tasks.',
    pain_point: 'Spreadsheet import does not preview field mapping or validate, forcing users into hours of cleanup after the import commits.',
    severity: 'High',
    frequency_estimate: 'Every new account; surfaced in 4 of 8 interviews + 3 support tickets in 30 days',
    confidence_score: 92,
  },
  {
    quote: 'I emailed support — got a templated reply after 14 hours. The help article was for an older version.',
    pain_point: 'Self-serve onboarding fails because help content lags product changes and first-touch support is slow.',
    severity: 'Med',
    frequency_estimate: 'Reported by 3 of 8 interviews; corroborated by Reddit thread',
    confidence_score: 78,
  },
  {
    quote: 'Every new hire goes through the same cliff. Our last two hires spent half a day each just figuring out where automations live.',
    pain_point: 'No contextual, role-aware in-product onboarding for new teammates joining an existing workspace.',
    severity: 'Med',
    frequency_estimate: 'Mentioned by 5 of 8 interviews; aligned with NPS comments',
    confidence_score: 84,
  },
  {
    quote: 'Building an automation feels like writing a regex. There is no dry-run. I built one that auto-assigned tasks to the wrong person for three days.',
    pain_point: 'Automation builder lacks dry-run / preview, leading to high-stakes errors and trust erosion.',
    severity: 'High',
    frequency_estimate: 'Top concern in 6 of 8 interviews; 1 escalated support ticket about data corruption',
    confidence_score: 95,
  },
  {
    quote: 'I get 60 emails a day and I miss the three that actually matter. There is no notion of this needs your attention now versus this is FYI.',
    pain_point: 'Notifications lack priority signal, causing critical updates to be lost in volume.',
    severity: 'High',
    frequency_estimate: 'Every interview; teams report bypassing built-in notifications for Slack',
    confidence_score: 88,
  },
  {
    quote: 'I do not even open the app. I tried — it crashed twice last week.',
    pain_point: 'Mobile app is unreliable, especially on Android 13 with large projects.',
    severity: 'High',
    frequency_estimate: '7 crash tickets in 30 days; 2 of 8 interviews abandoned mobile',
    confidence_score: 81,
  },
  {
    quote: 'Cannot bulk-edit due dates across projects. Have to do one at a time.',
    pain_point: 'Bulk editing is missing for common multi-project operations.',
    severity: 'Low',
    frequency_estimate: '1 ticket; mentioned once in interviews',
    confidence_score: 62,
  },
  {
    quote: 'A 40-person shop should not pay $19,000/year just to log in with Google. That felt predatory.',
    pain_point: 'SSO is gated behind enterprise pricing, creating friction and brand damage with mid-market accounts.',
    severity: 'Med',
    frequency_estimate: 'Pricing objection in 3 of 8 interviews; mirrors competitor positioning',
    confidence_score: 70,
  },
];

export const DEMO_THEMES: Omit<Theme, 'id'>[] = [
  {
    theme_name: 'Risky first 20 minutes',
    summary: 'New workspaces fail at the import step — fields do not map, errors are silent, and the cleanup tax is paid by the operator. The first impression of the product is "this might break something."',
    supporting_pain_points: ['Spreadsheet import has no preview', 'Help content lags product'],
    assumptions: [
      'Most accounts start by importing from a spreadsheet (assumed; not yet measured)',
      'Operators are the primary persona during setup, not end users',
    ],
    confidence_score: 86,
  },
  {
    theme_name: 'Trust gap in automations',
    summary: 'The automation builder is the differentiator AND the largest source of fear. Without a dry-run, users either avoid the feature or absorb the cost of a bad rule running unchecked.',
    supporting_pain_points: ['No dry-run on automations', 'Automation ran on deleted project'],
    assumptions: [
      'Power users want preview more than additional triggers',
      'A read-only simulation captures enough behavior to be trusted',
    ],
    confidence_score: 91,
  },
  {
    theme_name: 'Notification noise drives off-platform behavior',
    summary: 'Inbox volume is high and undifferentiated, so teams route work through Slack and bypass the platform. This silently erodes daily active workspace use.',
    supporting_pain_points: ['No priority signal in notifications'],
    assumptions: [
      'DAU is materially affected — needs instrumentation',
      'Slack integration cannibalizes in-product notifications rather than complementing them',
    ],
    confidence_score: 74,
  },
  {
    theme_name: 'Mobile is effectively abandoned',
    summary: 'Mobile crashes and feature gaps push users to the mobile web. The native app is not in the critical path for most teams today.',
    supporting_pain_points: ['Android crashes on large projects'],
    assumptions: [
      'Crash rate is concentrated in a specific code path (project load > 100 tasks)',
      'Fixing crashes restores enough trust to drive re-adoption',
    ],
    confidence_score: 68,
  },
  {
    theme_name: 'Mid-market pricing friction',
    summary: 'SSO behind enterprise creates a values-misalignment moment for buyers in the 25–100 seat range. The trust cost outweighs the revenue gain.',
    supporting_pain_points: ['SSO gated behind enterprise tier'],
    assumptions: [
      'Mid-market churn correlates with this gate (needs cohort analysis)',
      'Unbundling SSO into Team tier is revenue-neutral if expansion picks up',
    ],
    confidence_score: 60,
  },
];

export const DEMO_CARDS: Omit<FeatureCard, 'id' | 'status'>[] = [
  {
    feature_name: 'Import Preview & Dry-Run',
    user_problem: 'New admins import a spreadsheet, find out fields mapped incorrectly only after the import commits, and spend hours cleaning up. The first 20 minutes set the tone for the entire trial.',
    proposed_solution: 'Two-step import: parse and show a field-mapping preview with sample rows and warning flags (untyped statuses, missing assignees, date format mismatches). Allow the admin to remap and re-validate before committing. Persist mapping as a reusable template.',
    success_metric: 'Reduce post-import edits per new workspace by 60% within 30 days of launch; increase Day-1 to Day-7 retention by 8 points.',
    priority_score: 9,
    confidence_score: 88,
    needs_human_review: false,
  },
  {
    feature_name: 'Automation Dry-Run Sandbox',
    user_problem: 'Power users are afraid to ship automations because there is no safe way to see what an automation would do before it runs against production data.',
    proposed_solution: 'A sandbox mode that replays the last 7 days of project events through the automation and renders a diff: which tasks would have been assigned, moved, or closed. Admins approve from the diff. Live changes only happen after approval.',
    success_metric: 'Increase % of workspaces with at least one active automation from 22% to 40% within 60 days; reduce automation-related support tickets by 50%.',
    priority_score: 9,
    confidence_score: 90,
    needs_human_review: false,
  },
  {
    feature_name: 'Notification Priority Tiers',
    user_problem: 'Users receive too many notifications and cannot tell which require action. They miss critical updates and route work through Slack instead.',
    proposed_solution: 'Introduce three tiers (Action Required, FYI, Digest). Tier is inferred from rule (mentions and assigned-to-you are Action; subscribed updates are FYI; activity rolls into a daily Digest). Each tier has its own delivery channel and inbox view.',
    success_metric: 'Reduce notification emails per user per week by 40%; increase click-through on Action-tier notifications to 65%.',
    priority_score: 8,
    confidence_score: 72,
    needs_human_review: false,
  },
  {
    feature_name: 'Contextual Onboarding for New Teammates',
    user_problem: 'New hires joining an existing workspace face the same cliff every time. There is no role-aware tour that points them at the features their team actually uses.',
    proposed_solution: 'When a user is invited, generate a tour based on the inviting workspace usage signals (which features they use, which automations are active). Surface as a dismissible sidebar with 4–6 contextual moments rather than a modal walkthrough.',
    success_metric: 'Reduce time-to-first-meaningful-action for invited users from a median of 4 hours to 30 minutes.',
    priority_score: 7,
    confidence_score: 68,
    needs_human_review: true,
  },
  {
    feature_name: 'Mobile Stability Fix (Android, large projects)',
    user_problem: 'Mobile app crashes when opening projects with >100 tasks on Android 13. Users abandon the app and use mobile web.',
    proposed_solution: 'Profile and fix the project-load code path under Android 13. Add a virtualized task list for projects above a threshold. Ship behind a feature flag; monitor crash-free sessions.',
    success_metric: 'Crash-free sessions on Android > 99.5% within 30 days; restore mobile DAU to 40% of web DAU.',
    priority_score: 7,
    confidence_score: 65,
    needs_human_review: true,
  },
  {
    feature_name: 'Unbundle SSO into Team Tier',
    user_problem: 'Mid-market buyers see SSO behind an enterprise paywall as predatory pricing. It damages trust during the sales cycle and creates an avoidable churn risk.',
    proposed_solution: 'Move SAML SSO into the Team tier. Keep SCIM, audit logs, and custom contracts as enterprise differentiators. Price-test a $2/seat security add-on before fully bundling.',
    success_metric: 'Increase win rate in 25–100 seat deals by 10 points; measure net revenue impact at 90 days.',
    priority_score: 6,
    confidence_score: 58,
    needs_human_review: true,
  },
  {
    feature_name: 'Bulk Edit Across Projects',
    user_problem: 'Operators cannot bulk-edit due dates or assignees across projects, leading to manual repetition.',
    proposed_solution: 'Cross-project bulk-edit panel with filter chips (project, status, due date range) and a confirmation step showing affected count.',
    success_metric: 'Tasks edited per session for power users +25%.',
    priority_score: 4,
    confidence_score: 55,
    needs_human_review: true,
  },
];

// Async helper that simulates a streaming/timed agent run for the demo path
export function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
