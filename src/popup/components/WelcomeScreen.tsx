import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Download } from 'lucide-react';

interface WelcomeScreenProps {
  onCreateNew: () => void;
  onImportExisting: () => void;
}

export function WelcomeScreen({ onCreateNew, onImportExisting }: WelcomeScreenProps) {
  return (
    <div className="popup-container bg-background p-6 flex flex-col gap-6">
      {/* Logo/Header */}
      <div className="text-center pt-4">
        <h1 className="text-2xl font-bold text-primary mb-2">Nutpay</h1>
        <p className="text-sm text-muted-foreground">
          Cashu ecash wallet for the web
        </p>
      </div>

      {/* Options */}
      <div className="flex-1 flex flex-col gap-4 justify-center">
        <Card
          className="bg-card border-0 cursor-pointer hover:bg-muted transition-colors"
          onClick={onCreateNew}
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-white">Create New Wallet</h3>
              <p className="text-xs text-muted-foreground">
                Generate a new seed phrase
              </p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="bg-card border-0 cursor-pointer hover:bg-muted transition-colors"
          onClick={onImportExisting}
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <Download className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <h3 className="font-medium text-white">Import Existing Wallet</h3>
              <p className="text-xs text-muted-foreground">
                Restore from 12-word seed phrase
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Skip option for trying without seed */}
      <Button
        variant="ghost"
        className="text-muted-foreground text-sm"
        onClick={onCreateNew}
      >
        Skip for now
      </Button>
    </div>
  );
}

export default WelcomeScreen;
