# Browser AI Agent Extension

A Chrome extension that provides AI-powered browser automation and assistance using NVIDIA AI models.

## Features

- **AI-Powered Automation**: Automate web tasks using natural language commands
- **Real-time Communication**: WebSocket connection to backend AI services
- **Page Context Analysis**: Extract and analyze webpage content for AI processing
- **Interactive Element Detection**: Identify and interact with page elements
- **Session Management**: Persistent sessions across browser tabs and restarts
- **Security**: Secure authentication and data protection

## Architecture

The extension consists of several key components:

### Background Script (`background/`)
- **Service Worker**: Main background process that manages API communication and WebSocket connections
- **Message Handler**: Handles communication between different parts of the extension
- **Session Manager**: Manages user sessions and authentication

### Content Script (`content/`)
- **Page Analysis**: Extracts page context and interactive elements
- **Element Interaction**: Executes automation actions on web pages
- **Real-time Updates**: Receives and processes messages from the AI backend

### Popup (`popup/`)
- **Control Interface**: Main user interface for connecting and controlling the AI agent
- **Status Display**: Shows connection status and session information
- **Quick Actions**: Buttons for common AI tasks

### Utilities (`utils/`)
- **API Client**: Handles HTTP requests to the backend API
- **Storage**: Manages local storage for settings and session data
- **Messaging**: Utilities for inter-component communication

## Development

### Prerequisites

- Node.js 18+
- Chrome browser for testing
- Backend API server running (see `packages/backend/`)

### Setup

1. Install dependencies:
```bash
npm install
```

2. Build the extension:
```bash
npm run build:dev
```

3. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable \"Developer mode\"
   - Click \"Load unpacked\" and select the `dist/` folder

### Development Commands

```bash
# Build for development
npm run build:dev

# Build for production
npm run build

# Watch for changes during development
npm run watch

# Run tests
npm test

# Run tests in watch mode
npm test:watch

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Type check
npm run type-check

# Clean build directory
npm run clean
```

### Testing

The extension includes comprehensive tests:

- **Unit Tests**: Test individual components and utilities
- **Integration Tests**: Test communication between components
- **Mock Chrome APIs**: Full Chrome extension API mocking for testing

Run tests with:
```bash
npm test
```

### Project Structure

```
src/
├── background/           # Background script and service worker
│   ├── index.ts         # Entry point
│   ├── service-worker.ts # Main background service
│   ├── message-handler.ts # Message routing
│   └── __tests__/       # Background script tests
├── content/             # Content script for webpage interaction
│   ├── index.ts         # Content script entry point
│   └── __tests__/       # Content script tests
├── popup/               # Extension popup interface
│   ├── index.ts         # Popup logic
│   ├── popup.html       # Popup HTML
│   └── __tests__/       # Popup tests
├── utils/               # Shared utilities
│   ├── api-client.ts    # API communication
│   ├── storage.ts       # Local storage management
│   ├── messaging.ts     # Message utilities
│   └── __tests__/       # Utility tests
├── assets/              # Extension assets (icons, etc.)
├── manifest.json        # Extension manifest
└── content.css          # Content script styles
```

## Configuration

### Manifest Permissions

The extension requires the following permissions:

- `activeTab`: Access to the currently active tab
- `storage`: Local storage for settings and session data
- `scripting`: Inject content scripts into web pages
- `tabs`: Access to browser tabs information
- `webNavigation`: Track page navigation events
- `contextMenus`: Add context menu items
- `notifications`: Show system notifications
- `offscreen`: Create offscreen documents for background processing

### Host Permissions

- `http://*/*`: Access to all HTTP websites
- `https://*/*`: Access to all HTTPS websites
- `http://localhost:*/*`: Access to local development servers
- `https://localhost:*/*`: Access to local HTTPS development servers

### Content Security Policy

The extension uses a strict CSP that allows:
- Self-hosted scripts and resources
- WebSocket connections to localhost for development
- HTTP/HTTPS connections to localhost for API communication

## API Integration

The extension communicates with the backend API server through:

1. **HTTP REST API**: For session management, authentication, and data operations
2. **WebSocket Connection**: For real-time AI communication and automation commands
3. **Authentication**: JWT-based authentication with secure token storage

### API Endpoints Used

- `POST /api/v1/sessions` - Create new session
- `PUT /api/v1/sessions/:id` - Update session
- `POST /api/v1/chat/message` - Send chat message
- `POST /api/v1/automation/execute` - Execute automation
- `POST /api/v1/automation/screenshot` - Take screenshot
- `WebSocket /` - Real-time communication

## Security

The extension implements several security measures:

1. **Origin Validation**: Only allows communication from authorized origins
2. **Token Security**: Secure storage and transmission of authentication tokens
3. **Input Sanitization**: All user inputs are validated and sanitized
4. **CSP Protection**: Content Security Policy prevents XSS attacks
5. **Permission Minimization**: Only requests necessary permissions

## Troubleshooting

### Common Issues

1. **Extension not loading**: Check that all files are built correctly and manifest.json is valid
2. **API connection failed**: Ensure backend server is running on localhost:3000
3. **WebSocket connection issues**: Check firewall settings and backend WebSocket server
4. **Content script not injecting**: Verify page permissions and CSP settings

### Debug Mode

Enable debug logging by setting `DEBUG_TESTS=true` in your environment:

```bash
DEBUG_TESTS=true npm test
```

### Chrome DevTools

Use Chrome DevTools to debug the extension:

1. **Background Script**: Go to `chrome://extensions/` → Extension details → \"Inspect views: background page\"
2. **Content Script**: Use regular DevTools on any webpage
3. **Popup**: Right-click popup → \"Inspect\"

## Contributing

1. Follow the existing code style and patterns
2. Add tests for new functionality
3. Update documentation as needed
4. Ensure all tests pass before submitting

## License

This project is part of the Browser AI Agent system. See the main project README for license information.