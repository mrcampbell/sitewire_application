import type { Counts } from '../loader.js';
import { LoadStatus } from './LoadStatus.js';
import { StatsBar } from './StatsBar.js';

export const LoadSummary = ({ counts }: { counts: Counts }) => (
  <>
    <StatsBar counts={counts} />
    <LoadStatus counts={counts} />
  </>
);
