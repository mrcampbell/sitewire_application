import type { Counts } from '../loader.js';
import { WarningIcon } from './icons.js';

export const LoadStatus = ({ counts }: { counts: Counts }) => {
  const settled = counts.loaded + counts.failed;

  if (counts.pending > 0) {
    return (
      <div id="load-status" class="space-y-1.5">
        <div class="text-sm text-base-content/70">
          Loading login history: {settled.toLocaleString('en-US')} of {counts.total.toLocaleString('en-US')}
        </div>
        <progress class="progress w-full" value={settled} max={counts.total}></progress>
      </div>
    );
  }

  if (counts.failed > 0) {
    return (
      <div id="load-status" role="alert" class="alert alert-warning alert-soft">
        <WarningIcon />
        <span class="text-base-content">
          {counts.failed.toLocaleString('en-US')} {counts.failed === 1 ? "user's" : "users'"} logins couldn't be loaded.
          Retry them individually below.
        </span>
      </div>
    );
  }

  return <div id="load-status"></div>;
};
