let shown = false;

export function showBudgetWarningToast(data: {
  spent: number;
  limit: number;
  hostname: string;
  period: string;
}): void {
  if (shown) return;
  shown = true;

  const host = document.createElement('div');
  host.id = 'nutpay-budget-toast-host';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    @keyframes nutpay-budget-slide-in {
      from { transform: translateY(100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes nutpay-budget-slide-out {
      from { transform: translateY(0); opacity: 1; }
      to { transform: translateY(100%); opacity: 0; }
    }
  `;
  shadow.appendChild(style);

  const periodLabel = data.period === 'monthly' ? 'this month' : 'today';

  const toast = document.createElement('div');
  toast.setAttribute('style', [
    'position: fixed',
    'bottom: 16px',
    'right: 16px',
    'z-index: 2147483647',
    'background: #1c1c2e',
    'color: #e2e2e2',
    'border: 1px solid rgba(245, 158, 11, 0.3)',
    'border-radius: 10px',
    'padding: 12px 16px',
    "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    'font-size: 13px',
    'box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3)',
    'display: flex',
    'flex-direction: column',
    'gap: 6px',
    'max-width: 340px',
    'min-width: 260px',
    'animation: nutpay-budget-slide-in 0.25s ease-out',
  ].join('; '));

  const header = document.createElement('div');
  header.setAttribute('style', 'display: flex; align-items: center; justify-content: space-between;');

  const titleRow = document.createElement('div');
  titleRow.setAttribute('style', 'display: flex; align-items: center; gap: 6px;');

  const icon = document.createElement('span');
  icon.setAttribute('style', 'font-size: 14px; line-height: 1;');
  icon.textContent = '\u26A0';

  const title = document.createElement('span');
  title.setAttribute('style', 'font-weight: 600; font-size: 13px; color: #F59E0B;');
  title.textContent = 'Budget warning';

  titleRow.appendChild(icon);
  titleRow.appendChild(title);

  const dismissBtn = document.createElement('button');
  dismissBtn.setAttribute('style', [
    'flex-shrink: 0',
    'background: none',
    'border: none',
    'color: #555',
    'cursor: pointer',
    'padding: 2px',
    'font-size: 16px',
    'line-height: 1',
  ].join('; '));
  dismissBtn.textContent = '\u00D7';

  header.appendChild(titleRow);
  header.appendChild(dismissBtn);
  toast.appendChild(header);

  const message = document.createElement('div');
  message.setAttribute('style', 'font-size: 12px; color: #ccc; line-height: 1.4;');
  message.textContent = `You\u2019ve spent ${data.spent} of ${data.limit} sats on ${data.hostname} ${periodLabel}`;

  toast.appendChild(message);
  shadow.appendChild(toast);
  document.body.appendChild(host);

  function dismiss(): void {
    toast.style.animation = 'nutpay-budget-slide-out 0.2s ease-in forwards';
    setTimeout(() => host.remove(), 200);
  }

  dismissBtn.addEventListener('click', dismiss);
  setTimeout(dismiss, 5000);
}
