/**
 * Simple Content Script for Browser AI Agent Extension
 * Minimal version that provides basic page interaction
 */
declare class SimpleContentScript {
    private widget;
    private isWidgetVisible;
    constructor();
    private init;
    private createWidget;
    private setupEventListeners;
    private toggleWidget;
    private showWidget;
    private hideWidget;
    private sendMessage;
    private addMessageToChat;
    private addTypingIndicator;
    private handleMessage;
    private getInteractiveElements;
}
