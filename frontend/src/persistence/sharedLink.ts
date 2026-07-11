export function readShareTokenFromLocation(location: { search: string }): string | null {
  const params = new URLSearchParams(location.search);
  const token = params.get("share");
  return token !== null && token.trim() !== "" ? token : null;
}
