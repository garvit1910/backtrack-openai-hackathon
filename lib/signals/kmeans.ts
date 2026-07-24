/**
 * Seeded k-means++ over unit-normalized vectors (euclidean on normalized
 * vectors is monotone with cosine distance). Deterministic: same input,
 * same seed, same clusters.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

function dist2(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

export interface KMeansResult {
  assignments: number[];
  centroids: number[][];
}

export function kmeans(vectors: number[][], k: number, seed = 42): KMeansResult {
  const rand = mulberry32(seed);
  const n = vectors.length;
  const X = vectors.map(normalize);

  // k-means++ init
  const centroids: number[][] = [X[Math.floor(rand() * n)]];
  while (centroids.length < k) {
    const d = X.map((x) => Math.min(...centroids.map((c) => dist2(x, c))));
    const total = d.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    let idx = 0;
    for (; idx < n - 1 && r > d[idx]; idx++) r -= d[idx];
    centroids.push(X[idx]);
  }

  let assignments = new Array<number>(n).fill(0);
  for (let iter = 0; iter < 60; iter++) {
    const next = X.map((x) => {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist2(x, centroids[c]);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      return best;
    });
    const changed = next.some((a, i) => a !== assignments[i]);
    assignments = next;
    for (let c = 0; c < k; c++) {
      const members = X.filter((_, i) => assignments[i] === c);
      if (members.length === 0) continue;
      const dim = X[0].length;
      const mean = new Array<number>(dim).fill(0);
      for (const m of members) for (let j = 0; j < dim; j++) mean[j] += m[j];
      centroids[c] = normalize(mean.map((x) => x / members.length));
    }
    if (!changed) break;
  }
  return { assignments, centroids };
}

/** indexes of the `count` vectors nearest to a centroid */
export function nearestTo(
  centroid: number[],
  vectors: number[][],
  memberIdx: number[],
  count: number
): number[] {
  return memberIdx
    .map((i) => ({ i, d: dist2(normalize(vectors[i]), centroid) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((x) => x.i);
}
