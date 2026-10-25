const { combineRgb } = require('@companion-module/base')

const RED = combineRgb(200, 30, 40)
const YELLOW = combineRgb(230, 160, 20)
const GREEN = combineRgb(30, 140, 80)
const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)

module.exports = function setupFeedbacks(self) {
	const s = () => self.state

	self.setFeedbackDefinitions({
		status: {
			type: 'boolean',
			name: 'Show-Status ist …',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [
				{
					type: 'dropdown',
					id: 'status',
					label: 'Status',
					default: 'running',
					choices: [
						{ id: 'running', label: 'Läuft' },
						{ id: 'paused', label: 'Pausiert' },
						{ id: 'stopped', label: 'Bereit / gestoppt' },
					],
				},
			],
			callback: (fb) => s()?.status === fb.options.status,
		},
		remaining_below: {
			type: 'boolean',
			name: 'Restzeit unter X Sekunden (noch nicht überzogen)',
			defaultStyle: { bgcolor: YELLOW, color: BLACK },
			options: [{ type: 'number', id: 'seconds', label: 'Sekunden', default: 60, min: 1, max: 3600 }],
			callback: (fb) => {
				const r = s()?.remainingSec
				return s()?.status !== 'stopped' && typeof r === 'number' && r >= 0 && r <= fb.options.seconds
			},
		},
		overtime: {
			type: 'boolean',
			name: 'Aktueller Punkt überzogen',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [],
			callback: () => s()?.status !== 'stopped' && typeof s()?.remainingSec === 'number' && s().remainingSec < 0,
		},
		late: {
			type: 'boolean',
			name: 'Show liegt mehr als X Sekunden hinter dem Plan',
			defaultStyle: { color: combineRgb(255, 90, 90) },
			options: [{ type: 'number', id: 'seconds', label: 'Sekunden', default: 30, min: 0, max: 36000 }],
			callback: (fb) => typeof s()?.overUnderSec === 'number' && s().overUnderSec > fb.options.seconds,
		},
		early: {
			type: 'boolean',
			name: 'Show liegt mehr als X Sekunden vor dem Plan',
			defaultStyle: { color: combineRgb(90, 220, 140) },
			options: [{ type: 'number', id: 'seconds', label: 'Sekunden', default: 30, min: 0, max: 36000 }],
			callback: (fb) => typeof s()?.overUnderSec === 'number' && s().overUnderSec < -fb.options.seconds,
		},
		cue_current: {
			type: 'boolean',
			name: 'Punkt Nr. X ist aktuell',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [{ type: 'number', id: 'cue', label: 'Nummer', default: 1, min: 1, max: 999 }],
			callback: (fb) => s()?.status !== 'stopped' && Number(s()?.current?.index) === Number(fb.options.cue),
		},
		cue_next: {
			type: 'boolean',
			name: 'Punkt Nr. X ist als Nächstes dran',
			defaultStyle: { bgcolor: combineRgb(60, 60, 60), color: WHITE },
			options: [{ type: 'number', id: 'cue', label: 'Nummer', default: 1, min: 1, max: 999 }],
			callback: (fb) => Number(s()?.next?.index) === Number(fb.options.cue),
		},
		offline: {
			type: 'boolean',
			name: 'Keine Verbindung zu ShowCommander',
			defaultStyle: { bgcolor: combineRgb(40, 40, 40), color: combineRgb(130, 130, 130) },
			options: [],
			callback: () => !s(),
		},
	})
}
