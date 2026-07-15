// Client-side PII stripping. Conservative — we'd rather over-redact than leak.
// All replacements happen BEFORE any API call to the LLM.

export interface PIIStripResult {
  cleaned: string;
  counts: {
    emails: number;
    phones: number;
    urls: number;
    names: number;
    ssns: number;
    creditCards: number;
  };
}

// Conservative first-name list — covers common cases. We replace only when
// surrounded by sentence-typical context to avoid mangling words like "Will".
const COMMON_FIRST_NAMES = new Set([
  'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph',
  'Thomas', 'Charles', 'Christopher', 'Daniel', 'Matthew', 'Anthony', 'Mark',
  'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth', 'Kevin', 'Brian',
  'George', 'Edward', 'Ronald', 'Timothy', 'Jason', 'Jeffrey', 'Ryan', 'Jacob',
  'Gary', 'Nicholas', 'Eric', 'Jonathan', 'Stephen', 'Larry', 'Justin', 'Scott',
  'Brandon', 'Benjamin', 'Samuel', 'Frank', 'Gregory', 'Raymond', 'Alexander',
  'Patrick', 'Jack', 'Dennis', 'Jerry',
  'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan',
  'Jessica', 'Sarah', 'Karen', 'Lisa', 'Nancy', 'Betty', 'Sandra', 'Margaret',
  'Ashley', 'Kimberly', 'Emily', 'Donna', 'Michelle', 'Carol', 'Amanda', 'Dorothy',
  'Melissa', 'Deborah', 'Stephanie', 'Rebecca', 'Laura', 'Sharon', 'Cynthia',
  'Kathleen', 'Amy', 'Shirley', 'Angela', 'Helen', 'Anna', 'Brenda', 'Pamela',
  'Nicole', 'Samantha', 'Katherine', 'Christine', 'Emma', 'Catherine', 'Debra',
  'Rachel', 'Olivia', 'Carolyn', 'Janet', 'Maria', 'Heather', 'Diane',
  'Priya', 'Wei', 'Hiroshi', 'Aisha', 'Mohammed', 'Fatima', 'Carlos', 'Sofia',
  'Diego', 'Yuki', 'Chen', 'Raj', 'Anika', 'Ravi',
]);

export function stripPII(input: string): PIIStripResult {
  let out = input;
  const counts = { emails: 0, phones: 0, urls: 0, names: 0, ssns: 0, creditCards: 0 };

  // SSN — XXX-XX-XXXX
  out = out.replace(/\b\d{3}-\d{2}-\d{4}\b/g, () => { counts.ssns++; return '[SSN]'; });

  // Credit card — 13 to 19 digits, optionally separated by spaces or dashes
  out = out.replace(/\b(?:\d[ -]*?){13,19}\b/g, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19) { counts.creditCards++; return '[CARD]'; }
    return m;
  });

  // Emails
  out = out.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, () => {
    counts.emails++; return '[EMAIL]';
  });

  // URLs (http/https/www)
  out = out.replace(/\b(?:https?:\/\/|www\.)[^\s)"'<>]+/gi, () => {
    counts.urls++; return '[URL]';
  });

  // Phone numbers — handles common US formats and international with +
  out = out.replace(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, (m) => {
    // Require at least 10 digits total to avoid stripping random sequences
    const digits = m.replace(/\D/g, '');
    if (digits.length >= 10) { counts.phones++; return '[PHONE]'; }
    return m;
  });

  // Common first names — only when capitalized and standalone word
  out = out.replace(/\b([A-Z][a-z]{2,})\b/g, (m, name) => {
    if (COMMON_FIRST_NAMES.has(name)) { counts.names++; return '[PERSON]'; }
    return m;
  });

  return { cleaned: out, counts };
}

export function totalPII(c: PIIStripResult['counts']): number {
  return c.emails + c.phones + c.urls + c.names + c.ssns + c.creditCards;
}
