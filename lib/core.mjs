import crypto from 'node:crypto';

export const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // polls expire after 90 days
export const MAX_VOTES = 200;
const VALID = new Set(['yes', 'maybe', 'no']);

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const clean = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
export const validId = id => typeof id === 'string' && /^[a-f0-9]{10}$/.test(id);
const nameKey = name => crypto.createHash('sha256').update(name.toLowerCase()).digest('hex').slice(0, 24);

async function removePoll(store, id) {
  const { blobs } = await store.list({ prefix: `votes/${id}/` });
  await Promise.all(blobs.map(b => store.delete(b.key)));
  await store.delete(`polls/${id}`);
}

async function loadPoll(store, id) {
  if (!validId(id)) throw new HttpError(404, 'Poll nahi mila.');
  const poll = await store.get(`polls/${id}`, { type: 'json' });
  if (!poll) throw new HttpError(404, 'Poll nahi mila.');
  if (Date.now() - poll.created > MAX_AGE_MS) {
    await removePoll(store, id);
    throw new HttpError(404, 'Ye poll expire ho chuka hai.');
  }
  return poll;
}

async function listVotes(store, id) {
  const { blobs } = await store.list({ prefix: `votes/${id}/` });
  const votes = await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })));
  return votes.filter(Boolean).sort((a, b) => a.at - b.at);
}

function summarize(poll, votes) {
  const totals = poll.options.map((label, i) => {
    let score = 0, yes = 0, maybe = 0, no = 0;
    votes.forEach(v => {
      const a = v.answers[i];
      if (a === 'yes') { yes++; score += 2; }
      else if (a === 'maybe') { maybe++; score += 1; }
      else no++;
    });
    return { label, score, yes, maybe, no };
  });
  const best = Math.max(0, ...totals.map(t => t.score));
  return {
    id: poll.id,
    title: poll.title,
    description: poll.description,
    options: poll.options,
    votes: votes.map(v => ({ name: v.name, answers: v.answers })),
    totals,
    winners: votes.length && best > 0
      ? totals.map((t, i) => (t.score === best ? i : -1)).filter(i => i >= 0)
      : []
  };
}

export async function createPoll(store, body) {
  const title = clean(body.title, 120);
  const description = clean(body.description, 300);
  const options = Array.isArray(body.options)
    ? [...new Set(body.options.map(o => clean(o, 80)).filter(Boolean))].slice(0, 12)
    : [];
  if (!title) throw new HttpError(400, 'Title likhna zaroori hai.');
  if (options.length < 2) throw new HttpError(400, 'Kam az kam 2 alag options chahiye.');
  const id = crypto.randomBytes(5).toString('hex');
  await store.setJSON(`polls/${id}`, { id, title, description, options, created: Date.now() });
  return { id };
}

export async function getPoll(store, id) {
  const poll = await loadPoll(store, id);
  return summarize(poll, await listVotes(store, id));
}

export async function vote(store, id, body) {
  const poll = await loadPoll(store, id);
  const name = clean(body.name, 40);
  if (!name) throw new HttpError(400, 'Apna naam likhein.');
  const key = `votes/${id}/${nameKey(name)}`;
  const existing = await store.get(key, { type: 'json' });
  if (!existing) {
    const { blobs } = await store.list({ prefix: `votes/${id}/` });
    if (blobs.length >= MAX_VOTES) throw new HttpError(400, 'Is poll mein votes ki limit poori ho gayi.');
  }
  const answers = {};
  poll.options.forEach((_, i) => {
    const a = body.answers && body.answers[i];
    answers[i] = VALID.has(a) ? a : 'no';
  });
  await store.setJSON(key, { name, answers, at: existing ? existing.at : Date.now() });
  return summarize(poll, await listVotes(store, id));
}

// Deletes polls (and their votes) older than MAX_AGE_MS. Returns how many were removed.
export async function cleanup(store) {
  const { blobs } = await store.list({ prefix: 'polls/' });
  let removed = 0;
  for (const b of blobs) {
    const poll = await store.get(b.key, { type: 'json' });
    if (poll && Date.now() - poll.created > MAX_AGE_MS) { await removePoll(store, poll.id); removed++; }
  }
  return removed;
}
