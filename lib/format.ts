/** Times are shown in Harare time (UTC+2, no daylight saving) whatever the viewer's machine says. */
const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Harare',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  return fmt.format(new Date(iso));
}

export const OUTCOME_LABEL: Record<string, string> = {
  pass: 'Pass',
  fail: 'Fail',
  blocked: 'Blocked',
  not_run: 'Not run',
  untouched: 'Nobody yet',
};
