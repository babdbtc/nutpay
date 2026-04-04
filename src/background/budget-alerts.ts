import type { AllowlistEntry } from '../shared/types';
import { withDefaults } from '../core/storage/allowlist-store';

export type BudgetAlertLevel = 'normal' | 'warning' | 'over-limit';

export interface BudgetStatus {
  dailyLevel: BudgetAlertLevel;
  monthlyLevel: BudgetAlertLevel;
  overallLevel: BudgetAlertLevel;  // worst of daily/monthly
  dailyPercent: number;            // 0-100+
  monthlyPercent: number;          // 0-100+
}

export function calculateBudgetStatus(entry: AllowlistEntry): BudgetStatus {
  const e = withDefaults(entry);
  const dailyPercent = e.maxPerDay > 0 ? (e.dailySpent / e.maxPerDay) * 100 : 0;
  const monthlyPercent = e.maxPerMonth > 0 ? (e.monthlySpent / e.maxPerMonth) * 100 : 0;

  const getLevel = (percent: number): BudgetAlertLevel => {
    if (percent >= 100) return 'over-limit';
    if (percent >= 80) return 'warning';
    return 'normal';
  };

  const dailyLevel = getLevel(dailyPercent);
  const monthlyLevel = getLevel(monthlyPercent);

  // Overall is the worst of the two
  const levelPriority: Record<BudgetAlertLevel, number> = {
    'normal': 0, 'warning': 1, 'over-limit': 2
  };
  const overallLevel = levelPriority[dailyLevel] >= levelPriority[monthlyLevel]
    ? dailyLevel : monthlyLevel;

  return { dailyLevel, monthlyLevel, overallLevel, dailyPercent, monthlyPercent };
}

export function getBadgeColorForLevel(level: BudgetAlertLevel): string {
  switch (level) {
    case 'warning': return '#F59E0B';    // amber
    case 'over-limit': return '#EF4444'; // red
    default: return '#7C3AED';           // purple (existing primary)
  }
}
