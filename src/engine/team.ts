// Working together on a project (offline). Users on the same device share through each other's locked
// "Shared with you" box: an invite carries the project, and every save after that drops a fresh copy for
// the others, which the app merges in by itself (the same section-by-section merge as Sync Devices).
// Coworkers on other devices use Sync Devices (Wi-Fi, Bluetooth, cloud folder, or a password-protected file).
// Online sync through a server can plug in later as one more transport that calls the same merge.
import type { Project } from '../types';
import { currentUser, loadRegistry, sendToUser, readInbox, dropInbox, linkTeam, teamLinks, setTeamLinks, type InboxItem, type TeamMember } from './accounts';
import { mergeProjects, stampSync } from './sync';
import { getRecord, putProject, newId } from './projectdb';

const sig = (p: Project) => JSON.stringify([Object.entries(p.sync?.sections ?? {}).map(([k, v]) => [k, v.hash]).sort(), Object.keys(p.sync?.tombstones ?? {}).length]);
const lastPushed = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | undefined, pendingProject: Project | null = null;

const who = () => { const u = currentUser(); return u ? { id: u.id, name: u.name } : null; };
const stamp = (p: Project) => { const u = who(); if (!u) return p; const s = stampSync(p, { id: `team.${u.id}`, name: u.name }); return s ? { ...p, sync: s } : p; };

/** Make (or extend) the team on a project; returns the new team value to save on the project. */
export function teamWith(p: Project, add: TeamMember[]): NonNullable<Project['team']> {
  const me = who(); if (!me) throw new Error('Sign in first');
  const t = p.team ?? { id: newId() + newId(), members: [me], owner: me.id };
  const members = [...t.members];
  if (!members.some((m) => m.id === me.id)) members.push(me);
  for (const m of add) if (!members.some((x) => x.id === m.id)) members.push(m);
  return { ...t, members };
}
/** Send an invite to users on this device. The project must already carry the team (see teamWith). */
export async function inviteUsers(p: Project, ids: string[], projectId: string) {
  if (!p.team) throw new Error('Not a shared project');
  await linkTeam(p.team.id, projectId);
  const s = stamp(p);
  for (const id of ids) await sendToUser(id, 'invite', p.team.id, s, p.team.members);
  lastPushed.set(p.team.id, sig(s));
}

/** After each save of a shared project: give the other users on this device the newest copy (debounced). */
export function pushTeamUpdate(p: Project) {
  if (!p.team || !who()) return;
  pendingProject = p; clearTimeout(timer);
  timer = setTimeout(async () => {
    const q = pendingProject; pendingProject = null; if (!q?.team) return;
    const s = stamp(q); const g = sig(s);
    if (lastPushed.get(q.team.id) === g) return; // nothing new since the last copy (stops copies going back and forth)
    const here = new Set((await loadRegistry()).accounts.map((a) => a.id));
    const me = who()!.id;
    for (const m of q.team.members) if (m.id !== me && here.has(m.id)) await sendToUser(m.id, 'update', q.team.id, s, q.team.members).catch(() => undefined);
    lastPushed.set(q.team.id, g);
  }, 3000);
}

export interface TeamResult { invites: InboxItem[]; merged: { name: string; from: string }[] }
/** Bring in other users' changes. `open` is the project on screen: its changes come back through `replace`. */
export async function collectTeamChanges(open: { id: string; project: Project; replace: (p: Project) => void }): Promise<TeamResult> {
  const out: TeamResult = { invites: [], merged: [] };
  if (!who()) return out;
  const links = await teamLinks();
  for (const it of await readInbox()) {
    const remote = it.project as Project;
    const local = links[it.teamId] ?? (open.project.team?.id === it.teamId ? open.id : undefined);
    if (it.kind === 'invite' && !local) { out.invites.push(it); continue; }
    if (!local) { await dropInbox(it.key); continue; }
    if (local === open.id && open.project.team?.id === it.teamId) {
      const { project } = mergeProjects(stamp(open.project), remote);
      lastPushed.set(it.teamId, sig(remote)); // they already have their own changes; only ours go back
      open.replace(project);
    } else {
      const r = await getRecord(local);
      if (r) {
        const { project } = mergeProjects(stamp(r.project), remote);
        await putProject(local, project);
      }
    }
    out.merged.push({ name: it.projectName, from: it.from.name });
    await dropInbox(it.key);
  }
  return out;
}
/** Accept an invite: the project goes into your list and stays linked to the team. Returns the new project id. */
export async function acceptInvite(it: InboxItem, importProject: (p: Project) => Promise<string>): Promise<string> {
  const p = it.project as Project;
  const id = await importProject(p);
  await linkTeam(it.teamId, id);
  await dropInbox(it.key);
  return id;
}
export const declineInvite = (it: InboxItem) => dropInbox(it.key);
/** Stop working together on this project: your copy stays yours, the others are told you left
 *  and stop sending you changes. Returns the project without the team. */
export async function leaveTeam(p: Project): Promise<Project> {
  const me = who(); if (!p.team || !me) return p;
  const left: Project = { ...p, team: { ...p.team, members: p.team.members.filter((m) => m.id !== me.id) } };
  const s = stamp(left);
  const here = new Set((await loadRegistry()).accounts.map((a) => a.id));
  for (const m of left.team!.members) if (here.has(m.id)) await sendToUser(m.id, 'update', p.team.id, s, left.team!.members).catch(() => undefined);
  const links = await teamLinks(); delete links[p.team.id]; await setTeamLinks(links);
  const { team: _t, ...rest } = p; void _t; return rest as Project;
}
