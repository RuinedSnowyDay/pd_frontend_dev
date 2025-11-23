import { post } from './client';

export type AnchorKind = 'Section' | 'Figure' | 'Lines';

export const paper = {
  async ensure(args: { id: string; title?: string }): Promise<{ id: string }> {
    const data = await post<{ result: string }>(`/PaperIndex/ensure`, args);
    return { id: data.result };
  },
  async updateMeta(args: { id: string; title?: string }): Promise<void> {
    await post<{ ok: true }>(`/PaperIndex/updateMeta`, args);
  },
  async get(args: { id: string }): Promise<{ id: string; paperId: string; title?: string }> {
    // id is the external paperId (DOI, arXiv, etc.)
    // Use _getByPaperId to get the paper by external identifier
    const data = await post<
      Array<{ paper: { _id: string; paperId: string; title?: string } | null }>
    >(`/PaperIndex/_getByPaperId`, { paperId: args.id });
    const doc = data[0]?.paper;
    if (doc) {
      // Return both internal _id (for backend operations) and external paperId (for display/URLs)
      return { id: doc._id, paperId: doc.paperId, title: doc.title };
    }
    // If paper doesn't exist, return the external id as fallback for both
    return { id: args.id, paperId: args.id };
  },
  async listRecent(args?: { limit?: number }): Promise<{ papers: Array<{ id: string; paperId: string; title?: string; createdAt?: number }> }> {
    // Query returns fan-out format: Array<{ paper: PaperDoc }>
    const data = await post<
      Array<{ paper: { _id: string; paperId: string; title?: string; createdAt?: number; authors: string[]; links: string[] } }>
    >(`/PaperIndex/_listRecent`, args ?? {});
    // Collect all papers from fan-out format
    const papers = data.map(r => ({
      id: r.paper._id, // Internal _id for backend operations
      paperId: r.paper.paperId, // External paperId for display/URLs
      title: r.paper.title,
      createdAt: r.paper.createdAt,
    }));
    return { papers };
  },
  async searchArxiv(args: { q: string }): Promise<{ papers: Array<{ id: string; title?: string }> }> {
    // Query returns fan-out format: Array<{ result: { id, title? } }>
    const data = await post<
      Array<{ result: { id: string; title?: string } }>
    >(`/PaperIndex/_searchArxiv`, args);
    // Collect all results from fan-out format
    const results = data.map(r => r.result);
    return { papers: results };
  },
};

export const anchored = {
  async create(args: {
    paperId: string;
    kind: AnchorKind;
    ref: string;
    snippet: string;
    session: string;
  }): Promise<{ anchorId: string }> {
    const { paperId, kind, ref, snippet, session } = args;

    // Convert external paperId to internal _id for PdfHighlighter operations
    // Ensure paper exists and get internal _id
    const ensured = await paper.ensure({ id: paperId });
    const internalPaperId = ensured.id;

    // Parse legacy ref string "p=3;rects=x,y,w,h|..."
    let page = 1;
    let rects: Array<{ x: number; y: number; w: number; h: number }> = [];
    try {
      const m = ref.match(/p=(\d+)/);
      if (m) page = parseInt(m[1], 10);
      const rectsPart = ref.split("rects=")[1];
      if (rectsPart) {
        for (const seg of rectsPart.split("|")) {
          const parts = seg.split(",").map((s) => parseFloat(s));
          if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
            rects.push({
              x: parts[0],
              y: parts[1],
              w: parts[2],
              h: parts[3],
            });
          }
        }
      }
    } catch {
      // fall back to default page/empty rects
    }

    // 1) Create the PDF highlight (geometry + quote)
    // Use internal _id for PdfHighlighter operations
    const highlightRes = await post<{
      highlightId?: string;
      error?: string;
    }>(`/PdfHighlighter/createHighlight`, {
      session,
      paper: internalPaperId,
      page,
      rects,
      quote: snippet,
    });
    if (!highlightRes.highlightId) {
      throw new Error(highlightRes.error ?? "Failed to create highlight");
    }

    // 2) Create the highlighted context pointing at this highlight
    const contextRes = await post<{
      newContext?: string;
      error?: string;
    }>(`/HighlightedContext/create`, {
      session,
      paperId,
      location: highlightRes.highlightId,
      kind,
    });
    if (!contextRes.newContext) {
      throw new Error(contextRes.error ?? "Failed to create context");
    }

    return { anchorId: contextRes.newContext };
  },

  async listByPaper(args: {
    paperId: string;
  }): Promise<
    { anchors: Array<{ _id: string; kind: AnchorKind; ref: string; snippet: string }> }
  > {
    const { paperId } = args;

    // Convert external paperId to internal _id for PdfHighlighter operations
    // Ensure paper exists and get internal _id
    const ensured = await paper.ensure({ id: paperId });
    const internalPaperId = ensured.id;

    // Load contexts for this paper (uses external paperId)
    const ctxData = await post<
      Array<{
        filteredContexts: Array<{
          _id: string;
          paperId: string;
          author: string;
          location: string;
          kind?: AnchorKind;
          parentContext?: string;
          createdAt: number;
        }>;
      }>
    >(`/HighlightedContext/_getFilteredContexts`, { paperIds: [paperId] });
    const contexts = ctxData[0]?.filteredContexts ?? [];
    if (!contexts.length) return { anchors: [] };

    // Load all highlights for this paper (uses internal _id)
    // The sync collects all highlights and responds with { highlights: [...] }
    const hlData = await post<{
      highlights: Array<{
        _id: string;
        paper: string;
        page: number;
        rects: Array<{ x: number; y: number; w: number; h: number }>;
        quote?: string;
      }>;
    }>(`/PdfHighlighter/_listByPaper`, { paper: internalPaperId });
    const highlights = hlData?.highlights ?? [];
    const hlById = new Map(highlights.map((h) => [h._id, h]));

    const anchors = contexts
      .map((ctx) => {
        const hl = hlById.get(ctx.location);
        if (!hl) return null;
        const rectsEncoded = (hl.rects ?? [])
          .map((r) =>
            [r.x, r.y, r.w, r.h].map((n) => Number(n.toFixed(4))).join(","),
          )
          .join("|");
        const ref = `p=${hl.page};rects=${rectsEncoded}`;
        return {
          _id: ctx._id,
          kind: ctx.kind ?? "Lines",
          ref,
          snippet: hl.quote ?? "",
        };
      })
      .filter((a): a is { _id: string; kind: AnchorKind; ref: string; snippet: string } =>
        a !== null
      );

    return { anchors };
  },
};

export const discussion = {
  async open(args: { paperId: string; session?: string }): Promise<{ pubId: string }> {
    const data = await post<{ result: string }>(`/DiscussionPub/open`, args);
    return { pubId: data.result };
  },
  async startThread(args: { pubId: string; author: string; body: string; anchorId?: string; session?: string }): Promise<{ threadId: string }> {
    const data = await post<{ result: string }>(`/DiscussionPub/startThread`, args);
    return { threadId: data.result };
  },
  async reply(args: { threadId: string; author: string; body: string; session?: string }): Promise<{ replyId: string }> {
    const data = await post<{ result: string }>(`/DiscussionPub/reply`, args);
    return { replyId: data.result };
  },
  async replyTo(args: { threadId: string; author: string; body: string; parentId?: string; session?: string }): Promise<{ replyId: string }> {
    const data = await post<{ result: string }>(`/DiscussionPub/replyTo`, args);
    return { replyId: data.result };
  },
  async getPubIdByPaper(args: { paperId: string }): Promise<{ pubId: string | null }> {
    const data = await post<
      Array<{ result: string | null }>
    >(`/DiscussionPub/_getPubIdByPaper`, args);
    const result = data[0]?.result ?? null;
    return { pubId: result };
  },
  async listThreads(args: { pubId: string; anchorId?: string }): Promise<{ threads: Array<{ _id: string; author: string; body: string; anchorId?: string; createdAt: number; editedAt?: number }>}> {
    const data = await post<
      Array<{ threads: Array<{ _id: string; author: string; title?: string; body: string; anchorId?: string; createdAt: number; editedAt?: number }> }>
    >(`/DiscussionPub/_listThreads`, args);
    const threads = data[0]?.threads ?? [];
    return { threads };
  },
  async deleteThread(args: { threadId: string; session?: string }): Promise<{ ok: true }> {
    const data = await post<{ ok: true }>(`/DiscussionPub/deleteThread`, args);
    return data;
  },
  async deleteReply(args: { replyId: string; session?: string }): Promise<{ ok: true }> {
    const data = await post<{ ok: true }>(`/DiscussionPub/deleteReply`, args);
    return data;
  },
  async listReplies(args: { threadId: string }): Promise<{ replies: Array<{ _id: string; author: string; body: string; createdAt: number; editedAt?: number }>}> {
    const data = await post<
      Array<{ replies: Array<{ _id: string; author: string; body: string; anchorId?: string; parentId?: string; createdAt: number; editedAt?: number }> }>
    >(`/DiscussionPub/_listReplies`, args);
    const replies = data[0]?.replies ?? [];
    return { replies };
  },
  async listRepliesTree(args: { threadId: string }): Promise<{ replies: Array<any> }> {
    const data = await post<
      Array<{ replies: Array<any> }>
    >(`/DiscussionPub/_listRepliesTree`, args);
    const replies = data[0]?.replies ?? [];
    return { replies };
  },
};

export const identity = {
  async addORCID(args: { userId: string; orcid: string }): Promise<void> {
    await post<{ ok: true }>(`/IdentityVerification/addORCID`, args);
  },
  async addBadge(args: { userId: string; badge: string }): Promise<void> {
    await post<{ ok: true }>(`/IdentityVerification/addBadge`, args);
  },
  async get(args: { userId: string }): Promise<{ orcid?: string; affiliation?: string; badges: string[] }> {
    const data = await post<{ result: { orcid?: string; affiliation?: string; badges?: string[] } | null }>(`/IdentityVerification/get`, args);
    const r = data.result ?? {};
    return { orcid: r.orcid, affiliation: r.affiliation, badges: r.badges ?? [] };
  },
};

export const session = {
  async register(args: { username: string; password: string }): Promise<{ user?: string; error?: string }> {
    return await post<{ user?: string; error?: string }>(`/UserAuthentication/register`, args);
  },
  async login(args: { username: string; password: string }): Promise<{ session: string; user: string } | { error: string }> {
    return await post<{ session: string; user: string } | { error: string }>(`/login`, args);
  },
  async logout(args: { session: string }): Promise<{ status: string }> {
    return await post<{ status: string }>(`/logout`, args);
  },
};


