import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';

interface CredentialFormProps {
  authType: 'pin' | 'password';
  credential: string;
  onCredentialChange: (value: string) => void;
  confirmCredential: string;
  onConfirmChange: (value: string) => void;
  showPassword: boolean;
  onToggleShow: () => void;
}

/**
 * Reusable PIN/password creation form with confirm field and show/hide toggle.
 * Used in SecuritySetup, Options security setup, Options credential change,
 * and RecoveryScreen new credential step.
 */
export function CredentialForm({
  authType,
  credential,
  onCredentialChange,
  confirmCredential,
  onConfirmChange,
  showPassword,
  onToggleShow,
}: CredentialFormProps) {
  const isPIN = authType === 'pin';
  const label = isPIN ? 'PIN' : 'Password';
  const placeholder = isPIN ? '••••' : '••••••';
  const maxLength = isPIN ? 6 : 50;

  return (
    <>
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="relative">
          <Input
            type={showPassword ? 'text' : 'password'}
            inputMode={isPIN ? 'numeric' : undefined}
            pattern={isPIN ? '[0-9]*' : undefined}
            placeholder={placeholder}
            value={credential}
            onChange={(e) => onCredentialChange(e.target.value)}
            maxLength={maxLength}
            className="bg-card border-input pr-10"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={onToggleShow}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Confirm {label}</Label>
        <Input
          type={showPassword ? 'text' : 'password'}
          inputMode={isPIN ? 'numeric' : undefined}
          pattern={isPIN ? '[0-9]*' : undefined}
          placeholder={placeholder}
          value={confirmCredential}
          onChange={(e) => onConfirmChange(e.target.value)}
          maxLength={maxLength}
          className="bg-card border-input"
          autoComplete="new-password"
        />
      </div>
    </>
  );
}
