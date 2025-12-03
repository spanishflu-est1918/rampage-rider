import React, { useState, useEffect } from "react";
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

interface GameOverProps {
  stats: GameStats;
  onRestart: () => void;
}

export const GameOver: React.FC<GameOverProps> = ({ stats, onRestart }) => {
  const config = TIER_CONFIGS[stats.tier];

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/90 z-50">
      <Card className="w-[480px] bg-card border-4 border-foreground scale-75 origin-center">
        <CardHeader className="text-center">
          <CardTitle className="text-6xl text-destructive retro">
            BUSTED!
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3 text-lg retro">
          <div className="flex justify-between">
            <strong>Score:</strong>
            <Badge variant="default">{stats.score.toLocaleString()}</Badge>
          </div>
          <div className="flex justify-between">
            <strong>Kills:</strong>
            <Badge variant="destructive">{stats.kills}</Badge>
          </div>
          <div className="flex justify-between">
            <strong>Tier:</strong>
            <Badge variant="secondary">{config.name}</Badge>
          </div>
          <div className="flex justify-between">
            <strong>Time:</strong>
            <Badge variant="outline">{Math.floor(stats.gameTime)}s</Badge>
          </div>

          <div className="pt-6">
            <Button
              onClick={onRestart}
              size="lg"
              className="w-full bg-foreground text-background hover:bg-foreground/90"
            >
              TRY AGAIN
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
