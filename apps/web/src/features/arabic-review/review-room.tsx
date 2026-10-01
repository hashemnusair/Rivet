"use client";

import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useConvexConnectionState } from "convex/react";
import {
  Check,
  ChevronRight,
  Download,
  Languages,
  RefreshCw,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import {
  ARABIC_REVIEW_CARDS as cards,
  ARABIC_REVIEW_VERSION,
  ARABIC_REVIEWERS,
  type ReviewerName,
  cardStatus,
  exportReview,
  reviewComplete,
  voteText,
  type ReviewCard,
  type ReviewSnapshot,
  type ReviewVote,
} from "../../../convex/arabicReviewModel";
import { Button } from "@/components/ui/button";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";

type SaveInput = {
  version: string;
  cardId: string;
  choice: string;
  customText: string;
  note: string;
  expectedUpdatedAt: number;
};
type RoomProps = {
  snapshot: ReviewSnapshot;
  connected: boolean;
  save: (input: SaveInput) => Promise<unknown>;
  approve: () => Promise<unknown>;
  present: (cardId: string) => Promise<unknown>;
  preview?: boolean;
  onSwitchReviewer?: () => void;
};
const categories = [...new Set(cards.map((card) => card.category))];
const statusLabels = {
  unanswered: "Not started",
  waiting: "Waiting for both",
  different: "Discuss together",
  agreed: "Agreed",
};
const fieldClass =
  "min-h-11 w-full rounded-md border border-line-2 bg-white px-3 py-2 text-sm";
const arabicStyle = { fontFamily: "var(--font-plex-arabic), sans-serif" };

class RoomErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <div className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-semibold">
          The review room could not load
        </h1>
        <p className="my-4">
          Reload to reconnect. Your saved choices remain on the server.
        </p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function ArabicReviewRoom() {
  const [reviewer, setReviewer] = useState<ReviewerName | null>(null);
  if (!reviewer)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-paper p-6">
        <section className="w-full max-w-md">
          <p className="mb-3 flex items-center gap-2 text-sm text-ink-2">
            <Languages className="size-4" /> RIVET · Arabic review
          </p>
          <h1 className="text-[32px] font-semibold">Who are you?</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            Choose your name to continue your review. Your saved answers and
            progress will be waiting here.
          </p>
          <div className="mt-7 grid grid-cols-2 gap-3">
            {ARABIC_REVIEWERS.map((person) => (
              <Button
                key={person.id}
                className="h-16 text-lg"
                variant="secondary"
                onClick={() => setReviewer(person.id)}
              >
                {person.name}
              </Button>
            ))}
          </div>
        </section>
      </main>
    );
  const switchReviewer = () => setReviewer(null);
  return (
    <RoomErrorBoundary key={reviewer}>
      {DEMO_AUTH_BYPASS ? (
        <PreviewRoom reviewer={reviewer} onSwitchReviewer={switchReviewer} />
      ) : (
        <ConnectedRoom reviewer={reviewer} onSwitchReviewer={switchReviewer} />
      )}
    </RoomErrorBoundary>
  );
}
function ConnectedRoom({
  reviewer,
  onSwitchReviewer,
}: {
  reviewer: ReviewerName;
  onSwitchReviewer: () => void;
}) {
  const connection = useConvexConnectionState();
  const snapshot = useQuery(api.arabicReview.snapshot, { reviewer });
  const save = useMutation(api.arabicReview.saveVote);
  const approve = useMutation(api.arabicReview.approve);
  const present = useMutation(api.arabicReview.present);
  const showPresence = useCallback(
    (cardId: string) => present({ cardId, reviewer }),
    [present, reviewer],
  );
  if (!snapshot)
    return (
      <p role="status" className="p-8">
        Loading your saved review…
      </p>
    );
  return (
    <ReviewRoomView
      snapshot={snapshot}
      connected={connection.isWebSocketConnected}
      save={(input) => save({ ...input, reviewer })}
      onSwitchReviewer={onSwitchReviewer}
      approve={() =>
        approve({
          reviewer,
          version: snapshot.version,
          revision: snapshot.revision,
        })
      }
      present={showPresence}
    />
  );
}
const previewPresent = async () => {};
function PreviewRoom({
  reviewer,
  onSwitchReviewer,
}: {
  reviewer: ReviewerName;
  onSwitchReviewer: () => void;
}) {
  const [snapshot, setSnapshot] = useState<ReviewSnapshot>({
    version: ARABIC_REVIEW_VERSION,
    revision: 0,
    me: reviewer,
    reviewers: ARABIC_REVIEWERS.map((person) => ({ ...person })),
    votes: [],
    approvals: [],
    ready: false,
    presence: [],
  });
  return (
    <ReviewRoomView
      preview
      onSwitchReviewer={onSwitchReviewer}
      snapshot={snapshot}
      connected
      save={async (input) =>
        setSnapshot((current) => ({
          ...current,
          revision: current.revision + 1,
          votes: [
            ...current.votes.filter((vote) => vote.cardId !== input.cardId),
            { ...input, userId: reviewer, updatedAt: Date.now() },
          ],
        }))
      }
      approve={async () => {}}
      present={previewPresent}
    />
  );
}
function friendlyError(error: unknown) {
  if (error && typeof error === "object" && "data" in error) {
    const data = error.data;
    if (
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof data.message === "string"
    )
      return data.message;
  }
  return "Could not save. Check your connection and try again. Your unsaved answer is still here.";
}
export function ReviewRoomView({
  snapshot,
  connected,
  save,
  approve,
  present,
  preview,
  onSwitchReviewer,
}: RoomProps) {
  const [activeId, setActiveId] = useState(() => {
    const requested =
      typeof window === "undefined"
        ? ""
        : new URLSearchParams(window.location.search).get("card");
    return (
      cards.find((card) => card.id === requested)?.id ??
      cards.find(
        (card) =>
          !snapshot.votes.some(
            (vote) => vote.cardId === card.id && vote.userId === snapshot.me,
          ),
      )?.id ??
      cards[0]!.id
    );
  });
  const cardRegion = useRef<HTMLDivElement>(null);
  const previousCard = useRef(activeId);
  const [category, setCategory] = useState("All sections");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);
  const [following, setFollowing] = useState("");
  const [error, setError] = useState("");
  const [approving, setApproving] = useState(false);
  const [now, setNow] = useState(Date.now());
  const active = cards.find((card) => card.id === activeId) ?? cards[0]!;
  const mine = snapshot.votes.find(
    (vote) => vote.cardId === active.id && vote.userId === snapshot.me,
  );
  const answered = snapshot.votes.filter(
    (vote) => vote.userId === snapshot.me,
  ).length;
  const agreed = cards.filter(
    (card) => cardStatus(card, snapshot.votes, snapshot.reviewers) === "agreed",
  ).length;
  const visible = cards.filter((card) => {
    const status = cardStatus(card, snapshot.votes, snapshot.reviewers);
    return (
      (category === "All sections" || card.category === category) &&
      (filter === "all" ||
        (filter === "mine"
          ? !snapshot.votes.some(
              (vote) => vote.cardId === card.id && vote.userId === snapshot.me,
            )
          : status === filter)) &&
      search
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .every((term) =>
          `${card.id} ${card.category} ${card.english} ${card.context} ${card.options.map((option) => option.text).join(" ")}`
            .toLowerCase()
            .includes(term),
        )
    );
  });
  useEffect(() => {
    if (previousCard.current !== activeId) {
      previousCard.current = activeId;
      cardRegion.current?.focus({ preventScroll: true });
      cardRegion.current?.scrollIntoView({ block: "start" });
    }
  }, [activeId]);
  useEffect(() => {
    const update = () => {
      setNow(Date.now());
      void present(activeId).catch(() => {});
    };
    update();
    const interval = window.setInterval(update, 30_000);
    return () => window.clearInterval(interval);
  }, [activeId, present]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const followedCard = snapshot.presence.find(
    (person) => person.userId === following && now - person.seenAt < 90_000,
  )?.cardId;
  useEffect(() => {
    if (followedCard && !dirty) setActiveId(followedCard);
  }, [followedCard, dirty]);
  function go(id: string) {
    if (id === activeId) return;
    if (
      dirty &&
      !window.confirm(
        "Discard your unsaved answer and move to another question?",
      )
    )
      return;
    setDirty(false);
    setFollowing("");
    setActiveId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("card", id);
    window.history.replaceState(null, "", url);
  }
  function next() {
    const index = visible.findIndex((card) => card.id === activeId);
    const target = visible[index + 1] ?? visible[0];
    if (target) {
      setDirty(false);
      setActiveId(target.id);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exportReview(snapshot), null, 2)], {
        type: "application/json;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `rivet-arabic-review-${snapshot.version}-r${snapshot.revision}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="mx-auto max-w-[1480px] p-4 sm:p-6 lg:p-8">
      {onSwitchReviewer && (
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-line pb-3">
          <span className="text-sm">
            Reviewing as{" "}
            <strong>
              {
                snapshot.reviewers.find((person) => person.id === snapshot.me)
                  ?.name
              }
            </strong>
          </span>
          <Button variant="ghost" disabled={dirty} onClick={onSwitchReviewer}>
            Switch name
          </Button>
        </div>
      )}
      {preview && (
        <p
          role="status"
          className="mb-4 rounded-md bg-warning-bg p-3 text-sm text-warning-deep"
        >
          Local preview. These sample answers are not saved to the server.
        </p>
      )}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-ink-2">
            <Languages className="size-4" /> RIVET · Arabic review
          </p>
          <h1 className="text-[26px] font-semibold">Make it sound like us.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">
            Choose the Arabic you would actually use. Save each answer, compare
            your choices, then approve the wording together.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={dirty || !connected}
            onClick={download}
          >
            <Download className="size-4" /> Export{" "}
            {snapshot.ready ? "approved choices" : "draft choices"}
          </Button>
          <a
            className="inline-flex min-h-11 items-center rounded-md border border-line-2 bg-white px-3 text-sm font-medium"
            href="/arabic-implementation-prompt.txt"
            download
          >
            Agent prompt
          </a>
        </div>
      </header>
      <div className="my-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-sm text-ink-2">Your saved answers</p>
          <p className="mt-1 text-xl font-semibold">
            {answered}{" "}
            <span className="text-sm font-normal text-ink-2">
              / {cards.length}
            </span>
          </p>
          <progress
            aria-label="Your review progress"
            value={answered}
            max={cards.length}
            className="mt-2 h-1.5 w-full accent-ink"
          />
        </div>
        <div>
          <p className="text-sm text-ink-2">Agreed together</p>
          <p className="mt-1 text-xl font-semibold">
            {agreed}{" "}
            <span className="text-sm font-normal text-ink-2">
              / {cards.length}
            </span>
          </p>
          <p className="mt-1 text-xs text-ink-2">
            Different answers stay open for discussion.
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p
            role="status"
            className={`text-sm font-medium ${connected ? "text-success" : "text-danger"}`}
          >
            {connected
              ? "Connected · saved answers sync live"
              : "Disconnected · reconnect before saving"}
          </p>
          <p className="mt-2 text-xs text-ink-2">
            {snapshot.reviewers
              .map(
                (reviewer) =>
                  `${reviewer.name}: ${snapshot.votes.filter((vote) => vote.userId === reviewer.id).length}`,
              )
              .join(" · ")}
          </p>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-xs font-medium">
          Find a word or situation
          <input
            className={`${fieldClass} mt-1`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Membership, refund, offline…"
          />
        </label>
        <label className="w-full text-xs font-medium sm:w-56">
          Section
          <select
            className={`${fieldClass} mt-1`}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option>All sections</option>
            {categories.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="w-full text-xs font-medium sm:w-44">
          Show
          <select
            className={`${fieldClass} mt-1`}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">Every question</option>
            <option value="mine">I haven’t answered</option>
            <option value="different">Discuss together</option>
            <option value="waiting">Waiting for both</option>
            <option value="agreed">Agreed</option>
          </select>
        </label>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <label className="text-xs font-medium xl:hidden">
          Jump to a question
          <select
            className={`${fieldClass} mt-1`}
            value={visible.some((card) => card.id === activeId) ? activeId : ""}
            onChange={(event) => go(event.target.value)}
          >
            <option value="" disabled>
              Choose from {visible.length} questions
            </option>
            {visible.map((card) => (
              <option key={card.id} value={card.id}>
                {card.english}
              </option>
            ))}
          </select>
        </label>
        <nav
          aria-label="Review questions"
          className="hidden max-h-48 xl:block overflow-y-auto rounded-lg border border-line bg-white xl:sticky xl:top-20 xl:max-h-[70vh]"
        >
          <p className="border-b border-line px-3 py-2 text-xs text-ink-2">
            {visible.length} questions in this view
          </p>
          {visible.length === 0 && (
            <p className="p-4 text-sm">
              No matching questions. Try another filter.
            </p>
          )}
          {visible.map((card) => (
            <button
              key={card.id}
              onClick={() => go(card.id)}
              aria-current={activeId === card.id ? "step" : undefined}
              className={`flex min-h-11 w-full items-start justify-between gap-2 border-b border-line px-3 py-3 text-start text-sm last:border-0 hover:bg-sunken ${activeId === card.id ? "bg-sunken font-semibold" : ""}`}
            >
              <span>{card.english}</span>
              <span
                className="shrink-0 text-xs text-ink-2"
                aria-label={
                  statusLabels[
                    cardStatus(card, snapshot.votes, snapshot.reviewers)
                  ]
                }
              >
                {cardStatus(card, snapshot.votes, snapshot.reviewers) ===
                "agreed" ? (
                  <Check className="size-4" />
                ) : snapshot.votes.some(
                    (vote) =>
                      vote.cardId === card.id && vote.userId === snapshot.me,
                  ) ? (
                  "Saved"
                ) : (
                  ""
                )}
              </span>
            </button>
          ))}
        </nav>
        <div
          ref={cardRegion}
          tabIndex={-1}
          aria-label="Current review question"
          className="min-w-0 scroll-mt-20 space-y-5 outline-none"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-2">
            <span>
              {active.category} · {cards.indexOf(active) + 1} of {cards.length}
            </span>
            <span>
              {
                statusLabels[
                  cardStatus(active, snapshot.votes, snapshot.reviewers)
                ]
              }
            </span>
          </div>
          <AnswerEditor
            key={active.id}
            card={active}
            mine={mine}
            connected={connected}
            save={save}
            onDirty={setDirty}
            onNext={next}
          />
          <section className="border-t border-line pt-5">
            <h2 className="text-base font-semibold">Together</h2>
            <p className="mt-1 text-xs text-ink-2">
              Save your answer to reveal the others. To agree on someone’s
              wording, select it above or use “Write my own”.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {snapshot.reviewers.map((reviewer) => {
                const vote = snapshot.votes.find(
                  (item) =>
                    item.cardId === active.id && item.userId === reviewer.id,
                );
                const presence = snapshot.presence.find(
                  (person) =>
                    person.userId === reviewer.id &&
                    now - person.seenAt < 90_000,
                );
                return (
                  <div
                    key={reviewer.id}
                    className="rounded-md border border-line bg-white p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">
                        {reviewer.name}
                        {reviewer.id === snapshot.me ? " (you)" : ""}
                      </h3>
                      {presence && (
                        <span className="text-xs text-success">Here now</span>
                      )}
                    </div>
                    {vote && (mine || reviewer.id === snapshot.me) ? (
                      <>
                        <p
                          dir="auto"
                          lang={vote.choice === "reject" ? "en" : "ar"}
                          style={arabicStyle}
                          className="mt-3 break-words text-lg leading-loose"
                        >
                          {voteText(active, vote)}
                        </p>
                        {vote.note && (
                          <p
                            dir="auto"
                            className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-2"
                          >
                            {vote.note}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-ink-2">
                          Saved {new Date(vote.updatedAt).toLocaleString()}
                        </p>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-ink-2">
                        {!mine && reviewer.id !== snapshot.me
                          ? "Revealed after you save your answer."
                          : "Hasn’t answered this one yet."}
                      </p>
                    )}
                    {reviewer.id !== snapshot.me && presence && (
                      <Button
                        variant="ghost"
                        className="mt-2"
                        onClick={() => {
                          if (!dirty)
                            setFollowing(
                              following === reviewer.id ? "" : reviewer.id,
                            );
                          else
                            setError(
                              "Save your answer before following another reviewer.",
                            );
                        }}
                      >
                        {following === reviewer.id
                          ? "Stop following"
                          : "Follow their questions"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            {following && (
              <p role="status" className="mt-2 text-xs">
                Following{" "}
                {
                  snapshot.reviewers.find(
                    (reviewer) => reviewer.id === following,
                  )?.name
                }
                . Following pauses while you edit.
              </p>
            )}
          </section>
          {!preview && (
            <History
              cardId={active.id}
              reviewers={snapshot.reviewers}
              reveal={Boolean(mine)}
            />
          )}
          <section className="border-t border-line pt-5">
            <h2 className="text-base font-semibold">Approve the rulebook</h2>
            <p className="my-2 text-sm text-ink-2">
              All {cards.length} questions need matching answers from both
              reviewers. Each person then approves this revision. Changing any
              answer or comment clears approvals.
            </p>
            <p className="mb-3 text-xs">
              {snapshot.ready
                ? "Approved by everyone. Ready for the implementation agent."
                : `${snapshot.approvals.length} of ${snapshot.reviewers.length} approvals · revision ${snapshot.revision}`}
            </p>
            <Button
              disabled={
                !connected ||
                dirty ||
                approving ||
                !reviewComplete(snapshot.votes, snapshot.reviewers) ||
                snapshot.approvals.includes(snapshot.me)
              }
              onClick={async () => {
                setApproving(true);
                setError("");
                try {
                  await approve();
                } catch (cause) {
                  setError(friendlyError(cause));
                } finally {
                  setApproving(false);
                }
              }}
            >
              {approving
                ? "Saving approval…"
                : snapshot.approvals.includes(snapshot.me)
                  ? "You approved this revision"
                  : "Approve agreed wording"}
            </Button>
          </section>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
function AnswerEditor({
  card,
  mine,
  connected,
  save,
  onDirty,
  onNext,
}: {
  card: ReviewCard;
  mine?: ReviewVote;
  connected: boolean;
  save: RoomProps["save"];
  onDirty: (dirty: boolean) => void;
  onNext: () => void;
}) {
  const [choice, setChoice] = useState(mine?.choice ?? "");
  const [customText, setCustomText] = useState(mine?.customText ?? "");
  const [note, setNote] = useState(mine?.note ?? "");
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(
    mine?.updatedAt ?? 0,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(Boolean(mine));
  function edit() {
    setSaved(false);
    onDirty(true);
    setError("");
  }
  async function persist(advance: boolean) {
    setPending(true);
    setError("");
    try {
      const timestamp = await save({
        version: ARABIC_REVIEW_VERSION,
        cardId: card.id,
        choice,
        customText,
        note,
        expectedUpdatedAt,
      });
      if (typeof timestamp === "number") setExpectedUpdatedAt(timestamp);
      setSaved(true);
      onDirty(false);
      if (advance) onNext();
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setPending(false);
    }
  }
  // The server subscription confirms timestamps; retain typed drafts when
  // another tab changes the same answer so the user can explicitly reload it.
  useEffect(() => {
    if (saved && mine && mine.updatedAt >= expectedUpdatedAt) {
      setExpectedUpdatedAt(mine.updatedAt);
      setChoice(mine.choice);
      setCustomText(mine.customText);
      setNote(mine.note);
    }
  }, [mine, saved, expectedUpdatedAt]);
  const stale = !saved && (mine?.updatedAt ?? 0) !== expectedUpdatedAt;
  return (
    <section className="rounded-lg border border-line bg-white p-4 sm:p-6">
      <h2 className="text-xl font-semibold">{card.english}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{card.context}</p>
      <fieldset disabled={pending} className="mt-6">
        <legend className="mb-3 text-sm font-medium">
          Which wording would you use?
        </legend>
        <div className="space-y-2">
          {card.options.map((option, i) => (
            <label
              key={option.id}
              className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-md border p-3 ${choice === option.id ? "border-ink bg-sunken" : "border-line hover:bg-paper"}`}
            >
              <input
                type="radio"
                name={`answer-${card.id}`}
                value={option.id}
                checked={choice === option.id}
                onChange={() => {
                  setChoice(option.id);
                  edit();
                }}
                className="size-4 shrink-0 accent-ink"
              />
              <span className="text-xs text-ink-2">
                {String.fromCharCode(65 + i)}
              </span>
              <span
                lang="ar"
                dir="rtl"
                style={arabicStyle}
                className="min-w-0 flex-1 text-lg leading-loose"
              >
                {option.text}
              </span>
            </label>
          ))}
          <label className="flex min-h-11 cursor-pointer items-center gap-3 px-1 text-sm">
            <input
              type="radio"
              name={`answer-${card.id}`}
              checked={choice === "reject"}
              onChange={() => {
                setChoice("reject");
                edit();
              }}
              className="size-4 accent-ink"
            />{" "}
            None of these — needs another draft
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 px-1 text-sm">
            <input
              type="radio"
              name={`answer-${card.id}`}
              checked={choice === "custom"}
              onChange={() => {
                setChoice("custom");
                edit();
              }}
              className="size-4 accent-ink"
            />{" "}
            Write my own
          </label>
          {choice === "custom" && (
            <label className="block text-sm">
              Your Arabic wording
              <textarea
                lang="ar"
                dir="rtl"
                style={arabicStyle}
                className={`${fieldClass} mt-2 text-lg`}
                maxLength={1000}
                value={customText}
                onChange={(event) => {
                  setCustomText(event.target.value);
                  edit();
                }}
              />
            </label>
          )}
          <label className="block pt-3 text-sm">
            Why this wording? <span className="text-ink-2">(optional)</span>
            <textarea
              dir="auto"
              className={`${fieldClass} mt-2`}
              placeholder="What sounds right, what to avoid, or where this should apply…"
              maxLength={2000}
              rows={2}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                edit();
              }}
            />
          </label>
        </div>
      </fieldset>
      {stale && (
        <div role="alert" className="mt-3 text-sm text-warning-deep">
          This answer changed in another tab.{" "}
          <button
            className="underline"
            onClick={() => {
              setChoice(mine?.choice ?? "");
              setCustomText(mine?.customText ?? "");
              setNote(mine?.note ?? "");
              setExpectedUpdatedAt(mine?.updatedAt ?? 0);
              setSaved(Boolean(mine));
              onDirty(false);
              setError("");
            }}
          >
            Reload saved answer
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p role="status" className="text-xs text-ink-2">
          {pending
            ? "Saving to server…"
            : saved
              ? "Answer saved"
              : choice
                ? "Unsaved answer"
                : "Choose an answer to begin"}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={
              !choice ||
              pending ||
              !connected ||
              stale ||
              (choice === "custom" && !customText.trim())
            }
            onClick={() => void persist(false)}
          >
            Save answer
          </Button>
          <Button
            disabled={
              !choice ||
              pending ||
              !connected ||
              stale ||
              (choice === "custom" && !customText.trim())
            }
            onClick={() => void persist(true)}
          >
            Save & next <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <details className="mt-4 text-xs text-ink-2">
        <summary className="cursor-pointer py-2">Context and source</summary>
        <p className="mb-2">
          {card.sourceKind === "source-match"
            ? "Related wording found in the current product:"
            : "Editorial scenario for a language or formatting decision; not an exact quotation from a screen."}
        </p>
        <ul className="space-y-1 break-all">
          {card.sources.map((source) => (
            <li key={`${source.file}:${source.line}`}>
              {source.file}:{source.line}
            </li>
          ))}
        </ul>
        <p className="mt-2">
          Options are drafts for you to judge. Picking a voice never changes
          what a payment, permission or warning actually means.
        </p>
      </details>
    </section>
  );
}
function History({
  cardId,
  reviewers,
  reveal,
}: {
  cardId: string;
  reviewers: ReviewSnapshot["reviewers"];
  reveal: boolean;
}) {
  const [open, setOpen] = useState(false);
  const history = useQuery(
    api.arabicReview.history,
    open && reveal ? { cardId } : "skip",
  );
  const card = cards.find((item) => item.id === cardId)!;
  return (
    <div>
      <Button variant="ghost" disabled={!reveal} onClick={() => setOpen(!open)}>
        <RefreshCw className="size-4" /> {open ? "Hide" : "Show"} answer history
      </Button>
      {open && reveal && (
        <ul className="mt-2 space-y-3 border-s border-line ps-4 text-sm">
          {!history ? (
            <li>Loading history…</li>
          ) : (
            history.map((vote) => (
              <li key={vote._id}>
                <p className="text-xs text-ink-2">
                  {reviewers.find((person) => person.id === vote.userId)
                    ?.name ?? "Former reviewer"}{" "}
                  · {new Date(vote.updatedAt).toLocaleString()}
                </p>
                <p dir="auto" style={arabicStyle} className="text-base">
                  {voteText(card, vote)}
                </p>
                {vote.note && <p dir="auto">{vote.note}</p>}
              </li>
            ))
          )}
          <li className="text-xs text-ink-2">
            Showing the latest 30 saved changes for this question.
          </li>
        </ul>
      )}
    </div>
  );
}
