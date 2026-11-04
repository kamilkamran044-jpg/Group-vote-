import { getStore } from '@netlify/blobs';
import { makeHandler } from '../../lib/handler.mjs';

export default makeHandler(() => getStore({ name: 'groupvote', consistency: 'strong' }));

export const config = { path: '/api/*' };
