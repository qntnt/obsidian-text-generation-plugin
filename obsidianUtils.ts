import { Setting, TextComponent } from "obsidian"
import { toPrecision } from "textUtils"

export function createNumberInput(containerEl: HTMLElement, options: {
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