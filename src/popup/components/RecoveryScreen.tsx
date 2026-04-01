import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useRecovery } from '@/hooks/useRecovery';
import { SeedImportStep } from './SeedImportStep';
import { MintScannerStep } from './MintScannerStep';

interface RecoveryScreenProps {
  onRecovered: () => void;
  onBack: () => void;
}

export function RecoveryScreen({ onRecovered, onBack }: RecoveryScreenProps) {
  const recovery = useRecovery({ onRecovered, onBack });

  if (recovery.step === 'phrase') {
    return (
      <SeedImportStep
        recoveryMode={recovery.recoveryMode}
        setRecoveryMode={recovery.setRecoveryMode}
        recoveryPhrase={recovery.recoveryPhrase}
        setRecoveryPhrase={recovery.setRecoveryPhrase}
        error={recovery.error}
        loading={recovery.loading}
        onVerify={recovery.handleVerifyPhrase}
        onBack={onBack}
      />
    );
  }

  if (
    recovery.step === 'selectMints' ||
    recovery.step === 'recovering' ||
    recovery.step === 'results'
  ) {
    return (
      <MintScannerStep
        step={recovery.step}
        availableMints={recovery.availableMints}
        selectedMints={recovery.selectedMints}
        setSelectedMints={recovery.setSelectedMints}
        customMintUrl={recovery.customMintUrl}
        setCustomMintUrl={recovery.setCustomMintUrl}
        error={recovery.error}
        loading={recovery.loading}
        recoveryProgress={recovery.recoveryProgress}
        recoveryResult={recovery.recoveryResult}
        authType={recovery.authType}
        onAddCustomMint={recovery.handleAddCustomMint}
        onStartRecovery={recovery.handleStartRecovery}
        onCancelRecovery={recovery.handleCancelRecovery}
        onFinishRecovery={recovery.handleFinishRecovery}
        onBackToPhrase={() => recovery.setStep('phrase')}
      />
    );
  }

  return (
    <div className="popup-container bg-background p-6 flex flex-col gap-4">
      <div className="text-center mb-2">
        <h2 className="text-lg font-semibold text-white">
          Set New {recovery.authType === 'pin' ? 'PIN' : 'Password'}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose a new {recovery.authType} to protect your wallet
        </p>
      </div>

      <Tabs
        value={recovery.authType}
        onValueChange={(v) => recovery.setAuthType(v as 'pin' | 'password')}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 bg-card">
          <TabsTrigger value="pin">PIN</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
        </TabsList>
        <TabsContent value="pin" className="mt-4">
          <Card className="bg-card border-0">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">4-6 digit numeric code</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="password" className="mt-4">
          <Card className="bg-card border-0">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Alphanumeric, min 6 characters</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>New {recovery.authType === 'pin' ? 'PIN' : 'Password'}</Label>
          <div className="relative">
            <Input
              type={recovery.showPassword ? 'text' : 'password'}
              inputMode={recovery.authType === 'pin' ? 'numeric' : undefined}
              pattern={recovery.authType === 'pin' ? '[0-9]*' : undefined}
              placeholder={recovery.authType === 'pin' ? '••••' : '••••••'}
              value={recovery.credential}
              onChange={(e) => recovery.setCredential(e.target.value)}
              maxLength={recovery.authType === 'pin' ? 6 : 50}
              className="bg-card border-input pr-10"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => recovery.setShowPassword(!recovery.showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
            >
              {recovery.showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Confirm {recovery.authType === 'pin' ? 'PIN' : 'Password'}</Label>
          <Input
            type={recovery.showPassword ? 'text' : 'password'}
            inputMode={recovery.authType === 'pin' ? 'numeric' : undefined}
            pattern={recovery.authType === 'pin' ? '[0-9]*' : undefined}
            placeholder={recovery.authType === 'pin' ? '••••' : '••••••'}
            value={recovery.confirmCredential}
            onChange={(e) => recovery.setConfirmCredential(e.target.value)}
            maxLength={recovery.authType === 'pin' ? 6 : 50}
            className="bg-card border-input"
            autoComplete="new-password"
          />
        </div>
      </div>

      {recovery.error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {recovery.error}
        </div>
      )}

      <Button onClick={recovery.handleResetCredential} disabled={recovery.loading}>
        {recovery.loading ? 'Saving...' : 'Save & Unlock'}
        <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
          Enter
        </Badge>
      </Button>

      <Button
        variant="ghost"
        onClick={() => recovery.setStep('phrase')}
        className="text-muted-foreground"
      >
        Start Over
        <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
          Esc
        </Badge>
      </Button>
    </div>
  );
}

export default RecoveryScreen;
