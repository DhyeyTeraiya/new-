# 🤖 AI-Powered Website

A comprehensive AI-powered website with integrated browser automation capabilities, similar to Manus AI and Skywork AI. This platform combines modern web technologies with advanced AI to create a seamless user experience for web automation and AI assistance.

## ✨ Features

### 🌐 **Modern Web Application**
- **Next.js 14** with App Router and TypeScript
- **Responsive Design** with Tailwind CSS
- **Real-time Communication** via WebSocket
- **Progressive Web App** capabilities

### 🤖 **AI Integration**
- **NVIDIA AI APIs** for intelligent responses
- **Natural Language Processing** for command understanding
- **Context-Aware Conversations** with memory
- **Intelligent Workflow Generation**

### 🔧 **Browser Automation**
- **Playwright Integration** for cross-browser automation
- **Visual Page Analysis** with screenshot processing
- **Element Detection** and interaction
- **Form Automation** and data extraction

### 📊 **Advanced Features**
- **Workflow Builder** with drag-and-drop interface
- **Real-time Collaboration** with team features
- **Analytics Dashboard** with usage insights
- **API & SDK** for developers
- **Enterprise Features** with team management

## 🏗️ Architecture

```
ai-powered-website/
├── apps/
│   ├── website/          # Next.js frontend application
│   └── api/              # Node.js backend API
├── packages/
│   ├── extension/        # Browser extension (existing)
│   ├── backend/          # Legacy backend (existing)
│   └── shared/           # Shared types and utilities
├── docker-compose.dev.yml
├── docker-compose.prod.yml
└── README.md
```

### 🛠️ **Technology Stack**

**Frontend:**
- Next.js 14 with App Router
- React 18 with TypeScript
- Tailwind CSS + Framer Motion
- React Query + Zustand
- Socket.io Client

**Backend:**
- Node.js with Express
- TypeScript throughout
- Prisma ORM + PostgreSQL
- Redis for caching
- Socket.io for WebSocket
- Bull Queue for jobs

**Infrastructure:**
- Docker & Docker Compose
- PostgreSQL database
- Redis cache
- MinIO for file storage
- Nginx for load balancing

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm 8+
- Docker and Docker Compose
- Git

### 1. Clone and Setup
```bash
git clone <repository-url>
cd ai-powered-website
npm run setup
```

### 2. Environment Configuration
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Start Development Environment
```bash
# Option 1: Docker (Recommended)
npm run docker:dev

# Option 2: Local Development
npm run dev
```

### 4. Access the Application
- **Website:** http://localhost:3000
- **API:** http://localhost:4000
- **Database Admin:** http://localhost:5555 (Prisma Studio)
- **Redis Admin:** http://localhost:8001
- **File Storage:** http://localhost:9001

## 📋 Available Scripts

### Development
```bash
npm run dev              # Start both frontend and backend
npm run dev:website      # Start frontend only
npm run dev:api          # Start backend only
```

### Building
```bash
npm run build            # Build both applications
npm run build:website    # Build frontend
npm run build:api        # Build backend
```

### Database
```bash
npm run db:generate      # Generate Prisma client
npm run db:push          # Push schema to database
npm run db:migrate       # Run database migrations
npm run db:studio        # Open Prisma Studio
npm run db:seed          # Seed database with sample data
```

### Docker
```bash
npm run docker:dev       # Start development environment
npm run docker:dev:down  # Stop development environment
npm run docker:prod      # Start production environment
```

### Code Quality
```bash
npm run lint             # Lint all code
npm run lint:fix         # Fix linting issues
npm run type-check       # Check TypeScript types
npm run format           # Format code with Prettier
npm run test             # Run all tests
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Database
DATABASE_URL=postgresql://aiuser:aipassword@localhost:5432/aiwebsite

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key

# External APIs
NVIDIA_API_KEY=your-nvidia-api-key
OPENAI_API_KEY=your-openai-api-key

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Database Setup

1. **Start PostgreSQL:**
   ```bash
   docker-compose -f docker-compose.dev.yml up postgres -d
   ```

2. **Run Migrations:**
   ```bash
   npm run db:migrate
   ```

3. **Seed Database:**
   ```bash
   npm run db:seed
   ```

## 📚 API Documentation

The API provides comprehensive endpoints for:

- **Authentication:** `/api/auth/*`
- **User Management:** `/api/users/*`
- **AI Chat:** `/api/chat/*`
- **Browser Automation:** `/api/automation/*`
- **Workflows:** `/api/workflows/*`
- **Analytics:** `/api/analytics/*`

Visit http://localhost:4000/api for interactive API documentation.

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run specific test suites
npm run test:website     # Frontend tests
npm run test:api         # Backend tests

# Run tests in watch mode
npm run test:watch
```

## 🚢 Deployment

### Production Build
```bash
npm run build
npm run docker:prod
```

### Environment Setup
1. Set production environment variables
2. Configure database and Redis
3. Set up SSL certificates
4. Configure domain and DNS

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Write tests for new features
- Use conventional commit messages
- Ensure code passes linting and type checking

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **NVIDIA** for AI API services
- **Vercel** for Next.js framework
- **Prisma** for database toolkit
- **Playwright** for browser automation
- **Open Source Community** for amazing tools and libraries

## 📞 Support

- **Documentation:** [Link to docs]
- **Issues:** [GitHub Issues]
- **Discussions:** [GitHub Discussions]
- **Email:** support@aiwebsite.com

---

**Built with ❤️ by the AI Website Team**