import catalog from "./arabicReviewCatalog.json";

// Bump when meanings/options change: an old answer must never approve new wording.
export const ARABIC_REVIEW_VERSION = "2026-09-30-v1";
export const ARABIC_REVIEW_CARDS = catalog;
export const ARABIC_REVIEWERS = [
  { id: "elias", name: "Elias" },
  { id: "hashem", name: "Hashem" },
] as const;
export type ReviewerName = (typeof ARABIC_REVIEWERS)[number]["id"];
export type ReviewCard = (typeof catalog)[number];
export type ReviewVote = {
  cardId: string;
  userId: string;
  choice: string;
  customText: string;
  note: string;
  updatedAt: number;
};
export type Reviewer = { id: string; name: string };
export type ReviewStatus = "unanswered" | "waiting" | "different" | "agreed";
export function voteText(card: ReviewCard, vote: ReviewVote): string {
  return vote.choice === "custom"
    ? vote.customText
    : vote.choice === "reject"
      ? "None of these"
      : (card.options.find((option) => option.id === vote.choice)?.text ??
        "Unknown choice");
}
export function cardStatus(
  card: ReviewCard,
  votes: ReviewVote[],
  reviewers: Reviewer[],
): ReviewStatus {
  const current = reviewers.map((reviewer) =>
    votes.find(
      (vote) => vote.cardId === card.id && vote.userId === reviewer.id,
    ),
  );
  if (!current.some(Boolean)) return "unanswered";
  if (reviewers.length < 2 || current.some((vote) => !vote)) return "waiting";
  const answers = current.filter((vote): vote is ReviewVote => Boolean(vote));
  if (answers.some((vote) => vote.choice === "reject")) return "different";
  return new Set(answers.map((vote) => voteText(card, vote).trim())).size === 1
    ? "agreed"
    : "different";
}
export function reviewComplete(votes: ReviewVote[], reviewers: Reviewer[]) {
  return ARABIC_REVIEW_CARDS.every(
    (card) => cardStatus(card, votes, reviewers) === "agreed",
  );
}
export type ReviewSnapshot = {
  version: string;
  revision: number;
  me: string;
  reviewers: Reviewer[];
  votes: ReviewVote[];
  approvals: string[];
  ready: boolean;
  presence: { userId: string; cardId: string; seenAt: number }[];
};
export function exportReview(snapshot: ReviewSnapshot) {
  return {
    format: "rivet-arabic-review-v1",
    identityMode:
      "Self-selected names; anyone with the link can edit either reviewer’s choices.",
    exportedAt: new Date().toISOString(),
    catalogVersion: snapshot.version,
    revision: snapshot.revision,
    readyForImplementation: snapshot.ready,
    reviewers: snapshot.reviewers,
    approvals: snapshot.approvals,
    instructions:
      "Use agreed wording as binding guidance. Other choices, notes and rejected alternatives are context, not approved translations. Do not invent agreement. Preserve exact meanings of finance, permissions and legal statements. Review the complete source inventory; this questionnaire samples language decisions, not every product string.",
    decisions: ARABIC_REVIEW_CARDS.map((card) => {
      const votes = snapshot.votes.filter((vote) => vote.cardId === card.id);
      const status = cardStatus(card, votes, snapshot.reviewers);
      return {
        ...card,
        status,
        agreedText:
          status === "agreed" && votes[0] ? voteText(card, votes[0]) : null,
        votes: votes.map((vote) => ({
          ...vote,
          selectedText: voteText(card, vote),
        })),
      };
    }),
  };
}
