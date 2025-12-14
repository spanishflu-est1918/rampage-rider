import React, { useState, useEffect } from 'react';
import { fetchLeaderboard, LeaderboardEntry } from '../../services/leaderboard';

// Neon colors matching the game UI
const NEON = {
  yellow: '#FFE500',
  cyan: '#00F5FF',
  magenta: '#FF00FF',
  red: '#FF3333',
  orange: '#FF8800',
  purple: '#AA55FF',
};

interface LeaderboardPanelProps {
  limit?: number;
  highlightRank?: number; // Highlight the player's rank after submission
  compact?: boolean; // Compact mode for loading screen
  onLoaded?: () => void;
}

export const LeaderboardPanel: React.FC<LeaderboardPanelProps> = ({
  limit = 10,
  highlightRank,
  compact = false,
  onLoaded,
}) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(false);

      const data = await fetchLeaderboard(limit);

      if (mounted) {
        if (data.scores.length === 0 && data.total === 0) {
          setError(true);
        } else {
          setEntries(data.scores);
          setTotal(data.total);
        }
        setLoading(false);
        onLoaded?.();
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [limit, onLoaded]);

  if (loading) {
    return (
      <div className={`text-center ${compact ? 'py-4' : 'py-8'}`}>
        <p className="text-xs retro animate-pulse" style={{ color: NEON.cyan }}>
          LOADING SCORES...
        </p>
      </div>
    );
  }

  if (error || entries.length === 0) {
    return (
      <div className={`text-center ${compact ? 'py-4' : 'py-8'}`}>
        <p className="text-xs retro" style={{ color: '#666' }}>
          {error ? 'LEADERBOARD UNAVAILABLE' : 'NO SCORES YET'}
        </p>
        <p className="text-[10px] retro mt-1" style={{ color: '#444' }}>
          BE THE FIRST!
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? '' : 'space-y-2'}>
      {/* Header */}
      <div
        className="flex justify-between items-center px-2 py-1"
        style={{
          borderBottom: `2px solid ${NEON.yellow}40`,
        }}
      >
        <span className="text-[10px] retro tracking-widest" style={{ color: NEON.yellow }}>
          TOP {limit}
        </span>
        <span className="text-[9px] retro" style={{ color: '#666' }}>
          {total} TOTAL
        </span>
      </div>

      {/* Entries */}
      <div className={`space-y-0.5 ${compact ? 'max-h-[180px] overflow-y-auto' : ''}`}>
        {entries.map((entry, index) => {
          const isHighlighted = highlightRank === entry.rank;
          const isTop3 = entry.rank <= 3;
          const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32']; // Gold, Silver, Bronze

          return (
            <div
              key={`${entry.handle}-${entry.rank}-${index}`}
              className="flex items-center gap-2 px-2 py-1 transition-all"
              style={{
                background: isHighlighted
                  ? `linear-gradient(90deg, ${NEON.cyan}20 0%, transparent 100%)`
                  : isTop3
                    ? `linear-gradient(90deg, ${rankColors[entry.rank - 1]}10 0%, transparent 100%)`
                    : 'transparent',
                borderLeft: isHighlighted ? `3px solid ${NEON.cyan}` : '3px solid transparent',
              }}
            >
              {/* Rank */}
              <span
                className="w-6 text-right text-xs retro font-bold"
                style={{
                  color: isTop3 ? rankColors[entry.rank - 1] : '#666',
                  textShadow: isTop3 ? `0 0 8px ${rankColors[entry.rank - 1]}60` : 'none',
                }}
              >
                {entry.rank}
              </span>

              {/* Handle */}
              <span
                className="w-12 text-sm retro font-bold tracking-wider"
                style={{
                  color: isHighlighted ? NEON.cyan : '#fff',
                  textShadow: isHighlighted ? `0 0 10px ${NEON.cyan}80` : 'none',
                }}
              >
                {entry.handle}
              </span>

              {/* Score */}
              <span
                className="flex-1 text-right text-sm retro"
                style={{
                  color: isHighlighted ? NEON.yellow : NEON.red,
                  textShadow: `0 0 8px ${isHighlighted ? NEON.yellow : NEON.red}40`,
                }}
              >
                {entry.score.toLocaleString()}
              </span>

              {/* Metadata (kills) - only if not compact */}
              {!compact && entry.metadata?.kills !== undefined && (
                <span
                  className="text-[10px] retro"
                  style={{ color: '#666' }}
                >
                  {entry.metadata.kills}K
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      {!compact && total > limit && (
        <div className="text-center pt-2">
          <p className="text-[9px] retro" style={{ color: '#444' }}>
            +{total - limit} MORE PLAYERS
          </p>
        </div>
      )}
    </div>
  );
};

export default LeaderboardPanel;
