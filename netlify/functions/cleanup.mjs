import { getStore } from '@netlify/blobs';
import { cleanup } from '../../lib/core.mjs';

// Runs once a day and deletes polls older than 90 days.
export default async () => {
  const removed = await cleanup(getStore({ name: 'groupvote', consistency: 'strong' }));
  console.log(`cleanup: removed ${removed} expired poll(s)`);
};

export const config = { schedule: '@daily' };
