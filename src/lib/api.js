/**
 * Minimal client for the LingoChunk public API (/api/v1), Bearer-token auth.
 *
 * Endpoints used (all require the submissions:write scope):
 *   GET  /api/v1/collections                — publish targets for the picker
 *   POST /api/v1/submissions                — multipart upload of a recording
 *   GET  /api/v1/submissions/{id}/status    — processing poll after upload
 *
 * Errors: the server answers with a uniform {"detail": "...", "code"?: "..."}
 * body; we surface `detail` as the Error message so the UI can show it as-is.
 */

export class ApiError extends Error {
  constructor(status, detail, code = null) {
    super(detail);
    this.status = status;
    this.code = code;
  }
}

async function raiseForStatus(response) {
  if (response.ok) return;
  let detail = `Request failed (HTTP ${response.status})`;
  let code = null;
  try {
    const body = await response.json();
    if (body && typeof body.detail === 'string') detail = body.detail;
    if (body && typeof body.code === 'string') code = body.code;
  } catch {
    // Non-JSON error body (proxy page etc.) — keep the generic message.
  }
  throw new ApiError(response.status, detail, code);
}

export class ApiClient {
  constructor(apiBase, token, fetchImpl = globalThis.fetch.bind(globalThis)) {
    this.apiBase = apiBase.replace(/\/+$/, '');
    this.token = token;
    this.fetch = fetchImpl;
  }

  headers() {
    return { Authorization: `Bearer ${this.token}` };
  }

  /** Fetch with Bearer auth and NO ambient cookies. Extension fetches to a
   *  host with granted permissions would otherwise include the user's
   *  lingochunk.com session cookie (they just logged in via the connect
   *  popup), and the server's CSRF middleware rightly blocks cookie-carrying
   *  cross-origin writes. This API speaks tokens only, so omit cookies. */
  request(url, init = {}) {
    return this.fetch(url, {
      ...init,
      credentials: 'omit',
      headers: { ...this.headers(), ...(init.headers ?? {}) },
    });
  }

  /** The collections the user may publish into: [{slug, name, ...}]. */
  async listCollections() {
    const response = await this.request(`${this.apiBase}/api/v1/collections`);
    await raiseForStatus(response);
    return (await response.json()).collections;
  }

  /**
   * Upload a recording. Returns {submission_id, job_id, status, collection}.
   * `collection` is a slug from listCollections(), or empty/undefined.
   */
  async createSubmission({
    blob,
    filename,
    learningLanguage,
    nativeLanguage,
    level,
    title,
    collection,
  }) {
    const form = new FormData();
    form.append('audio', blob, filename);
    form.append('learning_language', learningLanguage);
    form.append('native_language', nativeLanguage);
    form.append('level', level);
    if (title) form.append('title', title);
    if (collection) form.append('collection', collection);

    const response = await this.request(`${this.apiBase}/api/v1/submissions`, {
      method: 'POST',
      body: form,
    });
    await raiseForStatus(response);
    return response.json();
  }

  /** Processing status: {submission_id, status, progress, step, message, error}. */
  async submissionStatus(submissionId) {
    const response = await this.request(
      `${this.apiBase}/api/v1/submissions/${encodeURIComponent(submissionId)}/status`,
    );
    await raiseForStatus(response);
    return response.json();
  }

  /** The in-app home of an uploaded submission. */
  submissionUrl(submissionId) {
    return `${this.apiBase}/submissions/${encodeURIComponent(submissionId)}/listen`;
  }
}
