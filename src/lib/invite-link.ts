/**
 * The account page address with an invite code in it, to send to one person.
 * The account page reads the code from `?token=` (account/src/main.tsx).
 */
export function inviteLink(accountPageUrl: string, code: string): string {
  const url = new URL(accountPageUrl);
  url.searchParams.set('token', code);
  return url.toString();
}
