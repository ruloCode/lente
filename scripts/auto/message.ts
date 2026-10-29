// The commit message the runner writes for a merged node. Pure: the builder's report in, the
// message out. The builder sometimes adds its own trailer; the runner adds exactly one.

export type Report = { commit_message?: string; tasks?: { id: string; status: string; evidence: string }[] };

const TRAILER = /^co-authored-by:.*$/gim;

export function commitMessage(report: Report | undefined, fallbackSubject: string, nodeLine: string, reviewLine: string, coAuthor: string): string {
  const own = (report?.commit_message ?? "").replace(TRAILER, "").replace(/\n{3,}/g, "\n\n").trim();
  const evidence = report?.tasks?.map((t) => `- ${t.id} ${t.status}: ${t.evidence}`).join("\n") ?? "";
  return `${own || fallbackSubject}\n\n${nodeLine}\n${evidence}\n${reviewLine}\n\n${coAuthor}\n`;
}
