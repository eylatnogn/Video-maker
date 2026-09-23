/**
 * Runs once per server start. Resumes renders that were in flight when the
 * previous process stopped, so a restart never strands a paid job.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { resumeUnfinishedJobs } = await import("./lib/pipeline/jobs");
  const ids = await resumeUnfinishedJobs();
  if (ids.length) console.log(`Resumed ${ids.length} unfinished job(s)`);
}
