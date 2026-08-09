// Shared football-data.org fetch helper + env-var guard, used by every
// script that talks to the provider (seed-fixtures.mjs, issue #89's
// seed-gameweek-1-selection.mjs) -- extracted to stop the same three blocks
// drifting between scripts (code-review finding on #89).

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

export function createFootballDataClient(apiKey) {
  return async function fetchFromFootballData(path) {
    const res = await fetch(`https://api.football-data.org/v4${path}`, {
      headers: { "X-Auth-Token": apiKey },
    });
    if (!res.ok) {
      throw new Error(
        `football-data.org ${path} failed: ${res.status} ${await res.text()}`,
      );
    }
    return res.json();
  };
}
