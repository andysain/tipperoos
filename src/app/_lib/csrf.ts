// Custom-header CSRF check for state-changing routes (see CLAUDE.md -> Trust,
// fairness, and admin integrity). A plain cross-site form POST can't set a
// custom header, so requiring one here is enough protection for this threat
// model without a full token library -- our hand-rolled session cookie
// doesn't get CSRF protection for free the way a framework auth lib would.
const CSRF_HEADER_NAME = "x-tipperoos-client";

/** True if the request carries the app's custom header. Reject if false. */
export function hasCsrfHeader(request: Request): boolean {
  return request.headers.get(CSRF_HEADER_NAME) !== null;
}
