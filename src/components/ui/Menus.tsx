import React, { useState, useEffect, useCallback } from "react";
import { GameStats } from "../../types";
import { TIER_CONFIGS } from "../../constants";
import { Button } from "@/components/ui/8bit/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/8bit/card";
import { Badge } from "@/components/ui/8bit/badge";
import { HandleInput } from "./HandleInput";
import { LeaderboardPanel } from "./LeaderboardPanel";
import { submitScore } from "../../services/leaderboard";

const TAGLINES = [
  "YOUR UBER RATING: ZERO STARS.",
  "MORALLY QUESTIONABLE CARDIO SIMULATOR.",
  "WALK. BIKE. DRIVE. DESTROY.",
  "CLIMB THE FOOD CHAIN. LITERALLY.",
  "EVERY KILL IS A PROMOTION.",
  "CARDIO WITH CONSEQUENCES.",
  "EMPLOYEE OF THE MONTH. EVERY MONTH. FOREVER.",
  "YOUR INSURANCE DOESN'T COVER THIS.",
  "ANGER MANAGEMENT SPEEDRUN.",
  "NETWORKING, BUT VIOLENTLY.",
  "THE FLOOR IS LAVA. YOU ARE THE LAVA.",
];

interface MainMenuProps {
  onStart: () => void;
  isLoading?: boolean;
  loadingProgress?: number;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onStart,
  isLoading = false,
  loadingProgress = 0,
}) => {
  const [taglineIndex, setTaglineIndex] = useState(() =>
    Math.floor(Math.random() * TAGLINES.length)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setTaglineIndex((prev) => (prev + 1) % TAGLINES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-50">
      <div className="text-center p-10 scale-75 origin-center">
        <h1 className="text-7xl font-bold mb-5 text-destructive retro">
          HOLIDAY MAYHEM
        </h1>

        <p className="text-lg mb-10 text-muted-foreground retro transition-opacity duration-500">
          {TAGLINES[taglineIndex]}
        </p>

        <div className="space-y-3">
          <Button
            onClick={onStart}
            disabled={isLoading}
            size="lg"
            className="px-16 py-8 text-2xl bg-destructive text-white hover:bg-destructive/90 retro disabled:opacity-50"
          >
            {isLoading
              ? `LOADING... ${Math.round(loadingProgress * 100)}%`
              : "START GAME"}
          </Button>
          {isLoading && (
            <p className="text-sm text-muted-foreground retro tracking-widest">
              PRELOADING RAPID RESPONSE UNITS...
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// Neon colors matching the game UI
const NEON = {
  yellow: '#FFE500',
  cyan: '#00F5FF',
  red: '#FF3333',
};

interface GameOverProps {
  stats: GameStats;
  onRestart: () => void;
}

type GameOverPhase = 'stats' | 'input' | 'leaderboard';

export const GameOver: React.FC<GameOverProps> = ({ stats, onRestart }) => {
  const config = TIER_CONFIGS[stats.tier];
  const [phase, setPhase] = useState<GameOverPhase>('stats');
  const [submittedRank, setSubmittedRank] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [leaderboardKey, setLeaderboardKey] = useState(0);

  const handleSubmitScore = useCallback(async (handle: string) => {
    setIsSubmitting(true);

    const result = await submitScore(handle, stats.score, {
      kills: stats.kills,
      tier: config.name,
      gameTime: Math.floor(stats.gameTime),
    });

    setIsSubmitting(false);

    if (result) {
      setSubmittedRank(result.rank);
      // Force leaderboard refresh
      setLeaderboardKey((k) => k + 1);
    }

    // Move to leaderboard phase after short delay
    setTimeout(() => {
      setPhase('leaderboard');
    }, 800);
  }, [stats.score, stats.kills, stats.gameTime, config.name]);

  const handleSkipToLeaderboard = () => {
    setPhase('leaderboard');
  };

  const handleShowInput = () => {
    setPhase('input');
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/90 z-50">
      <Card className="w-[90vw] max-w-[520px] bg-neutral-900 border-4 border-white scale-[0.85] md:scale-100 origin-center">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-5xl md:text-6xl text-destructive retro">
            BUSTED!
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Stats - always visible */}
          <div className="grid grid-cols-2 gap-2 text-sm md:text-base retro">
            <div className="flex justify-between items-center px-2 py-1 bg-black/30 rounded">
              <span className="text-muted-foreground">Score</span>
              <Badge variant="default" className="text-base">{stats.score.toLocaleString()}</Badge>
            </div>
            <div className="flex justify-between items-center px-2 py-1 bg-black/30 rounded">
              <span className="text-muted-foreground">Kills</span>
              <Badge variant="destructive">{stats.kills}</Badge>
            </div>
            <div className="flex justify-between items-center px-2 py-1 bg-black/30 rounded">
              <span className="text-muted-foreground">Tier</span>
              <Badge variant="secondary">{config.name}</Badge>
            </div>
            <div className="flex justify-between items-center px-2 py-1 bg-black/30 rounded">
              <span className="text-muted-foreground">Time</span>
              <Badge variant="outline">{Math.floor(stats.gameTime)}s</Badge>
            </div>
          </div>

          {/* Phase-specific content */}
          {phase === 'stats' && (
            <div className="pt-4 space-y-3">
              <Button
                onClick={handleShowInput}
                size="lg"
                className="w-full text-lg"
                style={{
                  background: NEON.cyan,
                  color: '#000',
                  boxShadow: `0 0 20px ${NEON.cyan}60`,
                }}
              >
                SUBMIT TO LEADERBOARD
              </Button>
              <Button
                onClick={handleSkipToLeaderboard}
                variant="outline"
                size="lg"
                className="w-full"
              >
                VIEW LEADERBOARD
              </Button>
            </div>
          )}

          {phase === 'input' && (
            <div className="pt-4">
              <p
                className="text-center text-xs retro mb-4 tracking-wider"
                style={{ color: NEON.yellow }}
              >
                ENTER YOUR INITIALS
              </p>
              <HandleInput
                onSubmit={handleSubmitScore}
                disabled={isSubmitting}
              />
              {isSubmitting && (
                <p
                  className="text-center text-xs retro mt-4 animate-pulse"
                  style={{ color: NEON.cyan }}
                >
                  SUBMITTING...
                </p>
              )}
            </div>
          )}

          {phase === 'leaderboard' && (
            <div className="pt-2">
              {submittedRank && (
                <div
                  className="text-center mb-4 py-2 rounded"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${NEON.cyan}20, transparent)`,
                  }}
                >
                  <p className="text-xs retro" style={{ color: NEON.cyan }}>
                    YOU RANKED
                  </p>
                  <p
                    className="text-3xl retro font-bold"
                    style={{
                      color: NEON.yellow,
                      textShadow: `0 0 20px ${NEON.yellow}80`,
                    }}
                  >
                    #{submittedRank}
                  </p>
                </div>
              )}
              <LeaderboardPanel
                key={leaderboardKey}
                limit={10}
                highlightRank={submittedRank ?? undefined}
              />
              <div className="pt-4">
                <Button
                  onClick={onRestart}
                  size="lg"
                  className="w-full"
                  style={{
                    background: NEON.red,
                    color: '#fff',
                    boxShadow: `0 0 20px ${NEON.red}60`,
                  }}
                >
                  TRY AGAIN
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
