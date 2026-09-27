export interface RecommendationWork {
  id: string;
  title: string;
  format: string;
  tags: string[];
}

export interface WorkInteraction {
  userId: string;
  workId: string;
  kind: "favorite" | "watched";
}

export interface PersonalizedRecommendation {
  id: string;
  title: string;
  format: string;
  tagFitScore: number;
  similarMemberScore: number;
  recommendationScore: number;
  sharedTags: string[];
  similarMemberCount: number;
}

export interface PersonalizedRecommendationResult {
  recommendations: PersonalizedRecommendation[];
  coldStart: boolean;
}

export function filterEligibleInteractions(
  currentUserId: string,
  optedInUserIds: ReadonlySet<string>,
  interactions: WorkInteraction[],
): WorkInteraction[] {
  return interactions.filter(
    (interaction) =>
      interaction.userId === currentUserId || optedInUserIds.has(interaction.userId),
  );
}

const FAVORITE_WEIGHT = 2;
const WATCHED_WEIGHT = 1;
const TAG_WEIGHT = 0.35;
const SIMILAR_MEMBER_WEIGHT = 0.65;

function interactionWeight(kind: WorkInteraction["kind"]): number {
  return kind === "favorite" ? FAVORITE_WEIGHT : WATCHED_WEIGHT;
}

function roundScore(score: number): number {
  return Math.round(score * 10) / 10;
}

function weightedJaccard(
  left: Map<string, number>,
  right: Map<string, number>,
): number {
  const workIds = new Set([...left.keys(), ...right.keys()]);
  if (workIds.size === 0) return 0;

  let intersection = 0;
  let union = 0;
  for (const workId of workIds) {
    const leftWeight = left.get(workId) ?? 0;
    const rightWeight = right.get(workId) ?? 0;
    intersection += Math.min(leftWeight, rightWeight);
    union += Math.max(leftWeight, rightWeight);
  }
  return union === 0 ? 0 : intersection / union;
}

export function rankPersonalizedWorks(
  userId: string,
  works: RecommendationWork[],
  interactions: WorkInteraction[],
  limit: number,
): PersonalizedRecommendationResult {
  const workById = new Map(works.map((work) => [work.id, work]));
  const interactionWeights = new Map<string, Map<string, number>>();

  for (const interaction of interactions) {
    if (!workById.has(interaction.workId)) continue;
    const profile = interactionWeights.get(interaction.userId) ?? new Map<string, number>();
    const weight = interactionWeight(interaction.kind);
    profile.set(interaction.workId, Math.max(profile.get(interaction.workId) ?? 0, weight));
    interactionWeights.set(interaction.userId, profile);
  }

  const userProfile = interactionWeights.get(userId) ?? new Map<string, number>();
  if (userProfile.size === 0) {
    return { recommendations: [], coldStart: true };
  }
  const interactedWorkIds = new Set(userProfile.keys());
  const interestWeights = new Map<string, number>();

  for (const [workId, weight] of userProfile) {
    const tags = new Set((workById.get(workId)?.tags ?? []).map((tag) => tag.toLowerCase()));
    for (const normalizedTag of tags) {
      interestWeights.set(normalizedTag, (interestWeights.get(normalizedTag) ?? 0) + weight);
    }
  }

  const neighbors = [...interactionWeights.entries()]
    .filter(([neighborId]) => neighborId !== userId)
    .map(([neighborId, profile]) => ({
      profile,
      matchScore: weightedJaccard(userProfile, profile) * 100,
    }))
    .filter((neighbor) => neighbor.matchScore > 0);

  const maxSimilarMemberSignal = neighbors.reduce(
    (total, neighbor) => total + neighbor.matchScore * FAVORITE_WEIGHT,
    0,
  );
  const coldStart = maxSimilarMemberSignal === 0;
  const totalInterestWeight = [...interestWeights.values()].reduce((sum, weight) => sum + weight, 0);

  const recommendations = works
    .filter((work) => !interactedWorkIds.has(work.id))
    .map((work): PersonalizedRecommendation => {
      const uniqueTags = [...new Map(
        work.tags.map((tag) => [tag.toLowerCase(), tag]),
      ).values()];
      const workTags = new Set(uniqueTags.map((tag) => tag.toLowerCase()));
      const sharedTags = uniqueTags.filter((tag) => interestWeights.has(tag.toLowerCase()));
      const matchingInterestWeight = [...workTags].reduce(
        (sum, tag) => sum + (interestWeights.get(tag) ?? 0),
        0,
      );
      const tagFitScore = totalInterestWeight === 0
        ? 0
        : (matchingInterestWeight / totalInterestWeight) * 100;

      let neighborSignal = 0;
      let similarMemberCount = 0;
      for (const neighbor of neighbors) {
        const candidateWeight = neighbor.profile.get(work.id);
        if (candidateWeight === undefined) continue;
        neighborSignal += neighbor.matchScore * candidateWeight;
        similarMemberCount++;
      }
      const similarMemberScore = maxSimilarMemberSignal === 0
        ? 0
        : (neighborSignal / maxSimilarMemberSignal) * 100;
      const recommendationScore = coldStart
        ? tagFitScore
        : (TAG_WEIGHT * tagFitScore) + (SIMILAR_MEMBER_WEIGHT * similarMemberScore);

      return {
        id: work.id,
        title: work.title,
        format: work.format,
        tagFitScore: roundScore(tagFitScore),
        similarMemberScore: roundScore(similarMemberScore),
        recommendationScore: roundScore(recommendationScore),
        sharedTags,
        similarMemberCount,
      };
    })
    .sort((left, right) =>
      right.recommendationScore - left.recommendationScore ||
      left.title.localeCompare(right.title),
    )
    .slice(0, limit);

  return { recommendations, coldStart };
}
