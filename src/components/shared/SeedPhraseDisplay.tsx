import { Card, CardContent } from '@/components/ui/card';

interface SeedPhraseDisplayProps {
  phrase: string;
}

/**
 * Displays a BIP39 seed phrase as a 3-column numbered grid.
 * Used in SecuritySetup, Options setup modal, and Options recovery phrase modal.
 */
export function SeedPhraseDisplay({ phrase }: SeedPhraseDisplayProps) {
  const words = phrase.split(' ');

  return (
    <Card className="bg-card border-0">
      <CardContent className="p-4">
        <div className="grid grid-cols-3 gap-2 text-sm">
          {words.map((word, i) => (
            <div key={i} className="bg-popover rounded p-2 text-center">
              <span className="text-muted-foreground text-xs mr-1">{i + 1}.</span>
              <span className="text-white">{word}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
