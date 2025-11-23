import React from 'react';
import { GameStats } from '../../types';
import { TIER_CONFIGS } from '../../constants';
import { Button } from '@/components/ui/8bit/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/8bit/card';
import { Badge } from '@/components/ui/8bit/badge';

interface MainMenuProps {
  onStart: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onStart }) => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-50">
      <div className="text-center p-10">
        <h1 className="text-7xl font-bold mb-5 text-destructive retro">
          RAMPAGE RIDER
        </h1>

        <p className="text-lg mb-10 text-muted-foreground retro">
          START ON FOOT. KILL TO UPGRADE. SURVIVE THE CHAOS.
        </p>

        <Button
          onClick={onStart}
          size="lg"
          className="px-16 py-8 text-2xl bg-destructive text-white hover:bg-destructive/90 retro"
        >
          START GAME
        </Button>
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
      <Card className="w-96 bg-card border-4 border-foreground">
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
