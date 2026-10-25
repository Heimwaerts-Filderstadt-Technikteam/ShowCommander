module.exports = function setupActions(self) {
	const simple = (name, cmd, description) => ({
		name,
		description,
		options: [],
		callback: async () => self.command(cmd),
	})

	self.setActionDefinitions({
		go: {
			name: 'GO: Start bzw. nächster Punkt',
			description: 'Startet die Show oder springt zum nächsten (oder vorgemerkten) Punkt',
			options: [],
			callback: async () => self.command(self.state && self.state.status !== 'stopped' ? 'next' : 'start'),
		},
		start: simple('Start', 'start'),
		next: simple('Nächster Punkt', 'next'),
		prev: simple('Vorheriger Punkt', 'prev'),
		toggle: simple('Pause / Weiter umschalten', 'toggle'),
		pause: simple('Pause', 'pause'),
		resume: simple('Weiter (nach Pause)', 'resume'),
		end: simple('Show beenden', 'end'),
		reset: simple('Show zurücksetzen (Protokoll löschen)', 'reset'),
		adjust: {
			name: 'Zeit des aktuellen Punkts anpassen',
			options: [
				{
					type: 'number',
					id: 'seconds',
					label: 'Sekunden (+ verlängern, − kürzen)',
					default: 60,
					min: -3600,
					max: 3600,
				},
			],
			callback: async (action) => self.command('adjust', action.options.seconds),
		},
		goto: {
			name: 'Punkt sofort starten',
			options: [
				{
					type: 'textinput',
					id: 'cue',
					label: 'Nummer (wie im Editor) oder Item-ID',
					default: '1',
					useVariables: true,
				},
			],
			callback: async (action, context) => {
				const cue = await context.parseVariablesInString(String(action.options.cue))
				self.command('goto', cue.trim())
			},
		},
		arm: {
			name: 'Punkt als nächsten vormerken',
			options: [
				{
					type: 'textinput',
					id: 'cue',
					label: 'Nummer oder Item-ID (leer = Vormerkung löschen)',
					default: '1',
					useVariables: true,
				},
			],
			callback: async (action, context) => {
				const cue = await context.parseVariablesInString(String(action.options.cue))
				self.command('arm', cue.trim())
			},
		},
		ct_sync: {
			name: 'Mit ChurchTools synchronisieren',
			options: [],
			callback: async () => {
				const r = await self.post('sync')
				if (r) self.log('info', `ChurchTools: ${r.added} neu, ${r.updated} geändert, ${r.removed} entfernt`)
			},
		},
		pp_push: {
			name: 'Aktuellen Stand an ProPresenter senden',
			options: [],
			callback: async () => self.post('pp-push'),
		},
	})
}
