import React from 'react';
import type { HelpTopic } from './content';
import { GUIDES, guideCtx } from '../pages/Install';
import { useStore } from '../store';
import { projectSystems } from '../data/systems';

// Screenshots of each page, made from the app itself at release time (src/help/shots/<page>.jpg).
const SHOTS = import.meta.glob('./shots/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const shotFor = (page?: string) => (page ? SHOTS[`./shots/${page}.jpg`] : undefined);

/** Color wiring diagrams that go with each help topic's page. */
const DIAGRAMS: Record<string, string[]> = { alarm: ['nac'], erces: ['erces'], indoor: ['erces'], solar: ['solar'], wifi: ['poe'], network: ['poe'], grounding: ['antenna'], equipment: ['antenna', 'repeater'], systems: ['nac', 'poe'], autodesign: ['nac', 'poe', 'erces'], troubleshoot: ['nac', 'poe'], testing: ['antenna'] };
/** What to search for in how-to videos for each page. */
const VIDEO: Record<string, string> = {
  alarm: 'fire alarm NAC circuit wiring and battery calculation', erces: 'ERCES BDA in-building public safety radio installation', indoor: 'DAS distributed antenna system installation',
  solar: 'off-grid solar battery charge controller installation', wifi: 'Wi-Fi site survey how to', grounding: 'tower grounding and bonding R56', equipment: 'two-way radio antenna and coax installation',
  install: 'low voltage installation best practices', testing: 'cable certification and antenna sweep testing', troubleshoot: 'low voltage troubleshooting multimeter', service: 'fire alarm inspection and testing NFPA 72',
  blueprints: 'fire alarm shop drawings how to', library: 'how to read a datasheet low voltage', materials: 'low voltage material takeoff', reports: 'low voltage proposal and closeout package',
  autodesign: 'low voltage system design basics', compliance: 'NFPA 72 code requirements overview', calculators: 'voltage drop calculation low voltage', survey: 'RF drive test how to',
  locate: 'radio site survey how to choose a tower site', company: 'low voltage contractor project setup', sites: 'GPS coordinates radio site survey', terrain: 'terrain profile radio path planning',
  path: 'radio path profile Fresnel zone line of sight', coverage: 'two-way radio coverage prediction', network: 'radio frequency interference intermodulation troubleshooting', scenarios: 'radio system design comparison',
  optimize: 'antenna tilt azimuth alignment', lfhf: 'HF antenna installation and propagation', sync: 'how to sync files between devices', systems: 'low voltage systems overview installation',
  contacts: 'fire alarm inspection permit process AHJ', fieldnotes: 'low voltage job site documentation photos', directions: 'job site survey walkthrough low voltage', projects: 'low voltage project management tips',
};
/** Pages whose videos should be about the project's own systems (e.g. "Fire Alarm troubleshooting"). */
const PER_SYSTEM: Record<string, string> = { troubleshoot: 'troubleshooting', install: 'installation', service: 'inspection and maintenance', systems: 'installation', testing: 'testing and commissioning', autodesign: 'system design', library: 'equipment datasheet', materials: 'material takeoff' };
const short = (label: string) => label.replace(/\s*\(.*?\)\s*/g, ' ').replace(/ (Control )?Systems?$/i, '').replace(/,.*$/, '').trim();

export function HelpMedia({ topic, compact }: { topic: HelpTopic; compact?: boolean }) {
  const { project: p } = useStore();
  const shot = shotFor(topic.page), guides = GUIDES.filter((g) => (DIAGRAMS[topic.page ?? ''] ?? []).includes(g.id));
  const sysNames = projectSystems(p.meta).filter((x) => x.libCats.length).map((x) => short(x.label));
  const pg = topic.page ?? '';
  const q = PER_SYSTEM[pg] && sysNames.length ? `${sysNames.slice(0, 2).join(' and ')} ${PER_SYSTEM[pg]}`
    : VIDEO[pg] ?? (topic.id === 'getting-started' ? `${sysNames.length ? sysNames.slice(0, 2).join(' and ') : 'low voltage'} installation basics` : `${topic.title} low voltage how to`);
  return (
    <div className="help-media">
      {shot && <figure><img src={shot} alt={`The ${topic.title} page`} loading="lazy" /><figcaption className="small muted">The {topic.title} page.</figcaption></figure>}
      {!compact && guides.map((g) => <figure key={g.id} className="help-diagram"><figcaption><b>{g.title}</b></figcaption>{g.diagram(guideCtx(p))}</figure>)}
      {compact && guides.length > 0 && <p className="small"><a href={`#help/${topic.id}`}>Wiring diagrams for this topic →</a></p>}
      <p><a className="btn" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer">▶ How-to videos (online)</a> <span className="small muted">Searches YouTube for “{q}”; videos are from other people, so check them against the codes and the manufacturer.</span></p>
    </div>
  );
}
