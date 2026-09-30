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

test("matching a favorite makes a member a stronger neighbor than matching watched-only activity", () => {
  const scoredWorks: RecommendationWork[] = [
    { id: "favorite-overlap", title: "Favorite Overlap", format: "Manga", tags: ["Yuri"] },
    { id: "watched-overlap", title: "Watched Overlap", format: "Manga", tags: ["Yuri"] },
    { id: "favorite-neighbor-pick", title: "Favorite Neighbor Pick", format: "Manga", tags: ["Yuri"] },
    { id: "watched-neighbor-pick", title: "Watched Neighbor Pick", format: "Manga", tags: ["Yuri"] },
  ];
  const interactions: WorkInteraction[] = [
    { userId: "current", workId: "favorite-overlap", kind: "favorite" },
    { userId: "current", workId: "watched-overlap", kind: "watched" },
    { userId: "favorite-neighbor", workId: "favorite-overlap", kind: "favorite" },
    { userId: "favorite-neighbor", workId: "favorite-neighbor-pick", kind: "favorite" },
    { userId: "watched-neighbor", workId: "watched-overlap", kind: "watched" },
    { userId: "watched-neighbor", workId: "watched-neighbor-pick", kind: "favorite" },
  ];
  const { recommendations } = rankPersonalizedWorks("current", scoredWorks, interactions, 10);
  const favoritePick = recommendations.find((work) => work.id === "favorite-neighbor-pick");
  const watchedPick = recommendations.find((work) => work.id === "watched-neighbor-pick");

  assert.ok(favoritePick);
  assert.ok(watchedPick);
  assert.ok(favoritePick.similarMemberScore > watchedPick.similarMemberScore);
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

test("matching communities boosts member similarity and recommendation score", () => {
  const scoredWorks: RecommendationWork[] = [
    { id: "shared", title: "Shared", format: "Manga", tags: ["Yuri"] },
    { id: "community-neighbor-pick", title: "Community Pick", format: "Manga", tags: ["Yuri"] },
    { id: "other-neighbor-pick", title: "Other Pick", format: "Manga", tags: ["Yuri"] },
  ];
  const interactions: WorkInteraction[] = [
    { userId: "current", workId: "shared", kind: "favorite" },
    { userId: "neighbor-with-community", workId: "shared", kind: "favorite" },
    { userId: "neighbor-with-community", workId: "community-neighbor-pick", kind: "favorite" },
    { userId: "neighbor-without-community", workId: "shared", kind: "favorite" },
    { userId: "neighbor-without-community", workId: "other-neighbor-pick", kind: "favorite" },
  ];
  const communityInteractions = [
    { userId: "current", communityId: "yuri-fanatics" },
    { userId: "neighbor-with-community", communityId: "yuri-fanatics" },
  ];

  const { recommendations } = rankPersonalizedWorks(
    "current",
    scoredWorks,
    interactions,
    10,
    communityInteractions,
  );
  const communityPick = recommendations.find((w) => w.id === "community-neighbor-pick");
  const otherPick = recommendations.find((w) => w.id === "other-neighbor-pick");

  assert.ok(communityPick);
  assert.ok(otherPick);
  assert.ok(communityPick.similarMemberScore > otherPick.similarMemberScore);
});

test("matching ships boosts member similarity and recommendation score", () => {
  const scoredWorks: RecommendationWork[] = [
    { id: "shared", title: "Shared", format: "Manga", tags: ["Yuri"] },
    { id: "ship-neighbor-pick", title: "Ship Pick", format: "Manga", tags: ["Yuri"] },
    { id: "plain-neighbor-pick", title: "Plain Pick", format: "Manga", tags: ["Yuri"] },
  ];
  const interactions: WorkInteraction[] = [
    { userId: "current", workId: "shared", kind: "favorite" },
    { userId: "neighbor-ship", workId: "shared", kind: "favorite" },
    { userId: "neighbor-ship", workId: "ship-neighbor-pick", kind: "favorite" },
    { userId: "neighbor-plain", workId: "shared", kind: "favorite" },
    { userId: "neighbor-plain", workId: "plain-neighbor-pick", kind: "favorite" },
  ];
  const shipInteractions = [
    { userId: "current", shipId: "touko-yuu" },
    { userId: "neighbor-ship", shipId: "touko-yuu" },
  ];

  const { recommendations } = rankPersonalizedWorks(
    "current",
    scoredWorks,
    interactions,
    10,
    [],
    shipInteractions,
  );
  const shipPick = recommendations.find((w) => w.id === "ship-neighbor-pick");
  const plainPick = recommendations.find((w) => w.id === "plain-neighbor-pick");

  assert.ok(shipPick);
  assert.ok(plainPick);
  assert.ok(shipPick.similarMemberScore > plainPick.similarMemberScore);
});
