import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, Command, EditorPosition, TextComponent } from 'obsidian'
import { Configuration, CreateCompletionRequest, CreateCompletionResponse, OpenAIApi } from 'openai'
import axios, { AxiosInstance } from 'axios'
import matter from 'gray-matter'

const MAX_COMPLETION_TOKENS = 150
const MAX_TOKENS = 2048
const MAX_PROMPT_TOKENS = MAX_TOKENS - MAX_COMPLETION_TOKENS

interface TextGeneratorPluginSettings {
	openAISecretKey: string
	maxTokens: number
	temperature: number,
	topP: number,
}

const DEFAULT_SETTINGS: TextGeneratorPluginSettings = {
	openAISecretKey: '',
	maxTokens: MAX_COMPLETION_TOKENS,
	temperature: 0.8,
	topP: 0.95,
}

type Frontmatter = { [key: string]: string }

export default class TextGeneratorPlugin extends Plugin {
	axios: AxiosInstance
	settings: TextGeneratorPluginSettings
	openAIConfiguration?: Configuration
	openAIApi?: OpenAIApi

	async onload() {
		await this.loadSettings()

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new TextGeneratorSettingTab(this.app, this))

		this.addCommand({
			id: 'text_generator:generate_text',
			name: 'Generate Text',
			editorCallback: this.generateText,
		})

		this.addCommand({
			id: 'text_generator:continue_selection',
			name: 'Continue Selection',
			editorCallback: this.continueSelection,
		})

		this.addCommand({
			id: 'text_generator:generate_selection',
			name: 'Generate from Selection Directive',
			editorCallback: this.generateSelection,
		})

		// Auto tag
		this.addCommand({
			id: 'text_generator:tag_document',
			name: 'Generate document tags',
			editorCallback: this.generateTags,
		})

		// Selection modifiers
		this.addCommand({
			id: 'text_generator:reword_selection',
			name: 'Reword Selection',
			editorCallback: (editor, view) => this.transformAndAppendSelection(editor, this.reword),
		})

		this.addCommand({
			id: 'text_generator:simplify_selection',
			name: 'Simplify Selection',
			editorCallback: (editor, view) => this.transformAndAppendSelection(editor, this.simplify),
		})

		this.addCommand({
			id: 'text_generator:complicate_selection',
			name: 'Complicate Selection',
			editorCallback: (editor, view) => this.transformAndAppendSelection(editor, this.complicate),
		})

		this.addCommand({
			id: 'text_generator:rewrite_as_poetry',
			name: 'Rewrite Selection as Poetry',
			editorCallback: (editor, view) => this.transformAndAppendSelection(editor, this.rewriteAsPoetry),
		})

		this.addCommand({
			id: 'text_generator:rewrite_as_song_lyrics',
			name: 'Rewrite Selection as Song Lyrics',
			editorCallback: (editor, view) => this.transformAndAppendSelection(editor, this.rewriteAsLyrics),
		})
	}

	onunload() {

	}

	createCompletion = async (prompt: string) => {
		console.log('Prompt', prompt)
		const request: CreateCompletionRequest = {
			prompt,
			max_tokens: this.settings.maxTokens,
			temperature: this.settings.temperature,
			top_p: this.settings.topP,
		}
		console.log('Completion request', request)
		const res = await this.openAIApi?.createCompletion('text-curie-001', request)
		return res.data
	}

	getCompletionText = async (prompt: string) => {
		const completion = await this.createCompletion(prompt)
		return completion.choices.first()
			.text
			.trim()
			.split('\n')
			.map(line => line.trim())
			.join('\n')
	}

	cleanText(text: string) {
		return text.split('\n')
			.map(line => line.trim())
			.filter(line => line.length > 0)
			.join('\n')
	}

	buildPrompt(body: string, header: string = '', footer: string = '') {
		console.log(`Building prompt:\nbody:\n`, body, `\nheader:\n`, header, `\nfooter:\n`, footer)
		const text = body + (footer ? `\n${footer}` : '')
		const prompt = this.label(text, header, MAX_PROMPT_TOKENS, 'start')
		console.log(`Prompt:\n`, prompt)
		return prompt
	}

	printFrontmatter(frontmatter?: Frontmatter) {
		if (!frontmatter) return ''
		console.log('printing frontmatter', frontmatter)
		const entries = Object.entries(frontmatter)
		if (entries.length > 0) {
			let text = `---\n`
			entries.forEach(([key, value]) => {
				text += `${key}: ${value}\n`
			})
			text += '---\n'
			return text
		}
		return '\n'
	}

	completeText = async (directive: string, content: string = '', frontmatter?: Frontmatter, footer?: string) => {
		if (!this.openAIApi) throw Error('You need to configure your API key to generate lines')
		const header = `${directive}:\n${this.printFrontmatter(frontmatter)}\n`
		const body = content
		const prompt = this.buildPrompt(body, header, footer)
		return this.getCompletionText(prompt)
	}

	words(text: string): string[] {
		return text.split(/\s+/)
	}

	label(text: string, label: string, maxLength: number, truncateDirection: 'start' | 'end' = 'end', truncationIndicator: string = '...') {
		console.log(`Labeling (${label}, ${maxLength}):\n`, text)
		const maxTextLength = maxLength - label.length
		const truncatedText = this.truncate(text, maxTextLength, truncateDirection, truncationIndicator)
		console.log('Truncated:\n', truncatedText)
		return label + truncatedText
	}

	truncate(text: string, maxLength: number, direction: 'start' | 'end' = 'end', truncationIndicator: string = '...'): string {
		console.log(`Truncating (to ${maxLength}):\n`, text)
		const lengthDiff = text.length - maxLength
		if (lengthDiff > 0) {
			if (direction === 'start') {
				const start = lengthDiff + truncationIndicator.length
				return truncationIndicator + text.substring(start)
			} else {
				const end = maxLength - truncationIndicator.length
				return text.substring(0, end) + truncationIndicator
			}
		}
		return text
	}

	reword = async (text: string) => {
		const words = this.words(text)
		console.log(words)
		if (words.length === 1) {
			return await this.completeText('Write synonyms for this word', `Word:${words[0]}\nSynonym:`)
		}
		return await this.completeText('Reword this text', `Text:${text}\nReworded:`)
	}

	simplify = async (text: string) => {
		const words = this.words(text)
		console.log(words)
		if (words.length === 1) {
			return await this.completeText('Write eighth-grade level synonyms for this word', `Word:${words[0]}\nSynonym:`)
		}
		return await this.completeText('Reword this text for an eighth-grade student', `Text:${text}\nReworded:`)
	}

	complicate = async (text: string) => {
		const words = this.words(text)
		console.log(words)
		if (words.length === 1) {
			return await this.completeText('Write PhD level synonyms for this word', `Word:${words[0]}\nSynonym:`)
		}
		return await this.completeText('Reword this text for a PhD student', `Text:${text}\nReworded:`)
	}

	rewriteAsPoetry = async (text: string) => {
		return await this.completeText('Rewrite this text as poetry', `Text:${text}\nPoetry:`)
	}

	rewriteAsLyrics = async (text: string) => {
		return await this.completeText('Rewrite this text as song lyrics', `Text:${text}\nLyrics:`)
	}

	getNextLineCursor(editor: Editor): EditorPosition {
		const cursor = editor.getCursor('to')
		return {
			line: cursor.line + 1,
			ch: 0,
		}
	}

	addTextAfterSelection(editor: Editor, text: string) {
		const cursor = this.getNextLineCursor(editor)
		editor.replaceRange(`\n\`\`\`GPT-3\n${text}\n\`\`\`\n`, cursor)
	}

	transformAndAppendSelection = async (editor: Editor, transform: (text: string) => Promise<string>) => {
		const selection = editor.getSelection()
		if (selection.length > 0) {
			const transformed = await transform(selection)
			this.addTextAfterSelection(editor, transformed)
		}
	}

	continueSelection = async (editor: Editor, view: MarkdownView) => {
		const cursor = editor.getCursor('to')
		const nextLine: EditorPosition = {
			line: cursor.line + 1,
			ch: 0,
		}
		const selection = editor.getSelection()
		if (selection.length < MAX_TOKENS - MAX_COMPLETION_TOKENS) {
			const reworded = await this.completeText('Continue this document with a new part that is different but related to the text', selection, undefined, 'Continued:')
			console.log(`"${selection}" => "${reworded}"`)
			editor.replaceRange(`\n\`\`\`GPT-3\n${reworded}\n\`\`\`\n`, nextLine)
		}
	}

	generateTags = async (editor: Editor, view: MarkdownView) => {
		const text = editor.getDoc().getValue()
		console.log('Doc', text)
		const prompt = this.buildPrompt(text, `Generate tags for this document.

Document:
Title: Free to Use
Meeting up last night
Talkin' bout plot lines
You only
Wish to have a good time

Tags: #song #poetry #lyrics #song-writing

Document:
Title: He Left So I Could Learn
When my phone rang, and it was Mom telling me Dad had a heart attack. He didn't make it. I felt as though the perfectly carpeted floors had dropped out from under me. Now that I've come out the other side, I realize Dad left me with a hefty stack of teachings. Here are three ideals I know he would've liked for me to embrace. 

Tags: #story #writing #family

Document:
Title: Todo List
* Do laundry
* Groceries
* Vacuum stairway

Tags: #note #todo-list #chores

Document:
`, 'Tags:')
		const tags = await this.getCompletionText(prompt)
		editor.replaceRange(`${tags}\n`, {
			line: 0,
			ch: 0,
		})

	}

	generateSelection = async (editor: Editor, view: MarkdownView) => {
		const cursor = editor.getCursor('to')
		const nextLine: EditorPosition = {
			line: cursor.line + 1,
			ch: 0,
		}
		const selection = editor.getSelection()
		if (selection.length < MAX_TOKENS - MAX_COMPLETION_TOKENS) {
			const reworded = await this.completeText(selection)
			console.log(`"${selection}" => "${reworded}"`)
			editor.replaceRange(`\n\`\`\`GPT-3\n${reworded}\n\`\`\`\n`, nextLine)
		}
	}

	generateText = async (editor: Editor, view: MarkdownView) => {
		const start: EditorPosition = {
			ch: 0,
			line: 0,
		}
		const from = editor.getCursor('from')
		const nextLine: EditorPosition = {
			line: from.line + 1,
			ch: 0,
		}
		const graymatter = matter(editor.getRange(start, from))
		if (!graymatter.data.title) {
			graymatter.data['title'] = view.file.basename
		}
		const body = this.cleanText(graymatter.content)
		const result = await this.completeText('Continue this document with a new part that is different but related to the text', body, graymatter.data, 'Continued:')
		console.log('Response', result)
		editor.replaceRange(`\`\`\`GPT-3\n${result}\n\`\`\`\n`, nextLine)
	}

	configureOpenAI() {
		if (this.settings.openAISecretKey === '') {
			console.log('Open AI API Key is undefined')
			this.openAIConfiguration = undefined
			this.openAIApi = undefined
		} else {
			this.openAIConfiguration = new Configuration({
				apiKey: this.settings.openAISecretKey,
			})
			this.openAIApi = new OpenAIApi(this.openAIConfiguration, undefined, this.axios)
			console.log('Open AI is configured')
		}
	}

	async loadSettings() {
		this.axios = axios.create()
		this.axios.interceptors.request.use(value => {
			if (value.headers['User-Agent']) {
				delete (value.headers['User-Agent'])
			}
			return value
		})
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
		this.configureOpenAI()
	}

	async saveSettings() {
		await this.saveData(this.settings)
		this.configureOpenAI()
	}
}

class TextGeneratorSettingTab extends PluginSettingTab {
	plugin: TextGeneratorPlugin

	constructor(app: App, plugin: TextGeneratorPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this

		containerEl.empty()

		containerEl.createEl('h2', { text: 'Text Generator Settings' })

		new Setting(containerEl)
			.setName('Open AI Secret Key')
			.setDesc('The secret key you need to use GPT-3.')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.openAISecretKey)
				.onChange(async (value) => {
					this.plugin.settings.openAISecretKey = value
					await this.plugin.saveSettings()
				}))
			.addExtraButton(button => button
				.setIcon('links-going-out')
				.setTooltip('Register here')
				.onClick(() => {
					open('https://openai.com/api/')
				}))

		containerEl.createEl('h3', { text: 'GPT-3 Settings' })
		containerEl.createEl('p', { text: 'Only modify these if you know what you\'re doing.' })

		createNumberInput(
			containerEl,
			{
				name: 'Max Tokens',
				settingProvider: () => this.plugin.settings.maxTokens,
				settingUpdate: async (value) => {
					this.plugin.settings.maxTokens = value
					await this.plugin.saveSettings()
				},
				min: 0,
				max: MAX_TOKENS,
				extraButton: {
					icon: 'links-going-out',
					tooltip: 'Documentation',
					url: 'https://beta.openai.com/docs/api-reference/completions/create#completions/create-max_tokens',
				},
				defaultValue: MAX_COMPLETION_TOKENS,
			}
		)

		createNumberInput(
			containerEl,
			{
				name: 'Temperature',
				settingProvider: () => this.plugin.settings.temperature,
				settingUpdate: async (value) => {
					this.plugin.settings.temperature = value
					await this.plugin.saveSettings()
				},
				min: 0,
				max: 1,
				extraButton: {
					icon: 'links-going-out',
					tooltip: 'Documentation',
					url: 'https://beta.openai.com/docs/api-reference/completions/create#completions/create-temperature',
				},
				defaultValue: 0.8,
			}
		)


		createNumberInput(
			containerEl,
			{
				name: 'Top P',
				settingProvider: () => this.plugin.settings.topP,
				settingUpdate: async (value) => {
					this.plugin.settings.topP = value
					await this.plugin.saveSettings()
				},
				min: 0,
				max: 1,
				extraButton: {
					icon: 'links-going-out',
					tooltip: 'Documentation',
					url: 'https://beta.openai.com/docs/api-reference/completions/create#completions/create-top_p',
				},
				defaultValue: 0.95,
			}
		)
	}
}

function createNumberInput(containerEl: HTMLElement, options: {
	name: string,
	settingProvider: () => number,
	settingUpdate: (value: number) => any,
	min: number,
	max: number,
	description?: string,
	extraButton?: {
		icon: string,
		tooltip: string,
		url: string,
	},
	precision?: number,
	defaultValue?: number,
}) {
	const { name, settingProvider, settingUpdate, min, max, description, extraButton, precision = 2, defaultValue } = options
	let textComponent: TextComponent
	const setting = new Setting(containerEl)
		.setName(name)
		.addText(text => {
			textComponent = text
			const updateValue = async () => {
				const valueNumber = Math.max(min, Math.min(max, Number.parseFloat(text.getValue())))
				const valueString = toPrecision(valueNumber, precision)
				text.setValue(valueString)
				settingUpdate(valueNumber)
			}
			text.inputEl.onblur = () => {
				updateValue()
			}
			text.inputEl.onkeydown = (ev) => {
				if (ev.key === 'Enter') {
					updateValue()
				}
			}
			return text
				.setPlaceholder(`Enter a value from ${min} to ${max}`)
				.setValue(toPrecision(settingProvider(), precision))
		}
		)
	if (description) {
		setting.setDesc(description)
	}
	if (defaultValue) {
		setting.addExtraButton(button => button
			.setIcon('undo')
			.setTooltip('Revert to default')
			.onClick(() => {
				textComponent.setValue(toPrecision(defaultValue, precision))
				settingUpdate(defaultValue)
			}))
	}
	if (extraButton) {
		setting.addExtraButton(button => button
			.setIcon(extraButton.icon)
			.setTooltip(extraButton.tooltip)
			.onClick(() => {
				open(extraButton.url)
			}))
	}
}

function toPrecision(value: number, precision: number) {
	return (Math.floor(value * Math.pow(10, precision)) / Math.pow(10, precision)).toString()
}