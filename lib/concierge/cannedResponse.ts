/**
 * Canned-response token interpolation. Pure. NOT a "use server" module.
 * Replaces {{token}} placeholders; unknown tokens are left intact.
 */
export interface CannedTokens {
  agent_name?: string;
  agent_designation?: string;
  agent_phone?: string;
  client_name?: string;
}

export function interpolateCannedResponse(template: string, tokens: CannedTokens): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => {
    const value = (tokens as Record<string, string | undefined>)[key.toLowerCase()];
    return value != null && value !== "" ? value : match;
  });
}
