const BASE = [
	{ variableId: 'rundown', name: 'Name des Ablaufs' },
	{ variableId: 'status', name: 'Status (running/paused/stopped)' },
	{ variableId: 'status_text', name: 'Status (Läuft/Pausiert/Bereit)' },
	{ variableId: 'current_number', name: 'Aktueller Punkt: Nummer' },
	{ variableId: 'current_title', name: 'Aktueller Punkt: Titel' },
	{ variableId: 'current_who', name: 'Aktueller Punkt: Verantwortlich' },
	{ variableId: 'current_info', name: 'Aktueller Punkt: Info' },
	{ variableId: 'current_duration', name: 'Aktueller Punkt: geplante Dauer' },
	{ variableId: 'remaining', name: 'Restzeit (mm:ss)' },
	{ variableId: 'remaining_s', name: 'Restzeit in Sekunden' },
	{ variableId: 'elapsed', name: 'Verstrichene Zeit (mm:ss)' },
	{ variableId: 'progress', name: 'Fortschritt in %' },
	{ variableId: 'next_number', name: 'Nächster Punkt: Nummer' },
	{ variableId: 'next_title', name: 'Nächster Punkt: Titel' },
	{ variableId: 'next_who', name: 'Nächster Punkt: Verantwortlich' },
	{ variableId: 'over_under', name: 'Über/Unter (+mm:ss = überzogen)' },
	{ variableId: 'over_under_s', name: 'Über/Unter in Sekunden' },
	{ variableId: 'projected_end', name: 'Erwartetes Ende (HH:MM)' },
	{ variableId: 'planned_end', name: 'Geplantes Ende (HH:MM)' },
	{ variableId: 'total', name: 'Gesamtdauer' },
	{ variableId: 'cue_count', name: 'Anzahl Punkte' },
]

function setupVariables(self, cueCount) {
	const defs = [...BASE]
	for (let n = 1; n <= cueCount; n++) {
		defs.push({ variableId: `cue_${n}_title`, name: `Punkt ${n}: Titel` })
		defs.push({ variableId: `cue_${n}_duration`, name: `Punkt ${n}: Dauer` })
	}
	self.setVariableDefinitions(defs)
}

function variableValues(s) {
	if (!s) {
		const empty = {}
		for (const d of BASE) empty[d.variableId] = ''
		empty.status = 'offline'
		empty.status_text = 'Offline'
		return empty
	}
	const v = {
		rundown: s.rundown?.name ?? '',
		status: s.status,
		status_text: s.statusText ?? s.status,
		current_number: s.current?.index ?? '',
		current_title: s.current?.title ?? '',
		current_who: s.current?.who ?? '',
		current_info: s.current?.info ?? '',
		current_duration: s.current?.durationText ?? '',
		remaining: s.remaining || '--:--',
		remaining_s: s.remainingSec ?? '',
		elapsed: s.elapsed || '',
		progress: s.progress ?? 0,
		next_number: s.next?.index ?? '',
		next_title: s.next?.title ?? '',
		next_who: s.next?.who ?? '',
		over_under: s.overUnder || '',
		over_under_s: s.overUnderSec ?? '',
		projected_end: s.projectedEnd || '',
		planned_end: s.plannedEnd || '',
		total: s.totalDuration || '',
		cue_count: s.cueCount ?? 0,
	}
	for (const c of s.cues || []) {
		v[`cue_${c.n}_title`] = c.title
		v[`cue_${c.n}_duration`] = c.duration
	}
	return v
}

module.exports = { setupVariables, variableValues }
