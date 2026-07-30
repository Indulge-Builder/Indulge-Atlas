/**
 * Cryptographically-random temporary password (browser Web Crypto).
 *
 * Used by admin provisioning flows that set a password directly instead of
 * emailing an invite/reset link. Guarantees at least one uppercase, one
 * lowercase, and one digit so it satisfies the app's password policy; ambiguous
 * look-alike characters (0/O/1/l/I) are omitted so it's safe to read aloud.
 */
export function generateTempPassword(length = 16): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = upper + lower + digits + symbols;
  const len = Math.max(length, 12);

  const rand = new Uint32Array(len);
  crypto.getRandomValues(rand);
  const pick = (set: string, n: number) => set[n % set.length];

  // Guarantee the classes the password policy requires, then fill the rest.
  const chars = [pick(upper, rand[0]), pick(lower, rand[1]), pick(digits, rand[2])];
  for (let i = 3; i < len; i++) chars.push(pick(all, rand[i]));

  // Fisher–Yates shuffle so the guaranteed characters aren't always in front.
  const shuf = new Uint32Array(chars.length);
  crypto.getRandomValues(shuf);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = shuf[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
