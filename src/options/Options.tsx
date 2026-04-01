import { ErrorBoundary } from '../components/shared/ErrorBoundary';
import { GeneralSettings } from './GeneralSettings';
import { SecuritySettings } from './SecuritySettings';
import { MintManager } from './MintManager';
import { AllowlistManager } from './AllowlistManager';

function Options() {
  return (
    <ErrorBoundary>
      <div className="options-container bg-background min-h-screen text-white">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Nutpay Settings</h1>
          <p className="text-muted-foreground">
            Configure your Cashu wallet and payment preferences
          </p>
        </div>

        <GeneralSettings />
        <SecuritySettings />
        <MintManager />
        <AllowlistManager />
      </div>
    </ErrorBoundary>
  );
}

export default Options;
