/**
 * Simple Browser AI Agent Backend Server
 * Minimal version for development without Docker dependencies
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Basic middleware
app.use(helmet());
app.use(cors({
  origin: "*",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    version: '1.0.0',
    services: {
      server: 'running',
      memory: 'available'
    }
  });
});

// Simple session endpoint
app.post('/api/v1/sessions', (req, res) => {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
  
  const session = {
    id: sessionId,
    userId: req.body.userId || `user_${Date.now()}`,
    browserState: {
      currentTab: null,
      tabs: [],
      window: {
        id: 'window_1',
        width: 1920,
        height: 1080,
        left: 0,
        top: 0,
        focused: true,
        state: 'normal'
      }
    },
    conversationHistory: [],
    preferences: {
      theme: 'light',
      language: 'en',
      ...req.body.preferences
    },
    metadata: {
      source: 'extension',
      device: req.body.deviceInfo || {}
    },
    createdAt: new Date(),
    lastActivity: new Date(),
    expiresAt: new Date(Date.now() + 3600000) // 1 hour
  };

  res.status(201).json({
    success: true,
    data: {
      session,
      token: `token_${sessionId}`
    },
    timestamp: new Date()
  });
});

// Get session endpoint
app.get('/api/v1/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  // Mock session data
  const session = {
    id: sessionId,
    userId: 'demo_user',
    browserState: {
      currentTab: {
        id: 'tab_1',
        url: 'https://example.com',
        title: 'Example Page',
        active: true,
        status: 'complete'
      },
      tabs: [],
      window: {
        id: 'window_1',
        width: 1920,
        height: 1080,
        left: 0,
        top: 0,
        focused: true,
        state: 'normal'
      }
    },
    conversationHistory: [],
    preferences: {
      theme: 'light',
      language: 'en'
    },
    metadata: {
      source: 'extension'
    },
    createdAt: new Date(Date.now() - 300000), // 5 minutes ago
    lastActivity: new Date(),
    expiresAt: new Date(Date.now() + 3600000) // 1 hour from now
  };

  res.json({
    success: true,
    data: { session },
    timestamp: new Date()
  });
});

// Chat endpoint
app.post('/api/v1/chat', (req, res) => {
  const { message, sessionId } = req.body;
  
  // Mock AI response
  const response = {
    id: `msg_${Date.now()}`,
    content: `I received your message: "${message}". This is a demo response from the Browser AI Agent backend.`,
    type: 'text',
    timestamp: new Date(),
    confidence: 0.95,
    actions: [],
    metadata: {
      model: 'demo',
      processingTime: Math.random() * 1000
    }
  };

  res.json({
    success: true,
    data: { response },
    timestamp: new Date()
  });
});

// Automation endpoint
app.post('/api/v1/automation', (req, res) => {
  const { actions, sessionId } = req.body;
  
  // Mock automation results
  const results = actions.map((action: any, index: number) => ({
    id: `result_${Date.now()}_${index}`,
    actionId: action.id || `action_${index}`,
    status: 'completed',
    result: {
      success: true,
      data: `Simulated execution of ${action.type} action`,
      screenshot: null
    },
    timestamp: new Date(),
    duration: Math.random() * 2000
  }));

  res.json({
    success: true,
    data: {
      results,
      finalState: 'completed'
    },
    timestamp: new Date()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      retryable: false
    },
    timestamp: new Date()
  });
});

// Error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', error);
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An internal server error occurred',
      retryable: true
    },
    timestamp: new Date()
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Browser AI Agent Backend Server (Simple Mode) started`);
  console.log(`📍 Port: ${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${port}/health`);
  console.log(`🔗 API base: http://localhost:${port}/api/v1`);
  console.log(`\n✅ Server is ready to accept requests!`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});