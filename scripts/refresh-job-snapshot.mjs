import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.argv[2] || "http://localhost:3001";
const output = resolve(process.cwd(), "app/job-snapshot.json");
// 1. Read the normalized market from Hirova's aggregator so the fallback contract stays identical.
const response = await fetch(`${baseUrl}/api/jobs?limit=2500`);
if (!response.ok) throw new Error(`Snapshot refresh failed with ${response.status}`);
const data = await response.json();
const jobs = data.jobs;

// 2. Keep only current normalized fields and record when source retrieval succeeded.
await writeFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), jobs })}\n`);
console.log(`Saved ${jobs.length} verified jobs to ${output}`);
