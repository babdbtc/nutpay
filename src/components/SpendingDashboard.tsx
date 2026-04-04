import { useState, useEffect, useCallback } from 'react';
import type { DomainSpending } from '../core/storage/transaction-store';
import type { Settings } from '../shared/types';
import { formatAmount } from '../shared/format';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

type Period = 'today' | 'month' | 'all';

interface SpendingDashboardProps {
  displayFormat: Settings['displayFormat'];
}

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' },
];

export function SpendingDashboard({ displayFormat }: SpendingDashboardProps) {
  const [period, setPeriod] = useState<Period>('today');
  const [spending, setSpending] = useState<DomainSpending[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSpending = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'GET_SPENDING_DASHBOARD',
        period: p,
      });
      if (Array.isArray(result)) {
        setSpending(result);
      }
    } catch (error) {
      console.error('Failed to load spending data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSpending(period);
  }, [period, loadSpending]);

  const totalSpent = spending.reduce((sum, s) => sum + s.totalSpent, 0);
  const totalPayments = spending.reduce((sum, s) => sum + s.transactionCount, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {PERIODS.map((p) => (
          <Button
            key={p.value}
            variant={period === p.value ? 'default' : 'outline'}
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <Card className="bg-card border-0">
        <CardContent className="py-3 px-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs text-muted-foreground">Total Spent</p>
              <p className="text-lg font-bold text-white">
                {formatAmount(totalSpent, displayFormat)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Payments</p>
              <p className="text-lg font-bold text-white">{totalPayments}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : spending.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">
          No spending data yet
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {spending.map((site) => (
            <Card key={site.origin} className="bg-card border-0">
              <CardContent className="py-2 px-3 flex justify-between items-center">
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-white truncate">
                    {site.hostname}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {site.transactionCount} payment{site.transactionCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <span className="text-sm font-semibold text-primary ml-2 flex-shrink-0">
                  {formatAmount(site.totalSpent, displayFormat)}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
