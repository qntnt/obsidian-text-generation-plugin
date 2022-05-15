export function words(text: string): string[] {
    return text.split(/\s+/)
}


export function truncate(text: string, maxLength: number, direction: 'start' | 'end' = 'end', truncationIndicator: string = '...'): string {
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

export function label(text: string, label: string, maxLength: number, truncateDirection: 'start' | 'end' = 'end', truncationIndicator: string = '...') {
    console.log(`Labeling (${label}, ${maxLength}):\n`, text)
    const maxTextLength = maxLength - label.length
    const truncatedText = truncate(text, maxTextLength, truncateDirection, truncationIndicator)
    console.log('Truncated:\n', truncatedText)
    return label + truncatedText
}

export function buildPrompt(body: string, header: string = '', footer: string = '', maxLength: number) {
    console.log(`Building prompt:\nbody:\n`, body, `\nheader:\n`, header, `\nfooter:\n`, footer)
    const text = body + (footer ? `\n${footer}` : '')
    const prompt = label(text, header, maxLength, 'start')
    console.log(`Prompt:\n`, prompt)
    return prompt
}

export function toPrecision(value: number, precision: number) {
    return (Math.floor(value * Math.pow(10, precision)) / Math.pow(10, precision)).toString()
}