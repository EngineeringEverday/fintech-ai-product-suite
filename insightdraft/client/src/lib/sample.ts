// Realistic but synthetic interview transcript for demo. Composite of common patterns
// from B2B SaaS onboarding research — no real users.

export const SAMPLE_TRANSCRIPT = `User Interview — Onboarding research
Project: NorthStar (project management SaaS)
Date: 2025-03-14
Interviewer: Priya
Participant: Operations Lead at a 40-person services company. 6 weeks into trial.

Priya: Walk me through your first week with NorthStar.
P: Honestly? I almost gave up on day two. I imported our spreadsheet and nothing
mapped to the right fields. Statuses came in as plain text. I had to manually
fix 180 tasks. There was no preview before the import committed. By the time I
caught the mistake, half my team had already started creating duplicate items.

Priya: Did you reach out to support?
P: I emailed support@northstar.io — got a templated reply after 14 hours saying
"please check our help center." The help article was for an older version. I
ended up screen-sharing with a coworker who'd used it before. The product
shouldn't need a buddy system.

Priya: What about now, six weeks in?
P: Day-to-day is fine — once you know the shortcuts. But every new hire goes
through the same cliff. Our last two hires spent half a day each just figuring
out where automations live. There's no in-product tour that's tied to the
features we actually use.

Priya: You mentioned automations. Tell me more.
P: That's the killer feature — and the scariest. Building an automation feels
like writing a regex. There's no dry-run. I built one last month that
auto-assigned tasks to the wrong person for three days before anyone noticed.
You can imagine the conversation I had with the head of delivery. Some kind of
preview, even a fake one, would save my job.

Priya: Anything else that frustrates you?
P: Notifications. I get 60 emails a day and I miss the three that actually
matter. There's no notion of "this needs your attention now" vs "this is FYI."
Our PMs ignore the inbox entirely and we route everything through Slack instead,
which defeats the point.

Priya: How does mobile work for you?
P: I don't even open the app. I tried — it crashed twice last week. I just use
the web on my phone. It's not great but it's not crashing.

Priya: If you could change one thing tomorrow?
P: Import. Make import not feel like defusing a bomb. Everything downstream gets
easier if the first 20 minutes don't break you. After that, automations
preview, and notification triage.

Priya: One more — pricing?
P: We're on the team plan, $24/user/month. Fine for what we get. But the
sales rep, John, kept pushing us to enterprise for SSO and I don't think a
40-person shop should pay $19,000/year just to log in with Google. That felt
predatory.

---

Support Tickets (last 30 days, sample)
- "Import failed silently. No error, no email, just nothing imported." (x3)
- "Automation ran on a deleted project and corrupted historical data."
- "Mobile crash on Android 13 when opening a project with >100 tasks." (x7)
- "SSO setup docs are wrong — the SAML URL has changed."
- "Cannot bulk-edit due dates across projects. Have to do one at a time."

---

Reddit thread (r/projectmanagement, paraphrased)
"NorthStar is good once you learn it, but the onboarding is brutal. Plan a full
day. Don't trust the import. The automations are powerful but you WILL break
something the first time you build one. Their mobile app is unusable. We use
the web on phones and it's fine."`;
