# AI Widget Component

The AI Widget is a floating chat interface that provides users with an intuitive way to interact with the AI assistant directly on web pages.

## Features

- **Floating Button**: Minimalist floating button that doesn't interfere with page content
- **Expandable Chat**: Full-featured chat interface with message history
- **Real-time Communication**: WebSocket integration for instant AI responses
- **Quick Actions**: Pre-defined actions for common tasks (analyze, extract, automate, summarize)
- **Responsive Design**: Adapts to different screen sizes and mobile devices
- **Accessibility**: Full keyboard navigation and screen reader support
- **Dark Mode**: Automatic dark mode support based on user preferences
- **Animations**: Smooth transitions and micro-interactions for better UX

## Architecture

### Components

1. **WidgetManager** (`widget-manager.ts`)
   - Manages widget lifecycle and integration with content script
   - Handles communication between widget and background script
   - Creates and manages the iframe container

2. **WidgetController** (`widget-controller.ts`)
   - Controls the widget UI and user interactions
   - Manages chat state and message history
   - Handles keyboard navigation and accessibility

3. **Widget HTML** (`widget.html`)
   - Complete HTML structure for the widget interface
   - Embedded CSS for styling and animations
   - Basic JavaScript for widget functionality

### Integration

The widget integrates with the content script through:

1. **Iframe Isolation**: Widget runs in an isolated iframe to prevent conflicts with page styles
2. **PostMessage Communication**: Secure message passing between widget and content script
3. **Event Handling**: Handles user interactions and forwards them to the background script

## Usage

### Initialization

```typescript
import { WidgetManager } from './widget/widget-manager';

const widgetManager = new WidgetManager();
await widgetManager.initialize();
```

### Showing/Hiding Widget

```typescript
// Show the widget
widgetManager.show();

// Hide the widget
widgetManager.hide();
```

### Sending AI Responses

```typescript
// Send AI response to widget
widgetManager.sendAIResponse('Hello! How can I help you?', [
  { label: 'Analyze Page', action: 'analyze_page' },
  { label: 'Extract Data', action: 'extract_data' }
]);
```

### Handling WebSocket Messages

```typescript
// Handle WebSocket messages from backend
widgetManager.handleWebSocketMessage({
  type: 'ai_response',
  payload: {
    message: 'I can help you with that!',
    actions: []
  }
});
```

## Styling

### CSS Architecture

The widget uses a modular CSS approach:

1. **Base Styles**: Core widget structure and layout
2. **Component Styles**: Individual component styling (button, chat, messages)
3. **Animation Styles**: Transitions and micro-interactions
4. **Responsive Styles**: Mobile and tablet adaptations
5. **Accessibility Styles**: Focus indicators and screen reader support
6. **Theme Styles**: Dark mode and high contrast support

### CSS Custom Properties

The widget supports CSS custom properties for theming:

```css
:root {
  --widget-primary-color: #667eea;
  --widget-secondary-color: #764ba2;
  --widget-background: #ffffff;
  --widget-text-color: #374151;
  --widget-border-radius: 16px;
  --widget-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
}
```

### Responsive Breakpoints

- **Desktop**: Default styles (> 768px)
- **Tablet**: Adjusted sizing (481px - 768px)
- **Mobile**: Full-screen chat (≤ 480px)

## Accessibility

### Keyboard Navigation

- **Tab**: Navigate between interactive elements
- **Enter**: Activate buttons and send messages
- **Escape**: Close widget
- **Shift + Tab**: Navigate backwards

### Screen Reader Support

- **ARIA Labels**: All interactive elements have descriptive labels
- **Live Regions**: Chat messages are announced to screen readers
- **Semantic HTML**: Proper heading structure and landmarks
- **Focus Management**: Logical focus order and visible focus indicators

### High Contrast Mode

The widget automatically adapts to high contrast mode preferences:

```css
@media (prefers-contrast: high) {
  .widget-button {
    border: 2px solid #000;
  }
  /* Additional high contrast styles */
}
```

## Performance

### Optimization Strategies

1. **Lazy Loading**: Widget is only loaded when needed
2. **Iframe Isolation**: Prevents style conflicts and improves performance
3. **Event Delegation**: Efficient event handling for dynamic content
4. **Debounced Input**: Input handling is debounced to prevent excessive API calls
5. **Virtual Scrolling**: For large message histories (future enhancement)

### Memory Management

- **Message Cleanup**: Old messages are cleaned up to prevent memory leaks
- **Event Listener Cleanup**: All event listeners are properly removed on destroy
- **Observer Cleanup**: ResizeObserver and other observers are disconnected

## Testing

### Unit Tests

The widget includes comprehensive unit tests:

```bash
npm test -- widget
```

### Test Coverage

- Widget initialization and lifecycle
- Message handling and communication
- User interactions and event handling
- Accessibility features
- Error handling and edge cases

### Manual Testing

1. **Cross-browser Testing**: Chrome, Firefox, Safari, Edge
2. **Device Testing**: Desktop, tablet, mobile
3. **Accessibility Testing**: Screen readers, keyboard navigation
4. **Performance Testing**: Memory usage, rendering performance

## Browser Compatibility

### Supported Browsers

- **Chrome**: 88+ (full support)
- **Firefox**: 85+ (full support)
- **Safari**: 14+ (full support)
- **Edge**: 88+ (full support)

### Feature Detection

The widget includes feature detection for:

- **ResizeObserver**: Falls back to window resize events
- **IntersectionObserver**: Falls back to scroll events
- **CSS Custom Properties**: Falls back to hardcoded values

## Security

### Content Security Policy

The widget respects CSP restrictions:

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self';"
  }
}
```

### Iframe Sandboxing

The widget iframe uses appropriate sandbox attributes:

```html
<iframe sandbox="allow-scripts allow-same-origin"></iframe>
```

### Message Validation

All postMessage communication is validated:

```typescript
// Validate message origin and structure
if (event.origin !== expectedOrigin) return;
if (!isValidMessage(event.data)) return;
```

## Future Enhancements

### Planned Features

1. **Voice Input**: Speech-to-text for hands-free interaction
2. **File Upload**: Drag and drop file analysis
3. **Multi-language**: Internationalization support
4. **Themes**: Customizable color themes
5. **Plugins**: Extensible plugin system
6. **Offline Mode**: Cached responses for offline use

### Performance Improvements

1. **Virtual Scrolling**: For large message histories
2. **Message Compression**: Compress large messages
3. **Lazy Image Loading**: For image messages
4. **Service Worker**: Background message processing

## Troubleshooting

### Common Issues

1. **Widget Not Appearing**
   - Check if content script is loaded
   - Verify iframe creation and loading
   - Check console for JavaScript errors

2. **Styling Issues**
   - Verify CSS isolation in iframe
   - Check for conflicting page styles
   - Ensure proper z-index values

3. **Communication Issues**
   - Verify postMessage event listeners
   - Check message format and validation
   - Ensure proper origin checking

### Debug Mode

Enable debug logging:

```typescript
const widgetManager = new WidgetManager({ debug: true });
```

### Performance Monitoring

Monitor widget performance:

```typescript
// Check widget initialization time
console.time('widget-init');
await widgetManager.initialize();
console.timeEnd('widget-init');
```