import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { currentUser } from '../engine/accounts';
import { collectTeamChanges } from '../engine/team';
import { notify } from '../engine/carelog';

/** Signed in: bring in other users' changes to shared projects, and tell about new invites (every 20 s). */
export function TeamSync() {
  const { project, replace, lib } = useStore();
  const live = useRef({ project, replace, id: lib.projectId }); live.current = { project, replace, id: lib.projectId };
  const told = useRef(new Set<string>());
  useEffect(() => {
    if (!currentUser()) return;
    let stop = false;
    const tick = async () => {
      if (stop || lib.saveState === 'loading') return;
      try {
        const r = await collectTeamChanges({ id: live.current.id, project: live.current.project, replace: live.current.replace });
        for (const m of r.merged) notify(`🤝 Added ${m.from}'s changes to “${m.name}”.`);
        for (const i of r.invites) if (!told.current.has(i.key)) { told.current.add(i.key); notify(`🤝 ${i.from.name} shared “${i.projectName}” with you. Open it in Projects & settings → Users & Sign-in.`); }
        if (r.merged.length) lib.bump();
      } catch { /* try again next time */ }
    };
    const t0 = setTimeout(tick, 2500); const iv = setInterval(tick, 20000);
    return () => { stop = true; clearTimeout(t0); clearInterval(iv); };
  }, [lib.projectId, lib.saveState === 'loading']); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
