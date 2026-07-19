export type GradeEntry = {
  score: number;
  weight: number;
  published: boolean;
};

export function computeOverallGrade(
  entries: GradeEntry[],
): number | null {
  const published = entries.filter((e) => e.published);
  if (published.length === 0) return null;

  const totalWeight = published.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight === 0) return null;

  const weightedSum = published.reduce(
    (sum, e) => sum + e.score * e.weight,
    0,
  );

  return Math.round((weightedSum / totalWeight) * 100) / 100;
}
