const { InstanceBase, Regex, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')
const setupActions = require('./actions')
const setupFeedbacks = require('./feedbacks')
const { setupVariables, variableValues } = require('./variables')
const setupPresets = require('./presets')

class ShowCommanderInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.state = null
		this.pollTimer = null
		this.cueCountDefined = -1
		this.failures = 0
	}

	async init(config) {
		this.config = config
		this.updateStatus(InstanceStatus.Connecting)
		setupActions(this)
		setupFeedbacks(this)
		setupVariables(this, 0)
		setupPresets(this)
		this.startPolling()
	}

	async destroy() {
		clearTimeout(this.pollTimer)
		this.pollTimer = null
		this.destroyed = true
	}

	async configUpdated(config) {
		this.config = config
		this.state = null
		this.failures = 0
		this.updateStatus(InstanceStatus.Connecting)
		setupPresets(this)
		this.startPolling()
	}

	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'ShowCommander',
				value:
					'Adresse des ShowCommander-Servers. Als Ablauf „active“ eintragen, um immer den zuletzt gesteuerten Ablauf zu bedienen, oder die ID aus der Editor-URL (/edit/<ID>).',
			},
			{ type: 'textinput', id: 'host', label: 'Server (IP oder Hostname)', width: 6, default: '127.0.0.1' },
			{ type: 'number', id: 'port', label: 'Port', width: 3, default: 8080, min: 1, max: 65535 },
			{ type: 'checkbox', id: 'https', label: 'HTTPS', width: 3, default: false },
			{ type: 'textinput', id: 'rundown', label: 'Ablauf-ID', width: 6, default: 'active' },
			{ type: 'textinput', id: 'apiKey', label: 'API-Key (falls gesetzt)', width: 6, default: '' },
			{ type: 'number', id: 'interval', label: 'Abfrage-Intervall (ms)', width: 4, default: 250, min: 100, max: 5000 },
		]
	}

	baseUrl() {
		const c = this.config || {}
		const proto = c.https ? 'https' : 'http'
		const port = c.port || 8080
		const host = String(c.host || '127.0.0.1').replace(/^https?:\/\//, '').replace(/\/+$/, '')
		return `${proto}://${host}:${port}/api/rundowns/${encodeURIComponent(c.rundown || 'active')}`
	}

	async request(method, path, { timeout = 3000 } = {}) {
		const c = this.config || {}
		let url = `${this.baseUrl()}/${path}`
		if (c.apiKey) url += (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(c.apiKey)
		const ctrl = new AbortController()
		const t = setTimeout(() => ctrl.abort(), timeout)
		try {
			const res = await fetch(url, { method, signal: ctrl.signal })
			const data = await res.json().catch(() => ({}))
			if (res.status === 401) throw new Error('Nicht berechtigt – API-Key prüfen')
			if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
			return data
		} finally {
			clearTimeout(t)
		}
	}

	/** Steuerbefehl senden und den Status sofort übernehmen */
	async command(cmd, arg) {
		const q = arg !== undefined && arg !== '' ? `?arg=${encodeURIComponent(arg)}` : ''
		try {
			const data = await this.request('POST', `control/${cmd}${q}`)
			if (data && data.status) this.applyState(data)
			if (data && data.ok === false) this.log('info', `Befehl „${cmd}“ wurde nicht ausgeführt`)
		} catch (err) {
			this.log('error', `Befehl „${cmd}“ fehlgeschlagen: ${err.message}`)
		}
	}

	async post(path) {
		try {
			return await this.request('POST', path, { timeout: 15000 })
		} catch (err) {
			this.log('error', `${path}: ${err.message}`)
		}
	}

	startPolling() {
		clearTimeout(this.pollTimer)
		const loop = async () => {
			if (this.destroyed) return
			try {
				const data = await this.request('GET', 'state', { timeout: 2000 })
				this.applyState(data)
				if (this.failures) this.log('info', 'Verbindung zu ShowCommander wieder da')
				this.failures = 0
				this.updateStatus(InstanceStatus.Ok)
			} catch (err) {
				this.failures++
				if (this.failures === 1) this.log('warn', `ShowCommander nicht erreichbar: ${err.message}`)
				this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
				if (this.failures === 3) {
					this.state = null
					this.setVariableValues(variableValues(null))
					this.checkFeedbacks()
				}
			}
			const base = Math.max(100, Number(this.config?.interval) || 250)
			this.pollTimer = setTimeout(loop, this.failures ? Math.min(5000, base * (this.failures + 1)) : base)
		}
		loop()
	}

	applyState(data) {
		this.state = data
		const count = Math.min(64, data.cueCount || 0)
		if (count !== this.cueCountDefined) {
			setupVariables(this, count)
			this.cueCountDefined = count
		}
		this.setVariableValues(variableValues(data))
		this.checkFeedbacks()
	}
}

module.exports = ShowCommanderInstance
runEntrypoint(ShowCommanderInstance, UpgradeScripts)
