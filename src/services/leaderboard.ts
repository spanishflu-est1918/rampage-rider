/**
 * Leaderboard service for flu-services API integration
 * Uses Vite proxy in dev (/api/flu -> flu-services.vercel.app)
 * API key is injected server-side by the proxy
 */

const API_BASE = '/api/flu';
const GAME_SLUG = 'christmas-market-mayhem';

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
      `${API_BASE}/leaderboards/${GAME_SLUG}?limit=${limit}`
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
        headers: {
          'Content-Type': 'application/json',
        },
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
