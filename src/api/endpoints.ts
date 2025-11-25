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
    color?: string;
    session: string;
    parentContext?: string; // Optional: nest this highlight under a parent
  }): Promise<{ anchorId: string }> {
    const { paperId, kind, ref, snippet, color, session, parentContext } = args;

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
      color,
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
      ...(parentContext && { parentContext }),
    });
    if (!contextRes.newContext) {
      throw new Error(contextRes.error ?? "Failed to create context");
    }

    return { anchorId: contextRes.newContext };
  },

  async listByPaper(args: {
    paperId: string;
  }): Promise<
    { anchors: Array<{ _id: string; kind: AnchorKind; ref: string; snippet: string; color?: string; parentContext?: string }> }
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
    // The sync returns { highlights: [{ highlight: HighlightDoc }, ...] } (wrapped)
    // collectAs doesn't unwrap, so we need to extract the highlight field
    const hlData = await post<{
      highlights: Array<{
        highlight: {
          _id: string;
          paper: string;
          page: number;
          rects: Array<{ x: number; y: number; w: number; h: number }>;
          quote?: string;
          color?: string;
        };
      }>;
    }>(`/PdfHighlighter/_listByPaper`, { paper: internalPaperId });
    const rawHighlights = hlData?.highlights ?? [];
    // Unwrap highlights from { highlight: HighlightDoc } format
    const highlights = rawHighlights.map((h) => h.highlight);
    const hlById = new Map(highlights.map((h) => [h._id, h]));

    const anchors = contexts
      .map((ctx) => {
        const hl = hlById.get(ctx.location);
        if (!hl) return null;
        const rectsEncoded = (hl.rects ?? [])
          .map((r: { x: number; y: number; w: number; h: number }) =>
            [r.x, r.y, r.w, r.h].map((n) => Number(n.toFixed(4))).join(","),
          )
          .join("|");
        const ref = `p=${hl.page};rects=${rectsEncoded}`;
        return {
          _id: ctx._id,
          kind: ctx.kind ?? "Lines",
          ref,
          snippet: hl.quote ?? "",
          color: hl.color,
          parentContext: ctx.parentContext,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

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
  async listThreads(args: { pubId: string; anchorId?: string; includeDeleted?: boolean }): Promise<{ threads: Array<{ _id: string; author: string; body: string; anchorId?: string; createdAt: number; editedAt?: number; deleted?: boolean }>}> {
    // Query returns fan-out format: Array<{ thread: Thread }>
    const data = await post<
      Array<{ thread: { _id: string; author: string; title?: string; body: string; anchorId?: string; createdAt: number; editedAt?: number; deleted?: boolean } }>
    >(`/DiscussionPub/_listThreads`, { ...args, includeDeleted: args.includeDeleted ?? true });
    // Sync collects threads into { threads: [...] } response
    const response = data as any;
    const threads = response.threads ?? data.map((r) => r.thread);
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
  async listReplies(args: { threadId: string; includeDeleted?: boolean }): Promise<{ replies: Array<{ _id: string; author: string; body: string; createdAt: number; editedAt?: number; deleted?: boolean }>}> {
    // Query returns fan-out format: Array<{ reply: Reply }>
    const data = await post<
      Array<{ reply: { _id: string; author: string; body: string; anchorId?: string; parentId?: string; createdAt: number; editedAt?: number; deleted?: boolean } }>
    >(`/DiscussionPub/_listReplies`, { ...args, includeDeleted: args.includeDeleted ?? true });
    // Sync collects replies into { replies: [...] } response
    const response = data as any;
    const replies = response.replies ?? data.map((r) => r.reply);
    return { replies };
  },
  async listRepliesTree(args: { threadId: string; includeDeleted?: boolean }): Promise<{ replies: Array<any> }> {
    // Query returns fan-out format: Array<{ reply: ReplyTree }>
    const data = await post<
      Array<{ reply: any }>
    >(`/DiscussionPub/_listRepliesTree`, { ...args, includeDeleted: args.includeDeleted ?? true });
    // Sync collects replies into { replies: [...] } response
    const response = data as any;
    const replies = response.replies ?? data.map((r) => r.reply);
    return { replies };
  },
};

export const identity = {
  async addORCID(args: { session: string; orcid: string }): Promise<{ newORCID: string }> {
    const data = await post<{ newORCID: string }>(`/IdentityVerification/addORCID`, args);
    return data;
  },
  async addBadge(args: { session: string; badge: string }): Promise<void> {
    await post<{ ok: true }>(`/IdentityVerification/addBadge`, args);
  },
  async get(args: { session: string }): Promise<{ orcid?: string; orcidId?: string; verified?: boolean; affiliation?: string; badges: string[] }> {
    // Sync queries all three and combines them into { orcids, affiliations, badges }
    const data = await post<{ orcids: Array<{ orcid: { _id: string; orcid: string; verified?: boolean } }>; affiliations: Array<{ affiliation: { affiliation: string } }>; badges: Array<{ badge: { badge: string } }> }>(`/IdentityVerification/_getByUser`, args);
    const orcidDoc = data.orcids?.[0]?.orcid;
    const orcid = orcidDoc?.orcid;
    const orcidId = orcidDoc?._id;
    const verified = orcidDoc?.verified ?? false;
    const affiliation = data.affiliations?.[0]?.affiliation?.affiliation;
    const badges = data.badges?.map((b) => b.badge.badge) ?? [];
    return { orcid, orcidId, verified, affiliation, badges };
  },
  async initiateVerification(args: { orcid: string; redirectUri: string; session: string }): Promise<{ authUrl: string; state: string }> {
    const data = await post<{ authUrl: string; state: string }>(`/IdentityVerification/initiateORCIDVerification`, args);
    return data;
  },
  async completeVerification(args: { orcid: string; code: string; state: string; redirectUri?: string }): Promise<{ ok: true }> {
    const data = await post<{ ok: true }>(`/IdentityVerification/completeORCIDVerification`, args);
    return data;
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


