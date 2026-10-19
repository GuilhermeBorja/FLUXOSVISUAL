import {readFileSync, writeFileSync} from 'node:fs';

// One-time, fail-closed source migration. Removed after the verified commit.
function edit(path, transform) {
  const before = readFileSync(path, 'utf8');
  const after = transform(before);
  if (before === after) throw new Error(`No changes made to ${path}`);
  writeFileSync(path, after);
}
function replace(source, before, after, count = 1) {
  const found = source.split(before).length - 1;
  if (found !== count) throw new Error(`Expected ${count}, found ${found}: ${before.slice(0,100)}`);
  return source.split(before).join(after);
}
function replaceFunction(source, name, body) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const end = source.indexOf('\n}', start);
  if (end < 0) throw new Error(`Missing end of ${name}`);
  return source.slice(0,start) + body.trim() + source.slice(end+2);
}
const helpers = `
// Calendar dates are inclusive; elapsed timers and date offsets are not durations.
function calendarDayNumber(value) {
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(value || '').slice(0,10));
  if (!match) return NaN;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(0);
  date.setUTCFullYear(year,month-1,day); date.setUTCHours(0,0,0,0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month-1 || date.getUTCDate() !== day) return NaN;
  return date.getTime() / 86400000;
}
function inclusiveDurationDays(start, finish) {
  const difference = calendarDayNumber(finish) - calendarDayNumber(start);
  return Number.isFinite(difference) && difference >= 0 ? difference + 1 : 0;
}
function hasPlannedDuration(item) {
  const value = item?.plannedDurationDays;
  return value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
}
function durationEndOffset(duration) {
  return Math.max(0,Number(duration) - 1);
}
function inclusiveFinishDate(start, duration) {
  return datePlusDays(start,durationEndOffset(duration));
}
function temporalStartOffset(relation, predecessorDuration, successorDuration) {
  const lag = Number(relation.lagDays) || 0;
  if (relation.relationType === 'TI') return Number(predecessorDuration) + lag;
  if (relation.relationType === 'II') return lag;
  if (relation.relationType === 'TT') return durationEndOffset(predecessorDuration) + lag - durationEndOffset(successorDuration);
  if (relation.relationType === 'IF') return lag - durationEndOffset(successorDuration);
  throw new Error('Unknown temporal relation: ' + relation.relationType);
}
`;
edit('dist/app.js', source => {
  source = replace(source, '      if (parsed.version === 2) {', `      if (parsed.version === 2) {
        // Preserve a recovery copy before adopting inclusive calendar dates.
        if (!parsed.calendarVersion && !localStorage.getItem(STORAGE_KEY + '.beforeInclusiveCalendar')) {
          try { localStorage.setItem(STORAGE_KEY + '.beforeInclusiveCalendar', saved); }
          catch (error) { console.warn('Calendar recovery copy could not be saved.', error); }
        }
        parsed.calendarVersion = 1;`);
  source = replace(source,'version:2, gpoVersion:1, setupComplete:false','version:2, calendarVersion:1, gpoVersion:1, setupComplete:false');
  source = replace(source,'    version: 2,\n    gpoVersion: 1,','    version: 2,\n    calendarVersion: 1,\n    gpoVersion: 1,');
  let count = 0;
  source = source.replace(/^([ \t]*)item\.plannedDurationDays = Number\.isFinite[^\n]*$/gm, (_,indent) => { count++; return indent + 'item.plannedDurationDays = itemDurationDays(item);'; });
  if (count !== 1) throw new Error('Unexpected saved-duration initializer count ' + count);
  count = 0;
  source = source.replace(/^([ \t]*)plannedDurationDays: Number\.isFinite[^\n]*$/gm, (_,indent) => { count++; return indent + 'plannedDurationDays: itemDurationDays(input),'; });
  if (count !== 2) throw new Error('Unexpected item-duration initializer count ' + count);
  source = replace(source, 'datePlusDays(item.baselineStartAt || item.plannedStartAt || today(), item.plannedDurationDays || 0)', 'inclusiveFinishDate(item.baselineStartAt || item.plannedStartAt || today(), item.plannedDurationDays || 0)');
  count = 0;
  source = source.replace(/^([ \t]*)baselineDueAt: (?:input\.[^\n]*)$/gm, (_,indent) => { count++; return indent + 'baselineDueAt: input.baselineDueAt || input.dueAt || inclusiveFinishDate(input.plannedStartAt || today(), itemDurationDays(input)),'; });
  if (count !== 2) throw new Error('Unexpected baseline initializer count ' + count);
  count = 0;
  source = source.replace(/^([ \t]*)plannedDurationDays: Math\.max\(0, \(new Date\(\(children[^\n]*$/gm, (_,indent) => { count++; return indent + `plannedDurationDays: inclusiveDurationDays(children.map((item)=>item.plannedStartAt).filter(Boolean).sort()[0] || parent.plannedStartAt || today(), children.map((item)=>item.dueAt).filter(Boolean).sort().at(-1) || parent.dueAt || today()),`; });
  if (count !== 1) throw new Error('Unexpected parent-duration initializer count ' + count);
  source = replaceFunction(source, 'itemDurationDays', `function itemDurationDays(item) {
  if (hasPlannedDuration(item)) return Number(item.plannedDurationDays);
  return inclusiveDurationDays(item.plannedStartAt,item.dueAt);
}`);
  source = replace(source, '\nfunction itemDurationDays(item) {', helpers + '\nfunction itemDurationDays(item) {');
  const start = source.indexOf('      const ps = starts.get(pred.id), pf = datePlusDays(');
  const end = source.indexOf('\n    }',start);
  if (start < 0 || end < 0) throw new Error('Dependency block not found');
  source = source.slice(0,start) + `      const ps = starts.get(pred.id);
      candidates.push(datePlusDays(ps,temporalStartOffset(r,durations.get(pred.id),duration)));` + source.slice(end);
  source = replace(source,'item.dueAt = datePlusDays(item.plannedStartAt,durations.get(item.id));','item.dueAt = inclusiveFinishDate(item.plannedStartAt,durations.get(item.id));');
  return source;
});
edit('dist/workspace.js', source => {
  source = replaceFunction(source,'plannedLabel',`function plannedLabel(item) {
  if (!item.plannedStartAt || !item.dueAt) return "Sem dura\\u00e7\\u00e3o";
  return itemDurationDays(item) + "d previstos";
}`);
  source = replace(source,'\n        ? Math.max(0,(new Date(item.dueAt + "T12:00:00") - new Date(item.plannedStartAt + "T12:00:00")) / 86400000)', '\n        ? inclusiveDurationDays(item.plannedStartAt,item.dueAt)');
  const start = source.indexOf('  const offsetFor = (relation) => {');
  const end = source.indexOf('\n  };',start);
  if (start < 0 || end < 0) throw new Error('CPM dependency block not found');
  source = source.slice(0,start) + '  const offsetFor = (relation) => temporalStartOffset(relation,duration.get(relation.sourceId),duration.get(relation.targetId));' + source.slice(end+5);
  source = replace(source,'  const terminalIds = tasks.map((item) => item.id).filter((id) => outgoing.get(id).length === 0);\n  const projectFinish = Math.max(0,...terminalIds.map((id) => earliest.get(id) + duration.get(id)));\n  const latest = new Map(tasks.map((item) => [item.id,projectFinish - duration.get(item.id)]));', `  // II/IF links do not guarantee that terminal nodes finish last.
  const projectFinish = Math.max(0,...tasks.map((item) => earliest.get(item.id) + durationEndOffset(duration.get(item.id))));
  const projectDuration = projectFinish + (tasks.some((item) => duration.get(item.id) > 0) ? 1 : 0);
  const latest = new Map(tasks.map((item) => [item.id,projectFinish - durationEndOffset(duration.get(item.id))]));`);
  source = replace(source,'durationDays:Math.ceil(projectFinish),rows','durationDays:Math.ceil(projectDuration),rows');
  source = replace(source,'const duration = item.plannedStartAt && item.dueAt ? Math.max(0,(new Date(item.dueAt + "T12:00:00") - new Date(item.plannedStartAt + "T12:00:00")) / 86400000) : 0;', 'const duration = itemDurationDays(item);');
  source = replace(source,'const finish = shiftedDate(analysis.startDate,row.startOffset + row.duration);','const finish = inclusiveFinishDate(start,row.duration);');
  source = replace(source,'datePlusDays(start,duration)','inclusiveFinishDate(start,duration)');
  source = replace(source,'datePlusDays(defaults.plannedStartAt || today(),defaults.plannedDurationDays || 0)','inclusiveFinishDate(defaults.plannedStartAt || today(),defaults.plannedDurationDays || 0)');
  source = replace(source,'input.dueAt = shiftedDate(start, days);','input.plannedDurationDays = days;\n        input.dueAt = inclusiveFinishDate(start, days);');
  source = replace(source,'dueAt:shiftedDate(start,duration)','dueAt:inclusiveFinishDate(start,duration)');
  source = replace(source,'const content = {version:state.version,exportedAt:', 'const content = {version:state.version,calendarVersion:1,exportedAt:');
  return source;
});
edit('package.json', source => replace(source,'0.4.0-prd3','0.4.1-prd3'));
edit('package-lock.json', source => replace(source,'0.4.0-prd3','0.4.1-prd3',2));
edit('README.md', source => {
  source = replace(source,'`feature/prd-evolution`','`PRD3`');
  return source + '\n## Calendário inclusivo (PRD3 0.4.1)\n\nDatas planejadas contam início e término: 01/10 a 02/10 = 2 dias. Uma atividade de 1 dia termina no mesmo dia; duração zero continua representando um marco. TI sem defasagem inicia a sucessora no dia seguinte ao término da predecessora. II alinha inícios; TT alinha términos; IF alinha o término da sucessora ao início da predecessora. Defasagens deslocam datas, sem somar um dia extra. Timers reais continuam medindo tempo decorrido. A numeração visual continua dependente da posição, sem alterar IDs internos.\n\nDurações explicitamente registradas são preservadas e suas previsões passam a usar a convenção inclusiva. Registros sem duração usam o intervalo das datas. Antes da primeira leitura de dados legados, uma cópia de recuperação é mantida em `fluxosVisualState.v2.beforeInclusiveCalendar`; nenhum registro é apagado.\n';
});
console.log('Inclusive calendar changes applied.');
