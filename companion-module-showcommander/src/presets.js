const { combineRgb } = require('@companion-module/base')

const C = {
	black: combineRgb(0, 0, 0),
	white: combineRgb(255, 255, 255),
	green: combineRgb(30, 140, 80),
	red: combineRgb(200, 30, 40),
	yellow: combineRgb(230, 160, 20),
	grey: combineRgb(45, 50, 58),
	dark: combineRgb(20, 22, 26),
	blue: combineRgb(40, 100, 210),
}

module.exports = function setupPresets(self) {
	const v = (name) => `$(${self.label}:${name})`
	const btn = (category, name, text, actions, { bg = C.grey, fg = C.white, size = 'auto', feedbacks = [] } = {}) => ({
		type: 'button',
		category,
		name,
		style: { text, size, color: fg, bgcolor: bg, show_topbar: false },
		steps: [{ down: actions, up: [] }],
		feedbacks,
	})
	const act = (actionId, options = {}) => ({ actionId, options })
	const timerFeedbacks = [
		{ feedbackId: 'remaining_below', options: { seconds: 60 }, style: { bgcolor: C.yellow, color: C.black } },
		{ feedbackId: 'overtime', options: {}, style: { bgcolor: C.red, color: C.white } },
		{ feedbackId: 'status', options: { status: 'paused' }, style: { color: C.yellow } },
		{ feedbackId: 'offline', options: {}, style: { bgcolor: C.dark, color: combineRgb(120, 120, 120) } },
	]

	const presets = {
		// --- Steuerung ---
		go: btn('Steuerung', 'GO (Start / Weiter) mit Restzeit', `GO\\n${v('remaining')}`, [act('go')], {
			bg: C.green,
			size: '18',
			feedbacks: timerFeedbacks,
		}),
		prev: btn('Steuerung', 'Zurück', '⏮\\nZURÜCK', [act('prev')]),
		pause: btn('Steuerung', 'Pause / Weiter', '⏯\\nPAUSE', [act('toggle')], {
			feedbacks: [{ feedbackId: 'status', options: { status: 'paused' }, style: { bgcolor: C.yellow, color: C.black } }],
		}),
		plus1: btn('Steuerung', '+1 Minute', '+1:00', [act('adjust', { seconds: 60 })], { size: '24' }),
		minus1: btn('Steuerung', '−1 Minute', '−1:00', [act('adjust', { seconds: -60 })], { size: '24' }),
		plus30: btn('Steuerung', '+30 Sekunden', '+0:30', [act('adjust', { seconds: 30 })], { size: '24' }),
		minus30: btn('Steuerung', '−30 Sekunden', '−0:30', [act('adjust', { seconds: -30 })], { size: '24' }),
		end: btn('Steuerung', 'Show beenden', '■\\nENDE', [act('end')], { bg: combineRgb(90, 20, 25) }),
		sync: btn('Steuerung', 'ChurchTools-Sync', '⟳\\nCHURCH\\nTOOLS', [act('ct_sync')], { bg: combineRgb(60, 45, 120), size: '14' }),
		pp: btn('Steuerung', 'An ProPresenter senden', '→\\nPRO\\nPRES', [act('pp_push')], { size: '14' }),

		// --- Anzeige ---
		remaining: btn('Anzeige', 'Restzeit groß', v('remaining'), [], { bg: C.dark, size: '30', feedbacks: timerFeedbacks }),
		current: btn('Anzeige', 'Aktueller Punkt', `JETZT\\n${v('current_title')}`, [], {
			bg: C.dark,
			size: '14',
			feedbacks: [{ feedbackId: 'status', options: { status: 'running' }, style: { bgcolor: combineRgb(90, 15, 20) } }],
		}),
		next: btn('Anzeige', 'Nächster Punkt (Taste = Weiter)', `DANACH\\n${v('next_title')}`, [act('next')], {
			bg: C.dark,
			size: '14',
		}),
		overunder: btn('Anzeige', 'Über / Unter', `+/−\\n${v('over_under')}`, [], {
			bg: C.dark,
			size: '18',
			feedbacks: [
				{ feedbackId: 'late', options: { seconds: 30 }, style: { color: combineRgb(255, 90, 90) } },
				{ feedbackId: 'early', options: { seconds: 30 }, style: { color: combineRgb(90, 220, 140) } },
			],
		}),
		endtime: btn('Anzeige', 'Erwartetes Ende', `ENDE\\n${v('projected_end')}`, [], { bg: C.dark, size: '18' }),
		elapsed: btn('Anzeige', 'Verstrichene Zeit', `LÄUFT\\n${v('elapsed')}`, [], { bg: C.dark, size: '18' }),
		status: btn('Anzeige', 'Status', v('status_text'), [act('toggle')], {
			bg: C.dark,
			size: '18',
			feedbacks: [
				{ feedbackId: 'status', options: { status: 'running' }, style: { bgcolor: C.red } },
				{ feedbackId: 'status', options: { status: 'paused' }, style: { bgcolor: C.yellow, color: C.black } },
			],
		}),
	}

	// --- Punkte direkt anspringen (1–32) ---
	for (let n = 1; n <= 32; n++) {
		presets[`cue_${n}`] = btn('Punkte', `Punkt ${n} starten`, `${n}\\n${v(`cue_${n}_title`)}`, [act('goto', { cue: String(n) })], {
			bg: C.dark,
			size: '14',
			feedbacks: [
				{ feedbackId: 'cue_current', options: { cue: n }, style: { bgcolor: C.red, color: C.white } },
				{ feedbackId: 'cue_next', options: { cue: n }, style: { bgcolor: combineRgb(70, 70, 70) } },
			],
		})
	}

	self.setPresetDefinitions(presets)
}
