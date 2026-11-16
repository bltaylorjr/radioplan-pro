import React from 'react';
import { useStore } from '../store';
import { Card } from '../components/ui';
import { ALWAYS_PAGES, PAGE_GROUPS, suggestPages } from '../data/customPages';
import { projectSystems } from '../data/systems';
import { setHiddenTools, setToolOn, useHiddenTools, useAutoHideTools, setAutoHideTools, neededTools, neededBy, toolLabel } from '../engine/toolPrefs';
import { checkProject } from '../engine/datacheck';
import { issueText } from '../engine/validate';
import { RrAppKeyCard } from '../components/RrAppKeyCard';

/** User Settings: turn tools on or off, check the project's data, and the RadioReference app key. */
export function SettingsPage() {
  const { project: p, go } = useStore();
  const hidden = useHiddenTools(); const auto = useAutoHideTools();
  const need = new Set(neededTools(p.meta));
  const all = PAGE_GROUPS.flatMap(([, ids]) => ids);
  const nOn = all.filter((id) => !hidden.includes(id)).length;
  const onlyNeeded = () => { const keep = new Set(suggestPages(projectSystems(p.meta))); setHiddenTools(all.filter((id) => !keep.has(id))); };
  const issues = checkProject(p);
  const nBad = issues.filter((i) => i.level === 'bad').length;
  return (
    <div className="grid">
      <Card title="Tools shown in the menu" className="wide" tour="tools">
        <p className="small">Untick a tool you do not use and it leaves the menu, the step numbers and Next / Previous. Nothing is deleted: tick it again to bring it back. This choice is for you on this device and applies to every project.</p>
        <p className="small">When you pick a project type or add a sub-project, any tool that job needs is turned back on automatically and you are told which ones.</p>
        <label className="check"><input type="checkbox" checked={auto} onChange={(e) => setAutoHideTools(e.target.checked)} /> Also hide the tools a newly picked project type does not use (you are told which; nothing is deleted)</label>
        <div className="row wrap" style={{ margin: '6px 0 10px' }}>
          <button onClick={() => setHiddenTools([])}>Show every tool</button>
          <button onClick={onlyNeeded} title="Hide the tools this project's systems do not use">Only what this project needs</button>
          <span className="small muted">{nOn} of {all.length} tools shown.</span>
        </div>
        {PAGE_GROUPS.map(([g, ids]) => (
          <fieldset key={g} className="subsys"><legend>{g.replace(/^\d+ · /, '')}</legend>
            <div className="tool-list">
              {ids.map((id) => { const always = ALWAYS_PAGES.includes(id), on = always || !hidden.includes(id), by = need.has(id) ? neededBy(id, p.meta) : [];
                return <label key={id} className="check"><input type="checkbox" disabled={always} checked={on} onChange={(e) => setToolOn(id, e.target.checked)} /> <span>{toolLabel(id)}
                  {always && <span className="small muted"> (always shown)</span>}
                  {!always && by.length > 0 && <span className="small muted" title={'Needed by ' + by.join(', ')}> (this job uses it)</span>}</span></label>; })}
            </div>
          </fieldset>))}
      </Card>
      <Card title="Check my data" className="wide" tour="datacheck">
        <p className="small">Goes through this whole project and lists entries that are empty, outside the normal range, or do not agree with each other, with the fix for each. Blank boxes are never counted as zero in any calculation.</p>
        {issues.length === 0 ? <p className="note">✓ No problems found. Every value checked is filled in, in range, and agrees with the related values.</p> : <>
          <p><b>{nBad ? `${nBad} problem${nBad > 1 ? 's' : ''} to fix` : 'No errors'}</b>{issues.length - nBad > 0 && <span className="muted"> · {issues.length - nBad} thing{issues.length - nBad > 1 ? 's' : ''} to double-check</span>}</p>
          {issues.map((i, n) => (
            <div key={n} className={'check-row ' + i.level}>
              <span>{i.level === 'bad' ? '⛔' : '⚠'}</span>
              <div style={{ flex: 1 }}><b>{i.where}:</b> {issueText(i)}</div>
              <button onClick={() => go(i.page)}>Fix on {toolLabel(i.page)} →</button>
            </div>))}
        </>}
      </Card>
      <RrAppKeyCard />
    </div>
  );
}
