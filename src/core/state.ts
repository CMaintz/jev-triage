/**
 * Build the Jev `state` from an issue. Pure — no network, trivially testable.
 *
 * Jev is text-only and has a bounded context (~32k tokens on Cloudflare), so we send the
 * fields that carry signal and truncate the body. Screenshots/attachments are lost — that
 * is a documented limitation, not a bug.
 */

export interface IssueInput {
  title: string;
  body: string | null | undefined;
  existingLabels: string[];
}

export interface JevState {
  title: string;
  body: string;
  existing_labels: string[];
}

const MAX_BODY_CHARS = 8000;

export function buildState(issue: IssueInput): JevState {
  const body = (issue.body ?? '').slice(0, MAX_BODY_CHARS);
  return {
    title: issue.title,
    body,
    existing_labels: issue.existingLabels,
  };
}
