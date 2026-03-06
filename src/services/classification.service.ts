/**
 * WitnessLedger — Auto Department Classification Service
 *
 * Rule-based keyword NLP classifier that maps complaint text to one
 * of the six Department enum values without requiring any paid API.
 *
 * Scoring:
 *  +2  exact whole-word match
 *  +2  multi-word phrase match (checked against original text)
 *  +1  substring / partial overlap
 *
 * Confidence bands:
 *  HIGH    → top score ≥ 4  AND top score ≥ 2× second-best score
 *  MEDIUM  → top score ≥ 2
 *  LOW     → no clear match (falls back to MUNICIPAL as default)
 */
import { Department } from '../generated/prisma/client.js';

// ── Keyword dictionary ────────────────────────────────────────────────────────
const DEPARTMENT_KEYWORDS: Record<Department, string[]> = {
  [Department.WATER]: [
    'water', 'pipeline', 'tap', 'supply', 'leak', 'pipe', 'sewage',
    'flood', 'drainage', 'bore', 'borewell', 'well', 'tank', 'pump',
    'plumber', 'hydrant', 'contamination', 'muddy water', 'no water',
    'water supply', 'water leakage', 'burst pipe', 'water logging',
  ],
  [Department.ELECTRICITY]: [
    'electricity', 'power', 'light', 'transformer', 'outage', 'wire', 'cable',
    'electric', 'voltage', 'blackout', 'streetlight', 'street light', 'bulb',
    'pole', 'electric pole', 'switch', 'meter', 'generator', 'spark', 'fuse',
    'no power', 'power cut', 'power outage', 'electric shock', 'live wire',
    'short circuit', 'tripping',
  ],
  [Department.MUNICIPAL]: [
    'road', 'pothole', 'garbage', 'drain', 'street', 'waste', 'trash', 'rubbish',
    'footpath', 'pavement', 'sidewalk', 'manhole', 'dumping', 'cleanliness',
    'sweeping', 'park', 'tree', 'encroachment', 'open drain', 'blocked drain',
    'garbage dump', 'solid waste', 'broken road', 'road repair', 'road damage',
  ],
  [Department.SANITATION]: [
    'toilet', 'latrine', 'open defecation', 'sewer', 'stench', 'smell',
    'bathroom', 'public toilet', 'hygiene', 'waste disposal', 'pit', 'compost',
    'foul smell', 'dirty water', 'sanitation', 'human waste', 'open sewer',
    'overflowing', 'sewage overflow',
  ],
  [Department.HEALTH]: [
    'hospital', 'clinic', 'doctor', 'medicine', 'health', 'disease', 'epidemic',
    'mosquito', 'dengue', 'malaria', 'vector', 'vaccine', 'ambulance',
    'dead animal', 'rat', 'pest', 'fumigation', 'cockroach', 'infection',
    'contaminated', 'unhealthy', 'fever', 'outbreak', 'stagnant water',
  ],
  [Department.TRANSPORT]: [
    'bus', 'traffic', 'signal', 'road block', 'speed breaker', 'zebra crossing',
    'bridge', 'flyover', 'vehicle', 'parking', 'auto', 'rickshaw', 'transport',
    'route', 'commute', 'bus stop', 'traffic light', 'no parking',
    'road divider', 'footover bridge', 'illegal parking',
  ],
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClassificationResult {
  /** Best-matched department. */
  department: Department;
  /** Confidence level of the prediction. */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Raw scores for every department (for debugging / display). */
  scores: Record<string, number>;
  /** True when department was auto-classified (not user-provided). */
  autoClassified: boolean;
}

// ── Core logic ────────────────────────────────────────────────────────────────

/**
 * Tokenise input text into lowercase, alphanumeric tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Score an input text against all department keyword lists.
 * Returns a sorted array of [department, score] pairs (descending).
 */
function scoreAll(rawText: string): [string, number][] {
  const lower  = rawText.toLowerCase();
  const tokens = tokenize(rawText);

  const scores: Record<string, number> = {};

  for (const [dept, keywords] of Object.entries(DEPARTMENT_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (keyword.includes(' ')) {
        // Multi-word phrase — check against full text (+2 per hit)
        if (lower.includes(keyword)) score += 2;
      } else {
        for (const token of tokens) {
          if (token === keyword) {
            score += 2; // exact whole-word match
          } else if (token.includes(keyword) || keyword.includes(token)) {
            score += 1; // partial overlap
          }
        }
      }
    }
    scores[dept] = score;
  }

  return Object.entries(scores).sort(([, a], [, b]) => b - a);
}

/**
 * Classify the department for a civic complaint based on its title and description.
 *
 * @param title       Issue title
 * @param description Optional issue description
 * @param provided    If the user already specified a department, pass it here to
 *                    skip classification but still return scores for transparency.
 */
export function classifyDepartment(
  title: string,
  description?: string,
  provided?: string,
): ClassificationResult {
  const text   = [title, description].filter(Boolean).join(' ');
  const ranked = scoreAll(text);

  const [topDept, topScore]    = ranked[0];
  const [,        secondScore] = ranked[1] ?? ['', 0];

  const confidence: ClassificationResult['confidence'] =
    topScore >= 4 && topScore >= secondScore * 2 ? 'HIGH'   :
    topScore >= 2                                 ? 'MEDIUM' : 'LOW';

  const scores = Object.fromEntries(ranked);

  // If the caller already provided a department, honour it but still return scores
  if (provided) {
    return {
      department:     provided as Department,
      confidence:     'HIGH',   // user chose it explicitly
      scores,
      autoClassified: false,
    };
  }

  return {
    department:     topScore > 0 ? (topDept as Department) : Department.MUNICIPAL,
    confidence,
    scores,
    autoClassified: true,
  };
}
