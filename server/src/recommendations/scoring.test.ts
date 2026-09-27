import assert from "node:assert/strict";
import test from "node:test";
import {
  filterEligibleInteractions,
  rankPersonalizedWorks,
  type RecommendationWork,
  type WorkInteraction,
} from "./scoring.js";

const works: RecommendationWork[] = [
  { id: "shared", title: "Shared Interest", format: "Manga", tags: ["Yuri", "Slow burn"] },
  { id: "watched", title: "Watched by a Similar Member", format: "Anime", tags: ["Yuri"] },
  { id: "favorite", title: "Favorited by a Similar Member", format: "Manga", tags: ["Slow burn"] },
  { id: "other", title: "Unrelated", format: "Webtoon", tags: ["Fantasy"] },
];

test("favorite interactions count twice as much as watched interactions in member matching", () => {
  const interactions: WorkInteraction[] = [
    { userId: "current", workId: "shared", kind: "favorite" },
    { userId: "neighbor", workId: "shared", kind: "favorite" },
    { userId: "neighbor", workId: "watched", kind: "watched" },
    { userId: "neighbor", workId: "favorite", kind: "favorite" },
    { userId: "neighbor", workId: "other", kind: "watched" },
  ];

  const { recommendations } = rankPersonalizedWorks("current", works, interactions, 10);
  const watched = recommendations.find((work) => work.id === "watched");
  const favorite = recommendations.find((work) => work.id === "favorite");

  assert.ok(watched);
  assert.ok(favorite);
  assert.ok(favorite.similarMemberScore > watched.similarMemberScore);
  assert.equal(favorite.similarMemberScore, watched.similarMemberScore * 2);
});

test("recommendation score combines 35 percent tag fit and 65 percent similar-member signal", () => {
  const interactions: WorkInteraction[] = [
    { userId: "current", workId: "shared", kind: "favorite" },
    { userId: "neighbor", workId: "shared", kind: "favorite" },
    { userId: "neighbor", workId: "watched", kind: "watched" },
  ];

  const { recommendations, coldStart } = rankPersonalizedWorks("current", works, interactions, 10);
  const watched = recommendations.find((work) => work.id === "watched");

  assert.equal(coldStart, false);
  assert.ok(watched);
  assert.equal(
    watched.recommendationScore,
    Math.round((0.35 * watched.tagFitScore + 0.65 * watched.similarMemberScore) * 10) / 10,
  );
});

test("cold start ranks by tag fit without pretending a collaborative signal exists", () => {
  const interactions: WorkInteraction[] = [
    { userId: "current", workId: "shared", kind: "favorite" },
  ];

  const { recommendations, coldStart } = rankPersonalizedWorks("current", works, interactions, 10);
  const topRecommendation = recommendations[0];

  assert.equal(coldStart, true);
  assert.ok(topRecommendation);
  assert.equal(topRecommendation.recommendationScore, topRecommendation.tagFitScore);
  assert.equal(topRecommendation.similarMemberScore, 0);
  assert.equal(topRecommendation.tagFitScore, 50);
});

test("excludes a user's own favorite and watched works from recommendations", () => {
  const interactions: WorkInteraction[] = [
    { userId: "current", workId: "shared", kind: "favorite" },
    { userId: "current", workId: "watched", kind: "watched" },
  ];

  const { recommendations } = rankPersonalizedWorks("current", works, interactions, 10);

  assert.deepEqual(
    recommendations.map((work) => work.id).sort(),
    ["favorite", "other"],
  );
});

test("returns no ranked results before the member has any activity", () => {
  const { recommendations, coldStart } = rankPersonalizedWorks("new-member", works, [], 10);
  assert.equal(coldStart, true);
  assert.deepEqual(recommendations, []);
});

test("activity from a closer-matching member contributes more to the score", () => {
  const scoredWorks: RecommendationWork[] = [
    { id: "shared", title: "Shared", format: "Manga", tags: ["Yuri"] },
    { id: "close-pick", title: "Close Match Pick", format: "Manga", tags: ["Yuri"] },
    { id: "weak-pick", title: "Weak Match Pick", format: "Manga", tags: ["Yuri"] },
    { id: "weak-history", title: "Weak Match History", format: "Manga", tags: ["Yuri"] },
  ];
  const interactions: WorkInteraction[] = [
    { userId: "current", workId: "shared", kind: "favorite" },
    { userId: "close", workId: "shared", kind: "favorite" },
    { userId: "close", workId: "close-pick", kind: "favorite" },
    { userId: "weak", workId: "shared", kind: "favorite" },
    { userId: "weak", workId: "weak-pick", kind: "favorite" },
    { userId: "weak", workId: "weak-history", kind: "watched" },
  ];
  const { recommendations } = rankPersonalizedWorks("current", scoredWorks, interactions, 10);
  const closePick = recommendations.find((work) => work.id === "close-pick");
  const weakPick = recommendations.find((work) => work.id === "weak-pick");

  assert.ok(closePick);
  assert.ok(weakPick);
  assert.ok(closePick.similarMemberScore > weakPick.similarMemberScore);
});

test("uses other members' activity only after they opt in, but always uses the current member's", () => {
  const interactions: WorkInteraction[] = [
    { userId: "current", workId: "shared", kind: "favorite" },
    { userId: "opted-in", workId: "favorite", kind: "favorite" },
    { userId: "not-opted-in", workId: "watched", kind: "watched" },
  ];

  assert.deepEqual(
    filterEligibleInteractions("current", new Set(["opted-in"]), interactions),
    [interactions[0], interactions[1]],
  );
});

test("a favorite and watched flag for the same work do not double-count as separate activity", () => {
  const baseInteractions: WorkInteraction[] = [
    { userId: "current", workId: "shared", kind: "favorite" },
    { userId: "neighbor", workId: "shared", kind: "favorite" },
    { userId: "neighbor", workId: "favorite", kind: "favorite" },
  ];
  const withDuplicate: WorkInteraction[] = [
    ...baseInteractions,
    { userId: "neighbor", workId: "favorite", kind: "watched" },
  ];

  const base = rankPersonalizedWorks("current", works, baseInteractions, 10);
  const duplicate = rankPersonalizedWorks("current", works, withDuplicate, 10);
  assert.deepEqual(duplicate, base);
});
