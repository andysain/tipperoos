export function shortName(fullName) {
  return fullName
    .replace(/\b(?:FC|AFC)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function displayName(name) {
  const commonNames = {
    "Coventry City": "Coventry",
    "Leeds United": "Leeds",
    "Brighton & Hove Albion": "Brighton",
    "Ipswich Town": "Ipswich",
    "Tottenham Hotspur": "Tottenham",
    "Newcastle United": "Newcastle",
  };
  return commonNames[name] ?? name.replaceAll("Manchester", "Man");
}
