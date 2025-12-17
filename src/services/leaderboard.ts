/**
 * Leaderboard service for flu-services API integration
 * Uses Vite proxy in dev (/api/flu -> flu-services.vercel.app)
 * In production, API key is included in client bundle (acceptable for game leaderboard)
 */

const API_BASE = import.meta.env.DEV ? '/api/flu' : 'https://flu-services.vercel.app/api';
const API_KEY = import.meta.env.VITE_FLU_API_KEY || '';
const GAME_SLUG = 'christmas-market-mayhem';

// Auth header only needed in production (proxy handles it in dev)
const getHeaders = (includeContentType = false): HeadersInit => {
  const headers: HeadersInit = {};
  if (!import.meta.env.DEV && API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
};

export interface LeaderboardEntry {
  rank: number;
  handle: string;
  score: number;
  metadata?: {
    kills?: number;
    tier?: string;
    gameTime?: number;
  };
  createdAt: string;
}

export interface LeaderboardResponse {
  scores: LeaderboardEntry[];
  total: number;
}

export interface SubmitScoreResponse {
  rank: number;
  total: number;
}

/**
 * Fetch the leaderboard
 */
export async function fetchLeaderboard(limit = 10): Promise<LeaderboardResponse> {
  try {
    const response = await fetch(
      `${API_BASE}/leaderboards/${GAME_SLUG}?limit=${limit}`,
      { headers: getHeaders() }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch leaderboard: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Leaderboard fetch error:', error);
    return { scores: [], total: 0 };
  }
}

/**
 * Submit a score to the leaderboard
 */
export async function submitScore(
  handle: string,
  score: number,
  metadata?: {
    kills?: number;
    tier?: string;
    gameTime?: number;
  }
): Promise<SubmitScoreResponse | null> {
  try {
    const response = await fetch(
      `${API_BASE}/leaderboards/${GAME_SLUG}`,
      {
        method: 'POST',
        headers: getHeaders(true),
        body: JSON.stringify({
          handle,
          score,
          metadata,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('Score submission error:', error);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Score submission error:', error);
    return null;
  }
}

/**
 * Validate handle format (3 uppercase letters)
 */
export function isValidHandle(handle: string): boolean {
  return /^[A-Z]{3}$/.test(handle);
}
