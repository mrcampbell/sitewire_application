import type { Counts } from '../loader.js';

type StatProps = {
  title: string;
  value: number;
  description?: string;
};

const Stat = ({ title, value, description }: StatProps) => (
  <div class="stat py-3">
    <div class="stat-title">{title}</div>
    <div class="stat-value text-2xl tabular-nums">{value.toLocaleString('en-US')}</div>
    {description && <div class="stat-desc">{description}</div>}
  </div>
);

export const StatsBar = ({ counts }: { counts: Counts }) => (
  <div id="stats" class="stats stats-vertical w-full border border-base-300 bg-base-100 sm:stats-horizontal">
    <Stat title="Users" value={counts.total} />
    <Stat title="Last login loaded" value={counts.loaded} description={`${counts.pending.toLocaleString('en-US')} still loading`} />
    <Stat title="Couldn't load" value={counts.failed} description="after several attempts" />
  </div>
);
